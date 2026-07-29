/**
 * Repository projection types.
 *
 * ---------------------------------------------------------------------------
 * PROJECT, NEVER DERIVE
 * ---------------------------------------------------------------------------
 * Every field below is a **verbatim string as it appears in the file**. Nothing
 * is coerced, normalised, computed, or classified:
 *
 *   - `provenance` is a string, not a union. Coercing `"confirmed"` into an enum
 *     would mean deciding what to do with a value the schema did not anticipate,
 *     and that decision is the advisor's, not the cockpit's.
 *   - There is no `isStale`, no `daysUntilReview`, no `completionPercent`. Each
 *     would require the cockpit to apply a rule that lives in the repository's
 *     own architecture, and duplicating that rule here guarantees the two drift.
 *   - `updated` is the raw date text, including `—` when absent.
 *
 * The cockpit displays what exists and says "Unavailable" when it does not.
 *
 * Pure types. No runtime code, so both processes can import them freely.
 */

/**
 * Result of reading one artifact.
 *
 * A failure is data, not an exception: a missing or malformed file is an ordinary
 * state for a repository that is filled in over months, and every screen must
 * render it without special-casing.
 */
export type Projection<T> =
  | { ok: true; value: T; readAt: number }
  | { ok: false; reason: string; readAt: number };

/* ------------------------------------------------------------ business memory */

export interface MemoryField {
  /** Schema key, e.g. `stage`. Shown only in diagnostics, never to the founder. */
  key: string;
  /** Human label derived from the key by formatting alone. */
  label: string;
  value: string;
  confidence: string;
  provenance: string;
  updated: string;
  /** True when the row was marked `●` in the source table. */
  required: boolean;
}

export interface MemorySection {
  title: string;
  fields: MemoryField[];
}

export interface BusinessMemory {
  sections: MemorySection[];
  /** Total rows parsed, for the diagnostics panel. */
  fieldCount: number;
}

/* ------------------------------------------------------------------ decisions */

export interface DecisionRecord {
  /** Filename without extension, e.g. `DEC-20260728_pricing`. */
  id: string;
  /** Path relative to the repository root. */
  file: string;
  /**
   * Front matter, verbatim key → value. Not typed into a schema, because a
   * record written next year may carry keys this build has never seen and
   * dropping them would lose exactly the traceability the journal exists for.
   */
  frontMatter: Record<string, string>;
  /** `status` from front matter, verbatim. Empty string when absent. */
  status: string;
  /** Part 1 — the memo as delivered. Raw markdown. */
  memo: string | null;
  /** Part 2 — the review, when one has been written. Raw markdown. */
  review: string | null;
}

export interface DecisionJournal {
  records: DecisionRecord[];
  /** Files present but unreadable, so the count is never silently wrong. */
  skipped: string[];
}

/* ---------------------------------------------------------------- calibration */

export interface CalibrationTable {
  heading: string;
  header: string[];
  rows: string[][];
}

export interface Calibration {
  /**
   * Active adjustment entries, verbatim. Empty is the correct state for a new
   * installation, not a gap.
   */
  activeAdjustments: string[];
  /** Every parsed table, keyed by its section heading. */
  tables: CalibrationTable[];
}

/* ----------------------------------------------------------------- executives */

/**
 * One executive lens, exactly as `core/executive_matrix.md` defines it.
 *
 * ---------------------------------------------------------------------------
 * PROJECTED, NEVER AUTHORED
 * ---------------------------------------------------------------------------
 * There is no list of executives anywhere in this application. Every lens the
 * interface displays came out of the repository file, and a lens the file does
 * not define cannot be displayed. That is the whole point: the matrix is the
 * source of truth for who the board is, and a second copy in the renderer would
 * drift the moment the matrix changed.
 *
 * Consequences the interface has to live with, rather than paper over:
 *   - If the file is missing, the Executive Board shows Unavailable. It does not
 *     fall back to a built-in roster.
 *   - `structural` is read from the heading's own `*(S5, structural)*` marker.
 *     It is not a judgment about the lens.
 *   - `fields` is verbatim and untyped for the same reason decision-record front
 *     matter is: a lens gaining a tenth field next year should surface, not be
 *     dropped for failing to match a hardcoded shape.
 */
export interface ExecutiveLens {
  /**
   * Canonical identifier, derived from `name` by `lensIdFromName`.
   *
   * The same function produces the identifier sent to the engine, so a lens can
   * never be shown under one name and consulted under another.
   */
  id: string;
  /** Heading name, verbatim. e.g. `Sales/GTM`, `Devil's Advocate`. */
  name: string;
  /** Heading subtitle, verbatim, with the structural marker removed. */
  role: string;
  /**
   * True when the heading marks this lens structural at S5.
   *
   * These lenses attack a finished draft rather than building one, and the
   * matrix declares them non-suppressible at Full and Maximum budget — which is
   * why the interface must not offer to disable them.
   */
  structural: boolean;
  /** Section number as written, so display order matches the file's order. */
  ordinal: number;
  /**
   * Bold-labelled fields, keyed by their label as written — `Objective`,
   * `Owns`, `Activates when`, `Suppressed when`, and the rest. Values are the
   * file's own prose, unmodified.
   */
  fields: Record<string, string>;
}

export interface ExecutiveMatrix {
  lenses: ExecutiveLens[];
}

/* --------------------------------------------------------------------- bundle */

export interface RepositorySnapshot {
  workspacePath: string;
  memory: Projection<BusinessMemory>;
  journal: Projection<DecisionJournal>;
  calibration: Projection<Calibration>;
  executives: Projection<ExecutiveMatrix>;
  /**
   * Whether `core/business_memory.md` exists on disk.
   *
   * ---------------------------------------------------------------------------
   * WHY THIS IS NOT `memory.ok`
   * ---------------------------------------------------------------------------
   * The engine's first-run rule is *absence of the file* (`CLAUDE.md` §14), and
   * `memory` reports failure for two very different situations: the file is not
   * there, and the file is there but nothing recognisable parsed out of it.
   * Treating the second as first run would offer onboarding to a founder who
   * already has a Business Memory — and onboarding writes to that file.
   *
   * So this is a plain existence check and nothing more. It is still read-only:
   * the cockpit observes the condition and the engine decides what it means.
   */
  memoryPresent: boolean;
}
