/**
 * Conversation persistence contract — shared by the host and the renderer.
 *
 * ---------------------------------------------------------------------------
 * WHY THE COCKPIT KEEPS ITS OWN TRANSCRIPT AT ALL
 * ---------------------------------------------------------------------------
 * The reasoning engine already persists its own conversation history. That
 * history is vendor-specific, lives outside this application, and reading it
 * would make the cockpit engine-aware everywhere instead of in one file — the
 * exact leak `shared/advisor.ts` exists to prevent.
 *
 * So there are deliberately **two records joined by one pointer**:
 *
 *   - the engine's record — what the advisor remembers, used to continue reasoning
 *   - the cockpit's record — what the founder was shown, used to redraw the screen
 *   - `sessionId` — the opaque handle that links them
 *
 * They can diverge. If the engine's history is pruned or the machine changes,
 * the cockpit can still redraw a transcript the advisor no longer remembers.
 * That state is legitimate and must be **disclosed**, never papered over: a
 * founder who believes the advisor recalls a decision it has actually forgotten
 * is worse off than one told plainly that continuity broke.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS IS STORED, AND WHERE IT IS NOT
 * ---------------------------------------------------------------------------
 * In the host's own application-data directory. **Never inside the repository.**
 * The cockpit writes nothing to `core/`, `journal/`, or `dossier/` — those are
 * the advisor's, and deleting `gui/` must leave the Executive Intelligence
 * System byte-identical to a terminal-only install.
 *
 * Pure types only, apart from the small readers at the foot of the file.
 */

import { DEFAULT_MEMORY_SCOPE, readMemoryScope, type MemoryScope } from './runtime-modes';

export type { MemoryScope };

/**
 * On-disk format version.
 *
 * Bumped when the record shape changes. A stored record carrying an unknown
 * version is skipped rather than guessed at — a misread transcript would show
 * the founder words nobody said.
 */
export const CONVERSATION_SCHEMA_VERSION = 1 as const;

/** Longest stored title. Titles are truncated user text, never a summary. */
export const TITLE_MAX_LENGTH = 72;

/**
 * Placeholder title for a conversation with no stored messages.
 *
 * Also the signal that a title may still be adopted from the founder's first
 * words: a conversation created with a real title of its own — a single-agent
 * chat, named for its executive — keeps it.
 */
export const NEW_CONVERSATION_TITLE = 'New conversation';

/**
 * Which kind of conversation this is.
 *
 * ---------------------------------------------------------------------------
 * INTERFACE METADATA, NOT REASONING STATE
 * ---------------------------------------------------------------------------
 * This records what the founder chose, so the right screen can be drawn and the
 * right runtime mode transmitted on the next turn. It holds no persona text, no
 * routing decision, and no business content.
 *
 * `lensId` is a canonical identifier from `core/executives/` and nothing else.
 * The executive's name, role, and mandate are read from the repository every
 * time they are displayed — storing them here would be a copy that goes stale
 * the moment that executive's file is edited.
 */
export interface ConversationMode {
  kind: 'council' | 'lens';
  /** Canonical lens id when `kind` is `lens`; null for Council conversations. */
  lensId: string | null;
  /**
   * Whether this conversation is grounded in the founder's own company.
   *
   * Fixed when the conversation is created and never written again. The global
   * default is a setting for the *next* conversation; this is a property of
   * *this* one.
   *
   * That distinction is the whole feature. A founder who switches the default to
   * Executive Learning and then reopens last month's fundraising thread must not
   * find it answering as though it had never heard of their company — and the
   * reverse, a Learning conversation silently acquiring their cash position on
   * reopen, is worse still. Neither can happen if the value is only ever read
   * back from the record it was written into.
   *
   * Records written before this field existed read back as `business`, which is
   * what they were: the only mode that existed.
   */
  memory: MemoryScope;
}

/**
 * A mode as a *caller* supplies it when starting a conversation.
 *
 * `memory` is optional here and required on the stored record. That asymmetry is
 * deliberate: the scope is resolved from the founder's current setting in one
 * place (`useConversations.startNew`) rather than by every caller, so a screen
 * that opens a conversation cannot forget to attach it and silently produce a
 * Business thread for someone who selected Executive Learning.
 *
 * Supplying it explicitly still wins, for a caller with a reason.
 */
export type NewConversationMode = Omit<ConversationMode, 'memory'> & {
  memory?: MemoryScope;
};

/** The default: normal Executive Intelligence behaviour, grounded in the company. */
export const COUNCIL_CONVERSATION_MODE: ConversationMode = {
  kind: 'council',
  lensId: null,
  memory: DEFAULT_MEMORY_SCOPE,
};

