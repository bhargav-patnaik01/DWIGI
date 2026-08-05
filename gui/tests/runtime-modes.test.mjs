/**
 * PERMANENT RUNTIME MODE AND FIRST-RUN TESTS
 *
 * Two features in this application can change what the advisor is asked, and one
 * decides which screen a founder sees on the day they first open it. All three are
 * silent when they go wrong:
 *
 *   - A single-agent chat that quietly ran normal Council routing would present a
 *     full deliberation as one executive's opinion, or the reverse. Nothing on
 *     screen would look different.
 *   - A Council turn that dropped the founder's enabled-lens configuration would
 *     engage an executive they disabled, and the answer would read as normal.
 *   - First-run detection that fired on an established repository would offer
 *     onboarding over the top of a real Business Memory.
 *
 * These run against the compiled production modules and the real
 * `core/executives/` directory, spawn nothing, and spend no tokens.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUI = path.resolve(HERE, '..');
const REPO = path.resolve(GUI, '..');

const {
  applyLensToggle,
  composeTurn,
  councilMode,
  DEFAULT_COUNCIL_MODE,
  directiveFor,
  FLOOR_MESSAGE,
  isLensId,
  lensIdFromName,
  lensMode,
  MIN_ENABLED_LENSES,
  ONBOARDING_TURN,
  parseRuntimeMode,
} = require('../dist-electron/shared/runtime-modes.js');

const { shouldShowWelcome } = require('../dist-electron/shared/onboarding.js');
const { resolveIconPath } = require('../dist-electron/shared/icon.js');
const { projectExecutive, projectManifest } = require(
  '../dist-electron/electron/repo/projections.js'
);
const { RepositoryReader } = require('../dist-electron/electron/repo/index.js');
const { ClaudeCliRuntime } = require('../dist-electron/electron/bridge/claude-cli.js');
const { ConversationStore } = require('../dist-electron/electron/conversations/index.js');

/** The real directory. It is the roster, so the tests enumerate it rather than a list. */
const EXEC_DIR = path.join(REPO, 'core', 'executives');
const EXEC_FILES = readdirSync(EXEC_DIR)
  .filter((name) => /\.md$/i.test(name))
  .sort();

/** Project the live directory exactly as `RepositoryReader.readExecutives` does. */
function projectAll() {
  return EXEC_FILES.map((name) =>
    projectExecutive(name, readFileSync(path.join(EXEC_DIR, name), 'utf8'))
  );
}

/** The live routing manifest — the only input Layer 1 gets. */
const MANIFEST_SOURCE = readFileSync(
  path.join(REPO, 'core', 'executive_manifest.md'),
  'utf8'
);

/* -------------------------------------------------------------------------- */
/* Minimal spawn harness, so a composed turn can be read off the wire           */
/* -------------------------------------------------------------------------- */

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter();
  child.stderr.setEncoding = () => {};
  child.stdin = {
    written: '',
    ended: false,
    write(chunk) {
      this.written += chunk;
    },
    end() {
      this.ended = true;
    },
  };
  child.kill = () => {};
  return child;
}

/** Send one turn through the real runtime and return exactly what stdin received. */
async function sentText(text, mode) {
  const original = childProcess.spawn;
  const spawns = [];
  childProcess.spawn = () => {
    const child = fakeChild();
    spawns.push(child);
    return child;
  };
  try {
    const runtime = new ClaudeCliRuntime(() => {});
    runtime.runtimeVersion = 'test-harness';
    await runtime.open({ workspacePath: '/workspace' });
    await runtime.send(text, mode);
    return JSON.parse(spawns[0].stdin.written.trim()).message.content[0].text;
  } finally {
    childProcess.spawn = original;
  }
}

/* -------------------------------------------------------------------------- */
/* 1 & 2. First-run detection                                                  */
/* -------------------------------------------------------------------------- */

const ESTABLISHED = {
  hasWorkspace: true,
  snapshotLoaded: true,
  memoryPresent: true,
  onboardingStarted: false,
  forced: false,
};

test('no business memory shows the welcome experience', () => {
  assert.equal(shouldShowWelcome({ ...ESTABLISHED, memoryPresent: false }), true);
});

test('an existing business memory skips the welcome experience', () => {
  assert.equal(shouldShowWelcome(ESTABLISHED), false);
});

test('the welcome screen is never shown before the repository has been read', () => {
  // The flash-of-wrong-screen case: `memoryPresent` defaults to false, so an
  // unread snapshot must not be treated as evidence of a first run.
  assert.equal(
    shouldShowWelcome({ ...ESTABLISHED, snapshotLoaded: false, memoryPresent: false }),
    false
  );
});

test('onboarding already begun does not restart from the welcome screen', () => {
  assert.equal(
    shouldShowWelcome({ ...ESTABLISHED, memoryPresent: false, onboardingStarted: true }),
    false,
    'business memory is written at the end of onboarding, not the start'
  );
});

test('with no repository chosen the welcome screen is not shown', () => {
  assert.equal(
    shouldShowWelcome({ ...ESTABLISHED, hasWorkspace: false, memoryPresent: false }),
    false
  );
});

test('the developer override forces the welcome screen without touching memory', () => {
  assert.equal(shouldShowWelcome({ ...ESTABLISHED, forced: true }), true);
});

