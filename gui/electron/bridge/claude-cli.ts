/**
 * Claude Code CLI runtime — the only Claude-aware code in this application.
 *
 * Everything vendor-specific is confined here: process arguments, the NDJSON
 * wire format, event shapes, session semantics. It converts all of that into
 * the vendor-neutral `AdvisorEvent` vocabulary. Replacing this file with an SDK
 * or Tauri implementation is the entire migration.
 *
 * ---------------------------------------------------------------------------
 * INVOCATION IS VERBATIM
 * ---------------------------------------------------------------------------
 * The argument list below is fixed and contains no prompt-shaping flags. There
 * is deliberately no `--system-prompt`, `--append-system-prompt`, `--agent`, or
 * `--bare`. `--bare` in particular would disable CLAUDE.md discovery and
 * decapitate the advisor.
 *
 * `--permission-prompt-tool stdio` is not an exception to this. It shapes no
 * prompt and injects no context; it redirects where the runtime asks for
 * consent, from a terminal it does not have to this process. See
 * `permission-policy.ts`.
 *
 * The only context supplied is `cwd`. That is what lets the runtime discover its
 * own operating instructions, and it is why this file needs to know nothing
 * about them.
 *
 * ---------------------------------------------------------------------------
 * THE SINGLE EXCEPTION, AND WHY IT IS NOT A LEAK
 * ---------------------------------------------------------------------------
 * `send` accepts a `RuntimeMode` the founder selected in the interface, and
 * `composeTurn` may prefix a repository-defined command — `/lens`, `/council` —
 * ahead of their text. Under the default mode it prefixes nothing and the bytes
 * are exactly what was typed.
 *
 * This file still knows nothing about executives. It calls one pure function
 * from `shared/runtime-modes.ts`, which knows only command names and argument
 * order; the semantics live in `.claude/commands/` inside the repository. No
 * system prompt, persona description, or reasoning instruction is composed
 * anywhere in this process.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AdvisorDiagnostics,
  AdvisorEvent,
  AdvisorSessionOptions,
  PermissionDecision,
} from '../../shared/advisor';
import { TRANSPORT_VERSION } from '../../shared/advisor';
import {
  composeTurn,
  DEFAULT_COUNCIL_MODE,
  type RuntimeMode,
} from '../../shared/runtime-modes';
import { CONTROL, PERMISSION_PROMPT_TRANSPORT } from './permission-policy';
import { toAdvisorEvents, type ControlRequestSighting, type ParserState } from './events';

const execFileAsync = promisify(execFile);

const IS_WINDOWS = process.platform === 'win32';

/**
 * Spawn configuration for the runtime.
 *
 * Windows resolves `claude` through a `.cmd` shim. Node 20+ refuses to spawn
 * `.cmd`/`.bat` directly without a shell (hardening from CVE-2024-27980), which
 * fails with EINVAL — so on Windows the shell is not optional.
 *
 * A shell concatenates arguments instead of escaping them (Node DEP0190), so it
 * is only safe while no argument can carry user input. That holds by
 * construction here:
 *
 *   - Every argument is a literal flag, a generated UUID, or a tool name drawn
 *     from a fixed set.
 *   - The user's message travels on **stdin**, never as an argument.
 *   - `workspacePath` is passed as the `cwd` *option*, which is not part of the
 *     concatenated command line.
 *
 * `assertArgsAreShellSafe` enforces that invariant at runtime rather than
 * trusting it to survive future edits.
 */
const RUNTIME_BIN = IS_WINDOWS ? 'claude.cmd' : 'claude';
const SPAWN_USES_SHELL = IS_WINDOWS;

/** Flags, UUIDs, and bare tool names only. Anything else is a programming error. */
const SAFE_ARG = /^[A-Za-z0-9_.:\-=/\\ ]+$/;

