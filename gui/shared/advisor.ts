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
 * The advisor may pause mid-turn to ask permission before writing to the
 * repository. A one-shot "send prompt, read reply" transport has no channel to
 * carry the answer back, so permission prompts could only be auto-approved —
 * which would break terminal-equivalent behaviour. The session is therefore
 * long-lived and bidirectional: `send` starts a turn, `respondToPermission`
 * answers a question raised during it.
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
 *    user. An implementation may never answer on their behalf.
 * 5. TOTAL ERRORS. Failures arrive as `ErrorEvent`. Implementations do not
 *    throw across the boundary, and never crash the host.
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
export const TRANSPORT_VERSION = 'v1' as const;
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
 * An action the engine attempted that was refused for want of consent.
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT: THIS IS A DENIAL NOTICE, NOT A BLOCKING PROMPT
 * ---------------------------------------------------------------------------
 * The programmatic runtime does not pause to ask. It refuses the action, tells
 * the advisor it was refused, and continues — so by the time this event exists
 * the attempt has already failed and the advisor has already reacted to the
 * refusal.
 *
 * Consequences the UI must respect:
 *   - Granting consent cannot resume the original attempt. It can only
 *     authorise a fresh attempt, which is a new turn.
 *   - The advisor's transcript contains the refusal either way. Approving after
 *     the fact does not rewrite history, and the UI must not imply that it does.
 *
 * `requestId` is minted by the transport so the UI has a stable handle for the
 * user's decision. It is not a runtime-issued token.
 */
export interface PermissionDeniedEvent {
  kind: 'permission-denied';
  turnId: string;
  requestId: string;
  /** Tool the engine tried to use, as reported. */
  tool: string;
  /** Plain-language description of the attempted action. */
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
  | PermissionDeniedEvent
  | RuntimeNoticeEvent
  | TurnCompleteEvent
  | ErrorEvent;

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
   * Record the user's decision on a `PermissionDeniedEvent`.
   *
   * `allow` authorises a **fresh attempt** — it cannot resume the refused one.
   * Never called automatically (invariant 4).
   */
  respondToPermission(requestId: string, decision: 'allow' | 'deny'): Promise<void>;

  /** Interrupt the current turn. Safe to call when idle. */
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
