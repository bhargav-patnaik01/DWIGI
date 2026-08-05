/**
 * Workspace manifest — `.dwigi/workspace.json`, and the shape of a workspace.
 *
 * ---------------------------------------------------------------------------
 * WHAT A WORKSPACE IS, IN THE FOUNDER'S VOCABULARY AND IN OURS
 * ---------------------------------------------------------------------------
 * To the founder it is "my workspace" — a folder holding their business, their
 * decisions, and their board. The words *repository*, *clone*, and *git* do not
 * appear in the interface (ADR-013 §D). Internally the layout is unchanged from
 * v1.0.1, which is what lets an existing installation open as a workspace with
 * no migration of the engine at all.
 *
 * ---------------------------------------------------------------------------
 * THREE OWNERS, AND WHY THE MANIFEST HOLDS SO LITTLE
 * ---------------------------------------------------------------------------
 *   the engine   CLAUDE.md, core/, .claude/     initialized once, then the advisor's
 *   the advisor  business_memory.md, journal/, dossier/   written only by the advisor
 *   the cockpit  .dwigi/workspace.json          written only by the cockpit
 *
 * The manifest holds workspace *metadata* and nothing else. Not Business Memory,
 * not journal content, not credentials, not conversation history, not reasoning,
 * not executive output. Every one of those already has an owner, and a manifest
 * that started caching them would become a second source of truth for facts the
 * engine is authoritative on — which is the drift `shared/repo.ts` refuses to
 * introduce for the same reason.
 *
 * The prohibition is enforced by `SCHEMA_KEYS` below and asserted by the test
 * suite, so it is a property of the code rather than a promise in a comment.
 *
 * Pure types and pure functions. The filesystem half lives in
 * `electron/workspace/`.
 */

import { readMemoryScope, type MemoryScope } from './runtime-modes';

/**
 * Current manifest schema version.
 *
 * Bumped when the shape changes. Migration is forward-only and automatic; a
 * manifest from the future is refused rather than guessed at — see `readManifest`.
 */
export const WORKSPACE_SCHEMA_VERSION = 1 as const;

/** Directory holding the cockpit's own workspace state. */
export const WORKSPACE_DIR = '.dwigi';

/** Manifest filename inside `WORKSPACE_DIR`. */
export const WORKSPACE_MANIFEST_FILE = 'workspace.json';

/** Longest stored workspace name. Names are labels, not prose. */
export const WORKSPACE_NAME_MAX_LENGTH = 64;

/** How many recent session ids are retained. Oldest are dropped. */
export const RECENT_SESSIONS_MAX = 10;

/* -------------------------------------------------------------------------- */
/* Manifest                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `.dwigi/workspace.json`.
 *
 * Every field is metadata about the workspace or a founder preference. Read the
 * header before adding one: if the value is a business fact, a credential, or
 * anything the advisor writes, it does not belong here and there is an existing
 * owner for it.
 */
export interface WorkspaceManifest {
  /** Manifest shape version. Not the application version. */
  schemaVersion: number;
  /** Founder-visible label. Defaults to the directory name at creation. */
  name: string;
  /** Application version that created this workspace. Never rewritten. */
  createdVersion: string;
  /** ISO-8601 creation timestamp. Never rewritten. */
  createdAt: string;
  /** ISO-8601, updated on every open. */
  lastOpenedAt: string;
  /**
   * Application version that last opened this workspace.
   *
   * Distinct from `createdVersion` and worth keeping separately: together they
   * tell a bug report whether a workspace was created by an old build and
   * carried forward, which is exactly the case a migration bug hides in.
   */
  lastOpenedVersion: string;
  /**
   * Preferred runtime id, or null.
   *
   * A *preference*, not an assertion that the runtime is installed. A workspace
   * carried to another machine names a provider that may be absent there, and
   * the Control Center reports that rather than silently choosing another —
   * ADR-013 §E, nothing switches automatically.
   */
  preferredRuntime: string | null;
  /**
   * Constructive lens ids the founder left enabled, or null for unconfigured.
   *
   * Null is not an empty set. Null means the founder has never touched Agent
   * Management, so the engine's own gate decides participation and no directive
   * is transmitted — the same distinction `useUi.enabledLenses` carries, stored
   * per workspace so two businesses can have different boards.
   */
  preferredExecutives: string[] | null;
  /** Interface theme. A preference, mirrored per workspace. */
  preferredTheme: 'dark' | 'light' | null;
  /** Default grounding for new conversations in this workspace. */
  preferredMemoryScope: MemoryScope;
  /**
   * Recent engine session handles, newest first.
   *
   * Opaque handles only — never transcripts, never message text. They exist so a
   * workspace opened on the same machine can offer to continue, and they are
   * useless to anything but the runtime that minted them.
   */
  recentSessions: string[];
}