/* -------------------------------------------------------------------------- */
/* 3 & 4. Onboarding is the engine's, not the cockpit's                        */
/* -------------------------------------------------------------------------- */

test('Get Started sends the repository’s own onboarding command, verbatim', async () => {
  assert.equal(ONBOARDING_TURN, '/begin');
  assert.equal(
    await sentText(ONBOARDING_TURN, DEFAULT_COUNCIL_MODE),
    '/begin',
    'no wrapping, no added instructions — the command file owns the behaviour'
  );
});

test('the onboarding command exists in the repository', () => {
  const command = readFileSync(path.join(REPO, '.claude', 'commands', 'begin.md'), 'utf8');
  assert.match(command, /memory_protocol\.md/, 'it must delegate to the canonical protocol');
});

test('the cockpit sends no prompt text of its own', () => {
  /*
   * The failure this guards against is a second onboarding script.
   *
   * It cannot be caught by looking for memory field keys — the Dashboard and
   * Memory screens legitimately name them to *display* projected rows, which is
   * reading, not asking. What distinguishes onboarding-in-React is prompt text
   * leaving the cockpit, so the assertion is on the send boundary itself: every
   * `send` call passes a variable, or the one repository command constant.
   *
   * A hardcoded question here would be the cockpit interviewing the founder in
   * words the engine never agreed to.
   */
  const sends = [];
  for (const file of sourceFiles(path.join(GUI, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\.send\(\s*([^),]+)/g)) {
      sends.push({ file: path.relative(GUI, file), argument: match[1].trim() });
    }
  }

  assert.ok(sends.length > 0, 'the send boundary moved; this test no longer guards it');

  for (const { file, argument } of sends) {
    assert.ok(
      !/^['"`]/.test(argument) || argument.startsWith('ONBOARDING_TURN'),
      `${file} sends the literal ${argument} — prompt text must come from the founder or a command file`
    );
  }
});

test('the onboarding flow asks the founder nothing about their business', () => {
  /*
   * ---------------------------------------------------------------------------
   * THIS TEST WAS REWRITTEN IN PHASE 2, AND THE REASON MATTERS
   * ---------------------------------------------------------------------------
   * It used to forbid `<input>` outright in `Welcome.tsx`, which was a good proxy
   * while that screen only explained and invited. `FirstRun.tsx` replaced it and
   * legitimately needs two controls: an API key field and the council checkboxes.
   *
   * Loosening the assertion to allow inputs would have thrown the invariant away.
   * So it is stated directly instead, and is now *stronger* than the proxy it
   * replaces: the flow may collect credentials and configuration, and may not ask
   * a single question about the company.
   *
   * That boundary is the whole reason there is no second onboarding schema. Every
   * business question lives in `core/onboarding/memory_protocol.md`, and a copy
   * here would drift from the one the advisor actually uses — with the founder
   * answering the copy that is wrong.
   */
  const flow = readFileSync(
    path.join(GUI, 'src', 'components', 'onboarding', 'FirstRun.tsx'),
    'utf8'
  );

  // Free-text entry is the mechanism a business question would need. Only two are
  // permitted, and both are named so a third cannot appear unnoticed.
  const inputs = [...flow.matchAll(/<input[\s\S]*?\/>/g)].map((match) => match[0]);
  for (const input of inputs) {
    const permitted =
      input.includes('type="password"') || // the API key field
      input.includes('type="checkbox"'); // council toggles
    assert.ok(
      permitted,
      `first run contains an input that is neither a credential nor a toggle:\n${input}`
    );
  }

  assert.ok(!flow.includes('<textarea'), 'first run must contain no free-text area');
  assert.ok(!flow.includes('<form'), 'first run must contain no form');

  const lower = flow.toLowerCase();

  /*
   * Two checks, because one blunt substring list gets this wrong in both
   * directions.
   *
   * A bare scan for "revenue" fails on the sentence naming the executive lenses —
   * "strategy, capital, execution, revenue, product, risk" — which is a
   * description of the board, not a question about the company. So the
   * interrogative phrases are matched whole, and the financial *field* names are
   * checked only where a question would actually have to put them: in a label or
   * a placeholder attached to an input.
   */
  const interrogatives = [
    'what stage',
    'customers do you',
    'how much runway',
    'what is your revenue',
    'monthly burn',
    'cash position',
    'business model',
    'north star',
  ];
  for (const phrase of interrogatives) {
    assert.ok(
      !lower.includes(phrase),
      `first run asks about "${phrase}" — that belongs to the engine's onboarding, not here`
    );
  }

  const prompts = [
    ...flow.matchAll(/(?:placeholder|aria-label|label)=\{?["'`]([^"'`]+)["'`]/g),
  ].map((match) => match[1].toLowerCase());
  const financialFields = ['runway', 'revenue', 'burn', 'valuation', 'cash'];
  for (const prompt of prompts) {
    for (const field of financialFields) {
      assert.ok(
        !prompt.includes(field),
        `first run prompts for "${field}" — the four financial fields are never asked for here`
      );
    }
  }
});

/* -------------------------------------------------------------------------- */
/* 5. Executives are discovered from the directory, never from a list          */
/* -------------------------------------------------------------------------- */

test('every file in core/executives projects into a usable lens', () => {
  const lenses = projectAll();

  assert.ok(lenses.length > 0, 'a board with no members is not a board');
  assert.equal(
    lenses.filter(Boolean).length,
    EXEC_FILES.length,
    'every .md file in the directory must yield a lens'
  );

  for (const lens of lenses) {
    assert.ok(isLensId(lens.id), `${lens.id} is not a transmittable identifier`);
    assert.ok(lens.name.length > 0, `${lens.file} declares no display_name`);
    assert.ok(lens.role.length > 0, `${lens.file} declares no role`);
    assert.ok(lens.fields.Objective, `${lens.name} has no Objective to display`);
    assert.equal(typeof lens.structural, 'boolean');
  }
});

test('a persona file carries reasoning only — never participation', () => {
  // ADR-012's one-source-of-truth rule, asserted against the live files. A
  // persona that reacquired `Suppressed when` would give the gate two answers.
  for (const name of EXEC_FILES) {
    const raw = readFileSync(path.join(EXEC_DIR, name), 'utf8');
    for (const field of ['Activates when', 'Suppressed when', 'Escalates when']) {
      assert.ok(
        !new RegExp(`\\*\\*${field}:\\*\\*`).test(raw),
        `${name} declares "${field}" — that belongs to the manifest alone`
      );
    }
    assert.ok(
      !/^structural:/m.test(raw),
      `${name} declares structural — group membership is the manifest's`
    );
  }
});

test('the projection alone cannot decide participation', () => {
  // Unjoined, every lens is constructive with no routing. That is deliberate:
  // it forces the reader to consult the manifest rather than letting a persona
  // file quietly imply a stage.
  for (const lens of projectAll()) {
    assert.equal(lens.routing, null, `${lens.id} acquired routing without the manifest`);
    assert.equal(lens.structural, false, `${lens.id} claimed a stage without the manifest`);
  }
});

test('the declared id matches the filename and the naming convention', () => {
  // Three independent spellings of one identity: the filename, the declared
  // `id`, and what the convention would produce from the display name. A typo in
  // front matter is invisible until a `/lens` argument fails, so it is caught here.
  for (const lens of projectAll()) {
    assert.equal(lens.id, path.basename(lens.file, '.md'), `${lens.file}: id vs filename`);
    assert.equal(
      lens.id,
      lensIdFromName(lens.name),
      `${lens.file}: declared id disagrees with the convention for "${lens.name}"`
    );
  }
});

test('no two executives claim the same identifier', () => {
  const ids = projectAll().map((lens) => lens.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate lens id among ${ids.join(', ')}`);
});

test('the manifest supplies participation for every live lens', () => {
  const { routing, structural, malformed } = projectManifest(MANIFEST_SOURCE);

  assert.deepEqual(malformed, [], 'the live manifest must have no malformed entries');
  assert.ok(structural.size > 0, 'the manifest defines challenge lenses; none were grouped');

  const ids = projectAll().map((lens) => lens.id);
  for (const id of ids) {
    const entry = routing.get(id);
    assert.ok(entry, `${id} has no manifest entry — the gate could not route it`);
    assert.ok(entry.activates.length > 0, `${id}: empty Activates when`);
    assert.ok(entry.suppressed.length > 0, `${id}: empty Suppressed when`);
    assert.ok(entry.escalates.length > 0, `${id}: empty Escalates when`);
  }

  // No entry may route a lens that does not exist.
  for (const id of routing.keys()) {
    assert.ok(ids.includes(id), `manifest routes "${id}" with no definition file behind it`);
  }

  assert.ok(structural.size < ids.length, 'not every lens can be a challenge lens');
});

test('discovery order is deterministic and independent of filesystem order', () => {
  const order = (files) =>
    files
      .map((name) => projectExecutive(name, readFileSync(path.join(EXEC_DIR, name), 'utf8')))
      .sort((a, b) => a.ordinal - b.ordinal || a.file.localeCompare(b.file))
      .map((lens) => lens.id);

  // `readExecutives` sorts on `ordinal` with the filename as a stable tiebreak,
  // so the same set of files presents identically whatever order they arrive in
  // — on any filesystem, in any locale. Note this is deliberately NOT filename
  // order: `coo` precedes `sales-gtm` by declared ordinal and follows it
  // alphabetically, which is exactly why the sort has to exist.
  const canonical = order(EXEC_FILES);
  assert.deepEqual(order([...EXEC_FILES].reverse()), canonical, 'reversed input reordered the board');
  assert.deepEqual(
    order([...EXEC_FILES].sort((a, b) => b.localeCompare(a))),
    canonical,
    'descending input reordered the board'
  );

  // And the result really is ascending by declared ordinal, rather than merely
  // stable at whatever the sort happened to produce.
  const ordinals = EXEC_FILES.map(
    (name) => projectExecutive(name, readFileSync(path.join(EXEC_DIR, name), 'utf8'))
  )
    .sort((a, b) => a.ordinal - b.ordinal || a.file.localeCompare(b.file))
    .map((lens) => lens.ordinal);

  assert.deepEqual(ordinals, [...ordinals].sort((a, b) => a - b));
  assert.equal(new Set(ordinals).size, ordinals.length, 'two lenses declare the same ordinal');
});

test('a file that declares no identity is refused rather than guessed at', () => {
  // Each of these is a way a hand-edited executive file could go wrong. All must
  // return null: displaying a lens under an identity the cockpit invented is the
  // failure this projection exists to prevent.
  const refused = [
    ['empty', ''],
    ['no front matter', '# CEO\n\n**Objective:** Strategy.'],
    ['no id', '---\ndisplay_name: CEO\n---\n\n**Objective:** Strategy.'],
    ['no display_name', '---\nid: ceo\n---\n\n**Objective:** Strategy.'],
    ['untransmittable id', '---\nid: Not An Id!\ndisplay_name: X\n---\n\n**Objective:** y.'],
    ['prose only', '# Not an executive\n\nsome prose'],
  ];

  for (const [label, source] of refused) {
    assert.equal(projectExecutive('x.md', source), null, `${label} should not yield a lens`);
  }
});

test('a lens with no declared ordinal sorts last rather than displacing the board', () => {
  const lens = projectExecutive(
    'newcomer.md',
    '---\nid: newcomer\ndisplay_name: Newcomer\nrole: Undeclared\n---\n\n**Objective:** x.'
  );
  assert.ok(lens, 'a lens missing only its ordinal is still a valid lens');
  assert.equal(lens.structural, false, 'absent structural must default to constructive');

  const board = [...projectAll(), lens].sort(
    (a, b) => a.ordinal - b.ordinal || a.file.localeCompare(b.file)
  );
  assert.equal(board[board.length - 1].id, 'newcomer', 'an undeclared ordinal must sort last');
});

test('adding an executive file adds an executive, with no code change', () => {
  // The claim the whole sprint rests on. A lens the codebase has never heard of
  // must project, carry a transmittable id, and be addressable by `/lens`.
  const lens = projectExecutive(
    'chief-scientist.md',
    [
      '---',
      'id: chief-scientist',
      'display_name: Chief Scientist',
      'role: Research & Evidence',
      'structural: false',
      'ordinal: 9',
      'version: 1',
      '---',
      '',
      '**Objective:** Maximise what the company learns per unit of spend.',
      '',
      '**Owns:** Experiment design, evidence standards.',
    ].join('\n')
  );

  assert.ok(lens, 'a new executive file must project without a code change');
  assert.equal(lens.id, 'chief-scientist');
  assert.equal(lens.name, 'Chief Scientist');
  assert.equal(lens.ordinal, 9);
  assert.equal(lens.structural, false);
  assert.equal(lens.fields.Objective, 'Maximise what the company learns per unit of spend.');
  assert.equal(composeTurn('Is this study powered?', lensMode(lens.id)),
    '/lens chief-scientist\n\nIs this study powered?');
});

/* -------------------------------------------------------------------------- */
/* 5b. Directory discovery at the reader, including partial failure            */
/* -------------------------------------------------------------------------- */

/**
 * A throwaway repository with `core/executives/` and, optionally, a manifest.
 *
 * `manifest` omitted means no manifest file at all, which is one of the two
 * degradation paths worth testing.
 */
function fakeBoard(files, manifest) {
  const root = mkdtempSync(path.join(tmpdir(), 'eis-board-'));
  const dir = path.join(root, 'core', 'executives');
  require('node:fs').mkdirSync(dir, { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), source, 'utf8');
  }
  if (manifest !== undefined) {
    writeFileSync(path.join(root, 'core', 'executive_manifest.md'), manifest, 'utf8');
  }
  return root;
}

const lensFile = (id, name, ordinal) =>
  `---\nid: ${id}\ndisplay_name: ${name}\nrole: Role\nordinal: ${ordinal}\nversion: 1\n---\n\n**Objective:** Something.\n`;

/** A manifest entry with all three criteria present. */
const entry = (id, extra = '') =>
  `### ${id}\n\n**Activates when:** Always.${extra}\n\n**Suppressed when:** Never.\n\n**Escalates when:** Rarely.\n`;

/** Assemble a manifest from constructive and challenge id lists. */
const manifestOf = (constructive, challenge = []) =>
  [
    '# Executive Routing Manifest',
    '',
    '## 1. Constructive lenses',
    '',
    ...constructive.map((id) => entry(id)),
    '## 2. Challenge lenses',
    '',
    ...challenge.map((id) => entry(id)),
  ].join('\n');

async function readBoard(root) {
  const reader = new RepositoryReader(() => {});
  await reader.setWorkspace(root);
  const projection = await reader.readExecutives();
  reader.stopWatching();
  return projection;
}

test('the reader discovers the live board and joins the live manifest', async () => {
  const projection = await readBoard(REPO);
  assert.ok(projection.ok, `live board should project: ${projection.reason ?? ''}`);
  assert.equal(projection.value.lenses.length, EXEC_FILES.length);
  assert.deepEqual(projection.value.skipped, [], 'no live executive should be skipped');
  assert.equal(projection.value.manifestError, null, 'the live manifest must join cleanly');
  assert.deepEqual(projection.value.orphanedEntries, []);

  for (const lens of projection.value.lenses) {
    assert.ok(lens.routing, `${lens.id} was not joined to a manifest entry`);
  }
  assert.ok(
    projection.value.lenses.some((lens) => lens.structural),
    'the join must recover the challenge lenses'
  );
});

test("Agent Management can still see CFO's standing floor after the move", async () => {
  // The concrete regression ADR-012 could have caused. The floor text moved from
  // the persona file to the manifest; the component reads `routing.suppressed`.
  // If the join broke, the caution would silently stop rendering and Agent
  // Management would imply CFO is freely disableable.
  const projection = await readBoard(REPO);
  assert.ok(projection.ok);
  const cfo = projection.value.lenses.find((lens) => lens.id === 'cfo');
  assert.ok(cfo, 'cfo missing from the live board');
  assert.match(
    cfo.routing.suppressed,
    /never suppressed/i,
    "the solvency floor text must survive the move to the manifest"
  );
});

test('a lens with no manifest entry is reported, not quietly routed', async () => {
  const root = fakeBoard(
    { 'ceo.md': lensFile('ceo', 'CEO', 1), 'cfo.md': lensFile('cfo', 'CFO', 2) },
    manifestOf(['ceo'])
  );
  try {
    const projection = await readBoard(root);
    assert.ok(projection.ok, 'the board still lists both executives');
    assert.equal(projection.value.lenses.length, 2);
    assert.match(projection.value.manifestError, /no entry for: cfo/);
    assert.equal(
      projection.value.lenses.find((l) => l.id === 'cfo').routing,
      null,
      'an unrouted lens must carry no invented criteria'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a manifest entry with no definition file is reported as orphaned', async () => {
  const root = fakeBoard({ 'ceo.md': lensFile('ceo', 'CEO', 1) }, manifestOf(['ceo', 'ghost']));
  try {
    const projection = await readBoard(root);
    assert.ok(projection.ok);
    assert.deepEqual(projection.value.orphanedEntries, ['ghost']);
    assert.equal(
      projection.value.lenses.length,
      1,
      'a manifest entry must never conjure an executive'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an absent manifest leaves the board intact and says participation is unknown', async () => {
  const root = fakeBoard({ 'ceo.md': lensFile('ceo', 'CEO', 1) });
  try {
    const projection = await readBoard(root);
    assert.ok(projection.ok, 'executives still project without a manifest');
    assert.equal(projection.value.lenses.length, 1);
    assert.ok(projection.value.manifestError, 'the absence must be reported');
    assert.equal(projection.value.lenses[0].routing, null);
    assert.equal(
      projection.value.lenses[0].structural,
      false,
      'no manifest means no claim about stage'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a partial manifest entry is refused rather than half-applied', async () => {
  const root = fakeBoard(
    { 'ceo.md': lensFile('ceo', 'CEO', 1) },
    '# M\n\n## 1. Constructive lenses\n\n### ceo\n\n**Activates when:** Always.\n'
  );
  try {
    const projection = await readBoard(root);
    assert.ok(projection.ok);
    assert.match(projection.value.manifestError, /Suppressed when/);
    assert.match(projection.value.manifestError, /Escalates when/);
    assert.equal(projection.value.lenses[0].routing, null, 'partial criteria must not apply');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an entry outside any group is refused rather than assumed constructive', async () => {
  // Guessing here would put a challenge lens into Agent Management as a toggle
  // the engine ignores — the deceptive switch that screen refuses to show.
  const root = fakeBoard(
    { 'ceo.md': lensFile('ceo', 'CEO', 1) },
    `# M\n\n${entry('ceo')}`
  );
  try {
    const projection = await readBoard(root);
    assert.ok(projection.ok);
    assert.match(projection.value.manifestError, /not under a constructive or challenge heading/);
    assert.equal(projection.value.lenses[0].routing, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('challenge grouping comes from the manifest section, not from any field', async () => {
  const root = fakeBoard(
    {
      'ceo.md': lensFile('ceo', 'CEO', 1),
      'risk-officer.md': lensFile('risk-officer', 'Risk Officer', 2),
    },
    manifestOf(['ceo'], ['risk-officer'])
  );
  try {
    const projection = await readBoard(root);
    assert.ok(projection.ok);
    assert.equal(projection.value.manifestError, null);
    const byId = Object.fromEntries(projection.value.lenses.map((l) => [l.id, l]));
    assert.equal(byId.ceo.structural, false);
    assert.equal(byId['risk-officer'].structural, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('manifest projection is deterministic across repeated reads', async () => {
  const first = await readBoard(REPO);
  const second = await readBoard(REPO);
  assert.deepEqual(
    first.value.lenses.map((l) => [l.id, l.structural, l.routing.suppressed]),
    second.value.lenses.map((l) => [l.id, l.structural, l.routing.suppressed])
  );
});

test('one unreadable executive costs one executive, not the whole board', async () => {
  // Validation item 4. The remaining lenses must still project, and the casualty
  // must be named — a board silently one member short is the failure here, because
  // nothing on screen would reveal it.
  const root = fakeBoard({
    'ceo.md': lensFile('ceo', 'CEO', 1),
    'cfo.md': lensFile('cfo', 'CFO', 2),
    'broken.md': '# no front matter, no identity\n',
  });
  try {
    const projection = await readBoard(root);
    assert.ok(projection.ok, 'a single bad file must not fail the projection');
    assert.deepEqual(projection.value.lenses.map((l) => l.id), ['ceo', 'cfo']);
    assert.deepEqual(projection.value.skipped, ['broken.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing directory reports unavailable rather than an empty board', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eis-board-none-'));
  try {
    const projection = await readBoard(root);
    assert.equal(projection.ok, false);
    assert.match(projection.reason, /core\/executives/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a directory of only unreadable files fails rather than showing nobody', async () => {
  const root = fakeBoard({ 'a.md': 'prose', 'b.md': '---\nid: !!\n---\n' });
  try {
    const projection = await readBoard(root);
    assert.equal(projection.ok, false, 'an empty board must be Unavailable, not an empty list');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('two files claiming one id: the second is refused and named', async () => {
  // Whichever wins would otherwise depend on directory iteration order, and the
  // loser becomes unreachable by `/lens` with nothing reporting why.
  const root = fakeBoard({
    'alpha.md': lensFile('ceo', 'CEO', 1),
    'zulu.md': lensFile('ceo', 'CEO Copy', 2),
  });
  try {
    const projection = await readBoard(root);
    assert.ok(projection.ok);
    assert.equal(projection.value.lenses.length, 1, 'one id, one lens');
    assert.equal(projection.value.lenses[0].file, 'alpha.md', 'filename order decides, not luck');
    assert.equal(projection.value.skipped.length, 1);
    assert.match(projection.value.skipped[0], /zulu\.md/);
    assert.match(projection.value.skipped[0], /duplicate/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('non-markdown files in the directory are not executives', async () => {
  const root = fakeBoard({ 'ceo.md': lensFile('ceo', 'CEO', 1), 'notes.txt': 'scratch' });
  try {
    const projection = await readBoard(root);
    assert.ok(projection.ok);
    assert.deepEqual(projection.value.lenses.map((l) => l.id), ['ceo']);
    assert.deepEqual(projection.value.skipped, [], 'a .txt file is not a failed executive');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* 6 & 9. Single-agent isolation                                               */
/* -------------------------------------------------------------------------- */

test('single-agent chat transmits exactly one executive and no council directive', async () => {
  const wire = await sentText('Is this price defensible?', lensMode('cfo'));

  assert.equal(wire, '/lens cfo\n\nIs this price defensible?');
  assert.ok(!wire.includes('/council'), 'council routing must not ride along');
  assert.equal(
    (wire.match(/\/lens/g) ?? []).length,
    1,
    'exactly one lens directive, naming exactly one executive'
  );
});

test('the single-lens command declines to convene any other executive', () => {
  const command = readFileSync(path.join(REPO, '.claude', 'commands', 'lens.md'), 'utf8');

  // The behaviour that makes this isolation rather than costume: no other
  // constructive lens at S4, and no challenge pass at S5.
  assert.match(command, /S4 convenes the named lens only/i);
  assert.match(command, /S5 does not run/i);
  assert.match(command, /Never speak for an absent lens/i);
  assert.match(command, /core\/executives\//, 'the persona definition stays canonical');
});

test('an executive disabled for Council is still reachable directly', () => {
  // The founder disabled Sales/GTM for deliberation, then opened a Sales chat.
  const available = ['ceo', 'cfo', 'coo', 'sales-gtm', 'product', 'coach'];
  const enabled = ['ceo', 'cfo', 'coo', 'product'];

  const council = councilMode(enabled, available);
  assert.ok(!(council.enabledLenses ?? []).includes('sales-gtm'));

  // The lens mode is built from the founder's explicit choice of executive and
  // consults no configuration at all, which is what keeps the two independent.
  assert.equal(directiveFor(lensMode('sales-gtm')), '/lens sales-gtm');
});

test('a lens conversation’s mode does not depend on the enabled set', () => {
  assert.deepEqual(lensMode('coach'), { kind: 'lens', lensId: 'coach' });
  assert.equal(directiveFor(lensMode('coach')), '/lens coach');
});

/* -------------------------------------------------------------------------- */
/* 7. Council cannot engage a disabled executive                               */
/* -------------------------------------------------------------------------- */

const AVAILABLE = ['ceo', 'cfo', 'coo', 'sales-gtm', 'product', 'coach'];

test('a narrowed council transmits only the enabled executives', async () => {
  const mode = councilMode(['cfo', 'coo', 'ceo'], AVAILABLE);
  const wire = await sentText('Should we hire a second engineer?', mode);

  assert.match(wire, /^\/council ceo,cfo,coo\n\n/, 'canonical order, not click order');
  for (const disabled of ['sales-gtm', 'product', 'coach']) {
    assert.ok(!wire.includes(disabled), `${disabled} is disabled and must not be transmitted`);
  }
  assert.ok(wire.endsWith('Should we hire a second engineer?'), 'the question survives verbatim');
});

test('an untouched configuration sends the founder’s bytes and nothing else', async () => {
  const mode = councilMode(AVAILABLE, AVAILABLE);
  assert.equal(directiveFor(mode), null, 'a full pool needs no directive');

  const typed = 'What is our runway?';
  assert.equal(await sentText(typed, mode), typed, 'byte-identical to a terminal');
  assert.equal(await sentText(typed, DEFAULT_COUNCIL_MODE), typed);
  assert.equal(composeTurn(typed, DEFAULT_COUNCIL_MODE), typed);
});

test('the council command states the exclusions it cannot honour', () => {
  const command = readFileSync(path.join(REPO, '.claude', 'commands', 'council.md'), 'utf8');

  // A configuration screen that promised to disable a lens the architecture
  // protects would be lying. The command is where the carve-outs are stated.
  assert.match(command, /Risk Officer and Devil's Advocate/i);
  assert.match(command, /solvency floor/i);
  assert.match(command, /Intervention overlay/i);
  assert.match(command, /the safe failure is the full board/i);
});

test('a malformed mode widens to the full council rather than narrowing it', () => {
  for (const hostile of [
    null,
    undefined,
    'council',
    { kind: 'council', enabledLenses: 'cfo' },
    { kind: 'council', enabledLenses: ['../../etc/passwd'] },
    { kind: 'council', enabledLenses: ['cfo; rm -rf /'] },
    { kind: 'council', enabledLenses: [] },
    { kind: 'lens' },
    { kind: 'lens', lensId: '' },
    { kind: 'lens', lensId: 'Not A Lens' },
    { kind: 'nonsense' },
  ]) {
    const parsed = parseRuntimeMode(hostile);
    assert.deepEqual(
      parsed,
      DEFAULT_COUNCIL_MODE,
      `${JSON.stringify(hostile)} must not be able to restrict a deliberation`
    );
    assert.equal(directiveFor(parsed), null);
  }
});

test('a well-formed mode survives the boundary unchanged', () => {
  assert.deepEqual(parseRuntimeMode({ kind: 'lens', lensId: 'risk-officer' }), {
    kind: 'lens',
    lensId: 'risk-officer',
  });
  assert.deepEqual(parseRuntimeMode({ kind: 'council', enabledLenses: ['ceo', 'cfo'] }), {
    kind: 'council',
    enabledLenses: ['ceo', 'cfo'],
  });
});

/* -------------------------------------------------------------------------- */
/* 8. The deliberation floor                                                   */
/* -------------------------------------------------------------------------- */

test('agent management cannot go below two enabled executives', () => {
  assert.equal(MIN_ENABLED_LENSES, 2);

  const two = ['ceo', 'cfo'];
  const refused = applyLensToggle(two, 'cfo', false, AVAILABLE);

  assert.equal(refused.ok, false);
  assert.equal(refused.reason, FLOOR_MESSAGE);
  assert.match(refused.reason, /At least two executives are required for Council deliberation/);
});

test('the floor blocks every route down to one, not just the last click', () => {
  let enabled = [...AVAILABLE];
  for (const id of AVAILABLE) {
    const outcome = applyLensToggle(enabled, id, false, AVAILABLE);
    if (outcome.ok) enabled = outcome.enabled;
  }
  assert.equal(enabled.length, MIN_ENABLED_LENSES, 'disabling everything still leaves two');
});

test('re-enabling is never refused', () => {
  const outcome = applyLensToggle(['ceo', 'cfo'], 'coach', true, AVAILABLE);
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.enabled, ['ceo', 'cfo', 'coach'], 'canonical order is preserved');
});

test('a lens the matrix no longer defines is dropped from the configuration', () => {
  // A stale preference must not be able to name an executive into existence.
  const outcome = applyLensToggle(['ceo', 'cfo', 'retired-lens'], 'coach', true, AVAILABLE);
  assert.equal(outcome.ok, true);
  assert.ok(!outcome.enabled.includes('retired-lens'));
});

/* -------------------------------------------------------------------------- */
/* 10 & 11. Configuration stays out of the repository                          */
/* -------------------------------------------------------------------------- */

test('interface preferences are persisted in the host’s own storage', () => {
  const source = readFileSync(path.join(GUI, 'src', 'lib', 'store', 'ui.ts'), 'utf8');

  assert.match(source, /name:\s*'eis-cockpit-ui'/, 'a named store in host storage');
  for (const key of ['noticeDismissed', 'enabledLenses', 'devForceFirstRun', 'onboardingStarted']) {
    assert.ok(
      new RegExp(`${key}:\\s*state\\.${key}`).test(source),
      `${key} must survive a restart, or the founder re-answers it every launch`
    );
  }
});

test('no runtime configuration can reach core/ or journal/', () => {
  /*
   * Structural, not aspirational.
   *
   * The read layer imports no mutating filesystem call, and the one write path —
   * the conversation store — accepts no path from any caller. Preferences never
   * cross the IPC boundary at all. So there is no code by which a toggle, a
   * dismissal, or a lens id could be written into the repository.
   */
  const readLayer = readFileSync(path.join(GUI, 'electron', 'repo', 'index.ts'), 'utf8');

  // Import statements only. The file's own comments name the mutators it refuses
  // to import, and scanning raw text would fail on the documentation of the very
  // property being asserted.
  const imports = [...readLayer.matchAll(/^import[\s\S]*?from\s+'[^']+';$/gm)].join('\n');
  assert.ok(imports.includes('readFile'), 'the reader should still import its read calls');

  for (const mutator of ['writeFile', 'appendFile', 'mkdir', 'rename', 'unlink', 'rmdir']) {
    assert.ok(
      !imports.includes(mutator),
      `the repository reader must not import ${mutator}`
    );
  }

  const preload = readFileSync(path.join(GUI, 'electron', 'preload.ts'), 'utf8');
  assert.ok(!/repo:\s*{[^}]*write/s.test(preload), 'the repo bridge exposes no write method');

  // Preferences are renderer-local. If they ever gained an IPC channel, that
  // channel would be the thing to audit — so assert that they have not.
  const main = readFileSync(path.join(GUI, 'electron', 'main.ts'), 'utf8');
  for (const key of ['noticeDismissed', 'enabledLenses', 'onboardingStarted']) {
    assert.ok(!main.includes(key), `${key} must not cross the IPC boundary`);
  }
});

test('the enabled-lens configuration is transmitted, never written', () => {
  // The only way the configuration reaches the engine is as command text on a
  // turn the founder sent. `composeTurn` is the entire mechanism.
  const mode = councilMode(['ceo', 'cfo'], AVAILABLE);
  assert.equal(composeTurn('go', mode), '/council ceo,cfo\n\ngo');
  assert.equal(composeTurn('', mode), '/council ceo,cfo', 'no trailing whitespace as content');
});

/* -------------------------------------------------------------------------- */
/* Chat type is stored, immutable, and backward compatible                     */
/* -------------------------------------------------------------------------- */

test('a single-agent conversation stores its executive and keeps its own title', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eis-mode-test-'));
  try {
    const store = new ConversationStore(root);
    const created = await store.create('/repo', {
      mode: { kind: 'lens', lensId: 'cfo' },
      title: 'CFO Chat',
    });

    assert.equal(created.ok, true);
    assert.deepEqual(created.value.mode, { kind: 'lens', lensId: 'cfo', memory: 'business' });
    assert.equal(created.value.title, 'CFO Chat');

    await store.append(created.value.id, [
      { id: 'u1', role: 'user', text: 'Is the price defensible?', createdAt: Date.now() },
    ]);

    const loaded = await store.load(created.value.id);
    assert.equal(loaded.value.summary.title, 'CFO Chat', 'the executive name is not overwritten');
    assert.deepEqual(loaded.value.summary.mode, { kind: 'lens', lensId: 'cfo', memory: 'business' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a council conversation still adopts the founder’s own first words', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eis-mode-test-'));
  try {
    const store = new ConversationStore(root);
    const created = await store.create('/repo');
    assert.deepEqual(created.value.mode, { kind: 'council', lensId: null, memory: 'business' });

    await store.append(created.value.id, [
      { id: 'u1', role: 'user', text: 'Should we raise prices?', createdAt: Date.now() },
    ]);

    const loaded = await store.load(created.value.id);
    assert.equal(loaded.value.summary.title, 'Should we raise prices?');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('conversations stored before chat types existed still load, as Council', async () => {
  // Adding a field must not cost anyone their history. An index entry with no
  // `mode` is a record from an earlier build, and it was a Council conversation.
  const root = mkdtempSync(path.join(tmpdir(), 'eis-mode-test-'));
  try {
    const id = '22222222-2222-4222-8222-222222222222';
    writeFileSync(
      path.join(root, 'index.json'),
      JSON.stringify({
        v: 1,
        conversations: [
          {
            id,
            sessionId: null,
            workspacePath: '/repo',
            title: 'An older conversation',
            createdAt: 1,
            updatedAt: 2,
            messageCount: 0,
          },
        ],
      }),
      'utf8'
    );

    const store = new ConversationStore(root);
    const listed = await store.list('/repo');

    assert.equal(listed.length, 1, 'a record without a mode must not be discarded');
    // `memory: 'business'` is not a fallback here — a record written before
    // Executive Learning existed was grounded in the founder's company, because
    // that was the only thing the system did.
    assert.deepEqual(listed[0].mode, {
      kind: 'council',
      lensId: null,
      memory: 'business',
    });
    assert.equal(listed[0].title, 'An older conversation');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* 12. A missing icon is an ordinary state                                     */
/* -------------------------------------------------------------------------- */

test('a missing icon.png resolves to no icon rather than throwing', () => {
  assert.equal(resolveIconPath(['/nope/icon.png', '/also/nope.png'], () => false), undefined);
  assert.equal(resolveIconPath([], () => true), undefined);
});

test('the founder’s icon.png wins over any derived copy', () => {
  const resolved = resolveIconPath(
    ['/app/icon.png', '/app/build/icon.png'],
    () => true
  );
  assert.equal(resolved, '/app/icon.png');
});

test('an unreadable icon candidate is skipped, not fatal', () => {
  const resolved = resolveIconPath(['/denied/icon.png', '/ok/icon.png'], (p) => {
    if (p.startsWith('/denied')) throw new Error('EACCES');
    return true;
  });
  assert.equal(resolved, '/ok/icon.png');
});

/* -------------------------------------------------------------------------- */
/* Release hygiene                                                             */
/* -------------------------------------------------------------------------- */

test('no developer-specific path is baked into the interface', () => {
  // A public release must not ship someone's drive letter, and least of all in a
  // string a founder could see.
  for (const file of [...sourceFiles(path.join(GUI, 'src')), ...sourceFiles(path.join(GUI, 'shared'))]) {
    const text = readFileSync(file, 'utf8');
    assert.ok(
      !/[A-Za-z]:[\\/](Work|Users)[\\/]/.test(text),
      `${path.relative(GUI, file)} contains an absolute developer path`
    );
  }
});

/** Every `.ts`/`.tsx` file under `dir`, recursively. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
