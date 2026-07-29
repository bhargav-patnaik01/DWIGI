/**
 * Runtime modes — the only sanctioned way the cockpit may shape a turn.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * `shared/advisor.ts` invariant 1 says input is verbatim: no prefixing, no
 * templating, no hidden mode flags. That invariant is what makes the cockpit a
 * window onto the engine rather than a second reasoning engine, and it is not
 * being relaxed. It is being made *conditional on an explicit founder choice*,
 * and the condition is narrow:
 *
 *   1. The founder selected the mode. Nothing here is inferred from their words,
 *      their history, or the shape of a question.
 *   2. The directive is a repository-defined command, not an instruction this
 *      application composes. `/lens` and `/council` live in `.claude/commands/`
 *      and own their own semantics; this file knows only their names and
 *      argument order.
 *   3. The default sends nothing. A founder who has changed no setting gets the
 *      identical bytes they typed — see `composeTurn`.
 *   4. What is sent is displayable. `directiveFor` is exported so the interface
 *      can show the founder exactly the override that is in force, rather than
 *      asking them to trust that one is.
 *
 * The alternative was for the cockpit to describe a persona to the model itself.
 * That would put a second, drifting copy of the executive definitions in the
 * renderer, and it is the thing this file exists to make unnecessary.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE MUST NEVER GROW INTO
 * ---------------------------------------------------------------------------
 * No prompt text. No persona descriptions. No routing logic, budget hints, or
 * reasoning instructions. If a change here would require knowing what a CFO is,
 * it belongs in `core/executive_matrix.md` or a command file, not here.
 *
 * Pure functions over plain data, so both processes and the test suite can use
 * them and cannot drift.
 */

/**
 * Canonical lens identifier.
 *
 * Derived mechanically from the lens's heading in `core/executive_matrix.md` —
 * lowercased, punctuation reduced to hyphens. `Devil's Advocate` is
 * `devils-advocate`; `Sales/GTM` is `sales-gtm`. Nothing maps these by hand,
 * which is what keeps the identifier from becoming an independent name for a
 * persona the matrix defines.
 */
export const LENS_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Bound on a lens id. Generous for the canonical eight; hostile to abuse. */
export const LENS_ID_MAX_LENGTH = 40;

/** The matrix defines eight lenses; nothing may claim more. */
export const MAX_LENSES = 8;

export function isLensId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= LENS_ID_MAX_LENGTH &&
    LENS_ID_PATTERN.test(value)
  );
}

/**
 * Turn a canonical heading into its identifier.
 *
 * Mechanical transformation, not interpretation: case folding and punctuation
 * collapse. The projection layer and any test both call this, so a lens can
 * never be displayed under one id and consulted under another.
 */
export function lensIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* -------------------------------------------------------------------------- */
/* Modes                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Normal Executive Intelligence behaviour.
 *
 * `enabledLenses` is present **only when the founder has narrowed the pool**.
 * Absent means the full constructive pool, which is the engine's own default and
 * needs no directive to express. Build this with `councilMode` rather than by
 * hand, so "did the founder actually change anything" is decided in one place.
 */
export interface CouncilMode {
  kind: 'council';
  enabledLenses?: readonly string[];
}

/** Exactly one canonical lens answers. No other lens is convened. */
export interface LensMode {
  kind: 'lens';
  lensId: string;
}

export type RuntimeMode = CouncilMode | LensMode;

/** The unconfigured default: full pool, no directive, byte-verbatim input. */
export const DEFAULT_COUNCIL_MODE: CouncilMode = { kind: 'council' };

/**
 * Build a Council mode from a founder's configuration.
 *
 * `available` is the full constructive pool in canonical order, as projected from
 * `core/executive_matrix.md`. Two properties come out of taking it as an argument
 * rather than hardcoding a list:
 *
 *   - **Order is canonical, not insertion order.** The directive reads the same
 *     way every turn regardless of the order the founder clicked toggles in.
 *   - **A complete set produces no directive.** Equality is decided here, once,
 *     instead of every caller deciding whether its configuration counts as
 *     default and one of them getting it wrong.
 */
export function councilMode(
  enabled: readonly string[],
  available: readonly string[]
): CouncilMode {
  const wanted = new Set(enabled.filter(isLensId));
  const ordered = available.filter((id) => wanted.has(id));

  // Nothing known to be enabled, or everything is: either way the engine's own
  // routing is what the founder wants, and silence is how we ask for it.
  if (ordered.length === 0 || ordered.length === available.length) {
    return DEFAULT_COUNCIL_MODE;
  }

  return { kind: 'council', enabledLenses: ordered };
}

export function lensMode(lensId: string): LensMode {
  return { kind: 'lens', lensId };
}

