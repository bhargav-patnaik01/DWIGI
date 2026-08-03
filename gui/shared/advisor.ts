/**
 * AdvisorTransport — the sole contract between the cockpit and the reasoning engine.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS DELIBERATELY VENDOR-NEUTRAL
 * ---------------------------------------------------------------------------
 * Nothing here names Claude, Anthropic, a CLI flag, a process, or a wire
 * format. The UI imports only these types. A future runtime — Claude Agent
 * SDK, a Tauri/Rust host, something local — is a new implementation of this
 * interface and nothing more. If a Claude-specific term ever appears in this
 * file, the abstraction has leaked and the migration cost has returned.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A PERSISTENT SESSION RATHER THAN REQUEST/RESPONSE
 * ---------------------------------------------------------------------------
 * The advisor pauses mid-turn to ask permission before writing to the
 * repository. A one-shot "send prompt, read reply" transport has no channel to
 * carry the answer back, so permission prompts could only be auto-approved —
 * which would break terminal-equivalent behaviour. The session is therefore
 * long-lived and bidirectional: `send` starts a turn, `respondToPermission`
 * answers a question raised during it, and the engine is genuinely blocked in
 * between.
 *
 * That last clause was aspirational in v1 and is load-bearing in v2. See
 * `PermissionRequestEvent`.
 *
 * ---------------------------------------------------------------------------
 * INVARIANTS THAT ANY IMPLEMENTATION MUST UPHOLD
 * ---------------------------------------------------------------------------
 * 1. VERBATIM INPUT, EXCEPT UNDER AN EXPLICIT FOUNDER-SELECTED MODE.
 *    `send(text)` transmits `text` byte-for-byte: no prefixing, no suffixing,
 *    no templating, no system-prompt injection, no hidden mode flags. The
 *    cockpit must not be able to make the advisor behave differently than the
 *    same words typed in a terminal.
 *
 *    The one sanctioned departure is `send(text, mode)`, where `mode` is a
 *    `RuntimeMode` the founder selected in the interface. Four properties keep
 *    it from reopening what this invariant closes, and all four are enforced in
 *    `shared/runtime-modes.ts` rather than promised here:
 *
 *      - The default mode composes nothing. An unconfigured cockpit is still
 *        byte-identical to a terminal.
 *      - The prefix is a repository-defined command, so its meaning lives in
 *        `.claude/commands/` and not in this application.
 *      - No prompt text, persona description, or reasoning instruction is
 *        composed here. The cockpit knows command names and argument order.
 *      - `directiveFor` exposes exactly what was prefixed, so the interface can
 *        show it. A mode the founder cannot see would be a hidden mode flag.
 * 2. VERBATIM OUTPUT. Emitted text is never rewritten, summarised, filtered,
 *    or reordered. Rendering is the UI's business; content is not.
 * 3. NO FABRICATION. Every `ActivityEvent` corresponds to something the
 *    engine actually reported. The cockpit never infers activity it did not
 *    observe, and never invents reasoning steps to fill silence.
 * 4. NO SILENT APPROVAL. A `PermissionRequestEvent` is always surfaced to the
 *    user. An implementation may never answer on their behalf — including by
 *    timing out. A request with no answer stays open until the user answers it
 *    or cancels the turn, exactly as a terminal prompt does.
 * 5. TOTAL ERRORS. Failures arrive as `ErrorEvent`. Implementations do not
 *    throw across the boundary, and never crash the host.
 * 6. NO ORPHANED REQUESTS. Every `PermissionRequestEvent` is eventually
 *    resolved — by the user, or by the transport when the turn ends for any
 *    reason. An implementation that can leave a request outstanding after
 *    `turn-complete` or a fatal `error` has a deadlock, not an edge case.
 */

import type { RuntimeMode } from './runtime-modes';

export type { RuntimeMode };

/**
 * Transport protocol version.
 *
 * Bumped when the event vocabulary or method signatures change. The renderer
 * reads it for diagnostics and may refuse to talk to a host advertising a
 * version it does not understand, which keeps protocol evolution isolated
 * behind this layer instead of leaking into components.
 */
export const TRANSPORT_VERSION = 'v2' as const;
export type TransportVersion = typeof TRANSPORT_VERSION;

/** Lifecycle of a single conversational turn. */
export type TurnStatus = 'idle' | 'working' | 'awaiting-permission' | 'error';

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

