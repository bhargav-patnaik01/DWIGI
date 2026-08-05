/**
 * Workspace lifecycle — create, validate, open.
 *
 * ---------------------------------------------------------------------------
 * "NO CLONING. NO COPYING TEMPLATES. NO MANUAL SETUP." — AND WHAT THAT COSTS
 * ---------------------------------------------------------------------------
 * A founder selects an empty folder and gets a working workspace. For that to be
 * true, the engine — the kernel, the executives, the manifest, the commands, the
 * onboarding protocol — has to travel *inside the application*, because there is
 * no git, no network fetch, and no repository to copy from.
 *
 * So the packaged build ships the engine as a resource (`package.json` →
 * `build.extraResources`), and `resolveEngineSource()` finds it in both the
 * packaged and the development layouts. If it cannot be found, creation fails
 * loudly with a specific message rather than producing an empty folder that looks
 * like a workspace and cannot answer a question.
 *
 * ---------------------------------------------------------------------------
 * THE POINTER FILES ARE WHAT MAKE `engineDiscovery` PROVIDER-NEUTRAL
 * ---------------------------------------------------------------------------
 * The kernel is single-sourced at `CLAUDE.md`. Creation additionally writes one
 * short pointer per provider convention — `GEMINI.md` today — each of which
 * delegates to the kernel and adds no rules of its own (ADR-013 §D).
 *
 * Duplicating the kernel per provider was the obvious alternative and would have
 * been a disaster: five copies of the operating contract, drifting independently,
 * with no way to tell which one a given runtime had read.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE WILL NOT DO
 * ---------------------------------------------------------------------------
 * It does not write `core/business_memory.md` — that is the advisor's, written
 * during onboarding, and seeding it would be inventing company facts. It does not
 * write `journal/` content. It creates the directories and stops.
 */

import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createManifest,
  readManifest,
  REQUIRED_STRUCTURE,
  serialiseManifest,
  stampOpened,
  WORKSPACE_DIR,
  WORKSPACE_MANIFEST_FILE,
  type WorkspaceManifest,
  type WorkspaceProblem,
  type WorkspaceValidation,
} from '../../shared/workspace';
import { pointerFilenames } from '../../shared/runtime/manifests';

/** The kernel's filename. The one Claude-shaped artifact left at the centre. */
const KERNEL_FILE = 'CLAUDE.md';

/**
 * Engine paths copied into a new workspace, relative to the engine source.
 *
 * Deliberately explicit rather than "copy everything": the source tree in
 * development is the whole D.W.I.G.I repository, and copying it wholesale would
 * put `gui/`, `node_modules/`, and the developer's own Business Memory into a
 * founder's workspace. That last one is not hypothetical — `core/business_memory.md`
 * sits in the development tree and is gitignored precisely because it holds a real
 * company's cash position.
 */
const ENGINE_PAYLOAD: readonly string[] = [
  KERNEL_FILE,
  'core/reasoning_rules.md',
  'core/execution_pipeline.md',
  'core/learning_protocol.md',
  'core/calibration_journal.md',
  'core/executive_manifest.md',
  'core/executives',
  'core/onboarding',
  '.claude/commands',
];

/** Never copied, whatever else matches. A denylist, because the cost is asymmetric. */
const NEVER_COPY: readonly string[] = ['business_memory.md'];

export interface EngineSource {
  root: string;
  /** How it was found, for diagnostics. */
  origin: 'packaged-resource' | 'development-tree';
}

/**
 * Locate the engine template.
 *
 * Packaged first: in a real installation the resource directory is authoritative,
 * and falling back to a development path on an end-user machine would silently
 * find nothing useful and produce a confusing error later rather than a clear one
 * here.
 */
export async function resolveEngineSource(
  resourcesPath: string | undefined,
  appDir: string
): Promise<EngineSource | null> {
  const candidates: { root: string; origin: EngineSource['origin'] }[] = [];
  if (resourcesPath) {
    candidates.push({ root: path.join(resourcesPath, 'engine'), origin: 'packaged-resource' });
  }
  // Development: `gui/` sits inside the engine repository, so the engine is one
  // level up. Checked second so a packaged build never prefers it.
  candidates.push({ root: path.resolve(appDir, '..'), origin: 'development-tree' });

  for (const candidate of candidates) {
    try {
      if ((await stat(path.join(candidate.root, KERNEL_FILE))).isFile()) return candidate;
    } catch {
      // Not here. Try the next.
    }
  }
  return null;
}

/** Recursive copy with the denylist applied. Skips what is absent rather than failing. */
async function copyTree(from: string, to: string): Promise<void> {
  let info;
  try {
    info = await stat(from);
  } catch {
    // An absent payload entry is survivable — `journal/` and `dossier/` do not
    // exist in a fresh engine tree either. Validation reports what is missing.
    return;
  }

  if (info.isFile()) {
    if (NEVER_COPY.includes(path.basename(from))) return;
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    return;
  }

  if (!info.isDirectory()) return;

  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from)) {
    if (NEVER_COPY.includes(entry)) continue;
    await copyTree(path.join(from, entry), path.join(to, entry));
  }
}

