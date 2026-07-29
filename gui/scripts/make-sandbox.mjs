#!/usr/bin/env node
/**
 * Create or refresh a disposable copy of the Executive Intelligence System for
 * bridge development.
 *
 * WHY THIS EXISTS
 * The bridge harnesses drive a real `claude` process against a real repository.
 * That process reads CLAUDE.md, may write journal records, and — on a repository
 * with no business memory — will enter onboarding. Pointing it at production
 * would consume the pristine first-run state that GATE 0 validation depends on,
 * and would scatter development artifacts through real decision journals.
 *
 * WHY OUTSIDE THE REPOSITORY TREE
 * The sandbox is created as a sibling directory, not a subdirectory. Claude Code
 * discovers CLAUDE.md by walking up from the working directory, so a sandbox
 * nested inside the real repository would load production's CLAUDE.md as well as
 * the copy's — making the two indistinguishable during debugging.
 *
 * ---------------------------------------------------------------------------
 * THE ONE FILE THIS NEVER COPIES
 * ---------------------------------------------------------------------------
 * `core/business_memory.md` holds the founder's actual cash position, runway, and
 * customer facts. An earlier version of this script copied `core/` wholesale,
 * which put all of it into a throwaway directory that development harnesses drive
 * an LLM against — and, through the screenshot harness, into PNG files.
 *
 * It is now excluded structurally, by a filter this script cannot proceed without,
 * and a synthetic fixture is seeded in its place. `tests/sandbox-privacy.test.mjs`
 * asserts the exclusion on every `npm test`, because a privacy fence nobody tests
 * is a privacy fence that silently stops working.
 *
 *   node scripts/make-sandbox.mjs            # create / refresh, synthetic memory
 *   node scripts/make-sandbox.mjs --reset    # delete and recreate from scratch
 *   node scripts/make-sandbox.mjs --empty    # no memory at all, for first-run work
 */

import { copyFile, cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Source and destination, overridable so the privacy regression test can run this
 * against a fake repository in a temporary directory. Without that, the only way
 * to test the exclusion would be to trust a reading of the code.
 */
const REPO_ROOT = process.env.EIS_SANDBOX_SOURCE
  ? path.resolve(process.env.EIS_SANDBOX_SOURCE)
  : path.resolve(HERE, '..', '..');

const SANDBOX = process.env.EIS_SANDBOX_TARGET
  ? path.resolve(process.env.EIS_SANDBOX_TARGET)
  : path.resolve(REPO_ROOT, '..', 'eis-sandbox');

/** Engine files only. `gui/`, `.git/`, and `journal/` are deliberately absent. */
const COPY = ['CLAUDE.md', 'core', 'docs', '.claude'];

/**
 * Repository-relative paths that must never reach a sandbox.
 *
 * Exported shape kept deliberately simple — a flat list of relative paths — so the
 * regression test can assert against the same constant the copy uses, rather than
 * against a second list that could drift.
 */
export const NEVER_COPY = [path.join('core', 'business_memory.md')];

/** Synthetic memory seeded when a populated sandbox is wanted. */
const SYNTHETIC_MEMORY = path.join(HERE, '..', 'tests', 'fixtures', 'business_memory_sandbox.md');

/**
 * Should this path be copied into the sandbox?
 *
 * Compared case-insensitively on the repository-relative path, because Windows
 * paths differ in case from the same path on POSIX and a case-sensitive check
 * would pass the test suite while leaking on one of the two platforms.
 */
export function shouldCopy(absolutePath, repoRoot = REPO_ROOT) {
  const relative = path.relative(repoRoot, absolutePath);
  return !NEVER_COPY.some(
    (excluded) => relative.toLowerCase() === excluded.toLowerCase()
  );
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const reset = process.argv.includes('--reset');
  const empty = process.argv.includes('--empty');

  if (reset && (await exists(SANDBOX))) {
    await rm(SANDBOX, { recursive: true, force: true });
    console.log(`removed  ${SANDBOX}`);
  }

  await mkdir(SANDBOX, { recursive: true });

  for (const entry of COPY) {
    const from = path.join(REPO_ROOT, entry);
    if (!(await exists(from))) {
      console.log(`skip     ${entry} (absent in source)`);
      continue;
    }
    await cp(from, path.join(SANDBOX, entry), {
      recursive: true,
      // The fence. `cp` calls this for every entry it is about to write.
      filter: (source) => shouldCopy(source),
    });
    console.log(`copied   ${entry}`);
  }

  /*
   * A stale real memory from an earlier run of this script would defeat the
   * exclusion entirely, so it is removed rather than merely not copied.
   */
  const sandboxMemory = path.join(SANDBOX, 'core', 'business_memory.md');
  if (await exists(sandboxMemory)) {
    await rm(sandboxMemory, { force: true });
    console.log('removed  core/business_memory.md left by an earlier run');
  }

  if (empty) {
    console.log('memory   omitted (--empty) — onboarding will trigger here');
  } else if (await exists(SYNTHETIC_MEMORY)) {
    await mkdir(path.join(SANDBOX, 'core'), { recursive: true });
    await copyFile(SYNTHETIC_MEMORY, sandboxMemory);
    console.log('seeded   core/business_memory.md from the synthetic fixture');
  } else {
    console.log('memory   synthetic fixture missing — sandbox left without memory');
  }

  /*
   * The sandbox must never be mistaken for production, including by the advisor
   * itself if it ever reads this file. The screenshot harness also refuses to run
   * against a directory without this marker, so it is load-bearing rather than
   * documentation.
   */
  await writeFile(
    path.join(SANDBOX, 'SANDBOX.md'),
    [
      '# Disposable Sandbox',
      '',
      'A throwaway copy of the Executive Intelligence System, used for GUI bridge',
      'development. Not production. Nothing here is authoritative and nothing here',
      'should be trusted or preserved.',
      '',
      'Regenerate with `node gui/scripts/make-sandbox.mjs --reset`.',
      '',
      'Business Memory here is a **synthetic fixture** describing a company that does',
      'not exist. The founder\'s real `core/business_memory.md` is never copied into',
      'this directory — see `gui/scripts/make-sandbox.mjs`. Decision records written',
      'here are development artifacts.',
      '',
    ].join('\n'),
    'utf8'
  );

  const hasMemory = await exists(sandboxMemory);

  console.log('');
  console.log(`sandbox  ${SANDBOX}`);
  console.log(`memory   ${hasMemory ? 'present (synthetic)' : 'absent (onboarding will trigger here, safely)'}`);
}

// Importable for the regression test without running the generator.
if (process.env.EIS_SANDBOX_IMPORT_ONLY !== '1') {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
