/**
 * EXPERIMENTAL PIPELINE — STRUCTURAL TESTS
 *
 * The isolated pipeline's defining property is a negative one: no lens sees
 * another lens's reasoning. A leak does not degrade the experiment, it voids it
 * — and it would void it silently, because a contaminated deliberation reads
 * exactly like a clean one.
 *
 * These are static checks on the command and the harness. Whether the engine
 * *obeys* the isolation is behavioural and belongs to the benchmark run, which
 * captures per-lens positions so it can be inspected rather than trusted.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUI = path.resolve(HERE, '..');
const REPO = path.resolve(GUI, '..');

const command = readFileSync(
  path.join(REPO, '.claude', 'commands', 'deliberate-isolated.md'),
  'utf8'
);
const harness = readFileSync(path.join(GUI, 'scripts', 'benchmark-pipelines.mjs'), 'utf8');
const benchmarkDoc = readFileSync(
  path.join(REPO, 'docs', 'validation', 'BENCHMARK.md'),
  'utf8'
);

/* -------------------------------------------------------------------------- */
/* Production must be untouched                                               */
/* -------------------------------------------------------------------------- */

test('the production pipeline is not modified by the experiment', () => {
  // The whole premise is that the experiment runs alongside production. If
  // `/deliberate` changed, the comparison would have no control arm.
  const deliberate = readFileSync(
    path.join(REPO, '.claude', 'commands', 'deliberate.md'),
    'utf8'
  );
  assert.ok(
    !/isolated|subagent|Task tool/i.test(deliberate),
    '/deliberate must not reference the experimental path'
  );

  // And the experiment must be reachable only by its own command name.
  for (const file of ['council.md', 'lens.md', 'learning.md', 'begin.md', 'stress-test.md']) {
    const body = readFileSync(path.join(REPO, '.claude', 'commands', file), 'utf8');
    assert.ok(
      !/deliberate-isolated/.test(body),
      `${file} must not route into the experimental pipeline`
    );
  }
});

test('the experiment is declared experimental in its own first lines', () => {
  const head = command.slice(0, 600);
  assert.match(head, /experimental/i);
  assert.match(head, /not the default/i);
});

/* -------------------------------------------------------------------------- */
/* Isolation                                                                  */
/* -------------------------------------------------------------------------- */

test('each lens is told to read only its own definition', () => {
  assert.match(command, /Read \*\*only\*\* `core\/executives\/\[ID\]\.md`/);
  assert.match(command, /Do not read any other file in `core\/executives\/`/);
});

test('the isolation rule is stated as absolute, not as a preference', () => {
  // "Never let a lens see another lens's position" — including as background or
  // for reference, which is how this kind of rule usually erodes.
  assert.match(command, /Never let a lens see another lens's position/i);
  assert.match(command, /not as "?for reference"?/i);
  assert.match(command, /voids it/i);
});

test('lenses are forbidden from speculating about each other', () => {
  assert.match(command, /Do not mention other executives/i);
  assert.match(command, /speculate about what they would say/i);
  // Guessing at an absent lens is the same gate failure reasoning_rules §1
  // forbids in production, and isolation makes it more tempting, not less.
  assert.match(command, /hedge toward a consensus you cannot see/i);
});

test('subagents return positions, never chains of thought', () => {
  assert.match(command, /Do not narrate your reasoning/i);
  assert.match(command, /Return \*\*only your finished position\*\*/);
  // The memo is the Chief of Staff's output. A lens producing one would be a
  // second synthesis competing with the real one.
  assert.match(command, /Do not produce an Executive Action Memo/i);
});

test('shared ground is established once, not per lens', () => {
  // Eight independent readings of the same question would be a different
  // experiment: the variable under test is reasoning isolation, not diagnosis.
  assert.match(command, /\*\*S1 and S2 are run once, by you, before any lens is spawned\.\*\*/);
  assert.match(command, /identical for every lens/);
});

test('the challenge lenses still attack a finished draft', () => {
  // S5 seeing the draft is its function, not contamination. If the experiment
  // isolated the challenge lenses from the recommendation, they would have
  // nothing to attack.
  assert.match(command, /\*\*S5 runs as normal\*\*/);
  assert.match(command, /attacking a finished draft is their whole function/i);
});

/* -------------------------------------------------------------------------- */
/* Orchestration stays in the repository                                      */
/* -------------------------------------------------------------------------- */

test('orchestration lives in the repository, never in the cockpit', () => {
  /*
   * The hard constraint on this sprint. If the GUI decided which lenses to
   * spawn, the cockpit would have become a reasoning engine — the one boundary
   * the whole architecture is built on.
   */
  // The engine spawns the executions. The command file owns that instruction.
  assert.match(command, /Use the Task tool/);

  /*
   * The harness sends a command name plus the founder's sentence, and reads what
   * comes back. It decides nothing about who participates.
   *
   * `LENS_NAMES` is the one list it holds, and only to split arm A's prose into
   * per-lens chunks after the fact — parsing a transcript, not routing a
   * deliberation.
   */
  assert.match(harness, /`\/deliberate-isolated \$\{scenario\.text\}`/);
  assert.match(harness, /`\/deliberate \$\{scenario\.text\}`/);

  const code = harness.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['Activates when', 'Suppressed when', 'executive_manifest', 'core/executives']) {
    assert.ok(!code.includes(forbidden), `the harness must not know about ${forbidden}`);
  }
});