/**
 * Keys the manifest is permitted to contain.
 *
 * The prohibition in Part J is enforced here rather than trusted: `readManifest`
 * drops anything not on this list, so a field added by a future build — or by
 * hand — cannot smuggle business content into a file this one will rewrite.
 * Asserted by the test suite against a list of forbidden key names.
 */
export const SCHEMA_KEYS: readonly (keyof WorkspaceManifest)[] = [
  'schemaVersion',
  'name',
  'createdVersion',
  'createdAt',
  'lastOpenedAt',
  'lastOpenedVersion',
  'preferredRuntime',
  'preferredExecutives',
  'preferredTheme',
  'preferredMemoryScope',
  'recentSessions',
];

/* -------------------------------------------------------------------------- */
/* Workspace structure                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A directory the workspace must contain.
 *
 * One list, shared by the creator and the validator. Two lists would diverge,
 * and the failure mode is specific and nasty: a workspace that creation
 * considers complete and validation considers broken, or worse the reverse —
 * a workspace that opens cleanly and is missing the directory the advisor is
 * about to write a Decision Record into.
 */
export interface RequiredEntry {
  /** Path relative to the workspace root, POSIX-separated. */
  path: string;
  kind: 'directory' | 'file';
  /**
   * True when absence makes the workspace unusable.
   *
   * `journal/` and `dossier/` are deliberately **not** essential: they do not
   * exist until the advisor writes the first record, and v1.0.1 shipped that way
   * on purpose (`readJournal` treats ENOENT as empty, not broken). Creation makes
   * them anyway so a founder browsing the folder sees where things will go.
   */
  essential: boolean;
  /** Why it exists, for the recovery message when it is missing. */
  purpose: string;
}

export const REQUIRED_STRUCTURE: readonly RequiredEntry[] = [
  {
    path: 'CLAUDE.md',
    kind: 'file',
    essential: true,
    purpose: 'the operating instructions your board reasons from',
  },
  {
    path: 'core',
    kind: 'directory',
    essential: true,
    purpose: 'the executive definitions, routing rules, and reasoning pipeline',
  },
  {
    path: 'core/executives',
    kind: 'directory',
    essential: true,
    purpose: 'one file per executive — this directory is the board',
  },
  {
    path: 'core/executive_manifest.md',
    kind: 'file',
    essential: true,
    purpose: 'which executives take part in a decision, and when',
  },
  {
    path: 'core/onboarding',
    kind: 'directory',
    essential: true,
    purpose: 'how the advisor learns your business on first run',
  },
  {
    path: '.claude/commands',
    kind: 'directory',
    essential: true,
    purpose: 'the commands that select a single executive or a restricted board',
  },
  {
    path: 'journal',
    kind: 'directory',
    essential: false,
    purpose: 'where your Decision Records are written',
  },
  {
    path: 'dossier',
    kind: 'directory',
    essential: false,
    purpose: 'where background research is kept',
  },
  {
    path: WORKSPACE_DIR,
    kind: 'directory',
    essential: false,
    purpose: 'this workspace’s own settings',
  },
];

/* -------------------------------------------------------------------------- */
/* Validation outcome                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What is wrong with a candidate workspace, in terms a founder can act on.
 *
 * `recoverable` distinguishes "we can fix this for you" from "this is not a
 * workspace". Offering to repair a folder that was never a workspace would write
 * an engine into someone's Documents directory, so the two are never conflated.
 */