/**
 * Fewest constructive lenses a Council deliberation can run with.
 *
 * A restatement of `core/reasoning_rules.md` §1, which routes 2–4 constructive
 * lenses. Below two there is nothing to deliberate — no objective competes with
 * another — so the interface refuses the configuration rather than transmitting
 * one the engine would have to reject.
 */
export const MIN_ENABLED_LENSES = 2;

/** Outcome of a toggle attempt. `refused` carries the reason to display. */
export type ToggleOutcome =
  | { ok: true; enabled: string[] }
  | { ok: false; reason: string };

export const FLOOR_MESSAGE = 'At least two executives are required for Council deliberation.';

/**
 * Enable or disable one lens, enforcing the deliberation floor.
 *
 * Lives here rather than in the component so the floor is a property of the
 * configuration itself, not of one screen. A second surface that offered these
 * toggles would otherwise be free to reimplement the limit differently — and the
 * limit is the only thing standing between the founder and a "council" of one.
 *
 * `available` fixes the output order to the matrix's own, so the resulting
 * directive is stable regardless of the order toggles were clicked.
 */
export function applyLensToggle(
  enabled: readonly string[],
  lensId: string,
  next: boolean,
  available: readonly string[]
): ToggleOutcome {
  const current = new Set(enabled.filter((id) => available.includes(id)));

  if (!next && current.has(lensId) && current.size <= MIN_ENABLED_LENSES) {
    return { ok: false, reason: FLOOR_MESSAGE };
  }

  if (next) current.add(lensId);
  else current.delete(lensId);

  return { ok: true, enabled: available.filter((id) => current.has(id)) };
}

/**
 * Accept a mode that arrived from the renderer.
 *
 * The renderer is the untrusted side even though we wrote it, and this value
 * reaches a command line the engine will act on. Anything unrecognised degrades
 * to the default rather than being rejected: a malformed mode must never be able
 * to *narrow* a deliberation, because a founder reading a Council answer would
 * have no way to tell it had been quietly restricted.
 */
export function parseRuntimeMode(value: unknown): RuntimeMode {
  if (typeof value !== 'object' || value === null) return DEFAULT_COUNCIL_MODE;
  const record = value as Record<string, unknown>;

  if (record.kind === 'lens') {
    return isLensId(record.lensId) ? { kind: 'lens', lensId: record.lensId } : DEFAULT_COUNCIL_MODE;
  }

  if (record.kind !== 'council') return DEFAULT_COUNCIL_MODE;
  if (!Array.isArray(record.enabledLenses)) return DEFAULT_COUNCIL_MODE;

  // De-duplicated, order preserved, capped. The cap is a backstop against a
  // pathological payload, not an expected condition.
  const seen = new Set<string>();
  for (const entry of record.enabledLenses) {
    if (!isLensId(entry)) return DEFAULT_COUNCIL_MODE;
    seen.add(entry);
  }
  if (seen.size === 0 || seen.size > MAX_LENSES) return DEFAULT_COUNCIL_MODE;

  return { kind: 'council', enabledLenses: [...seen] };
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The repository command a mode invokes, or null when the mode needs none.
 *
 * Exported so the interface can display the override verbatim. A mode the
 * founder cannot see is a hidden mode flag, which is the thing invariant 1
 * forbids.
 */
export function directiveFor(mode: RuntimeMode): string | null {
  if (mode.kind === 'lens') return `/lens ${mode.lensId}`;
  const enabled = mode.enabledLenses;
  if (!enabled || enabled.length === 0) return null;
  return `/council ${enabled.join(',')}`;
}

/**
 * Compose the bytes for one turn.
 *
 * ---------------------------------------------------------------------------
 * THE VERBATIM GUARANTEE, PRECISELY
 * ---------------------------------------------------------------------------
 * With no directive, this returns `text` — the same object, not a copy with
 * whitespace tidied. There is no branch on the content of `text`, so the default
 * path cannot become conditional on what the founder wrote.
 *
 * With a directive, the founder's text follows it unchanged after a blank line.
 * The command files read their own first token as configuration and everything
 * after it as the founder's message, so the message survives byte-for-byte
 * inside the composed turn as well.
 */
export function composeTurn(text: string, mode: RuntimeMode): string {
  const directive = directiveFor(mode);
  if (directive === null) return text;
  // An empty message is a real case: opening a lens conversation sends the
  // directive alone and lets the lens introduce itself. Appending blank lines to
  // nothing would send trailing whitespace as though it were content.
  if (text.length === 0) return directive;
  return `${directive}\n\n${text}`;
}

/**
 * Message that enters the engine's own first-run onboarding.
 *
 * A repository command, so the questions, field priorities, and follow-up limits
 * stay in `core/onboarding/memory_protocol.md`. The cockpit knows the name of the
 * door, not what is behind it — which is why there is no second onboarding
 * schema anywhere in this application.
 */
export const ONBOARDING_TURN = '/begin';
