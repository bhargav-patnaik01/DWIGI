/**
 * PERMANENT REPOSITORY PROJECTION TESTS
 *
 * Fixtures are real: `calibration_journal.md` and `memory_template.md` are copies
 * of the live repository files, so a schema change in the Executive Intelligence
 * System surfaces here as a failing test rather than as a blank screen.
 *
 * The central assertion throughout is negative — that the projections do NOT
 * derive. No staleness, no overdue calculation, no provenance-to-weight mapping,
 * no completion percentage. Those rules belong to the advisor, and a second
 * implementation of them in the cockpit would silently diverge.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');

const { projectBusinessMemory, projectCalibration, projectDecisionRecord } = require(
  '../dist-electron/electron/repo/projections.js'
);
const { extractTables, parseFrontMatter, humanise } = require(
  '../dist-electron/electron/repo/markdown.js'
);

const read = (name) => readFileSync(path.join(FIX, name), 'utf8');

/* ------------------------------------------------------------- markdown base */

test('extractTables finds tables and ignores prose', () => {
  const tables = extractTables(read('calibration_journal.md'));
  assert.ok(tables.length > 3, `expected several tables, got ${tables.length}`);
  for (const t of tables) assert.ok(Array.isArray(t.header) && t.header.length > 0);
});

test('parseFrontMatter reads scalars and collapses list values', () => {
  const { data, body } = parseFrontMatter(read('DEC-20260720_pricing.md'));
  assert.equal(data.status, 'open');
  assert.equal(data.domain, 'Pricing & packaging');
  assert.equal(data.review_date, '2026-10-15');
  assert.match(data.lenses_s4, /CFO \(Lead\)/);
  assert.match(data.lenses_s4, /Sales\/GTM \(Lead\)/);
  assert.ok(!body.startsWith('---'), 'front matter was not stripped from the body');
});

test('parseFrontMatter tolerates a document with no front matter', () => {
  const { data, body } = parseFrontMatter('# Just a heading\n\nSome text.');
  assert.deepEqual(data, {});
  assert.match(body, /Just a heading/);
});

test('humanise formats keys without inventing words', () => {
  assert.equal(humanise('north_star_metric'), 'North star metric');
  assert.equal(humanise('stage'), 'Stage');
});

/* ------------------------------------------------------------ business memory */

test('business memory projects sections and fields verbatim', () => {
  const memory = projectBusinessMemory(read('business_memory_filled.md'));
  assert.ok(memory.sections.length >= 2, 'expected at least two sections');
  assert.equal(memory.fieldCount, 6);

  const all = memory.sections.flatMap((s) => s.fields);
  const stage = all.find((f) => f.key === 'stage');
  assert.ok(stage);
  assert.equal(stage.value, 'Pre-PMF', 'value was altered');
  assert.equal(stage.provenance, 'confirmed', 'provenance was altered');
  assert.equal(stage.updated, '2026-07-20', 'date was reformatted');
  assert.equal(stage.required, true, 'required marker not detected');
});

test('unknown values are preserved, never replaced with a default', () => {
  const memory = projectBusinessMemory(read('business_memory_filled.md'));
  const team = memory.sections.flatMap((s) => s.fields).find((f) => f.key === 'team');
  assert.ok(team);
  assert.equal(team.value, 'unknown', 'unknown was substituted');
  assert.equal(team.required, false);
});

/**
 * The load-bearing negative test. A field carries only what the file said; the
 * cockpit attaches no interpretation of what that means.
 */
test('memory fields carry NO derived properties', () => {
  const memory = projectBusinessMemory(read('business_memory_filled.md'));
  const field = memory.sections.flatMap((s) => s.fields)[0];
  assert.ok(field);

  for (const forbidden of [
    'isStale',
    'stale',
    'epistemicWeight',
    'weight',
    'daysSinceUpdate',
    'isOverdue',
    'score',
  ]) {
    assert.equal(
      Object.hasOwn(field, forbidden),
      false,
      `field exposes derived property "${forbidden}" — projections must not derive`
    );
  }

  assert.deepEqual(
    Object.keys(field).sort(),
    ['confidence', 'key', 'label', 'provenance', 'required', 'updated', 'value'].sort()
  );
});

test('the schema template itself parses (guards against schema drift)', () => {
  const memory = projectBusinessMemory(read('memory_template.md'));
  assert.ok(
    memory.fieldCount > 20,
    `template should yield the full schema, got ${memory.fieldCount} fields`
  );
  // Contract chapters describe the schema and must not be projected as data.
  const titles = memory.sections.map((s) => s.title.toLowerCase());
  assert.ok(
    !titles.some((t) => t.includes('how this file works') || t.includes('notation')),
    `contract sections leaked into projections: ${titles.join(' | ')}`
  );
});

test('malformed memory yields zero fields rather than throwing', () => {
  for (const junk of ['', '# Heading only', '| broken | table', 'random text']) {
    const memory = projectBusinessMemory(junk);
    assert.equal(memory.fieldCount, 0);
    assert.deepEqual(memory.sections, []);
  }
});

/* ------------------------------------------------------------------ decisions */

test('decision record keeps front matter verbatim and untyped', () => {
  const record = projectDecisionRecord(
    'DEC-20260720_pricing',
    'journal/DEC-20260720_pricing.md',
    read('DEC-20260720_pricing.md')
  );
  assert.equal(record.status, 'open');
  assert.equal(record.frontMatter.verdict, 'Act');
  assert.equal(record.frontMatter.confidence, 'Moderate');
  assert.ok(record.memo, 'memo section not found');
  assert.match(record.memo, /Raise list price/);
});

test('an unknown front-matter key is preserved, not dropped', () => {
  const source = '---\nstatus: open\nsome_future_key: some value\n---\n\n## Memo\n\nBody.';
  const record = projectDecisionRecord('X', 'journal/X.md', source);
  assert.equal(
    record.frontMatter.some_future_key,
    'some value',
    'unrecognised keys must survive — they are the traceability the journal exists for'
  );
});

test('a record with no review section reports null rather than empty string', () => {
  const source = '---\nstatus: open\n---\n\n## Part 1 — memo\n\nBody.';
  const record = projectDecisionRecord('Y', 'journal/Y.md', source);
  assert.equal(record.review, null);
});

/* ---------------------------------------------------------------- calibration */

test('calibration projects tables from the real journal', () => {
  const cal = projectCalibration(read('calibration_journal.md'));
  assert.ok(cal.tables.length > 3, `expected several tables, got ${cal.tables.length}`);
  assert.ok(
    cal.tables.some((t) => /review queue/i.test(t.heading)),
    'review queue table not located'
  );
});

test('an empty ledger is projected as empty, not as missing', () => {
  const cal = projectCalibration(read('calibration_journal.md'));
  // The live journal ships with no adjustments; that is the correct state.
  assert.deepEqual(cal.activeAdjustments, []);
  const queue = cal.tables.find((t) => /review queue/i.test(t.heading));
  assert.ok(queue, 'queue table missing');
  assert.deepEqual(queue.rows, [], 'expected an empty queue on a fresh installation');
});

test('calibration tolerates junk without throwing', () => {
  for (const junk of ['', 'no tables here', '## 1. Heading\n\ntext']) {
    const cal = projectCalibration(junk);
    assert.ok(Array.isArray(cal.tables));
    assert.ok(Array.isArray(cal.activeAdjustments));
  }
});
