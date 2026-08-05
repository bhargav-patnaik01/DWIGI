/**
 * Executive Sessions — the lifecycle model behind "each executive reasons
 * independently."
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ACTUALLY INDEPENDENT, STATED PRECISELY
 * ---------------------------------------------------------------------------
 * An "Executive Session" in this file is **a conversation record** —
 * `shared/conversations.ts`'s `ConversationSummary` — scoped to one lens, to
 * the Council, or to the Council's isolated-reasoning variant. Independence is
 * real and is already load-bearing elsewhere in this codebase:
 *
 *   - Each is a **separate transcript** on disk, with its own message history.
 *   - Each carries its own **opaque engine session handle**
 *     (`ConversationSummary.sessionId`), so resuming the CFO's conversation
 *     never resumes the CEO's.
 *   - `/lens <id>` and `/deliberate-isolated` are **engine-level** isolation —
 *     a single-agent conversation never sees another lens's reasoning, and an
 *     isolated Council deliberation spawns each lens in its own execution
 *     context with no visibility into the others (`.claude/commands/lens.md`,
 *     `.claude/commands/deliberate-isolated.md`, and the existing
 *     `tests/isolated-pipeline.test.mjs`, which this file does not duplicate).
 *
 * What this file adds is the **lifecycle and roster** on top of that —
 * Created/Idle/Thinking/Responding/Archived/Disposed, tracked per executive,
 * with explicit transitions — because that bookkeeping did not exist before
 * v1.2.3 and "Chat with CFO" simply spawned a new conversation every time.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT CLAIM, AND WHY THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------
 * There is **one active runtime session** in this application
 * (`shared/runtime/contract.ts`, ADR-013 §E) — one AI, one process, one
 * conversation genuinely in flight at a time. That is unchanged and is not
 * touched by anything here.
 *
 * So `deriveState` can report **at most one** session as `thinking` or
 * `responding` at any moment — never eight executives simultaneously "active."
 * A design that showed concurrent live activity for every lens would be
 * fabricating a multi-process reality this application does not have, which is
 * exactly what `gui/README.md` and `KNOWN_LIMITATIONS.md` forbid: *"No live
 * per-executive activity is shown, ever."* This file is how that rule and "the
 * founder should understand each executive is an independent session" are both
 * satisfied at once — independence is about isolation and history, not about
 * concurrent animation.
 *
 * Pure types and pure functions throughout, so the lifecycle can be tested
 * without mounting a window — "No UI assumptions" (v1.2.3 Part D).
 */

import type { ConversationMode, ConversationSummary } from './conversations';

/* -------------------------------------------------------------------------- */
/* Roster                                                                     */
/* -------------------------------------------------------------------------- */

/** The Council's own session — the Chief of Staff's shared-context conversation. */
export const COUNCIL_SESSION_KEY = '__council__';

/** The Council's isolated-reasoning session — see `.claude/commands/deliberate-isolated.md`. */
export const ISOLATED_COUNCIL_SESSION_KEY = '__council_isolated__';

export type SessionKind = 'lens' | 'council';

/**
 * One addressable session slot.
 *
 * The roster is fixed by what `core/executives/` and the manifest declare, plus
 * the two Council slots — nothing here invents a lens or hides one the matrix
 * defines, mirroring the rule `useExecutiveRoster` already applies to the board.
 */
export interface SessionSlot {
  key: string;
  kind: SessionKind;
  /** Canonical lens id for a `lens` slot; null for either Council slot. */
  lensId: string | null;
  /** True only for the isolated-reasoning Council slot. */
  isolated: boolean;
  /** Display name — the lens's own name, or "Chief of Staff". */
  label: string;
}

/** Minimal shape this module needs from a projected lens. Avoids importing the full type. */
export interface LensLike {
  id: string;
  name: string;
}

/**
 * The full roster: one slot per known lens, plus the Council and its isolated
 * variant.
 *
 * Order is deterministic — lenses in the order supplied (already canonical by
 * the time `useExecutiveRoster` produces them), Council slots last — so the
 * Session Board renders identically across launches regardless of iteration
 * order anywhere upstream.
 */
