/**
 * `dwigi://` deep-link protocol — a navigation layer and nothing else.
 *
 * ---------------------------------------------------------------------------
 * THE ONE SENTENCE THAT CONSTRAINS THIS ENTIRE FILE
 * ---------------------------------------------------------------------------
 * A deep link can name a *screen*. It can never name a *path*, a *command*, a
 * *credential*, or anything that reaches a runtime.
 *
 * That is not a policy applied on top of a general parser — it is the shape of
 * the parser. There is no route in `ROUTES` that accepts a filesystem path,
 * because a route that accepted one would put `dwigi://workspace/open?path=…` on
 * the attack surface: a link in an email that silently repoints someone's
 * workspace, or reads a directory they never chose. `workspace/open` therefore
 * means "show the open-workspace picker", and the founder still chooses the
 * folder themselves.
 *
 * The same reasoning removes payloads entirely. A protocol handler that forwards
 * arbitrary data inward is a remote-input channel into an application that spawns
 * child processes; the only safe amount of forwarded data is none, and every
 * route below carries at most a short enum-validated identifier.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ROUTE TABLE IS DATA
 * ---------------------------------------------------------------------------
 * Adding `dwigi://journal` later should be one row and one screen, not a change
 * to the router. So the router knows how to validate *kinds* of parameter, and
 * the table declares which kind each route takes. Part H's future routes are
 * listed in `RESERVED` — deliberately unimplemented, and *rejected* rather than
 * silently accepted, so a link written against a future version fails honestly
 * instead of landing somewhere approximate.
 *
 * Pure functions over strings. No Electron, no filesystem, no navigation — the
 * caller decides what to do with a validated intent, and `electron/main.ts` is
 * the only place that maps one onto a window.
 */

import { isProviderId } from './runtime/contract';

/** The protocol scheme. Registered with the OS by the host. */
export const PROTOCOL = 'dwigi';

/** Longest acceptable whole URL. A link longer than this is not a navigation. */
export const MAX_URL_LENGTH = 512;

/* -------------------------------------------------------------------------- */
/* Route table                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What kind of parameter a route accepts, if any.
 *
 * Closed vocabulary. Note what is missing and will stay missing: `path`, `file`,
 * `command`, `url`, `json`. Each would be the mechanism of a different exploit,
 * and none is needed to navigate.
 */
type ParamKind =
  /** No parameter. The route is the whole intent. */
  | 'none'
  /** A provider id, validated against `isProviderId`. */
  | 'providerId'
  /**
   * An opaque short identifier — a decision record id, a workspace id.
   *
   * Reserved for future routes and validated conservatively: alphanumerics,
   * hyphens, underscores, bounded length. It is matched against real records by
   * the screen that receives it, never used to build a path.
   */
  | 'opaqueId';

interface RouteSpec {
  /** Path pattern after `dwigi://`, with `:param` for the variable segment. */
  pattern: string;
  /** Stable intent name the application switches on. */
  intent: string;
  param: ParamKind;
  /** One line, for the diagnostics screen's route list. */
  purpose: string;
}

/**
 * Every route this build honours.
 *
 * Order matters only for presentation. Matching is exact on the literal segments,
 * so `connect/claude` cannot be mistaken for `connect` with a trailing slash.
 */
export const ROUTES: readonly RouteSpec[] = [
  {
    pattern: 'onboarding',
    intent: 'onboarding',
    param: 'none',
    purpose: 'Start the first-run experience',
  },
  {
    pattern: 'workspace/new',
    intent: 'workspace.new',
    param: 'none',
    purpose: 'Open the create-workspace flow',
  },
  {
    pattern: 'workspace/open',
    intent: 'workspace.open',
    param: 'none',
    purpose: 'Open the workspace picker — carries no path, by design',
  },
  {
    pattern: 'connect/:provider',
    intent: 'connect',
    param: 'providerId',
    purpose: 'Open the connection flow for one AI provider',
  },
  {
    pattern: 'brains',
    intent: 'brains',
    param: 'none',
    purpose: 'Open the AI Control Center',
  },
  {
    pattern: 'settings',
    intent: 'settings',
    param: 'none',
    purpose: 'Open settings',
  },
  {
    pattern: 'diagnostics',
    intent: 'diagnostics',
    param: 'none',
    purpose: 'Open runtime diagnostics',
  },
];

