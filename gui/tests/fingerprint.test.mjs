/**
 * PERMANENT WRITE-FENCE TESTS
 *
 * The cockpit's central safety claim is that it never modifies the advisor's
 * files: `core/`, `journal/`, and `dossier/` belong to the engine, and deleting
 * the cockpit must leave the Executive Intelligence System byte-identical.
 *
 * `validate-bridge.mjs` asserts that claim by fingerprinting those directories
 * before and after driving the real runtime. But that harness costs real tokens
 * and needs a sandbox and an installed CLI, so it runs rarely — which would leave
 * the comparison it depends on unverified. These tests verify the comparison
 * itself, against a temporary directory, on every `npm test`.
 *
 * A fence that reports "unchanged" when a file has in fact been rewritten is
 * worse than no fence, because it is trusted.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  diffFingerprints,
  fingerprint,
  fingerprintGuarded,
  GUARDED,
} from '../scripts/lib/fingerprint.mjs';

function scratch() {
  return mkdtempSync(path.join(tmpdir(), 'eis-fence-'));
}

test('an untouched tree reports no change', () => {
  const root = scratch();
  try {
    mkdirSync(path.join(root, 'core'), { recursive: true });
    writeFileSync(path.join(root, 'core', 'business_memory.md'), '# memory\n');

    const before = fingerprintGuarded(root);
    const after = fingerprintGuarded(root);

    assert.deepEqual(diffFingerprints(before, after), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a modified file is named, not merely counted', () => {
  const root = scratch();
  try {
    mkdirSync(path.join(root, 'core'), { recursive: true });
    const file = path.join(root, 'core', 'business_memory.md');
    writeFileSync(file, 'runway_months: 9\n');

    const before = fingerprintGuarded(root);
    writeFileSync(file, 'runway_months: 4\n');
    const changed = diffFingerprints(before, fingerprintGuarded(root));

    assert.deepEqual(changed, ['modified core/business_memory.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a same-length edit is still caught', () => {
  // Size and mtime comparisons both miss this. Content hashing is the reason the
  // fence is trustworthy rather than approximately trustworthy.
  const root = scratch();
  try {
    mkdirSync(path.join(root, 'core'), { recursive: true });
    const file = path.join(root, 'core', 'memory.md');
    const original = 'runway_months: 09\n';
    const edited = 'runway_months: 04\n';
    assert.equal(original.length, edited.length, 'the edit must not change the size');

    writeFileSync(file, original);
    const before = fingerprintGuarded(root);
    writeFileSync(file, edited);
    const changed = diffFingerprints(before, fingerprintGuarded(root));

    assert.deepEqual(changed, ['modified core/memory.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('added and removed paths are reported by name', () => {
  const root = scratch();
  try {
    mkdirSync(path.join(root, 'journal'), { recursive: true });
    writeFileSync(path.join(root, 'journal', 'DEC-20260101_a.md'), 'a\n');

    const before = fingerprintGuarded(root);
    writeFileSync(path.join(root, 'journal', 'DEC-20260102_b.md'), 'b\n');
    rmSync(path.join(root, 'journal', 'DEC-20260101_a.md'));
    const changed = diffFingerprints(before, fingerprintGuarded(root)).sort();

    assert.deepEqual(changed, [
      'added journal/DEC-20260102_b.md',
      'removed journal/DEC-20260101_a.md',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a guarded directory created during a run reads as added, not as a crash', () => {
  // The state that broke the old absence check: `journal/` legitimately does not
  // exist until the advisor writes its first Decision Record.
  const root = scratch();
  try {
    const before = fingerprintGuarded(root);
    assert.equal(before.size, 0, 'a repository with no guarded files fingerprints as empty');

    mkdirSync(path.join(root, 'journal'), { recursive: true });
    writeFileSync(path.join(root, 'journal', 'DEC-20260101_a.md'), 'a\n');

    assert.deepEqual(diffFingerprints(before, fingerprintGuarded(root)), [
      'added journal/DEC-20260101_a.md',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('nested files are covered, so a fence cannot be sidestepped by a subdirectory', () => {
  const root = scratch();
  try {
    const deep = path.join(root, 'core', 'onboarding');
    mkdirSync(deep, { recursive: true });
    writeFileSync(path.join(deep, 'memory_protocol.md'), 'protocol\n');

    const before = fingerprintGuarded(root);
    writeFileSync(path.join(deep, 'memory_protocol.md'), 'protocol edited\n');

    assert.deepEqual(diffFingerprints(before, fingerprintGuarded(root)), [
      'modified core/onboarding/memory_protocol.md',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('only the guarded directories are watched', () => {
  // The cockpit writes its transcripts to the host's app-data directory, and it
  // is free to. A fence that flagged its own legitimate writes would be noise.
  const root = scratch();
  try {
    mkdirSync(path.join(root, 'gui'), { recursive: true });
    const before = fingerprintGuarded(root);
    writeFileSync(path.join(root, 'gui', 'anything.txt'), 'cockpit state\n');

    assert.deepEqual(diffFingerprints(before, fingerprintGuarded(root)), []);
    assert.deepEqual(GUARDED, ['core', 'journal', 'dossier']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fingerprint of a nonexistent directory is empty rather than throwing', () => {
  assert.equal(fingerprint(path.join(scratch(), 'nope')).size, 0);
});