function assertArgsAreShellSafe(args: readonly string[]): void {
  for (const arg of args) {
    if (!SAFE_ARG.test(arg)) {
      throw new Error(
        `Refusing to spawn: argument contains unsafe characters (${JSON.stringify(arg)}). ` +
          `User input must travel on stdin, never in the argument list.`
      );
    }
  }
}

export type Emit = (event: AdvisorEvent) => void;

/**
 * A control request the engine is currently blocked on.
 *
 * Held against the child that raised it. A late answer arriving after that
 * child is gone must not be written to a successor process, which would be
 * answering a question the new process never asked.
 */
interface PendingRequest {
  requestId: string;
  toolUseId: string | null;
  child: ChildProcessWithoutNullStreams;
}

/**
 * How the runtime is asked to continue a conversation, and why it matters.
 *
 * Verified against CLI 2.1.x rather than assumed:
 *
 *   `--session-id <uuid>`  creates a session under that id. If the id already
 *                          exists it refuses: `Session ID <id> is already in
 *                          use.` — exit 1.
 *   `--resume <uuid>`      continues an existing session, returns the same id
 *                          (no fork), and carries prior context. If the id is
 *                          unknown it refuses: `No conversation found with
 *                          session ID: <id>` — exit 1.
 *
 * Both refusals arrive on stderr and exit 1 with no terminal result, which is
 * indistinguishable at the transport boundary from any other early death. That
 * is why they are matched explicitly here and recovered from, rather than
 * surfaced as a bare exit code the founder cannot act on.
 *
 * The consequence for correctness: **the choice of flag must track whether the
 * session actually exists**, not whether this process has spawned before. A
 * fresh process resuming a stored session has spawned nothing, and must still
 * use `--resume`.
 */
const SESSION_ALREADY_EXISTS = /already in use/i;
const SESSION_NOT_FOUND = /no conversation found with session id/i;

/** Outcome of an attempt to recover from a session-flag mismatch. */
type Recovery = 'respawned' | 'reported' | 'none';

export class ClaudeCliRuntime {
  readonly version = TRANSPORT_VERSION;

  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private sessionId: string | null = null;
  private workspacePath: string | null = null;
  private turnId: string | null = null;
  private processState: AdvisorDiagnostics['processState'] = 'stopped';
  private lastEventKind: string | null = null;
  private runtimeVersion: string | null = null;

  /**
   * Control requests the engine is blocked on, keyed by its own request id.
   *
   * Every entry here is a stopped runtime. The invariant that matters is not
   * that this map is small but that it always drains: `resolveOutstanding` is
   * called from every path that ends a turn, so a request can never outlive the
   * process that raised it (contract invariant 6).
   */
  private pending = new Map<string, PendingRequest>();

  /**
   * Tool calls this cockpit answered during the current turn.
   *
   * Read by the parser to suppress a duplicate denial notice for a refusal the
   * founder already made themselves. Cleared per turn, not per request, because
   * the tool result arrives well after the answer.
   */
  private adjudicated = new Set<string>();

  /**
   * Whether the engine already holds a session under `sessionId`.
   *
   * Decides `--resume` versus `--session-id`, and is therefore the single field
   * that makes cross-restart continuity work. It is set by `open()` — true when
   * a stored session is being resumed, false when a new one is being started —
   * and *not* derived from whether this process has spawned a child, which is a
   * different question with the same answer only within one app run.
   */
  private sessionEstablished = false;

  /** The current turn's text, retained only so a recovery can resend it. */
  private pendingText: string | null = null;

  /** True once a terminal result has been parsed for the current turn. */
  private sawTerminalResult = false;

  /** stderr accumulated during the current spawn, for failure classification. */
  private turnStderr = '';

  /** At most one session recovery per turn. Guards against a respawn loop. */
  private recoveryAttempted = false;

  constructor(private readonly emit: Emit) {}

  /* ---------------------------------------------------------------- lifecycle */

  async isAvailable(): Promise<boolean> {
    return (await this.detectVersion()) !== null;
  }