/**
 * Routes Part H names as future work.
 *
 * Listed so they are **rejected with an explanation** rather than falling through
 * to the generic unknown-route message. A founder following a link from a future
 * release should be told the route exists but this version cannot serve it, which
 * is a different fact from "that is not a thing".
 *
 * Adding one for real means moving its prefix from here into `ROUTES` and
 * building the screen. No router change.
 */
export const RESERVED: readonly { prefix: string; note: string }[] = [
  { prefix: 'decision', note: 'Opening a specific Decision Record' },
  { prefix: 'journal', note: 'Opening the decision journal' },
  { prefix: 'memory', note: 'Opening Business Memory' },
  { prefix: 'review', note: 'Opening a scheduled review' },
  { prefix: 'provider', note: 'Opening one provider’s detail view' },
];

/* -------------------------------------------------------------------------- */
/* Parse result                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A validated navigation intent.
 *
 * `param` is present only for routes that declare one, and has already been
 * validated against that kind. A consumer never re-validates and never needs to.
 */
export interface DeepLinkIntent {
  intent: string;
  param?: string;
  /** The URL as received, for the diagnostics log. Never re-parsed. */
  received: string;
}

export type DeepLinkResult =
  | { ok: true; intent: DeepLinkIntent }
  | {
      ok: false;
      /** Why it failed, for the log and for the founder-facing notice. */
      reason: string;
      /** `reserved` is distinguishable so the notice can be specific. */
      kind: 'malformed' | 'wrong-scheme' | 'unknown-route' | 'reserved' | 'bad-parameter';
    };

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