export interface WorkspaceProblem {
  path: string;
  purpose: string;
  /** True when initializing the missing entry is a safe, sufficient fix. */
  recoverable: boolean;
}

export type WorkspaceValidation =
  | { ok: true; manifest: WorkspaceManifest | null }
  | {
      ok: false;
      /** `empty` — nothing there. `foreign` — a folder, but not ours. `damaged` — ours, incomplete. */
      kind: 'empty' | 'foreign' | 'damaged' | 'unreadable';
      /** One sentence, founder-facing. No paths, no error codes. */
      summary: string;
      problems: WorkspaceProblem[];
      /** True when Create Workspace here would be the right offer. */
      offerCreate: boolean;
      /** True when repairing in place would be the right offer. */
      offerRepair: boolean;
    };

/* -------------------------------------------------------------------------- */
/* Construction and reading                                                   */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Trim, collapse whitespace, clamp. Never invents a name. */
export function normaliseName(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const chosen = text.length > 0 ? text : fallback;
  return chosen.slice(0, WORKSPACE_NAME_MAX_LENGTH);
}

/**
 * A fresh manifest for a workspace being created.
 *
 * `now` and `appVersion` are parameters rather than being read from the clock and
 * the app: a function that reaches for `Date.now()` cannot be tested for the one
 * property that matters here, which is that `createdAt` and `lastOpenedAt` start
 * equal and only one of them ever moves.
 */
export function createManifest(input: {
  name: string;
  appVersion: string;
  now: string;
  preferredRuntime?: string | null;
  preferredMemoryScope?: MemoryScope;
}): WorkspaceManifest {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    name: normaliseName(input.name, 'Workspace'),
    createdVersion: input.appVersion,
    createdAt: input.now,
    lastOpenedAt: input.now,
    lastOpenedVersion: input.appVersion,
    preferredRuntime: input.preferredRuntime ?? null,
    preferredExecutives: null,
    preferredTheme: null,
    preferredMemoryScope: readMemoryScope(input.preferredMemoryScope),
    recentSessions: [],
  };
}

/**
 * Outcome of reading a stored manifest.
 *
 * `future` is its own case and is not an error to be swallowed. A manifest whose
 * schema version exceeds this build's has fields this build does not model, and
 * `writeManifest` would drop them on the next open — silently discarding settings
 * a newer D.W.I.G.I wrote. Refusing to touch it is the only non-destructive
 * option, so it is reported and the workspace opens read-only on that file.
 */
export type ManifestRead =
  | { ok: true; manifest: WorkspaceManifest; migratedFrom: number | null }
  | { ok: false; kind: 'absent' | 'corrupt' | 'future'; detail: string };

/**
 * Parse and migrate a stored manifest.
 *
 * ---------------------------------------------------------------------------
 * MIGRATION IS FORWARD-ONLY, TOTAL, AND NEVER LOSSY BY DEFAULT
 * ---------------------------------------------------------------------------
 * Every field is defaulted rather than required, because the alternative —
 * rejecting a manifest with one missing key — would discard a founder's
 * workspace settings over a field that has an obvious default. A manifest is a
 * convenience; losing it must never cost more than the convenience was worth.
 *
 * The one thing that is *not* defaulted is a newer schema version. See
 * `ManifestRead`.
 */
