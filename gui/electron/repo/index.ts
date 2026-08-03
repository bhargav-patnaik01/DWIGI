/**
 * Repository reader — read-only filesystem access, plus change watching.
 *
 * ---------------------------------------------------------------------------
 * READ-ONLY BY CONSTRUCTION, NOT BY CONVENTION
 * ---------------------------------------------------------------------------
 * This module imports `readFile`, `readdir`, and `stat`. It does not import
 * `writeFile`, `mkdir`, `rm`, or `rename`, and no method here creates or mutates
 * anything. The repository is written by the advisor; the cockpit only looks.
 *
 * Every path is confined to the chosen workspace. A traversal guard is applied
 * even though all paths are internally constructed, because the workspace itself
 * arrives from the renderer.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import type {
  BusinessMemory,
  Calibration,
  DecisionJournal,
  DecisionRecord,
  ExecutiveDirectory,
  ExecutiveLens,
  Projection,
  RepositorySnapshot,
} from '../../shared/repo';
import {
  projectBusinessMemory,
  projectCalibration,
  projectDecisionRecord,
  projectExecutive,
  projectManifest,
} from './projections';

/** Relative locations the cockpit knows about. Nothing else is read. */
const PATHS = {
  memory: path.join('core', 'business_memory.md'),
  calibration: path.join('core', 'calibration_journal.md'),
  executives: path.join('core', 'executives'),
  manifest: path.join('core', 'executive_manifest.md'),
  journal: 'journal',
} as const;

/** Directories worth watching for change. */
const WATCHED = ['core', 'journal'] as const;

function now(): number {
  return Date.now();
}

function fail<T>(reason: string): Projection<T> {
  return { ok: false, reason, readAt: now() };
}

function ok<T>(value: T): Projection<T> {
  return { ok: true, value, readAt: now() };
}