  private async detectVersion(): Promise<string | null> {
    if (this.runtimeVersion) return this.runtimeVersion;
    try {
      const { stdout } = await execFileAsync(RUNTIME_BIN, ['--version'], {
        shell: SPAWN_USES_SHELL,
        timeout: 15_000,
        windowsHide: true,
      });
      this.runtimeVersion = stdout.trim() || null;
      return this.runtimeVersion;
    } catch {
      return null;
    }
  }

  async open(options: AdvisorSessionOptions): Promise<{ sessionId: string }> {
    if (this.child) await this.close();

    this.workspacePath = options.workspacePath;
    // We mint the id rather than parsing one out of the stream, so resume is
    // deterministic even if a turn fails before any event arrives.
    this.sessionId = options.resumeSessionId ?? randomUUID();

    /*
     * The whole of resume support is this line.
     *
     * A supplied id names a session the engine already has, so the first turn
     * must continue it (`--resume`). An absent id means we are about to create
     * one, so the first turn must establish it (`--session-id`) and every later
     * turn continues it.
     *
     * Getting this backwards fails in both directions, and both were reachable
     * before: resuming a stored session with `--session-id` refuses as *already
     * in use*, and opening a fresh session with `--resume` refuses as *not
     * found*. Each surfaced only as `Runtime exited with code 1`.
     */
    this.sessionEstablished = options.resumeSessionId !== undefined;

    this.pendingText = null;
    this.recoveryAttempted = false;
    this.sawTerminalResult = false;
    this.turnStderr = '';
    this.pending.clear();
    this.adjudicated.clear();

    await this.detectVersion();
    this.processState = 'stopped';

    return { sessionId: this.sessionId };
  }

  /**
   * One child process per turn.
   *
   * Print mode terminates after each turn, so the "persistent session" is the
   * session *id*, not the process — continuity comes from `--resume`. This is
   * invisible above the transport boundary, which is the point of having one.
   *
   * It also means the process lifetime is irrelevant to continuity: closing the
   * app and reopening it is the same situation as the gap between two turns,
   * provided the id survives. Persisting the id is therefore all resume needs.
   */
  private spawnForTurn(resume: boolean): ChildProcessWithoutNullStreams {
    if (!this.workspacePath || !this.sessionId) {
      throw new Error('open() must be called before send()');
    }

    /*
     * `--permission-prompt-tool stdio` is the whole of native consent.
     *
     * It routes every permission decision to this process as a `can_use_tool`
     * control request on stdout, and blocks the engine until a matching
     * `control_response` arrives on stdin. Nothing else here pre-approves
     * anything: there is deliberately no `--allowedTools`, no
     * `--permission-mode`, and no settings injection. The runtime's own rules
     * decide what needs asking; we only answer.
     */
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool', PERMISSION_PROMPT_TRANSPORT,
      resume ? '--resume' : '--session-id',
      this.sessionId,
    ];

    this.processState = 'starting';

    assertArgsAreShellSafe(args);

    // Per-spawn, not per-turn: a recovery respawn re-classifies from scratch.
    this.turnStderr = '';
    this.sawTerminalResult = false;

    const child = spawn(RUNTIME_BIN, args, {
      cwd: this.workspacePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: SPAWN_USES_SHELL,
      windowsHide: true,
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      /*
       * `stdoutBuffer` is shared across children, so a superseded child writing
       * into it would interleave two NDJSON streams — producing a line that is
       * the tail of one turn spliced onto the head of another, and parsing as
       * neither. Its bytes are dropped rather than reassigned: the turn they
       * belonged to has already been reported complete.
       */
      if (this.child !== child) return;
      this.onStdout(chunk);
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      // A superseded child's diagnostics belong to a turn that is over. Shown
      // against the live turn they would read as a fault in what the founder is
      // currently waiting on.
      if (this.child !== child) return;
      // Retained for classification at exit. Capped so a runaway child cannot
      // grow this without bound.
      if (this.turnStderr.length < 8192) this.turnStderr += chunk;

      const text = chunk.trim();
      if (!text) return;

      /*
       * A session-flag refusal is recoverable and is handled at exit, where the
       * retry can be sequenced. Emitting it as a warning here as well would show
       * the founder raw engine diagnostics for a fault the cockpit is about to
       * fix silently and then explain in its own words.
       */
      if (SESSION_ALREADY_EXISTS.test(text) || SESSION_NOT_FOUND.test(text)) return;

      // stderr otherwise carries progress chatter as well as faults; never fatal
      // on its own.
      this.emit({
        kind: 'runtime-notice',
        turnId: this.turnId ?? '',
        severity: 'warning',
        message: text.slice(0, 500),
      });
    });

