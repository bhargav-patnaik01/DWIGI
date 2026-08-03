/**
 * PERMANENT PRIVACY TESTS
 *
 * ---------------------------------------------------------------------------
 * THE LEAK THIS PREVENTS, AND WHY IT NEEDS A TEST RATHER THAN A CODE REVIEW
 * ---------------------------------------------------------------------------
 * `core/business_memory.md` holds the founder's actual cash position, runway,
 * revenue, and customer facts. The sandbox generator used to copy `core/`
 * wholesale, so all of it landed in a throwaway directory that development
 * harnesses drive a real LLM against — and, via the screenshot harness, into PNG
 * files that render the Dashboard and Memory screens.
 *
 * That leak was invisible: the sandbox worked *better* with real data in it, every
 * harness passed, and the screenshots looked correct. Nothing failed. The only
 * thing that catches it is an assertion that the file is absent.
 *
 * So these tests drive the real generator against a fake repository in a temporary
 * directory and inspect what it produced. They spawn no runtime and spend no
 * tokens.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUI = path.resolve(HERE, '..');
const REPO = path.resolve(GUI, '..');
const GENERATOR = path.join(GUI, 'scripts', 'make-sandbox.mjs');

/** A distinctive string standing in for a real business fact. */
const SECRET = 'CONFIDENTIAL-RUNWAY-FIGURE-7f3a9c';

/**
 * Build a fake repository that looks enough like the real one for the generator,
 * with a Business Memory carrying a value that must never escape it.
 */
function fakeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'eis-fake-repo-'));

  mkdirSync(path.join(root, 'core', 'onboarding'), { recursive: true });
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  mkdirSync(path.join(root, '.claude', 'commands'), { recursive: true });

  writeFileSync(path.join(root, 'CLAUDE.md'), '# CLAUDE.md\n', 'utf8');
  writeFileSync(
    path.join(root, 'core', 'business_memory.md'),
    `# Business Memory\n\nrunway_months: ${SECRET}\n`,
    'utf8'
  );
  mkdirSync(path.join(root, 'core', 'executives'), { recursive: true });
  writeFileSync(
    path.join(root, 'core', 'executives', 'ceo.md'),
    '---\nid: ceo\ndisplay_name: CEO\n---\n\n**Objective:** Strategy.\n',
    'utf8'
  );
  writeFileSync(path.join(root, 'core', 'calibration_journal.md'), '# Calibration\n', 'utf8');
  writeFileSync(
    path.join(root, 'core', 'onboarding', 'memory_protocol.md'),
    '# Memory protocol\n',
    'utf8'
  );
  writeFileSync(path.join(root, 'docs', 'ARCHITECTURE.md'), '# Architecture\n', 'utf8');
  writeFileSync(path.join(root, '.claude', 'commands', 'begin.md'), '# /begin\n', 'utf8');

  return root;
}

/** Run the real generator, source and target overridden. Returns its stdout. */
function generate(source, target, extraArgs = []) {
  return execFileSync(process.execPath, [GENERATOR, ...extraArgs], {
    env: {
      ...process.env,
      EIS_SANDBOX_SOURCE: source,
      EIS_SANDBOX_TARGET: target,
    },
    encoding: 'utf8',
  });
}

/** Every file under `dir`, recursively, as paths relative to `base`. */
function walk(dir, base = dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The exclusion                                                               */
/* -------------------------------------------------------------------------- */

test('the real business memory is never copied into a sandbox', () => {
  const source = fakeRepo();
  const target = mkdtempSync(path.join(tmpdir(), 'eis-fake-sandbox-'));
  try {
    generate(source, target);

    // The engine files it is supposed to bring across did arrive, so this is a
    // test of the exclusion rather than of a generator that copied nothing.
    assert.ok(existsSync(path.join(target, 'CLAUDE.md')), 'CLAUDE.md should be copied');
    assert.ok(
      existsSync(path.join(target, 'core', 'executives', 'ceo.md')),
      'the executive definitions should be copied'
    );

    // The founder's value must appear in no file in the sandbox, whatever its name.
    for (const relative of walk(target)) {
      const text = readFileSync(path.join(target, relative), 'utf8');
      assert.ok(
        !text.includes(SECRET),
        `${relative} contains a value from the real business memory`
      );
    }
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test('a real memory left by an earlier run is removed, not left in place', () => {
  const source = fakeRepo();
  const target = mkdtempSync(path.join(tmpdir(), 'eis-fake-sandbox-'));
  try {
    // Simulate the state the old generator left behind: a real memory already in
    // the sandbox. Refreshing must clear it rather than step around it.
    mkdirSync(path.join(target, 'core'), { recursive: true });
    writeFileSync(
      path.join(target, 'core', 'business_memory.md'),
      `# Business Memory\n\nrunway_months: ${SECRET}\n`,
      'utf8'
    );

    generate(source, target);

    const seeded = path.join(target, 'core', 'business_memory.md');
    assert.ok(existsSync(seeded), 'a synthetic memory should have been seeded');
    assert.ok(
      !readFileSync(seeded, 'utf8').includes(SECRET),
      'the stale real memory survived a refresh'
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test('the seeded memory is the synthetic fixture and says so', () => {
  const source = fakeRepo();
  const target = mkdtempSync(path.join(tmpdir(), 'eis-fake-sandbox-'));
  try {
    generate(source, target);
    const seeded = readFileSync(path.join(target, 'core', 'business_memory.md'), 'utf8');

    assert.match(seeded, /SYNTHETIC FIXTURE/i, 'the fixture must announce what it is');
    assert.match(seeded, /Field \| Value/, 'it must still parse as a memory table');
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test('--empty leaves no memory at all, for first-run work', () => {
  const source = fakeRepo();
  const target = mkdtempSync(path.join(tmpdir(), 'eis-fake-sandbox-'));
  try {
    generate(source, target, ['--empty']);
    assert.ok(
      !existsSync(path.join(target, 'core', 'business_memory.md')),
      'absence of this file is what triggers onboarding'
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test('every sandbox is marked as one', () => {
  const source = fakeRepo();
  const target = mkdtempSync(path.join(tmpdir(), 'eis-fake-sandbox-'));
  try {
    generate(source, target);
    const marker = path.join(target, 'SANDBOX.md');
    assert.ok(existsSync(marker), 'the screenshot harness refuses to run without this');
    assert.match(readFileSync(marker, 'utf8'), /synthetic fixture/i);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* The fences around the harnesses                                             */
/* -------------------------------------------------------------------------- */

test('the screenshot harness refuses a workspace with no sandbox marker', () => {
  const harness = readFileSync(path.join(GUI, 'scripts', 'shot-main.cjs'), 'utf8');

  assert.match(harness, /assertSandbox\(WORKSPACE\)/, 'the check must actually be called');
  assert.match(harness, /SANDBOX\.md/, 'and it must be the marker it checks for');
  assert.match(harness, /process\.exit\(1\)/, 'and refusing must stop the run');
});

test('no tracked screenshot is committed', () => {
  // Screenshots render real projections. They are regenerated on demand and must
  // never enter the repository, whatever the workspace was pointed at.
  const ignore = readFileSync(path.join(GUI, '.gitignore'), 'utf8');
  assert.match(ignore, /^\/screenshots\/$/m, 'gui/.gitignore must exclude screenshots/');
});

test('the production business memory is not tracked by git', () => {
  // ADR-010: the repository is open source, and this file is the one thing in it
  // that is nobody else's business.
  const ignore = readFileSync(path.join(REPO, '.gitignore'), 'utf8');
  assert.match(ignore, /^core\/business_memory\.md$/m);
});