/** A turn has begun. `sessionId` is opaque to the UI — never parse it. */
export interface TurnStartedEvent {
  kind: 'turn-started';
  turnId: string;
  sessionId: string;
}

/** Incremental assistant text. Append in arrival order; do not reorder. */
export interface TextDeltaEvent {
  kind: 'text-delta';
  turnId: string;
  text: string;
}

/**
 * A complete assistant message, authoritative over accumulated deltas.
 * Replace the streaming buffer with this rather than trusting concatenation —
 * deltas can be dropped, a final message cannot be partially wrong.
 */
export interface MessageCompleteEvent {
  kind: 'message-complete';
  turnId: string;
  text: string;
}

/**
 * Something the engine actually did, for the activity timeline.
 *
 * `label` is display-ready and originates from the engine's own report.
 * Implementations must not synthesise labels for work they did not observe
 * (invariant 3).
 */
export interface ActivityEvent {
  kind: 'activity';
  turnId: string;
  activityId: string;
  label: string;
  /** Narrow, presentational hint. Not a reasoning classification. */
  category: 'read' | 'write' | 'search' | 'run' | 'other';
  state: 'started' | 'completed' | 'failed';
}

/**
 * The engine is blocked, waiting for consent before it may act.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A BLOCKING PROMPT. THE ENGINE IS STOPPED UNTIL IT IS ANSWERED.
 * ---------------------------------------------------------------------------
 * v1 of this contract carried a `PermissionDeniedEvent` instead, on the
 * documented belief that the programmatic runtime could not pause for consent
 * and could only report refusals after the fact. That belief was wrong. The
 * runtime blocks indefinitely; the v1 transport merely closed the channel the
 * question would have arrived on.
 *
 * What the UI must now respect is the inverse of what it respected before:
 *   - The attempt has NOT happened yet. Nothing has been written or run.
 *   - Answering `allow` completes the original attempt inside the same turn.
 *     There is no retry, no second turn, and no new message.
 *   - Answering `deny` suppresses the attempt entirely and tells the advisor
 *     so, which it will respond to in the same turn.
 *   - Leaving it unanswered stops the advisor indefinitely. This is correct
 *     behaviour and matches the terminal, but it means the UI may never lose
 *     track of an open request — see invariant 6.
 *
 * `requestId` is the runtime's own correlation token, not a cockpit-minted
 * handle. It must be returned verbatim; a fabricated id resolves nothing and
 * the engine stays blocked.
 */
export interface PermissionRequestEvent {
  kind: 'permission-request';
  turnId: string;
  /** Runtime-issued correlation token. Opaque — return it, never parse it. */
  requestId: string;
  /** Tool awaiting consent, as reported by the engine. */
  tool: string;
  /** Plain-language description of what is about to happen. */
  summary: string;
  /** Paths or targets the action would affect, when reported. */
  targets: string[];
  category: ActivityEvent['category'];
  /**
   * Detail the engine supplied about the pending call, for display only.
   *
   * Present when the runtime reports something worth showing that the summary
   * cannot carry — the command line for `Bash`, the replacement text for an
   * `Edit`. Never interpreted, never used to decide anything.
   */
  detail?: string;
}

/**
 * An action the engine refused on its own authority, without asking.
 *
 * Retained from v1 with a narrowed meaning. The runtime still short-circuits
 * some tool calls before they ever reach a prompt — a deny rule, a classifier,
 * a sandbox policy. Those never produce a `PermissionRequestEvent`, so without
 * this event the founder would see only an opaque tool failure.
 *
 * It is strictly a notice. There is nothing to answer and no `requestId`,
 * because no question was asked. Anything the cockpit *was* asked about and
 * itself denied is reported through the request it answered, never here.
 */
export interface PermissionDeniedEvent {
  kind: 'permission-denied';
  turnId: string;
  /** Tool the engine tried to use, as reported. */
  tool: string;
  /** Plain-language description of the refused action. */
  summary: string;
  /** Paths or targets affected, when reported. */
  targets: string[];
  category: ActivityEvent['category'];
}

/** Resource-pressure notice from the runtime. Advisory; never blocks. */
export interface RuntimeNoticeEvent {
  kind: 'runtime-notice';
  turnId: string;
  severity: 'info' | 'warning';
  message: string;
}

