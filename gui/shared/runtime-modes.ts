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
 * it belongs in `core/executives/` or a command file, not here.
 *
 * Pure functions over plain data, so both processes and the test suite can use
 * them and cannot drift.
 */

/**
 * Canonical lens identifier.
 *
 * Declared by each lens's own file in `core/executives/` as front-matter `id`,
 * and shaped by the convention below — lowercased, punctuation reduced to
 * hyphens. `Devil's Advocate` is `devils-advocate`; `Sales/GTM` is `sales-gtm`.
 * The convention is what keeps the identifier from becoming an independent name
 * for a persona its own file defines.
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
 * Turn a canonical display name into its identifier.
 *
 * Mechanical transformation, not interpretation: case folding and punctuation
 * collapse.
 *
 * Since Sprint 3 the id is *declared* in each executive's front matter rather
 * than derived here, which is the stronger arrangement — one declaration cannot
 * disagree with itself. This function survives as the definition of the naming
 * convention, and the test suite uses it to check that a declared id is the one
 * the convention would have produced. That catches the typo the old derivation
 * made impossible and the new declaration makes available.
 */
export function lensIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* -------------------------------------------------------------------------- */
/* Memory scope                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Whether a conversation is grounded in the founder's own company.
 *
 * ---------------------------------------------------------------------------
 * THE COCKPIT KNOWS THE NAME OF THIS CHOICE AND NOTHING ELSE ABOUT IT
 * ---------------------------------------------------------------------------
 * `business` is the system as designed: Business Memory, journal, calibration,
 * onboarding. `learning` is a founder-selected mode in which none of that is
 * consulted.
 *
 * What "none of that is consulted" *means* — which files go unread, what happens
 * to confidence, whether a Decision Record may be written — is defined in
 * `.claude/commands/learning.md` and nowhere in this application. This file
 * knows a command name and an argument position. That is the entire boundary,
 * and it is the same boundary `/council` and `/lens` already sit on.
 *
 * A second copy of these rules in the renderer would be a second reasoning
 * engine, which is the thing this design exists to avoid.
 */
export type MemoryScope = 'business' | 'learning';

/** The system as designed. Sends no directive, because it deviates from nothing. */
export const DEFAULT_MEMORY_SCOPE: MemoryScope = 'business';

export function isMemoryScope(value: unknown): value is MemoryScope {
  return value === 'business' || value === 'learning';
}

/**
 * Accept a scope from storage or from the renderer.
 *
 * Anything unrecognised — including absence, which is every record written
 * before this field existed — reads back as `business`. That direction is the
 * safe one in both halves. A Learning conversation mislabelled as Business shows
 * a badge claiming grounding it never had; a Business conversation mislabelled
 * as Learning would send `/learning` and silently strip the founder's own
 * company out of advice they believe is about it.
 */
export function readMemoryScope(value: unknown): MemoryScope {
  return isMemoryScope(value) ? value : DEFAULT_MEMORY_SCOPE;
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
  /** Absent means `business`. See `MemoryScope`. */
  memory?: MemoryScope;
  /**
   * Reason through `/deliberate-isolated` instead of the shared-context default.
   *
   * ---------------------------------------------------------------------------
   * EXPERIMENTAL, AND NOT COMPOSABLE WITH THE OTHER TWO KNOBS
   * ---------------------------------------------------------------------------
   * `.claude/commands/deliberate-isolated.md` documents no nested-directive
   * support — unlike `/learning`, which explicitly accepts `/council`/`/lens`
   * ahead of the message, `/deliberate-isolated` takes the decision as its whole
   * argument. Inventing a composition the command was never written to parse
   * would be this file assuming semantics that belong to `.claude/commands/`,
   * which is exactly the layering violation the header above forbids.
   *
   * So when this is true, `enabledLenses` narrowing and the Learning scope are
   * both ignored by `routingDirectiveFor`/`scopeDirectiveFor` — never silently
   * combined into an untested command line. A founder who wants an isolated,
   * narrowed, or ungrounded deliberation gets one of those, not a guess at what
   * combining them would do.
   *
   * Absent means the shared-context default — unchanged behaviour for every
   * conversation that predates this field.
   */
  isolated?: boolean;
}

/** Exactly one canonical lens answers. No other lens is convened. */
export interface LensMode {
  kind: 'lens';
  lensId: string;
  /** Absent means `business`. See `MemoryScope`. */
  memory?: MemoryScope;
}

export type RuntimeMode = CouncilMode | LensMode;

/** The unconfigured default: full pool, no directive, byte-verbatim input. */
export const DEFAULT_COUNCIL_MODE: CouncilMode = { kind: 'council' };

/**
 * Attach a memory scope to a mode built by `councilMode` or `lensMode`.
 *
 * Separate from those constructors because the two choices have different
 * lifetimes and different owners. The lens pool is a live global setting that
 * can change between turns; the memory scope is fixed when a conversation is
 * created and never changes again. Building them in one call would invite a
 * caller to pass a stale scope from the current default rather than the one the
 * conversation was created with — which is precisely the bug the immutability
 * rule exists to prevent.
 */
export function withMemoryScope(mode: RuntimeMode, memory: MemoryScope): RuntimeMode {
  // Default scope is represented by absence, so an unconfigured cockpit still
  // produces byte-identical output to a terminal.
  if (memory === DEFAULT_MEMORY_SCOPE) {
    const { memory: _dropped, ...rest } = mode;
    return rest as RuntimeMode;
  }
  return { ...mode, memory };
}