/**
 * The pointer file written for a non-Claude CLI runtime.
 *
 * Short by design. Every rule it could state is already stated in the kernel, and
 * a pointer that started explaining the system would become a second, drifting
 * copy of it — the failure ADR-011 removed from the executive roster and that this
 * file must not reintroduce.
 */
function pointerContent(providerLabel: string): string {
  return `# Operating instructions for ${providerLabel}

Read \`${KERNEL_FILE}\` in this directory and follow it as your operating kernel.

It is the single source of truth for how this board reasons. This file exists only
because different AI runtimes look for differently-named instruction files; it adds
no rules of its own, and where the two could ever appear to disagree, \`${KERNEL_FILE}\`
wins.
`;
}

export interface CreateResult {
  ok: boolean;
  reason?: string;
  manifest?: WorkspaceManifest;
}

/**
 * Initialize a new workspace in `target`.
 *
 * Refuses a directory that already holds a workspace. Overwriting one would
 * destroy a founder's Business Memory and decision journal, and "the folder
 * looked empty enough" is not a standard to apply to that.
 */
export async function createWorkspace(input: {
  target: string;
  name: string;
  appVersion: string;
  engine: EngineSource | null;
  now: string;
  preferredRuntime?: string | null;
}): Promise<CreateResult> {
  const { target, engine } = input;

  if (!engine) {
    return {
      ok: false,
      reason:
        'D.W.I.G.I could not find its own executive board template, so it cannot set up a new workspace. This is a problem with the installation rather than with the folder you chose.',
    };
  }

  try {
    const existing = await stat(path.join(target, KERNEL_FILE)).catch(() => null);
    if (existing?.isFile()) {
      return {
        ok: false,
        reason:
          'This folder already contains a workspace. Use Open Workspace instead — creating one here would overwrite what is already in it.',
      };
    }

    await mkdir(target, { recursive: true });

    for (const entry of ENGINE_PAYLOAD) {
      await copyTree(path.join(engine.root, entry), path.join(target, entry));
    }

    // Directories the advisor writes into. Created empty so a founder browsing the
    // folder can see where things will go; their absence is survivable, which is
    // why they are not in `ENGINE_PAYLOAD`.
    await mkdir(path.join(target, 'journal'), { recursive: true });
    await mkdir(path.join(target, 'dossier'), { recursive: true });

    // Provider-native pointers. Derived from the manifests, so a CLI provider
    // added later gets one automatically.
    for (const filename of pointerFilenames(KERNEL_FILE)) {
      await writeFile(
        path.join(target, filename),
        pointerContent(path.basename(filename, '.md')),
        'utf8'
      );
    }

    const manifest = createManifest({
      name: input.name,
      appVersion: input.appVersion,
      now: input.now,
      preferredRuntime: input.preferredRuntime ?? null,
    });

    await mkdir(path.join(target, WORKSPACE_DIR), { recursive: true });
    await writeFile(
      path.join(target, WORKSPACE_DIR, WORKSPACE_MANIFEST_FILE),
      serialiseManifest(manifest),
      'utf8'
    );

    return { ok: true, manifest };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `The workspace could not be created: ${error.message}`
          : 'The workspace could not be created.',
    };
  }
}

/**
 * Validate a candidate workspace.
 *
 * ---------------------------------------------------------------------------
 * THREE FAILURES THAT DEMAND THREE DIFFERENT OFFERS
 * ---------------------------------------------------------------------------
 * `empty`   → offer to create one here. Safe: there is nothing to destroy.
 * `foreign` → offer nothing but a different folder. This is someone's Documents
 *             directory, and writing an engine into it would be the application
 *             taking a liberty nobody granted.
 * `damaged` → offer repair. It is ours and it is incomplete.
 *
 * Collapsing these into "not a valid workspace" is what produces the classic
 * destructive accident: an offer to initialize, accepted on a folder that already
 * held something.
 */
