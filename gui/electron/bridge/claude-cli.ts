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
} from '../../shared/advisor';
import { TRANSPORT_VERSION } from '../../shared/advisor';
import {
  composeTurn,
  DEFAULT_COUNCIL_MODE,
  type RuntimeMode,
} from '../../shared/runtime-modes';
import { toAdvisorEvents, type ParserState } from './events';

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

interface PendingGrant {
  tool: string;
  requestId: string;
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
   * Tools the user has approved for the NEXT attempt, keyed by requestId.
   *
   * Populated only by an explicit user decision. See permission-policy.ts for
   * why post-hoc approval is the only mechanism available.
   */
  private grants = new Map<string, PendingGrant>();
  private allowedTools = new Set<string>();

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

    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      resume ? '--resume' : '--session-id',
      this.sessionId,
    ];

    // Only tools the user explicitly approved, and only while a grant is live.
    if (this.allowedTools.size > 0) {
      args.push('--allowedTools', [...this.allowedTools].join(' '));
    }

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
    child.stdout.on('data', (chunk: string) => this.onStdout(chunk));

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
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
      this.processState = 'exited';
      this.emit({
        kind: 'error',
        turnId: this.turnId,
        message: `Runtime failed to start: ${error.message}`,
        fatal: true,
      });
    });

    child.on('exit', (code) => {
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
        // A respawn owns the turn from here: leave `turnId` and the grants in
        // place, because the retry is the same turn by another process.
        if (recovery === 'respawned') return;

        this.turnId = null;
        this.allowedTools.clear();

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
      // Grants are single-use: one approval authorises one attempt.
      this.allowedTools.clear();
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
   */
  private writeTurn(child: ChildProcessWithoutNullStreams, text: string): void {
    // `text` is placed in the message unchanged. No wrapping, no re-encoding.
    // Whatever composition was going to happen happened once, in `send`.
    const message = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] },
    };

    child.stdin.write(`${JSON.stringify(message)}\n`);
    // Print mode processes one turn then exits; closing stdin signals completion
    // of input. Keeping it open makes the child wait indefinitely.
    child.stdin.end();
  }

  async cancel(): Promise<void> {
    if (!this.child) return;
    const turnId = this.turnId;
    this.child.kill();
    this.child = null;
    this.turnId = null;
    // Dropping the retained text is what makes the kill final: without it the
    // child's own exit could be classified as a mid-flight death and resend a
    // turn the founder just interrupted.
    this.pendingText = null;
    this.processState = 'stopped';
    if (turnId) {
      this.emit({ kind: 'turn-complete', turnId });
    }
  }

  async close(): Promise<void> {
    await this.cancel();
    this.stdoutBuffer = '';
    this.grants.clear();
    this.allowedTools.clear();
  }

  /* -------------------------------------------------------------- permissions */

  /**
   * Record a decision on a refused action.
   *
   * `allow` adds the tool to a single-use allowlist for the next attempt. It
   * cannot retroactively permit the attempt that was already refused — that
   * request is gone and the advisor has already been told it failed.
   */
  async respondToPermission(requestId: string, decision: 'allow' | 'deny'): Promise<void> {
    const grant = this.grants.get(requestId);
    this.grants.delete(requestId);
    if (!grant) return;
    if (decision === 'allow') this.allowedTools.add(grant.tool);
  }

  registerPendingGrant(requestId: string, tool: string): void {
    this.grants.set(requestId, { requestId, tool });
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

    const { events, lastKind } = toAdvisorEvents(raw, {
      turnId: this.turnId ?? '',
      state: this.parserState,
      registerGrant: (requestId, tool) => this.registerPendingGrant(requestId, tool),
    });

    if (lastKind) this.lastEventKind = lastKind;

    for (const event of events) {
      // The turn reached its own conclusion, so a later non-zero exit is not a
      // mid-flight death and must not be recovered from or re-reported.
      if (event.kind === 'turn-complete') this.sawTerminalResult = true;
      this.emit(event);
    }
  }

  /* -------------------------------------------------------------- diagnostics */

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
      pendingPermissionCount: this.grants.size,
    };
  }
}