/** The scope a mode carries, resolving absence to the default. */
export function memoryScopeOf(mode: RuntimeMode): MemoryScope {
  return readMemoryScope(mode.memory);
}

/**
 * Build a Council mode from a founder's configuration.
 *
 * `available` is the full constructive pool in canonical order, as discovered
 * from `core/executives/`. Two properties come out of taking it as an argument
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
 * The isolated-reasoning Council mode.
 *
 * Deliberately takes no `enabled` argument, unlike `councilMode`. Narrowing and
 * isolation compose in principle but not in the shipped commands (see
 * `CouncilMode.isolated`), so this constructor does not offer a parameter that
 * `routingDirectiveFor` would silently discard.
 */
export function isolatedCouncilMode(): CouncilMode {
  return { kind: 'council', isolated: true };
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

  /*
   * Scope degrades to `business`, and that is the safe direction here too.
   *
   * A malformed payload must never be able to strip the founder's own company
   * out of an answer they are reading as though it were about them. Unlike
   * routing, this is not merely a narrowing — it changes what the advice is
   * grounded in.
   */
  const memory = readMemoryScope(record.memory);
  const scoped = <T extends RuntimeMode>(mode: T): RuntimeMode =>
    withMemoryScope(mode, memory);

  if (record.kind === 'lens') {
    return isLensId(record.lensId)
      ? scoped({ kind: 'lens', lensId: record.lensId })
      : scoped(DEFAULT_COUNCIL_MODE);
  }

  if (record.kind !== 'council') return DEFAULT_COUNCIL_MODE;
  if (!Array.isArray(record.enabledLenses)) return scoped(DEFAULT_COUNCIL_MODE);

  // De-duplicated, order preserved, capped. The cap is a backstop against a
  // pathological payload, not an expected condition.
  const seen = new Set<string>();
  for (const entry of record.enabledLenses) {
    if (!isLensId(entry)) return scoped(DEFAULT_COUNCIL_MODE);
    seen.add(entry);
  }
  if (seen.size === 0 || seen.size > MAX_LENSES) return scoped(DEFAULT_COUNCIL_MODE);

  return scoped({ kind: 'council', enabledLenses: [...seen] });
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The scope directive, or null when the founder has not deviated from default.
 *
 * Separated from `directiveFor` because scope and routing are independent
 * choices with independent owners, and because the composition rule between
 * them is the only interesting thing in this file.
 */
function scopeDirectiveFor(mode: RuntimeMode): string | null {
  // See `CouncilMode.isolated`: composition with `/learning` is undocumented,
  // so an isolated Council never emits it, whatever the stored scope says.
  if (mode.kind === 'council' && mode.isolated) return null;
  return memoryScopeOf(mode) === 'learning' ? '/learning' : null;
}

/**
 * The routing directive, or null when the engine's own default is wanted.
 */
function routingDirectiveFor(mode: RuntimeMode): string | null {
  if (mode.kind === 'lens') return `/lens ${mode.lensId}`;
  // Isolated takes over routing entirely — see `CouncilMode.isolated`. Checked
  // before `enabledLenses` so a narrowed pool can never be silently combined
  // with a command that does not document accepting one.
  if (mode.isolated) return '/deliberate-isolated';
  const enabled = mode.enabledLenses;
  if (!enabled || enabled.length === 0) return null;
  return `/council ${enabled.join(',')}`;
}

/**
 * The repository command a mode invokes, or null when the mode needs none.
 *
 * Exported so the interface can display the override verbatim. A mode the
 * founder cannot see is a hidden mode flag, which is the thing invariant 1
 * forbids.
 *
 * ---------------------------------------------------------------------------
 * WHY TWO DIRECTIVES COMPOSE BY NESTING RATHER THAN BY A NEW GRAMMAR
 * ---------------------------------------------------------------------------
 * Scope and routing are orthogonal — a founder can want a narrowed pool in a
 * Learning conversation — so all six combinations must be expressible. Claude
 * Code resolves one leading command per message, so they cannot simply be
 * concatenated as siblings.
 *
 * Three options were available. Inventing a combined command with named
 * arguments would have created a mini-language this file owns, and the moment
 * the cockpit owns a grammar it owns semantics. Adding a scope token to
 * `/council` and `/lens` would have changed two existing commands' argument
 * order for a concern neither is about. Nesting adds one command and changes no
 * existing one: `/learning` documents that its arguments may begin with another
 * repository command, and delegates to that command's own rules.
 *
 * The nesting is textual, not semantic. This function knows the order the two
 * names go in. What either one *means* stays in `.claude/commands/`.
 *
 *   business + full pool   → null                        (verbatim input)
 *   business + narrowed    → /council ceo,cfo
 *   business + one lens    → /lens cfo
 *   learning + full pool   → /learning
 *   learning + narrowed    → /learning /council ceo,cfo
 *   learning + one lens    → /learning /lens cfo
 *   isolated (any scope)   → /deliberate-isolated   (see `CouncilMode.isolated`)
 */
export function directiveFor(mode: RuntimeMode): string | null {
  const scope = scopeDirectiveFor(mode);
  const routing = routingDirectiveFor(mode);
  if (scope === null) return routing;
  return routing === null ? scope : `${scope} ${routing}`;
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