function isValidOpaqueId(value: string): boolean {
  return value.length > 0 && value.length <= 64 && /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Parse an incoming protocol URL into a validated intent.
 *
 * ---------------------------------------------------------------------------
 * EVERY INPUT TO THIS FUNCTION IS HOSTILE
 * ---------------------------------------------------------------------------
 * It arrives from the operating system, which got it from a browser, which got it
 * from a web page. So the order of checks is: bound the length, confirm the
 * scheme, normalise the shape, match against a closed table, then validate the
 * one parameter. Nothing is inferred and nothing is best-guessed — an unknown
 * route is refused, because "did they mean settings?" is how a navigation layer
 * turns into an execution layer.
 *
 * Query strings and fragments are **discarded before matching**, not parsed.
 * Nothing in this protocol needs them, and a parser that read them would be one
 * refactor away from a route that accepted one.
 */
export function parseDeepLink(raw: unknown): DeepLinkResult {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, kind: 'malformed', reason: 'The link was empty.' };
  }
  if (raw.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      kind: 'malformed',
      reason: 'The link was longer than a navigation link can legitimately be.',
    };
  }
  // Control characters have no place in a URL and are the classic vehicle for
  // log injection and terminal escapes. Refused before anything else parses it.
  if (/[ -]/.test(raw)) {
    return { ok: false, kind: 'malformed', reason: 'The link contained control characters.' };
  }

  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/(.*)$/.exec(raw);
  if (!schemeMatch) {
    return { ok: false, kind: 'malformed', reason: 'The link was not a valid URL.' };
  }
  if ((schemeMatch[1] ?? '').toLowerCase() !== PROTOCOL) {
    return {
      ok: false,
      kind: 'wrong-scheme',
      reason: `Only ${PROTOCOL}:// links are handled.`,
    };
  }

  // Strip query and fragment without parsing them, then collapse slashes. A
  // trailing slash is a formatting difference, not a different route.
  const body = (schemeMatch[2] ?? '').split(/[?#]/)[0] ?? '';
  const segments = body
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return { ok: false, kind: 'unknown-route', reason: 'The link named no destination.' };
  }

  /*
   * Percent-decoding happens per segment, after splitting.
   *
   * Decoding the whole body first would let `%2F` introduce a separator that was
   * not in the original URL — the path-traversal trick that has broken a long
   * line of routers. Decoding after the split means an encoded slash stays inside
   * one segment, where it simply fails validation.
   */
  const decoded: string[] = [];
  for (const segment of segments) {
    try {
      decoded.push(decodeURIComponent(segment));
    } catch {
      return {
        ok: false,
        kind: 'malformed',
        reason: 'The link contained an invalid escape sequence.',
      };
    }
  }

  // A decoded separator or traversal token is refused outright rather than
  // sanitised. Sanitising invites a second opinion about what the link meant.
  for (const segment of decoded) {
    if (segment.includes('/') || segment.includes('\\') || segment === '..' || segment === '.') {
      return {
        ok: false,
        kind: 'malformed',
        reason: 'The link contained a path separator, which no route accepts.',
      };
    }
  }

  const reserved = RESERVED.find((entry) => entry.prefix === decoded[0]);
  if (reserved) {
    return {
      ok: false,
      kind: 'reserved',
      reason: `${reserved.note} is not available in this version of D.W.I.G.I.`,
    };
  }

  for (const route of ROUTES) {
    const expected = route.pattern.split('/');
    if (expected.length !== decoded.length) continue;

    let param: string | undefined;
    let matched = true;

    for (let i = 0; i < expected.length; i += 1) {
      const spec = expected[i] ?? '';
      const actual = decoded[i] ?? '';
      if (spec.startsWith(':')) {
        param = actual;
        continue;
      }
      // Literal segments are compared case-insensitively: operating systems and
      // browsers both normalise scheme case, and a founder typing `Settings`
      // means settings.
      if (spec.toLowerCase() !== actual.toLowerCase()) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    if (route.param === 'none') {
      if (param !== undefined) continue;
      return { ok: true, intent: { intent: route.intent, received: raw } };
    }

    if (param === undefined) continue;

    if (route.param === 'providerId') {
      if (!isProviderId(param)) {
        return {
          ok: false,
          kind: 'bad-parameter',
          reason: 'The link named an AI provider in a form this version does not recognise.',
        };
      }
      return { ok: true, intent: { intent: route.intent, param, received: raw } };
    }

    if (route.param === 'opaqueId') {
      if (!isValidOpaqueId(param)) {
        return {
          ok: false,
          kind: 'bad-parameter',
          reason: 'The link named an item in a form this version does not recognise.',
        };
      }
      return { ok: true, intent: { intent: route.intent, param, received: raw } };
    }
  }

  return {
    ok: false,
    kind: 'unknown-route',
    reason: 'This link points somewhere D.W.I.G.I does not have a screen for.',
  };
}

/* -------------------------------------------------------------------------- */
/* Intent → screen                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Where each intent lands in the renderer.
 *
 * Kept beside the route table so a new route cannot be added without deciding
 * where it goes — the failure otherwise is a route that validates, resolves, and
 * navigates nowhere, which looks to a founder exactly like the link being broken.
 *
 * `connect` and `onboarding` route to screens that then read
 * `DeepLinkIntent.param`; the mapping deliberately stops at the screen and does
 * not encode what the screen should do, because that is the screen's business.
 */
export const INTENT_ROUTES: Readonly<Record<string, string>> = {
  // First run is a state of the Chat screen, not a page of its own. A dedicated
  // /welcome route would be a second place deciding whether setup is finished.
  onboarding: '/',
  'workspace.new': '/',
  'workspace.open': '/',
  connect: '/brains',
  brains: '/brains',
  settings: '/settings',
  diagnostics: '/diagnostics',
};

/** Renderer path for a validated intent, or null when nothing is mapped. */
export function routeForIntent(intent: DeepLinkIntent): string | null {
  return INTENT_ROUTES[intent.intent] ?? null;
}

/** Every honoured route as a display list, for the diagnostics screen. */
export function describeRoutes(): { url: string; purpose: string }[] {
  return ROUTES.map((route) => ({
    url: `${PROTOCOL}://${route.pattern.replace(/:(\w+)/, '<$1>')}`,
    purpose: route.purpose,
  }));
}