/*
 * ---------------------------------------------------------------------------
 * THIS TEST WAS INVERTED IN v1.2.3, ON EXPLICIT INSTRUCTION
 * ---------------------------------------------------------------------------
 * It used to forbid any GUI source from mentioning `deliberate-isolated` at
 * all, on the reasoning that "the cockpit must not be able to select the
 * experimental pipeline... a UI affordance would make it a shipped feature."
 * That reasoning was sound for what v1.2.3 asked before this: silent,
 * undisclosed access. It stopped being sound the moment a founder explicitly
 * asked for exactly that affordance — Executive Sessions Part G wires
 * `/deliberate-isolated` into the Session Board as an isolated-Council mode.
 *
 * Deleting the test outright would throw away the property worth keeping:
 * this experiment must never become the *default*, and never run *silently*.
 * So the assertion is restated as those two things, checked directly, rather
 * than as "the string does not appear" — which the new feature necessarily
 * violates by design and which was never really the point.
 */
test('the experiment is reachable only through an explicit, disclosed opt-in', () => {
  const roots = ['src', 'electron', 'shared'];
  const referencing = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        if (readFileSync(full, 'utf8').includes('deliberate-isolated')) referencing.push(full);
      }
    }
  };
  for (const root of roots) walk(path.join(GUI, root));

  // A named, bounded set — not scattered composition logic. Adding a fourth
  // reference should be a deliberate decision, not something that happens
  // unnoticed; this list is the thing to extend on purpose if it ever needs to.
  const expected = [
    path.join(GUI, 'shared', 'runtime-modes.ts'),
    path.join(GUI, 'shared', 'conversations.ts'),
    path.join(GUI, 'shared', 'sessions.ts'),
    path.join(GUI, 'src', 'app', 'page.tsx'),
    path.join(GUI, 'src', 'components', 'chat', 'IsolatedCouncilNotice.tsx'),
  ];
  for (const file of referencing) {
    assert.ok(
      expected.includes(file),
      `${file} references the experiment outside the sanctioned set — is this deliberate?`
    );
  }

  // Never the default. The whole application ships one hardcoded default mode,
  // and it must not carry the flag that selects an unvalidated pipeline for
  // every founder who has changed nothing.
  const runtimeModes = readFileSync(path.join(GUI, 'shared', 'runtime-modes.ts'), 'utf8');
  const defaultBlock = /export const DEFAULT_COUNCIL_MODE: CouncilMode = \{[^}]*\};/.exec(
    runtimeModes
  );
  assert.ok(defaultBlock, 'could not find the default council mode');
  assert.ok(
    !defaultBlock[0].includes('isolated'),
    'the default Council mode must never carry the isolated flag'
  );

  const conversations = readFileSync(path.join(GUI, 'shared', 'conversations.ts'), 'utf8');
  const conversationDefault = /export const COUNCIL_CONVERSATION_MODE: ConversationMode = \{[^}]*\};/.exec(
    conversations
  );
  assert.ok(conversationDefault, 'could not find the default conversation mode');
  assert.ok(
    !conversationDefault[0].includes('isolated'),
    'the default conversation mode must never carry the isolated flag'
  );

  // Never silent. Every path that can produce the isolated directive must sit
  // beside a standing, non-dismissible disclosure — the same bar
  // `LensScopeNotice` already holds single-agent chat to.
  const notice = readFileSync(
    path.join(GUI, 'src', 'components', 'chat', 'IsolatedCouncilNotice.tsx'),
    'utf8'
  );
  assert.match(notice, /experimental/i, 'the isolated mode notice must say it is experimental');
  assert.match(notice, /full/i, 'the notice must disclose the forced budget');
  // No dismiss *affordance* — a close button, an onDismiss handler, a hidden
  // state. Checked structurally rather than by banning the word "dismiss",
  // which also appears in the doc comment explaining why there isn't one.
  assert.ok(!/onDismiss|onClose|<button[^>]*[×✕xX]<\/button>/.test(notice));
  assert.ok(!/useState\(false\)/.test(notice), 'no hidden/shown state to dismiss into');
});

