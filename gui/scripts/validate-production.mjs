#!/usr/bin/env node
/**
 * Production read-path validation and write audit.
 *
 * Verifies the two claims that can be checked without an advisor session:
 *
 *   1. Repository projections read the production repository correctly.
 *   2. NO WRITE ORIGINATES FROM THE GUI. Every tracked file is hashed before and
 *      after every read path is exercised, and the digests must match exactly.
 *
 * ---------------------------------------------------------------------------
 * THIS SCRIPT NEVER STARTS AN ADVISOR SESSION
 * ---------------------------------------------------------------------------
 * It spawns no `claude` process. On a repository with no business memory the
 * first substantive message is onboarding, and consuming that inside a
 * validation run would destroy the founder's first-run experience — which is
 * precisely what GATE 0 exists to judge.
 *
 *   node scripts/validate-production.mjs
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTION = path.resolve(HERE, '..', '..');

const { RepositoryReader } = require('../dist-electron/electron/repo/index.js');

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Recursive digest of every file the advisor owns. */
async function digest(root) {
  const entries = new Map();

  async function walk(dir, rel = '') {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      // `gui/` is this application; `.git` churns on its own.
      if (item.name === 'gui' || item.name === '.git' || item.name === 'node_modules') continue;
      const abs = path.join(dir, item.name);
      const key = rel ? `${rel}/${item.name}` : item.name;
      if (item.isDirectory()) {
        await walk(abs, key);
      } else if (item.isFile()) {
        const buf = await readFile(abs);
        entries.set(key, createHash('sha256').update(buf).digest('hex'));
      }
    }
  }

  await walk(root);
  return entries;
}

function compare(before, after) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const [file, hash] of after) {
    if (!before.has(file)) added.push(file);
    else if (before.get(file) !== hash) changed.push(file);
  }
  for (const file of before.keys()) if (!after.has(file)) removed.push(file);
  return { changed, added, removed };
}

async function main() {
  console.log('production read-path validation');
  console.log(`repository: ${PRODUCTION}\n`);

  /* -------------------------------------------------------------- precondition */
  console.log('[0] preconditions');
  const memoryPath = path.join(PRODUCTION, 'core', 'business_memory.md');
  let memoryExists = true;
  try {
    await stat(memoryPath);
  } catch {
    memoryExists = false;
  }
  const claudeMd = path.join(PRODUCTION, 'CLAUDE.md');
  let isRealRepo = true;
  try {
    await stat(claudeMd);
  } catch {
    isRealRepo = false;
  }
  check('target is the Executive Intelligence System (CLAUDE.md present)', isRealRepo);
  console.log(
    `  INFO  GATE 0 ${memoryExists ? 'has run (business_memory.md present)' : 'has NOT run (business_memory.md absent)'}`
  );
  if (!isRealRepo) {
    console.log('\nrefusing to continue against a non-repository');
    process.exit(1);
  }

  /* ------------------------------------------------------------- write audit */
  console.log('\n[1] write audit — digest before');
  const before = await digest(PRODUCTION);
  console.log(`  ${before.size} files hashed`);

  console.log('\n[2] exercising every read path');
  const reader = new RepositoryReader(() => {});
  const attached = await reader.setWorkspace(PRODUCTION);
  check('reader attaches to the production repository', attached.ok === true, attached.reason ?? '');

  const snapshot = await reader.snapshot();
  check('snapshot returns', snapshot !== null);

  // Exercise each projection individually as well, so a failure is attributable.
  const memory = await reader.readMemory();
  const journal = await reader.readJournal();
  const calibration = await reader.readCalibration();

  console.log(
    `  memory      : ${memory.ok ? `${memory.value.fieldCount} fields` : `unavailable — ${memory.reason}`}`
  );
  console.log(
    `  journal     : ${journal.ok ? `${journal.value.records.length} records` : `unavailable — ${journal.reason}`}`
  );
  console.log(
    `  calibration : ${calibration.ok ? `${calibration.value.tables.length} tables, ${calibration.value.activeAdjustments.length} adjustments` : `unavailable — ${calibration.reason}`}`
  );

  // Repeat reads and let the watcher settle, to catch anything written lazily.
  await reader.snapshot();
  await new Promise((r) => setTimeout(r, 1500));
  reader.stopWatching();

  console.log('\n[3] write audit — digest after');
  const after = await digest(PRODUCTION);
  const diff = compare(before, after);

  check('no file modified by the GUI read paths', diff.changed.length === 0, diff.changed.join(', '));
  check('no file created by the GUI read paths', diff.added.length === 0, diff.added.join(', '));
  check('no file removed by the GUI read paths', diff.removed.length === 0, diff.removed.join(', '));
  check('file count unchanged', before.size === after.size, `${before.size} -> ${after.size}`);

  /* ------------------------------------------------ projection accuracy checks */
  console.log('\n[4] projection accuracy');

  // Calibration is present in every installation, so it is always checkable.
  check('calibration projects successfully', calibration.ok === true, calibration.ok ? '' : calibration.reason);
  if (calibration.ok) {
    const headings = calibration.value.tables.map((t) => t.heading);
    check(
      'review queue table located',
      headings.some((h) => /review queue/i.test(h)),
      headings.join(' | ')
    );
    check(
      'confidence calibration table located',
      calibration.value.tables.some((t) => t.header.some((h) => /predictions/i.test(h)))
    );
  }

  // Absent artefacts must degrade with an honest reason, never a crash.
  if (!memoryExists) {
    check(
      'absent business memory degrades with a stated reason',
      memory.ok === false && /does not exist/i.test(memory.reason),
      memory.ok ? 'unexpectedly ok' : memory.reason
    );
    check(
      'absent journal degrades with a stated reason',
      journal.ok === false && /journal directory/i.test(journal.reason),
      journal.ok ? 'unexpectedly ok' : journal.reason
    );
  } else {
    check('business memory projects successfully', memory.ok === true, memory.ok ? '' : memory.reason);
    if (memory.ok) {
      const fields = memory.value.sections.flatMap((s) => s.fields);
      const stage = fields.find((f) => f.key === 'stage');
      check('stage field projected', Boolean(stage), stage ? `${stage.value} (${stage.provenance})` : 'missing');
      check(
        'every projected field carries provenance',
        fields.every((f) => typeof f.provenance === 'string'),
        ''
      );
    }
  }

  /* -------------------------------------------------------------------- result */
  console.log(`\n${pass} passed, ${fail} failed`);
  if (!memoryExists) {
    console.log(
      '\nBLOCKED: streaming, onboarding-data and journal-update checks require GATE 0.\n' +
        'Run onboarding in a terminal first — running it here would consume the\n' +
        'first-run experience that GATE 0 exists to judge.'
    );
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('harness error:', error);
  process.exit(1);
});
