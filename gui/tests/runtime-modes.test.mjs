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
 * `core/executive_matrix.md`, spawn nothing, and spend no tokens.
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
const { projectExecutiveMatrix } = require('../dist-electron/electron/repo/projections.js');
const { ClaudeCliRuntime } = require('../dist-electron/electron/bridge/claude-cli.js');
const { ConversationStore } = require('../dist-electron/electron/conversations/index.js');

const MATRIX = readFileSync(path.join(REPO, 'core', 'executive_matrix.md'), 'utf8');

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

test('the onboarding component asks the founder nothing', () => {
  // The welcome screen explains and invites. The moment it contains an input, it
  // has become a form, and a form here is a second onboarding schema.
  const welcome = readFileSync(
    path.join(GUI, 'src', 'components', 'onboarding', 'Welcome.tsx'),
    'utf8'
  );

  for (const element of ['<input', '<textarea', '<select', '<form']) {
    assert.ok(!welcome.includes(element), `the welcome screen must contain no ${element}`);
  }
});

/* -------------------------------------------------------------------------- */
/* 5. Every executive traces to the canonical matrix                           */
/* -------------------------------------------------------------------------- */

test('every projected executive maps to a canonical persona heading', () => {
  const { lenses } = projectExecutiveMatrix(MATRIX);

  // Independently recover the headings the file actually contains, so the
  // projection is checked against the file rather than against itself.
  const headings = [...MATRIX.matchAll(/^##\s+\d+\.\s*(.+?)\s+—\s+(.+)$/gm)].map((m) => m[1].trim());

  assert.equal(lenses.length, headings.length);
  assert.ok(lenses.length > 0, 'a board with no members is not a board');

  for (const lens of lenses) {
    assert.ok(headings.includes(lens.name), `${lens.name} is not a heading in the matrix`);
    assert.equal(lens.id, lensIdFromName(lens.name), 'the id must derive from the heading');
    assert.ok(isLensId(lens.id), `${lens.id} is not a transmittable identifier`);
    assert.ok(lens.fields.Objective, `${lens.name} has no Objective to display`);
  }
});

test('structural lenses are identified from the file, not from their names', () => {
  const { lenses } = projectExecutiveMatrix(MATRIX);
  const structural = lenses.filter((lens) => lens.structural).map((lens) => lens.name);

  // Whatever the matrix marks, the projection must agree with — the assertion is
  // the agreement, not a hardcoded expectation about which lenses those are.
  for (const lens of lenses) {
    const heading = new RegExp(
      `^##\\s+${lens.ordinal}\\..*$`,
      'm'
    ).exec(MATRIX)?.[0] ?? '';
    assert.equal(
      lens.structural,
      /\(S5, structural\)/i.test(heading),
      `${lens.name} structural flag disagrees with its heading`
    );
  }

  assert.ok(structural.length > 0, 'the matrix defines challenge lenses; none were flagged');
});

test('a matrix that cannot be read yields no executives rather than invented ones', () => {
  assert.deepEqual(projectExecutiveMatrix('').lenses, []);
  assert.deepEqual(projectExecutiveMatrix('# Not a matrix\n\nsome prose').lenses, []);
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
  assert.match(command, /executive_matrix\.md/, 'the persona definition stays canonical');
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
    assert.deepEqual(created.value.mode, { kind: 'lens', lensId: 'cfo' });
    assert.equal(created.value.title, 'CFO Chat');

    await store.append(created.value.id, [
      { id: 'u1', role: 'user', text: 'Is the price defensible?', createdAt: Date.now() },
    ]);

    const loaded = await store.load(created.value.id);
    assert.equal(loaded.value.summary.title, 'CFO Chat', 'the executive name is not overwritten');
    assert.deepEqual(loaded.value.summary.mode, { kind: 'lens', lensId: 'cfo' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a council conversation still adopts the founder’s own first words', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eis-mode-test-'));
  try {
    const store = new ConversationStore(root);
    const created = await store.create('/repo');
    assert.deepEqual(created.value.mode, { kind: 'council', lensId: null });

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
    assert.deepEqual(listed[0].mode, { kind: 'council', lensId: null });
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