export function sessionRoster(lenses: readonly LensLike[]): SessionSlot[] {
  return [
    ...lenses.map((lens) => ({
      key: lens.id,
      kind: 'lens' as const,
      lensId: lens.id,
      isolated: false,
      label: lens.name,
    })),
    {
      key: COUNCIL_SESSION_KEY,
      kind: 'council' as const,
      lensId: null,
      isolated: false,
      label: 'Chief of Staff',
    },
    {
      key: ISOLATED_COUNCIL_SESSION_KEY,
      kind: 'council' as const,
      lensId: null,
      isolated: true,
      label: 'Chief of Staff (isolated)',
    },
  ];
}

/** Which slot a stored conversation's mode belongs to, or null if it matches none. */
export function slotKeyForMode(mode: ConversationMode): string {
  if (mode.kind === 'lens') return mode.lensId ?? '';
  return mode.isolated ? ISOLATED_COUNCIL_SESSION_KEY : COUNCIL_SESSION_KEY;
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The six states v1.2.3 Part C names.
 *
 * `disposed` is a real state in the transition table (`canTransition`) but is
 * never returned by `deriveState`: a disposed session has no conversation
 * record left to derive a state *from*. Its meaning is the row's absence from
 * the roster's live results — see `SessionBoard`'s handling of a slot with no
 * current or archived history.
 */
export type SessionLifecycleState =
  | 'created'
  | 'idle'
  | 'thinking'
  | 'responding'
  | 'archived'
  | 'disposed';

/**
 * Explicit transition table.
 *
 * ---------------------------------------------------------------------------
 * "STATE TRANSITIONS MUST BE EXPLICIT" — THIS IS WHAT THAT MEANS IN CODE
 * ---------------------------------------------------------------------------
 * Every edge a session can legally take, and nothing else. `responding ->
 * thinking` is not on this list: once tokens have started arriving, the turn
 * cannot un-start. `archived -> idle` is not on this list either: a reset
 * session's next use always begins at `created`, spawning a fresh conversation
 * rather than resurrecting the archived one — that is what makes Reset a real
 * reset rather than a pause.
 *
 * `disposed` is terminal. Nothing transitions out of it, because the record it
 * would transition *from* no longer exists to hold a state.
 */
export const SESSION_TRANSITIONS: Readonly<Record<SessionLifecycleState, readonly SessionLifecycleState[]>> = {
  created: ['thinking', 'disposed'],
  idle: ['thinking', 'archived', 'disposed'],
  thinking: ['responding', 'idle'],
  responding: ['idle'],
  archived: ['created', 'disposed'],
  disposed: [],
};

export function canTransition(from: SessionLifecycleState, to: SessionLifecycleState): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

/** Inputs available to determine one session's current state — real facts only. */
export interface SessionStateInput {
  /** Does a non-archived conversation exist for this slot? */
  hasCurrentConversation: boolean;
  /** Has that conversation ever recorded a settled message? */
  hasMessages: boolean;
  /** Does at least one archived conversation exist for this slot? */
  hasArchivedHistory: boolean;
  /** Is this slot's conversation the one currently open on screen? */
  isOpen: boolean;
  /**
   * The chat store's turn status — meaningful only when `isOpen` is true.
   * Ignored otherwise, because a session that is not on screen cannot have a
   * turn in flight: there is one active runtime session, and it is always the
   * open conversation's.
   */
  turnStatus: 'idle' | 'working' | 'awaiting-permission' | 'error';
  /**
   * True while a turn is in flight and no advisor text has arrived yet.
   * Distinguishes `thinking` (nothing to show) from `responding` (streaming).
   */
  awaitingFirstToken: boolean;
}

/**
 * Derive one session's lifecycle state from what is actually known.
 *
 * ---------------------------------------------------------------------------
 * PRIORITY ORDER, AND WHY THE IN-FLIGHT CHECK COMES FIRST
 * ---------------------------------------------------------------------------
 * A turn in flight is checked *before* `hasMessages`. The obvious ordering —
 * "no messages yet, so this must be freshly created" — is wrong for exactly the
 * case that matters most: the first turn of a brand-new session. The founder
 * has just sent the opening message, a turn is genuinely in flight, and the
 * transcript has not been flushed to disk yet (`persistedCount` lags by design
 * — see `src/lib/conversations/recorder.ts`). Checking `hasMessages` first
 * would report a session that is actively thinking as merely `created`, which
 * is the one moment a founder most wants to see that something is happening.
 *
 * `isOpen` with a turn in flight implies a current conversation exists — it is
 * the one on screen — so this ordering never needs to consult
 * `hasCurrentConversation` to reach `thinking`/`responding`.
 *
 * Every remaining combination is total: this function always returns exactly
 * one state, so the board never renders "unknown."
 */
export function deriveState(input: SessionStateInput): SessionLifecycleState {
  if (input.isOpen && (input.turnStatus === 'working' || input.turnStatus === 'awaiting-permission')) {
    return input.awaitingFirstToken ? 'thinking' : 'responding';
  }

  if (!input.hasCurrentConversation) {
    return input.hasArchivedHistory ? 'archived' : 'created';
  }

  if (!input.hasMessages) return 'created';

  return 'idle';
}

/**
 * A full session row, as the Session Board renders it.
 *
 * Deliberately flat and free of message content. See the header on context
 * isolation: a session record is metadata about a conversation, never the
 * conversation itself, so there is no field here through which one executive's
 * reasoning could reach another's row.
 */
export interface SessionRecord {
  slot: SessionSlot;
  state: SessionLifecycleState;
  conversationId: string | null;
  /** Opaque engine handle, carried for diagnostics only — never parsed or displayed raw. */
  engineSessionId: string | null;
  /** Epoch millis of the current or most recent conversation's last activity. */
  lastActivityAt: number | null;
  /**
   * The Active Brain powering this session if it were opened right now.
   *
   * Every session shares the one active runtime (ADR-013 §E) — this is not a
   * per-session provider assignment, and the field says so by naming the whole
   * application's current choice rather than something scoped to this row.
   */
  providerId: string | null;
}

/**
 * At most one session may be `thinking` or `responding` at a time.
 *
 * A structural invariant of the single-active-runtime architecture, not a
 * business rule — exported so both the test suite and, if ever useful, a
 * runtime assertion can check the roster against reality rather than trusting
 * that the derivation logic upholds it by construction.
 */
export function atMostOneActive(records: readonly SessionRecord[]): boolean {
  const active = records.filter((r) => r.state === 'thinking' || r.state === 'responding');
  return active.length <= 1;
}

/* -------------------------------------------------------------------------- */
/* Context isolation (v1.2.3 Part E)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Exactly what one executive receives when reasoning — nothing else.
 *
 * ---------------------------------------------------------------------------
 * THIS TYPE IS DOCUMENTATION WITH A COMPILER BEHIND IT, NOT A RUNTIME OBJECT
 * ---------------------------------------------------------------------------
 * The GUI never constructs an executive's prompt — the engine does, entirely
 * inside `.claude/commands/lens.md` and `.claude/commands/deliberate-isolated.md`,
 * which is why this file has no function that builds one. What the GUI *can*
 * guarantee is that nothing it owns — `SessionRecord`, the conversation store,
 * the transport — carries a fifth field a future change could wire into that
 * prompt by accident.
 *
 * So this interface exists to be the fifth-field tripwire: if someone adds
 * `otherExecutivePositions` or `siblingReasoning` here, the test asserting this
 * type's key set is exactly these four names fails immediately, at the type
 * definition, before any such field could reach a real conversation.
 */
export interface ExecutiveContextScope {
  businessMemory: true;
  executiveProfile: true;
  workspace: true;
  currentRequest: true;
}

/** The only legal keys of `ExecutiveContextScope`. Read by the isolation test. */
export const EXECUTIVE_CONTEXT_KEYS = [
  'businessMemory',
  'executiveProfile',
  'workspace',
  'currentRequest',
] as const;
