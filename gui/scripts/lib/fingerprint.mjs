/**
 * Directory fingerprinting — the fence that proves production is untouched.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A MODULE AND NOT A HELPER INSIDE THE HARNESS
 * ---------------------------------------------------------------------------
 * `validate-bridge.mjs` drives the real runtime and costs real tokens, so it
 * cannot be run casually — which means a safety check living inside it is a
 * safety check nobody can test. Here it is importable, and
 * `tests/fingerprint.test.mjs` drives it against a temporary directory on every
 * `npm test`.
 *
 * The property being defended: the cockpit may read the advisor's files and spawn
 * a process against them, and may never modify them. That claim is only worth
 * making if something checks it.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Content hash of every file under `dir`, keyed by path relative to it.
 *
 * ---------------------------------------------------------------------------
 * WHY CONTENT HASHES RATHER THAN "THIS FILE DOES NOT EXIST"
 * ---------------------------------------------------------------------------
 * The check this replaced proved production was untouched by asserting that the
 * file onboarding creates did not exist. That worked only until the founder
 * actually onboarded — after which the harness refused to run at all, and the
 * strongest safety claim in the project became the reason it could not be
 * validated.
 *
 * Absence was always a proxy. Comparing content before and after is the real
 * property: it survives legitimate use of the system, and it is strictly stronger
 * — it also catches modification of files that always existed, which absence
 * could never detect.
 *
 * A missing or unreadable directory fingerprints as empty rather than throwing,
 * so a directory created during a run reads as an added path.
 */
export function fingerprint(dir) {
  const seen = new Map();

  const walk = (absolute, relative) => {
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(absolute, entry.name);
      const key = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(child, key);
        continue;
      }
      // Symlinks and devices are neither read nor followed: a fingerprint that
      // followed a link out of the tree would report changes from outside it.
      if (!entry.isFile()) continue;
      try {
        seen.set(key, createHash('sha256').update(readFileSync(child)).digest('hex'));
      } catch {
        // Unreadable: recorded by size, so a later change still shows up rather
        // than the file silently dropping out of the comparison.
        seen.set(key, `unreadable:${statSync(child).size}`);
      }
    }
  };

  walk(dir, '');
  return seen;
}

/**
 * Paths added, removed, or edited between two fingerprints.
 *
 * Returns descriptions rather than a boolean, because "something under core/
 * changed" is not actionable and "modified core/business_memory.md" is.
 */
export function diffFingerprints(before, after) {
  const changed = [];
  for (const [key, hash] of before) {
    if (!after.has(key)) changed.push(`removed ${key}`);
    else if (after.get(key) !== hash) changed.push(`modified ${key}`);
  }
  for (const key of after.keys()) {
    if (!before.has(key)) changed.push(`added ${key}`);
  }
  return changed;
}

/** The advisor's own directories. Nothing the cockpit does may alter any of them. */
export const GUARDED = ['core', 'journal', 'dossier'];

/** One fingerprint spanning every guarded directory of a repository. */
export function fingerprintGuarded(root) {
  const state = new Map();
  for (const dir of GUARDED) {
    for (const [key, hash] of fingerprint(path.join(root, dir))) {
      state.set(`${dir}/${key}`, hash);
    }
  }
  return state;
}
