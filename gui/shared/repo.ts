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
 * One executive lens, exactly as its file in `core/executives/` defines it.
 *
 * ---------------------------------------------------------------------------
 * PROJECTED, NEVER AUTHORED
 * ---------------------------------------------------------------------------
 * There is no list of executives anywhere in this application. Every lens the
 * interface displays came out of a file in `core/executives/`, and a lens with
 * no file cannot be displayed. That is the whole point: the directory is the
 * source of truth for who the board is, and a second copy in the renderer would
 * drift the moment an executive changed.
 *
 * Consequences the interface has to live with, rather than paper over:
 *   - If the directory is missing, the Executive Board shows Unavailable. It
 *     does not fall back to a built-in roster.
 *   - `structural` is read from the file's own front matter. It is not a
 *     judgment about the lens, and it is not inferred from its name.
 *   - `fields` is verbatim and untyped for the same reason decision-record front
 *     matter is: a lens gaining a tenth field next year should surface, not be
 *     dropped for failing to match a hardcoded shape.
 */
export interface ExecutiveLens {
  /**
   * Canonical identifier, declared in the file's own front matter.
   *
   * This is the identifier sent to the engine as a `/lens` or `/council`
   * argument, so it is validated for shape on the way in — a lens whose id is
   * not transmittable is skipped rather than displayed under an id that would
   * fail at the command line.
   *
   * Declared rather than derived from the display name. One declaration in one
   * place cannot disagree with itself, which is a stronger guarantee than two
   * derivations agreeing.
   */
  id: string;
  /** Display name, verbatim from front matter. e.g. `Sales/GTM`, `Devil's Advocate`. */
  name: string;
  /** Role subtitle, verbatim from front matter. */
  role: string;
  /**
   * True when the manifest lists this lens as a challenge lens.
   *
   * These lenses attack a finished draft rather than building one, and the
   * manifest declares them non-suppressible at Full and Maximum budget — which
   * is why the interface must not offer to disable them.
   *
   * **Read from the manifest, not the persona file** (ADR-012). Participation is
   * the manifest's business; a lens's own file no longer says which stage it
   * acts at. False when the lens has no manifest entry — see `routing`.
   */
  structural: boolean;
  /** Declared presentation order. Carries no reasoning precedence. */
  ordinal: number;
  /** Filename the lens was read from, relative to the repository root. */
  file: string;
  /**
   * Bold-labelled fields, keyed by their label as written — `Objective`,
   * `Owns`, `Heuristics`, and the rest. Values are the file's own prose,
   * unmodified.
   *
   * Since ADR-012 this carries reasoning fields only. The three participation
   * criteria moved to the manifest and are exposed as `routing`.
   */
  fields: Record<string, string>;
  /**
   * Participation criteria from this lens's manifest entry.
   *
   * **Null when the manifest has no entry for this id.** That is a real
   * condition rather than a defensive default: the engine's gate refuses to
   * route a lens it cannot evaluate, so the interface must be able to show the
   * same thing rather than implying the lens participates normally.
   */
  routing: ExecutiveRouting | null;
}

/**
 * One lens's participation criteria, verbatim from `core/executive_manifest.md`.
 *
 * Prose, not predicates. These are evaluated by the advisor's judgment, and the
 * cockpit displays them without interpreting them — the same rule that governs
 * every other projection.
 */
export interface ExecutiveRouting {
  activates: string;
  suppressed: string;
  escalates: string;
}

export interface ExecutiveDirectory {
  lenses: ExecutiveLens[];
  /**
   * Files present in `core/executives/` that did not yield a lens, so a roster
   * gap is never silent.
   *
   * A board displayed with one member quietly missing is worse than a board
   * that says it could not read one, because the founder has no way to notice
   * the absence — which is the same reason `DecisionJournal` reports skips.
   */
  skipped: string[];
  /**
   * Why the manifest could not be read, or null when it read cleanly.
   *
   * Separate from `skipped` because the consequences differ. A skipped persona
   * file removes one executive. An unreadable manifest leaves every executive
   * present but unrouted — the board still lists correctly, while Agent
   * Management cannot tell a constructive lens from a challenge one. The
   * interface has to say which of those happened.
   */
  manifestError: string | null;
  /**
   * Manifest ids with no matching file in `core/executives/`.
   *
   * The mirror of `skipped`, and the engine treats it as a real fault: the gate
   * can admit this lens and then find nothing to load.
   */
  orphanedEntries: string[];
}

/* --------------------------------------------------------------------- bundle */

export interface RepositorySnapshot {
  workspacePath: string;
  memory: Projection<BusinessMemory>;
  journal: Projection<DecisionJournal>;
  calibration: Projection<Calibration>;
  executives: Projection<ExecutiveDirectory>;
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