/* -------------------------------------------------------------------------- */
/* Mode compatibility                                                         */
/* -------------------------------------------------------------------------- */

test('Business Mode and Executive Learning both remain expressible', () => {
  // Business Memory is part of the shared context, and `/learning` omits it.
  // An experiment that only worked in one mode would not be comparable.
  assert.match(command, /Omitted entirely under `\/learning`/);
  assert.match(command, /Business Memory missing/);
  assert.match(command, /CLAUDE\.md` §13/);
});

test('the routing gate is unchanged, so the same lenses are admitted', () => {
  assert.match(command, /Layer 1 against `core\/executive_manifest\.md`/);
  assert.match(command, /It changes execution only/);
  assert.match(command, /Absent lenses stay absent/i);
  // Padding the board would make the experiment flatter itself.
  assert.match(command, /Do not pad the board/i);
});

/* -------------------------------------------------------------------------- */
/* Measurement integrity                                                      */
/* -------------------------------------------------------------------------- */

test('the harness refuses to run outside a marked sandbox', () => {
  assert.match(harness, /SANDBOX\.md/);
  assert.match(harness, /REFUSING TO RUN/);
});

test('the harness measures rather than estimates', () => {
  // The CLI reports usage, cost and duration; anything derived from them would
  // be an estimate presented as a measurement.
  assert.match(harness, /--output-format', 'json'/);
  for (const field of ['total_cost_usd', 'duration_api_ms', 'output_tokens', 'cache_read_input_tokens']) {
    assert.ok(harness.includes(field), `harness does not read ${field}`);
  }
});

test('the harness computes no quality score', () => {
  /*
   * The advisor generates both arms. A self-computed "quality" number would be
   * defendant and judge in one process, on the sprint that decides an
   * architectural question — the exact failure VALIDATION_MATRIX §1 forbids.
   */
  const code = harness.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['qualityScore', 'ratePipeline', 'betterArm', 'winner', 'recommendArm']) {
    assert.ok(!code.includes(forbidden), `harness must not compute ${forbidden}`);
  }
  // What it does emit instead: the caveats that make the numbers readable.
  assert.match(harness, /caveats:/);
});

test('the benchmark documents what cannot be self-judged', () => {
  assert.match(benchmarkDoc, /cannot be self-scored/i);
  assert.match(benchmarkDoc, /independent human/i);
  assert.match(benchmarkDoc, /VALIDATION_MATRIX\.md` §1/);
  // And it states the confounds rather than leaving them to be discovered.
  assert.match(benchmarkDoc, /Known confounds/i);
  assert.match(benchmarkDoc, /biases arm A's overlap \*\*upward\*\*/);
});

test('all eight named domains are in the suite', () => {
  for (const id of [
    'hiring',
    'fundraising',
    'pricing',
    'product-strategy',
    'founder-conflict',
    'churn',
    'technical-debt',
    'go-to-market',
  ]) {
    assert.ok(harness.includes(`${id}:`) || harness.includes(`'${id}'`), `missing scenario ${id}`);
    assert.ok(benchmarkDoc.includes(id), `${id} undocumented`);
  }
});