/** The turn ended normally. */
export interface TurnCompleteEvent {
  kind: 'turn-complete';
  turnId: string;
  /** Present only when the runtime reports it. Never computed by the cockpit. */
  stats?: { durationMs?: number; costUsd?: number; turns?: number };
}

/** The turn failed, or the transport did. Recoverable unless `fatal`. */
export interface ErrorEvent {
  kind: 'error';
  turnId: string | null;
  message: string;
  fatal: boolean;
}

export type AdvisorEvent =
  | TurnStartedEvent
  | TextDeltaEvent
  | MessageCompleteEvent
  | ActivityEvent
  | PermissionRequestEvent
  | PermissionDeniedEvent
  | RuntimeNoticeEvent
  | TurnCompleteEvent
  | ErrorEvent;

/**
 * How the user answered a `PermissionRequestEvent`.
 *
 * Only two values, because only two things can be said to a blocked engine.
 * Cancelling the turn is not a third answer — it is `cancel()`, which ends the
 * turn outright and resolves any open request as a side effect.
 */
export type PermissionDecision = 'allow' | 'deny';

/** Read-only host and session facts, for the developer diagnostics panel. */
export interface AdvisorDiagnostics {
  transportVersion: TransportVersion;
  connected: boolean;
  sessionId: string | null;
  workspacePath: string | null;
  /** Working directory the runtime was actually spawned in. */
  workingDirectory: string | null;
  /** Runtime version string, verbatim. Null if it could not be determined. */
  runtimeVersion: string | null;
  /** Live process state. */
  processState: 'stopped' | 'starting' | 'ready' | 'exited';
  /** Discriminator of the most recent raw event, for debugging only. */
  lastEventKind: string | null;
  /** Requests the engine is currently blocked on, awaiting an answer. */
  pendingPermissionCount: number;
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

export interface AdvisorSessionOptions {
  /**
   * Absolute path to the Executive Intelligence System repository.
   *
   * This is the ONLY context the cockpit provides. The engine discovers its
   * own operating instructions from this directory — which is precisely why
   * the cockpit needs no knowledge of them.
   */
  workspacePath: string;
  /** Resume a prior session. Omit to start fresh. */
  resumeSessionId?: string;
}

export interface AdvisorTransport {
  readonly version: TransportVersion;

  /** True when the host can actually reach a runtime. */
  isAvailable(): Promise<boolean>;

  /** Open a session. Idempotent per workspace. */
  open(options: AdvisorSessionOptions): Promise<{ sessionId: string }>;

  /**
   * Send one user message (invariant 1). Resolves with the turn id.
   *
   * `mode` is omitted for ordinary Council turns, in which case `text` is
   * transmitted byte-for-byte. Supplying a founder-selected mode is the only way
   * to alter the bytes, and the alteration is a repository command prefix that
   * `directiveFor` will disclose.
   */
  send(text: string, mode?: RuntimeMode): Promise<{ turnId: string }>;

  /**
   * Answer a `PermissionRequestEvent`, unblocking the engine.
   *
   * `allow` completes the pending call inside the turn already in flight.
   * `deny` suppresses it and tells the advisor why. Neither starts a new turn.
   *
   * Idempotent and total: answering an unknown or already-answered request is a
   * no-op rather than an error, because a double-click must not throw across
   * the boundary (invariant 5). Never called automatically (invariant 4).
   */
  respondToPermission(requestId: string, decision: PermissionDecision): Promise<void>;

  /**
   * Interrupt the current turn. Safe to call when idle.
   *
   * Resolves any outstanding permission request as a side effect, so cancelling
   * is always available as the escape from a prompt the user does not want to
   * answer (invariant 6).
   */
  cancel(): Promise<void>;

  /** Close the session and release the runtime. */
  close(): Promise<void>;

  /** Subscribe to events. Returns an unsubscribe function — always call it. */
  subscribe(listener: (event: AdvisorEvent) => void): () => void;

  /** Snapshot for diagnostics. Must have no side effects on the session. */
  getDiagnostics(): Promise<AdvisorDiagnostics>;
}

/** Thrown only by the null transport, so a missing host fails loudly in dev. */
export class TransportNotImplementedError extends Error {
  constructor(method: string) {
    super(
      `AdvisorTransport.${method} is unavailable: no host process is present. ` +
        `The cockpit runs read-only in a plain browser; the advisor requires the desktop application.`
    );
    this.name = 'TransportNotImplementedError';
  }
}