export async function validateWorkspace(target: string): Promise<WorkspaceValidation> {
  let entries: string[];
  try {
    const info = await stat(target);
    if (!info.isDirectory()) {
      return {
        ok: false,
        kind: 'unreadable',
        summary: 'That is a file, not a folder.',
        problems: [],
        offerCreate: false,
        offerRepair: false,
      };
    }
    entries = await readdir(target);
  } catch {
    return {
      ok: false,
      kind: 'unreadable',
      summary: 'That folder could not be opened. It may have been moved, or D.W.I.G.I may not have permission to read it.',
      problems: [],
      offerCreate: false,
      offerRepair: false,
    };
  }

  const problems: WorkspaceProblem[] = [];
  for (const entry of REQUIRED_STRUCTURE) {
    const full = path.join(target, entry.path);
    try {
      const info = await stat(full);
      const matches = entry.kind === 'directory' ? info.isDirectory() : info.isFile();
      if (!matches) {
        problems.push({ path: entry.path, purpose: entry.purpose, recoverable: !entry.essential });
      }
    } catch {
      problems.push({ path: entry.path, purpose: entry.purpose, recoverable: !entry.essential });
    }
  }

  const essentialMissing = problems.filter((problem) => !problem.recoverable);

  if (problems.length === 0) {
    const manifest = await readWorkspaceManifest(target, {
      name: path.basename(target),
      appVersion: 'unknown',
      now: new Date().toISOString(),
    });
    return { ok: true, manifest: manifest.ok ? manifest.manifest : null };
  }

  // Nothing of ours at all. Distinguish an empty folder from someone else's.
  const hasKernel = !problems.some((problem) => problem.path === KERNEL_FILE);
  if (!hasKernel) {
    const visible = entries.filter((entry) => !entry.startsWith('.'));
    if (visible.length === 0) {
      return {
        ok: false,
        kind: 'empty',
        summary: 'This folder is empty. D.W.I.G.I can set up a new workspace here.',
        problems,
        offerCreate: true,
        offerRepair: false,
      };
    }
    return {
      ok: false,
      kind: 'foreign',
      summary:
        'This folder has other things in it and is not a D.W.I.G.I workspace. Choose an empty folder, or pick the folder your workspace is actually in.',
      problems,
      offerCreate: false,
      offerRepair: false,
    };
  }

  return {
    ok: false,
    kind: 'damaged',
    summary:
      essentialMissing.length > 0
        ? 'This workspace is missing part of its executive board and cannot be used until it is repaired.'
        : 'This workspace is missing some optional parts. It will work, and D.W.I.G.I can fill them in.',
    problems,
    offerCreate: false,
    offerRepair: true,
  };
}

/** Read and migrate the manifest. Absence is normal for a v1.0.1 workspace. */
export async function readWorkspaceManifest(
  target: string,
  fallback: { name: string; appVersion: string; now: string }
) {
  let raw: unknown = null;
  try {
    raw = JSON.parse(
      await readFile(path.join(target, WORKSPACE_DIR, WORKSPACE_MANIFEST_FILE), 'utf8')
    );
  } catch {
    raw = null;
  }
  return readManifest(raw, fallback);
}

/**
 * Open a workspace: validate, migrate the manifest, stamp it, write it back.
 *
 * A workspace created by v1.0.1 has no `.dwigi/` at all. That is not an error and
 * not a migration failure — it is the expected state for every existing
 * installation, and one is written for it on first open.
 */
export async function openWorkspace(input: {
  target: string;
  appVersion: string;
  now: string;
}): Promise<{
  validation: WorkspaceValidation;
  manifest: WorkspaceManifest | null;
  /** Set when a manifest existed but could not be used. Reported, never silent. */
  manifestNotice: string | null;
}> {
  const validation = await validateWorkspace(input.target);
  if (!validation.ok) return { validation, manifest: null, manifestNotice: null };

  const fallbackName = path.basename(input.target) || 'Workspace';
  const read = await readWorkspaceManifest(input.target, {
    name: fallbackName,
    appVersion: input.appVersion,
    now: input.now,
  });

  if (!read.ok) {
    if (read.kind === 'future') {
      // Left untouched deliberately. See `readManifest`.
      return { validation, manifest: null, manifestNotice: read.detail };
    }
    const created = createManifest({
      name: fallbackName,
      appVersion: input.appVersion,
      now: input.now,
    });
    await writeManifest(input.target, created);
    return {
      validation,
      manifest: created,
      manifestNotice:
        read.kind === 'corrupt'
          ? 'This workspace’s settings could not be read and have been reset. Your business memory and decisions are untouched.'
          : null,
    };
  }

  const stamped = stampOpened(read.manifest, input.appVersion, input.now);
  await writeManifest(input.target, stamped);
  return { validation, manifest: stamped, manifestNotice: null };
}

/** Persist the manifest. Best-effort: a settings write must never block a launch. */
export async function writeManifest(
  target: string,
  manifest: WorkspaceManifest
): Promise<boolean> {
  try {
    await mkdir(path.join(target, WORKSPACE_DIR), { recursive: true });
    await writeFile(
      path.join(target, WORKSPACE_DIR, WORKSPACE_MANIFEST_FILE),
      serialiseManifest(manifest),
      'utf8'
    );
    return true;
  } catch {
    return false;
  }
}

/** Fill in missing non-essential structure. Never overwrites anything present. */
export async function repairWorkspace(target: string): Promise<{ repaired: string[] }> {
  const repaired: string[] = [];
  for (const entry of REQUIRED_STRUCTURE) {
    if (entry.kind !== 'directory') continue;
    const full = path.join(target, entry.path);
    try {
      await stat(full);
    } catch {
      await mkdir(full, { recursive: true });
      repaired.push(entry.path);
    }
  }
  return { repaired };
}