/**
 * One settled message, exactly as it was shown.
 *
 * Only settled messages are stored. A partially streamed message is never
 * persisted, because a transcript that records a half-finished recommendation
 * as if it were the whole one is a fabrication of the worst kind.
 */
export interface PersistedMessage {
  id: string;
  role: 'user' | 'advisor';
  text: string;
  createdAt: number;
}

/**
 * Index entry for one conversation. Cheap to list; carries no message bodies.
 */
export interface ConversationSummary {
  /** Cockpit-minted, stable for the life of the conversation. */
  id: string;
  /**
   * Opaque engine session handle, or null before the first turn establishes one.
   *
   * Never parsed, never displayed, never constructed by the renderer. It is a
   * handle to be handed back to the transport and nothing else.
   */
  sessionId: string | null;
  /** Repository this conversation belongs to. Sessions are workspace-scoped. */
  workspacePath: string;
  /** First words the founder typed, truncated. See `deriveTitle`. */
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Settled messages on disk. Not a turn count. */
  messageCount: number;
  /**
   * Council or single-agent, decided when the conversation was created.
   *
   * Immutable for the life of the conversation. A transcript that changed mode
   * part-way through would leave earlier answers labelled by a scope that did not
   * produce them — and the whole point of the label is that a single executive's
   * view is never mistaken for the Council's.
   *
   * Records written before this field existed read back as Council, which is what
   * they were.
   */
  mode: ConversationMode;
}

export interface ConversationTranscript {
  summary: ConversationSummary;
  messages: PersistedMessage[];
  /**
   * True when at least one stored line could not be read and was skipped.
   *
   * Surfaced rather than swallowed. A transcript with a hole in it is still
   * worth showing, but the founder is entitled to know it has one.
   */
  incomplete: boolean;
}

/**
 * Uniform result shape. The store reports failure; it does not throw across the
 * IPC boundary, for the same reason the transport does not (invariant 5).
 */
export type ConversationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/**
 * Title from the founder's own first words.
 *
 * ---------------------------------------------------------------------------
 * THIS IS TRUNCATION, NOT SUMMARISATION
 * ---------------------------------------------------------------------------
 * Whitespace is collapsed and the string is cut. Nothing is paraphrased,
 * classified, or characterised. Generating a title — "Pricing strategy
 * decision" — would be the cockpit inferring what a conversation was *about*,
 * which is reasoning, and reasoning is not the cockpit's job.
 *
 * Lives in `shared/` so the host and the renderer cannot drift on it.
 */
export function deriveTitle(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return 'Untitled';
  if (collapsed.length <= TITLE_MAX_LENGTH) return collapsed;
  return `${collapsed.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * Conversation ids are UUIDs, and only the host mints them.
 *
 * Validated on every call that names one, because ids arrive from the renderer
 * and are used to build filenames. Restricting the alphabet to a UUID makes
 * path traversal impossible by construction rather than by guard — `..` simply
 * is not a representable id.
 */
export function isConversationId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Accept a conversation mode from storage or from the renderer.
 *
 * Anything unrecognised — including absence, which is every record written
 * before this field existed — reads back as Council. That direction is the safe
 * one: a Council conversation mislabelled as single-agent would tell the founder
 * a full deliberation was one executive's opinion, while the reverse is caught by
 * the standing scope warning a lens conversation always carries.
 *
 * The lens id is validated for *shape* only. Whether it names a real executive is
 * decided by the projected matrix at display time, because the matrix can change
 * between a conversation being created and being reopened.
 */
export function readConversationMode(value: unknown): ConversationMode {
  if (typeof value !== 'object' || value === null) return COUNCIL_CONVERSATION_MODE;
  const record = value as Record<string, unknown>;

  /*
   * Scope is read independently of kind.
   *
   * The two are orthogonal — a single-executive conversation can be either
   * grounded or not — and reading them together would mean one malformed field
   * silently resetting the other. An unreadable lens id must not be able to
   * turn a Learning conversation into a Business one.
   */
  const memory = readMemoryScope(record.memory);

  if (record.kind !== 'lens') return { kind: 'council', lensId: null, memory };
  if (typeof record.lensId !== 'string') return { kind: 'council', lensId: null, memory };
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(record.lensId)) {
    return { kind: 'council', lensId: null, memory };
  }
  if (record.lensId.length > 40) return { kind: 'council', lensId: null, memory };
  return { kind: 'lens', lensId: record.lensId, memory };
}