    child.on('error', (error) => {
      // Same rule as `exit`: a superseded child must not report against the
      // turn that replaced it. A fatal error raised here would kill a healthy
      // turn on behalf of a process nobody is waiting on.
      if (this.child !== child) return;
      this.processState = 'exited';
      this.emit({
        kind: 'error',
        turnId: this.turnId,
        message: `Runtime failed to start: ${error.message}`,
        fatal: true,
      });
    });

    child.on('exit', (code) => {
      /*
       * A dead process cannot answer, so nothing may still be waiting on it.
       * This is the deadlock guard: without it, a runtime that crashes while
       * the founder has a dialog open leaves that dialog on screen forever,
       * addressed to a process that no longer exists.
       *
       * Done first, and for any child, because it concerns only that child's
       * own requests.
       */
      this.discardOutstanding(child);

      /*
       * ---------------------------------------------------------------------
       * A SUPERSEDED CHILD MAY NOT TOUCH SHARED STATE
       * ---------------------------------------------------------------------
       * `exit` is asynchronous, so an abandoned child's event can arrive after
       * its replacement has already spawned. Everything below this line is
       * about *the current turn*, and running it on behalf of a dead
       * predecessor corrupts the live one in two ways:
       *
       *   - `this.child = null` would drop the reference to the RUNNING child.
       *     `cancel()` and `close()` both begin `if (!this.child) return`, so
       *     the live process would become unkillable and leak — permanently,
       *     since stdin is deliberately held open for the whole turn.
       *   - `flushBuffer()` would push the dead child's trailing bytes through
       *     the parser under the new turn's id, attributing one turn's output
       *     to another.
       *
       * Found by a leaked `node` process outliving the test run, not by
       * reading the code. It became reachable when `send()` started cancelling
       * an in-flight turn instead of leaving it running.
       */
      if (this.child !== child) return;

      this.processState = 'exited';
      this.flushBuffer();
      this.child = null;

      const turnId = this.turnId;
      // A non-zero exit without a terminal result means the turn died mid-flight.
      // With a terminal result, the failure was already reported from the stream
      // and repeating it as an exit code would say the same thing twice.
      const diedMidFlight = code !== 0 && turnId !== null && !this.sawTerminalResult;

      if (diedMidFlight && turnId !== null) {
        const recovery = this.recoverSession(turnId);
        // A respawn owns the turn from here: leave `turnId` in place, because
        // the retry is the same turn by another process.
        if (recovery === 'respawned') return;

        this.turnId = null;
        this.adjudicated.clear();

        if (recovery === 'none') {
          this.emit({
            kind: 'error',
            turnId,
            message: `Runtime exited with code ${code}.`,
            fatal: false,
          });
        }
        return;
      }

      this.turnId = null;
      this.adjudicated.clear();
    });