export class RepositoryReader {
  private workspacePath: string | null = null;
  private watchers: FSWatcher[] = [];
  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onChange: () => void) {}

  /** Point at a repository. Stops any previous watch. */
  async setWorkspace(workspacePath: string): Promise<{ ok: boolean; reason?: string }> {
    this.stopWatching();

    try {
      const info = await stat(workspacePath);
      if (!info.isDirectory()) return { ok: false, reason: 'Not a directory.' };
    } catch {
      return { ok: false, reason: 'Directory does not exist or is not readable.' };
    }

    this.workspacePath = path.resolve(workspacePath);
    this.startWatching();
    return { ok: true };
  }

  getWorkspace(): string | null {
    return this.workspacePath;
  }

  /**
   * Resolve a repository-relative path, refusing anything outside the workspace.
   */
  private resolveInside(relative: string): string | null {
    if (!this.workspacePath) return null;
    const resolved = path.resolve(this.workspacePath, relative);
    const root = this.workspacePath;
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
    return resolved;
  }

  private async readText(relative: string): Promise<
    { ok: true; text: string } | { ok: false; reason: string }
  > {
    const target = this.resolveInside(relative);
    if (!target) return { ok: false, reason: 'Path is outside the workspace.' };
    try {
      return { ok: true, text: await readFile(target, 'utf8') };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return {
        ok: false,
        reason: code === 'ENOENT' ? 'File does not exist yet.' : `Unreadable (${code}).`,
      };
    }
  }

  /* ------------------------------------------------------------- projections */

  async readMemory(): Promise<Projection<BusinessMemory>> {
    const file = await this.readText(PATHS.memory);
    if (!file.ok) return fail(file.reason);
    try {
      const value = projectBusinessMemory(file.text);
      if (value.fieldCount === 0) {
        return fail('No recognisable memory fields found in the file.');
      }
      return ok(value);
    } catch (error) {
      return fail(`Could not project memory: ${(error as Error).message}`);
    }
  }

  /**
   * Does `core/business_memory.md` exist?
   *
   * Existence only — the file is not opened, parsed, or validated. `CLAUDE.md`
   * §14 makes absence the first-run trigger, and this reports that one condition
   * so the interface never has to infer it from a failed projection. A file that
   * exists but parses to nothing is *not* first run, and conflating the two would
   * offer onboarding over the top of a real Business Memory.
   */
  async hasMemory(): Promise<boolean> {
    const target = this.resolveInside(PATHS.memory);
    if (!target) return false;
    try {
      return (await stat(target)).isFile();
    } catch {
      return false;
    }
  }

  /**
   * Discover the board from `core/executives/`.
   *
   * ---------------------------------------------------------------------------
   * THE DIRECTORY IS THE ROSTER
   * ---------------------------------------------------------------------------
   * Every `.md` file is a candidate lens. There is no list of expected
   * executives here, no count to satisfy, and no name this reader knows —
   * adding a file adds an executive, and removing one removes it, with no code
   * change either way.
   *
   * Failure is graded rather than binary, because the two cases mean different
   * things to a founder. An unreadable *directory* is a broken installation and
   * the whole projection fails. An unreadable *file* is one missing executive:
   * the rest of the board still projects, and the casualty is named in
   * `skipped` so the gap is visible instead of silent.
   */
  async readExecutives(): Promise<Projection<ExecutiveDirectory>> {
    const dir = this.resolveInside(PATHS.executives);
    if (!dir) return fail('Path is outside the workspace.');

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return fail(
        code === 'ENOENT'
          ? 'No core/executives directory — the executive definitions are missing.'
          : `Executive definitions unreadable (${code}).`
      );
    }

    const lenses: ExecutiveLens[] = [];
    const skipped: string[] = [];
    const claimed = new Map<string, string>();

    // Filename order first, so the result is deterministic before `ordinal` is
    // consulted and stays deterministic when two lenses declare the same one.
    for (const name of entries.filter((n) => /\.md$/i.test(n)).sort()) {
      const relative = path.join(PATHS.executives, name);
      const file = await this.readText(relative);
      if (!file.ok) {
        skipped.push(name);
        continue;
      }

      let lens: ExecutiveLens | null = null;
      try {
        lens = projectExecutive(name, file.text);
      } catch {
        lens = null;
      }

      if (!lens) {
        skipped.push(name);
        continue;
      }

      /*
       * Two files claiming one id is a genuine ambiguity, not a preference.
       *
       * The id is what `/lens` transmits, so a duplicate would make one of the
       * two unreachable — and which one would depend on iteration order. The
       * second is refused and named rather than silently overwriting the first.
       */
      const owner = claimed.get(lens.id);
      if (owner !== undefined) {
        skipped.push(`${name} (duplicate id "${lens.id}", already claimed by ${owner})`);
        continue;
      }
      claimed.set(lens.id, name);

      lenses.push(lens);
    }

    if (lenses.length === 0) {
      // Better to report nothing than to show a partial board: an executive
      // roster with silent gaps would misrepresent who deliberates.
      return fail('No executive definitions could be read from core/executives.');
    }

    /*
     * Join participation metadata onto the roster.
     *
     * -------------------------------------------------------------------------
     * THE DIRECTORY IS STILL THE ROSTER; THE MANIFEST ONLY ANNOTATES IT
     * -------------------------------------------------------------------------
     * A manifest entry cannot conjure an executive — if there is no file, there
     * is no lens, and the id is reported as orphaned. That ordering matters: the
     * reverse would let a routing index invent a board member with no definition
     * behind it, which is the fabrication the whole projection layer forbids.
     *
     * A missing or unreadable manifest is survivable and disclosed. Every lens
     * still appears with its reasoning intact; what is lost is knowing which
     * ones may be toggled, and the interface says so rather than guessing.
     */
    const manifest = await this.readText(PATHS.manifest);
    let manifestError: string | null = null;
    const orphanedEntries: string[] = [];

    if (!manifest.ok) {
      manifestError = manifest.reason;
    } else {
      try {
        const { routing, structural, malformed } = projectManifest(manifest.text);

        for (const lens of lenses) {
          const entry = routing.get(lens.id);
          if (!entry) continue;
          lens.routing = entry;
          lens.structural = structural.has(lens.id);
        }

        for (const id of routing.keys()) {
          if (!lenses.some((lens) => lens.id === id)) orphanedEntries.push(id);
        }

        const unrouted = lenses.filter((lens) => lens.routing === null).map((lens) => lens.id);
        const problems = [
          malformed.length > 0 ? `malformed entries: ${malformed.join('; ')}` : '',
          unrouted.length > 0 ? `no entry for: ${unrouted.join(', ')}` : '',
        ].filter(Boolean);

        if (problems.length > 0) manifestError = problems.join(' — ');
      } catch (error) {
        manifestError = `Could not project the manifest: ${(error as Error).message}`;
      }
    }

    // Declared order, with filename order as the stable tiebreak. Sorting rather
    // than trusting directory order means the board presents identically on a
    // filesystem that enumerates differently.
    lenses.sort((a, b) => a.ordinal - b.ordinal || a.file.localeCompare(b.file));

    return ok({ lenses, skipped, manifestError, orphanedEntries });
  }

  async readCalibration(): Promise<Projection<Calibration>> {
    const file = await this.readText(PATHS.calibration);
    if (!file.ok) return fail(file.reason);
    try {
      return ok(projectCalibration(file.text));
    } catch (error) {
      return fail(`Could not project calibration: ${(error as Error).message}`);
    }
  }

  async readJournal(): Promise<Projection<DecisionJournal>> {
    const dir = this.resolveInside(PATHS.journal);
    if (!dir) return fail('Path is outside the workspace.');

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      /*
       * An absent journal is empty, not broken.
       *
       * `journal/` does not exist until the advisor writes the first Decision
       * Record, so every fresh installation hits this path. Reporting it as a
       * failed projection meant the Decisions screen greeted a new founder with a
       * caution-styled "unavailable" card about a directory they have no reason
       * to know exists — for the most ordinary state in the system.
       *
       * Any OTHER error still fails: a journal that exists and cannot be read is
       * a genuine fault, and collapsing the two would hide it.
       */
      if (code === 'ENOENT') return ok({ records: [], skipped: [] });
      return fail(`Journal unreadable (${code}).`);
    }

    const records: DecisionRecord[] = [];
    const skipped: string[] = [];

    // Only `DEC-*.md`. Anything else in the directory is not ours to interpret.
    for (const name of entries.filter((n) => /^DEC-.*\.md$/i.test(n)).sort().reverse()) {
      const file = await this.readText(path.join(PATHS.journal, name));
      if (!file.ok) {
        skipped.push(name);
        continue;
      }
      try {
        records.push(
          projectDecisionRecord(name.replace(/\.md$/i, ''), path.join('journal', name), file.text)
        );
      } catch {
        skipped.push(name);
      }
    }

    return ok({ records, skipped });
  }

  /** One read of everything, for a screen mount or a change notification. */
  async snapshot(): Promise<RepositorySnapshot | null> {
    if (!this.workspacePath) return null;
    const [memory, journal, calibration, executives, memoryPresent] = await Promise.all([
      this.readMemory(),
      this.readJournal(),
      this.readCalibration(),
      this.readExecutives(),
      this.hasMemory(),
    ]);
    return {
      workspacePath: this.workspacePath,
      memory,
      journal,
      calibration,
      executives,
      memoryPresent,
    };
  }

  /* ---------------------------------------------------------------- watching */

  /**
   * Watch `core/` and `journal/` for change.
   *
   * Notifications are coalesced: a single advisor action can touch several files,
   * and re-reading per event would thrash. The renderer is told only that
   * *something* changed and re-requests a snapshot — pushing diffs would mean
   * deciding what changed, which is interpretation.
   *
   * A missing directory is not an error. `journal/` legitimately does not exist
   * until the first record is written.
   */
  private startWatching(): void {
    if (!this.workspacePath) return;

    for (const relative of WATCHED) {
      const target = this.resolveInside(relative);
      if (!target) continue;
      try {
        const watcher = watch(target, { recursive: true }, () => this.notify());
        watcher.on('error', () => {
          /* Watch failure degrades to manual refresh; never fatal. */
        });
        this.watchers.push(watcher);
      } catch {
        // Directory absent or unwatchable on this platform: skip silently.
      }
    }
  }

  private notify(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      this.onChange();
    }, 350);
  }

  stopWatching(): void {
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {
        /* Already closed. */
      }
    }
    this.watchers = [];
    if (this.debounce) {
      clearTimeout(this.debounce);
      this.debounce = null;
    }
  }
}