export function readManifest(
  raw: unknown,
  fallback: { name: string; appVersion: string; now: string }
): ManifestRead {
  if (raw === undefined || raw === null) {
    return { ok: false, kind: 'absent', detail: 'No workspace settings file.' };
  }
  if (!isRecord(raw)) {
    return { ok: false, kind: 'corrupt', detail: 'Workspace settings are not an object.' };
  }

  const storedVersion =
    typeof raw.schemaVersion === 'number' && Number.isFinite(raw.schemaVersion)
      ? raw.schemaVersion
      : 0;

  if (storedVersion > WORKSPACE_SCHEMA_VERSION) {
    return {
      ok: false,
      kind: 'future',
      detail:
        `These workspace settings were written by a newer version of D.W.I.G.I ` +
        `(format ${storedVersion}; this version understands ${WORKSPACE_SCHEMA_VERSION}). ` +
        `They have been left untouched.`,
    };
  }

  const manifest: WorkspaceManifest = {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    name: normaliseName(raw.name, fallback.name),
    createdVersion:
      typeof raw.createdVersion === 'string' && raw.createdVersion
        ? raw.createdVersion
        : 'unknown',
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : fallback.now,
    lastOpenedAt:
      typeof raw.lastOpenedAt === 'string' && raw.lastOpenedAt ? raw.lastOpenedAt : fallback.now,
    lastOpenedVersion:
      typeof raw.lastOpenedVersion === 'string' && raw.lastOpenedVersion
        ? raw.lastOpenedVersion
        : 'unknown',
    // Shape-validated, not existence-validated: whether the provider is installed
    // is a question for discovery, and answering it here would make reading a file
    // depend on what is on the machine.
    preferredRuntime:
      typeof raw.preferredRuntime === 'string' && PROVIDER_ID_SHAPE.test(raw.preferredRuntime)
        ? raw.preferredRuntime
        : null,
    preferredExecutives: readLensIdList(raw.preferredExecutives),
    preferredTheme:
      raw.preferredTheme === 'dark' || raw.preferredTheme === 'light'
        ? raw.preferredTheme
        : null,
    preferredMemoryScope: readMemoryScope(raw.preferredMemoryScope),
    recentSessions: readSessionList(raw.recentSessions),
  };

  return {
    ok: true,
    manifest,
    migratedFrom: storedVersion < WORKSPACE_SCHEMA_VERSION ? storedVersion : null,
  };
}

/**
 * Provider id shape, duplicated as a literal rather than imported.
 *
 * `shared/runtime/contract.ts` owns `isProviderId`, and importing it here would
 * make the workspace module depend on the runtime module for one regex — a
 * dependency that exists only to avoid five characters of duplication and that
 * couples workspace reading to the provider contract. The test suite asserts the
 * two agree, which is the cheaper guarantee.
 */
const PROVIDER_ID_SHAPE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const LENS_ID_SHAPE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function readLensIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.length <= 40 && LENS_ID_SHAPE.test(entry)
  );
  // An array that contained only junk reads back as unconfigured rather than as
  // an empty board: an empty enabled set would transmit a council of nobody.
  return ids.length > 0 ? [...new Set(ids)] : null;
}

function readSessionList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.length > 0 && entry.length <= 128
      )
    ),
  ].slice(0, RECENT_SESSIONS_MAX);
}

/**
 * Stamp an opened manifest.
 *
 * `createdAt` and `createdVersion` are never touched — they are the workspace's
 * provenance, and a bug report saying "created by 1.0.1, opened by 1.2.0" is
 * worth more than either field alone.
 */
export function stampOpened(
  manifest: WorkspaceManifest,
  appVersion: string,
  now: string
): WorkspaceManifest {
  return { ...manifest, lastOpenedAt: now, lastOpenedVersion: appVersion };
}

/** Record a session handle, newest first, de-duplicated, bounded. */
export function rememberSession(
  manifest: WorkspaceManifest,
  sessionId: string
): WorkspaceManifest {
  if (!sessionId) return manifest;
  const recentSessions = [
    sessionId,
    ...manifest.recentSessions.filter((id) => id !== sessionId),
  ].slice(0, RECENT_SESSIONS_MAX);
  return { ...manifest, recentSessions };
}

/**
 * Serialise for disk, emitting only schema keys in a stable order.
 *
 * Stable order so a manifest rewritten with no logical change produces a
 * byte-identical file. A founder who keeps their workspace in version control
 * should not see a diff because two keys swapped places.
 */
export function serialiseManifest(manifest: WorkspaceManifest): string {
  const out: Record<string, unknown> = {};
  for (const key of SCHEMA_KEYS) out[key] = manifest[key];
  return `${JSON.stringify(out, null, 2)}\n`;
}