    this.child = child;
    return child;
  }

  /**
   * Recover from a session-flag mismatch, at most once per turn.
   *
   * ---------------------------------------------------------------------------
   * WHY RECOVER RATHER THAN REPORT
   * ---------------------------------------------------------------------------
   * Both failures mean the same thing — the cockpit's belief about whether a
   * session exists disagrees with the engine's. The engine is right by
   * definition. Reporting `exited with code 1` would hand the founder a fault
   * they have no way to act on, in the middle of a decision.
   *
   * ---------------------------------------------------------------------------
   * WHY THE SECOND CASE IS DISCLOSED AND NOT SMOOTHED OVER
   * ---------------------------------------------------------------------------
   * When the engine has no record of the session, continuity is genuinely lost:
   * the advisor will answer without any memory of the earlier turns, even though
   * the cockpit can still draw them on screen. Continuing quietly would leave
   * the founder believing the advisor is reasoning from context it does not
   * have — which is exactly the false-confidence failure this system exists to
   * prevent. So the turn proceeds, and the loss is stated plainly.
   */
  private recoverSession(turnId: string): Recovery {
    if (this.recoveryAttempted) return 'none';

    const text = this.pendingText;
    if (text === null || !this.sessionId) return 'none';

    let message: string;

    if (SESSION_ALREADY_EXISTS.test(this.turnStderr)) {
      // We tried to create a session the engine already holds — ours, from an
      // earlier run. Continuing it is what was wanted all along, and no context
      // is lost, so this is a correction rather than a warning.
      this.sessionEstablished = true;
      message = 'Reattached to the existing session for this conversation.';
    } else if (SESSION_NOT_FOUND.test(this.turnStderr)) {
      this.sessionId = randomUUID();
      this.sessionEstablished = false;
      message =
        'The advisor no longer has this conversation in its own history, so it is ' +
        'answering without memory of the earlier turns. The transcript above is the ' +
        "cockpit's record of what was said, not the advisor's.";
    } else {
      return 'none';
    }

    this.recoveryAttempted = true;
    this.emit({ kind: 'runtime-notice', turnId, severity: 'warning', message });

    try {
      this.turnId = turnId;
      const child = this.spawnForTurn(this.sessionEstablished);
      this.processState = 'ready';
      this.writeTurn(child, text);
      return 'respawned';
    } catch (error) {
      this.emit({
        kind: 'error',
        turnId,
        message: `Could not recover the session: ${
          error instanceof Error ? error.message : String(error)
        }`,
        fatal: false,
      });
      return 'reported';
    }
  }

  /* -------------------------------------------------------------------- turns */

  async send(
    text: string,
    mode: RuntimeMode = DEFAULT_COUNCIL_MODE
  ): Promise<{ turnId: string }> {
    if (!this.sessionId) throw new Error('open() must be called before send()');

    /*
     * A turn already in flight is abandoned explicitly, never left running.
     *
     * Holding stdin open for the whole turn — which is what makes native consent
     * possible — also means an abandoned child never terminates: print mode exits
     * on end-of-input, and nothing would ever supply it. Before this sprint such
     * a child closed its own stdin and died on its own, so overlapping sends
     * leaked nothing; now they would leak a process per send, each still holding
     * the workspace open.
     *
     * Worse than the leak: both children write into one `stdoutBuffer`, so the
     * abandoned turn's terminal result would be read as the new turn's, closing
     * the wrong stdin and interleaving two streams into one transcript.
     *
     * The interface does not currently allow this — the composer is disabled
     * mid-turn and the permission dialog is application-modal — so this is a
     * guard against a caller, not a live fault. It is here because the failure it
     * prevents is silent, and because "the UI happens not to do that" is not an
     * invariant the transport can rely on.
     */
    if (this.child) await this.cancel();

    const turnId = randomUUID();
    this.turnId = turnId;
    /*
     * Composed once, here, and retained composed.
     *
     * `composeTurn` returns `text` itself under the default mode, so the ordinary
     * path is still byte-identical to what the founder typed. Retaining the
     * *composed* string rather than the raw one matters for recovery: a respawn
     * must resend the same bytes, and re-composing there would be a second
     * implementation of this rule reachable only on a rare path.
     */
    this.pendingText = composeTurn(text, mode);
    this.recoveryAttempted = false;
    // Adjudications are per-turn: a tool call answered last turn tells us
    // nothing about a refusal this turn, and keeping them would suppress a
    // genuine engine-side denial that happened to reuse an id.
    this.adjudicated.clear();

    // Continue the session if it exists, establish it if it does not. See
    // `sessionEstablished` — this is deliberately not "have we spawned before".
    const child = this.spawnForTurn(this.sessionEstablished);
    this.sessionEstablished = true;
    this.processState = 'ready';

    this.emit({ kind: 'turn-started', turnId, sessionId: this.sessionId });

    this.writeTurn(child, this.pendingText);

    return { turnId };
  }

  /**
   * Deliver one turn's input.
   *
   * Shared by `send` and by a recovery respawn, so both paths transmit through
   * exactly the same code. A recovery that re-encoded the message differently
   * from the original send would be a verbatim-input violation reachable only on
   * a rare path — the worst kind to have.
   *
   * ---------------------------------------------------------------------------
   * STDIN STAYS OPEN. THIS IS THE WHOLE FIX.
   * ---------------------------------------------------------------------------
   * The previous implementation called `child.stdin.end()` here, reasoning that
   * print mode consumes one turn and closing stdin signals end of input. That
   * is true of the message stream and false of the control stream, which shares
   * the same pipe in both directions.
   *
   * Ending stdin here destroys the channel the engine asks permission on. It
   * then reports `Tool permission request failed: AbortError: Stream closed`
   * and falls back to refusing — which is the entire behaviour the old post-hoc
   * consent policy was built to work around.
   *
   * stdin is closed in exactly one place now: `endInput`, on the terminal
   * result. See `handleLine`.
   */
  private writeTurn(child: ChildProcessWithoutNullStreams, text: string): void {
    // `text` is placed in the message unchanged. No wrapping, no re-encoding.
    // Whatever composition was going to happen happened once, in `send`.
    const message = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] },
    };

    this.writeLine(child, message);
  }

  /**
   * Write one NDJSON frame, tolerating a pipe that has already gone.
   *
   * Every write to the child races its exit: the process can die between the
   * check and the call. A failed write is reported and swallowed rather than
   * thrown, because throwing here would cross the transport boundary and
   * violate contract invariant 5.
   */
  private writeLine(child: ChildProcessWithoutNullStreams, frame: unknown): boolean {
    if (child.stdin.destroyed || child.stdin.writableEnded) return false;
    try {
      child.stdin.write(`${JSON.stringify(frame)}\n`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Signal end of input, once, after the turn has genuinely finished.
   *
   * Called on the terminal result rather than after the user message, so the
   * control channel stays available for the whole turn. The child exits
   * shortly after this; without it, it would wait for more input forever.
   */
  private endInput(child: ChildProcessWithoutNullStreams): void {
    if (child.stdin.destroyed || child.stdin.writableEnded) return;
    try {
      child.stdin.end();
    } catch {
      // The child died first. Its exit handler owns cleanup.
    }
  }

  async cancel(): Promise<void> {
    if (!this.child) return;
    const child = this.child;
    const turnId = this.turnId;

    /*
     * Drop outstanding requests BEFORE the kill.
     *
     * They are unanswerable either way, but doing it first means the UI is
     * never briefly showing a dialog for a process that is already dead. This
     * is what makes "Cancel Turn" a complete escape from a prompt rather than
     * a way to leave one stranded.
     */
    this.discardOutstanding(child);

    /*
     * End input before killing, so the process tree gets EOF as well as a signal.
     *
     * On Windows the runtime is reached through a `.cmd` shim, so `kill()`
     * terminates the shim and not necessarily what it launched. Measured against
     * the real CLI 2.1.220, the engine does exit on its own — `claude.exe` count
     * returned to baseline within three seconds of a cancel — so this is not
     * fixing an observed leak.
     *
     * It is here because that clean exit is a property of the current shim and
     * the current engine, neither of which this file controls, and because
     * closing the only write end of the pipe is the one signal that reaches a
     * grandchild regardless of what sits between. Cheap, and it removes the
     * dependency on someone else's shutdown behaviour.
     */
    this.endInput(child);
    child.kill();
    this.child = null;
    this.turnId = null;
    // Dropping the retained text is what makes the kill final: without it the
    // child's own exit could be classified as a mid-flight death and resend a
    // turn the founder just interrupted.
    this.pendingText = null;
    this.adjudicated.clear();
    this.processState = 'stopped';
    if (turnId) {
      this.emit({ kind: 'turn-complete', turnId });
    }
  }

  async close(): Promise<void> {
    await this.cancel();
    this.stdoutBuffer = '';
    this.pending.clear();
    this.adjudicated.clear();
  }

  /* -------------------------------------------------------------- permissions */

  /**
   * Answer a request the engine is blocked on.
   *
   * The reply is written on the runtime's own correlation token, so `allow`
   * completes the pending call inside the turn already in flight. There is no
   * respawn, no retry, and no new turn — the same process continues from where
   * it stopped.
   *
   * Total by construction. An unknown, stale, or double-clicked id resolves to
   * a no-op rather than an error: the founder pressing a button twice must not
   * produce a fault, and a second write on a spent token would be answering a
   * question nobody asked.
   */
  async respondToPermission(requestId: string, decision: PermissionDecision): Promise<void> {
    const request = this.pending.get(requestId);
    if (!request) return;
    // Deleted before the write, so a synchronous re-entry cannot answer twice.
    this.pending.delete(requestId);

    // A late answer to a dead process is dropped rather than written to its
    // successor, which never asked and would be resolving a stale decision.
    if (request.child !== this.child) return;

    if (request.toolUseId) this.adjudicated.add(request.toolUseId);

    const body =
      decision === 'allow'
        ? { behavior: 'allow' as const, updatedInput: undefined }
        : {
            behavior: 'deny' as const,
            message: 'The founder declined this action.',
          };

    this.writeControlResponse(request.child, requestId, body);
  }

  /**
   * Write one `control_response`, the only frame that can unblock the engine.
   *
   * `updatedInput` is omitted rather than echoed back. The runtime already
   * holds the input it proposed, and returning a copy would create a second
   * place where the arguments of a tool call could differ from what the founder
   * was shown — which is the one thing a permission dialog must never allow.
   */
  private writeControlResponse(
    child: ChildProcessWithoutNullStreams,
    requestId: string,
    body: Record<string, unknown>
  ): void {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) payload[key] = value;
    }

    this.writeLine(child, {
      type: CONTROL.response,
      response: { subtype: 'success', request_id: requestId, response: payload },
    });
  }

  /**
   * Note a control request the engine is blocked on, and answer it if we cannot
   * hand it to the founder.
   *
   * Two cases never reach a dialog, and both must still be replied to:
   *
   *   - A subtype this bridge does not implement. Silence would hang the turn,
   *     so it is refused explicitly with a reason the advisor can act on.
   *   - A malformed `can_use_tool` — no tool name, or no correlation token.
   *     Asking the founder to authorise an unnamed action would be asking them
   *     to consent to something nobody can describe, so it is denied.
   *
   * Failing closed is deliberate. A request we do not understand is the exact
   * situation in which guessing "allow" is least defensible.
   */
  private noteControlRequest(
    child: ChildProcessWithoutNullStreams,
    sighting: ControlRequestSighting
  ): void {
    if (sighting.understood) {
      this.pending.set(sighting.requestId, {
        requestId: sighting.requestId,
        toolUseId: sighting.toolUseId,
        child,
      });
      return;
    }

    if (!sighting.requestId) {
      // Unanswerable: no token to address a reply to. Say so rather than
      // pretending the turn is healthy — it is now likely to stall.
      this.emit({
        kind: 'runtime-notice',
        turnId: this.turnId ?? '',
        severity: 'warning',
        message:
          'The advisor sent a request this version of the cockpit cannot answer, ' +
          'and it carried no reply address. The turn may not finish; cancel it if it stalls.',
      });
      return;
    }

    const reason =
      sighting.subtype === CONTROL.canUseTool
        ? 'The cockpit could not read this permission request, so it was refused rather than guessed at.'
        : `The cockpit does not implement control requests of type "${
            sighting.subtype || 'unknown'
          }".`;

    this.writeControlResponse(child, sighting.requestId, {
      behavior: 'deny',
      message: reason,
    });

    this.emit({
      kind: 'runtime-notice',
      turnId: this.turnId ?? '',
      severity: 'warning',
      message: reason,
    });
  }

  /**
   * Abandon every request raised by a child that can no longer answer.
   *
   * Emits a `permission-request` resolution the UI can act on by clearing the
   * dialog — see the reducer, which drops pending requests on `turn-complete`
   * and on a fatal error. Nothing is written to the process: it is either dead
   * or about to be killed.
   */
  private discardOutstanding(child: ChildProcessWithoutNullStreams): void {
    for (const [id, request] of this.pending) {
      if (request.child === child) this.pending.delete(id);
    }
  }

  /* ------------------------------------------------------------------- stdout */

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) this.handleLine(line);
  }

  private flushBuffer(): void {
    if (!this.stdoutBuffer.trim()) {
      this.stdoutBuffer = '';
      return;
    }
    const remainder = this.stdoutBuffer;
    this.stdoutBuffer = '';
    this.handleLine(remainder);
  }

  private parserState: ParserState = { textIndex: null };

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      // Malformed line: report, never throw. A partial write must not kill a turn.
      this.emit({
        kind: 'runtime-notice',
        turnId: this.turnId ?? '',
        severity: 'info',
        message: 'Discarded an unparseable runtime line.',
      });
      return;
    }

    // Captured before parsing: the parser may report a control request, and the
    // reply must go to the process that asked, not to whatever `this.child`
    // happens to be by the time an answer arrives.
    const child = this.child;

    const { events, lastKind } = toAdvisorEvents(raw, {
      turnId: this.turnId ?? '',
      state: this.parserState,
      onControlRequest: (sighting) => {
        if (child) this.noteControlRequest(child, sighting);
      },
      wasAdjudicated: (toolUseId) => this.adjudicated.has(toolUseId),
    });

    if (lastKind) this.lastEventKind = lastKind;

    for (const event of events) {
      if (event.kind === 'turn-complete') {
        // The turn reached its own conclusion, so a later non-zero exit is not a
        // mid-flight death and must not be recovered from or re-reported.
        this.sawTerminalResult = true;
        /*
         * End of input, and the only place stdin is closed on a healthy turn.
         *
         * It happens here rather than after the user message because the
         * control channel had to stay open for the whole turn. The child exits
         * on its own shortly after this.
         */
        if (child) {
          this.discardOutstanding(child);
          this.endInput(child);
        }
      }
      this.emit(event);
    }
  }

  /* -------------------------------------------------------------- diagnostics */

  /**
   * Outstanding request count, synchronously.
   *
   * `getDiagnostics` is async because version detection may need to spawn a
   * probe; the pending count needs neither I/O nor a promise, and the provider
   * contract's `pendingPermissionCount()` is synchronous so that a diagnostics
   * render cannot be made to await a runtime. Reads the same map, so the two
   * cannot disagree.
   */
  pendingPermissionCountSync(): number {
    return this.pending.size;
  }

  async getDiagnostics(): Promise<AdvisorDiagnostics> {
    return {
      transportVersion: this.version,
      connected: this.child !== null,
      sessionId: this.sessionId,
      workspacePath: this.workspacePath,
      workingDirectory: this.workspacePath,
      runtimeVersion: this.runtimeVersion ?? (await this.detectVersion()),
      processState: this.processState,
      lastEventKind: this.lastEventKind,
      pendingPermissionCount: this.pending.size,
    };
  }
}
