/**
 * BUSINESS MEMORY MODES — REGRESSION TESTS
 *
 * Two properties are worth more than the rest of this file combined, and both
 * are failures that would be invisible until they had already misled someone:
 *
 *   1. A stored conversation's scope never changes. If the global default could
 *      reach an existing conversation, flipping a toggle would silently rewrite
 *      what every thread in the founder's history is grounded in.
 *   2. The cockpit composes no reasoning. It emits a command name and an
 *      argument order; every rule about what Learning Mode *means* lives in
 *      `.claude/commands/learning.md`. The moment a prompt fragment appears in
 *      this application, there are two reasoning engines.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const {
  DEFAULT_MEMORY_SCOPE,
  directiveFor,
  composeTurn,
  councilMode,
  lensMode,
  memoryScopeOf,
  parseRuntimeMode,
  readMemoryScope,
  withMemoryScope,
} = require('../dist-electron/shared/runtime-modes.js');

const { readConversationMode, COUNCIL_CONVERSATION_MODE } = require('../dist-electron/shared/conversations.js');
const { shouldShowWelcome } = require('../dist-electron/shared/onboarding.js');
const { ConversationStore } = require('../dist-electron/electron/conversations/index.js');

const POOL = ['ceo', 'cfo', 'coo', 'sales-gtm', 'product', 'coach'];

/* -------------------------------------------------------------------------- */
/* 1. The directive: every combination, and the default that sends nothing      */
/* -------------------------------------------------------------------------- */

test('Business Mode is the default and composes no directive at all', () => {
  assert.equal(DEFAULT_MEMORY_SCOPE, 'business');

  const plain = councilMode(POOL, POOL);
  assert.equal(memoryScopeOf(plain), 'business');
  assert.equal(directiveFor(plain), null, 'an unconfigured cockpit must send nothing');

  const typed = 'Should we raise prices?';
  assert.equal(
    composeTurn(typed, withMemoryScope(plain, 'business')),
    typed,
    'Business Mode must stay byte-identical to what the founder typed'
  );
});

test('Learning Mode composes the repository command and nothing else', () => {
  const mode = withMemoryScope(councilMode(POOL, POOL), 'learning');
  assert.equal(directiveFor(mode), '/learning');

  const composed = composeTurn('Teach me product strategy.', mode);
  assert.equal(composed, '/learning\n\nTeach me product strategy.');
});

test('scope and routing compose without either losing information', () => {
  const cases = [
    [withMemoryScope(councilMode(POOL, POOL), 'business'), null],
    [withMemoryScope(councilMode(['ceo', 'cfo'], POOL), 'business'), '/council ceo,cfo'],
    [withMemoryScope(lensMode('cfo'), 'business'), '/lens cfo'],
    [withMemoryScope(councilMode(POOL, POOL), 'learning'), '/learning'],
    [withMemoryScope(councilMode(['ceo', 'cfo'], POOL), 'learning'), '/learning /council ceo,cfo'],
    [withMemoryScope(lensMode('cfo'), 'learning'), '/learning /lens cfo'],
  ];

  for (const [mode, expected] of cases) {
    assert.equal(directiveFor(mode), expected, JSON.stringify(mode));
  }
});

/**
 * THE INVARIANT THAT KEEPS THE COCKPIT A COCKPIT.
 *
 * Whatever the mode, the composed turn is a command name plus the founder's own
 * bytes. No instruction, no persona text, no description of what a mode means.
 */
test('no composed turn contains anything but a command name and the founder’s words', () => {
  const typed = 'What does a CFO look at in a board pack?';

  for (const scope of ['business', 'learning']) {
    for (const base of [councilMode(POOL, POOL), councilMode(['ceo'], POOL), lensMode('cfo')]) {
      const composed = composeTurn(typed, withMemoryScope(base, scope));
      const directive = directiveFor(withMemoryScope(base, scope));

      const expected = directive === null ? typed : `${directive}\n\n${typed}`;
      assert.equal(composed, expected, 'the cockpit added something of its own');

      // The founder's text survives byte-for-byte in every combination.
      assert.ok(composed.endsWith(typed), 'the message was altered');

      // Nothing that reads as an instruction to the model.
      for (const phrase of [
        'business memory',
        'do not read',
        'you are',
        'ignore',
        'journal',
        'calibration',
      ]) {
        assert.ok(
          !composed.toLowerCase().includes(phrase),
          `composed turn leaked reasoning instruction: "${phrase}"`
        );
      }
    }
  }
});

test('a malformed scope degrades to Business, never to Learning', () => {
  for (const bad of [undefined, null, '', 'LEARNING', 'learn', 42, {}, []]) {
    assert.equal(readMemoryScope(bad), 'business', JSON.stringify(bad));
  }
  // The safe direction is grounded, not ungrounded: a corrupt payload must never
  // be able to strip a founder's company out of advice they read as theirs.
  assert.equal(
    memoryScopeOf(parseRuntimeMode({ kind: 'council', memory: 'nonsense' })),
    'business'
  );
  assert.equal(
    memoryScopeOf(parseRuntimeMode({ kind: 'lens', lensId: 'cfo', memory: 'learning' })),
    'learning',
    'a valid scope must survive the trip from the renderer'
  );
});

test('an unreadable lens id cannot silently reset the scope', () => {
  // The two fields are orthogonal, so one being malformed must not take the
  // other with it.
  const mode = readConversationMode({ kind: 'lens', lensId: '!!not-valid!!', memory: 'learning' });
  assert.equal(mode.kind, 'council', 'a bad lens id falls back to Council');
  assert.equal(mode.memory, 'learning', 'the scope was collateral damage');
});

/* -------------------------------------------------------------------------- */
/* 2. Onboarding                                                                */
/* -------------------------------------------------------------------------- */

const firstRun = (overrides) => ({
  hasWorkspace: true,
  snapshotLoaded: true,
  memoryPresent: false,
  onboardingStarted: false,
  forced: false,
  memoryScope: 'business',
  ...overrides,
});

test('Business Mode still offers onboarding when there is no memory', () => {
  assert.equal(shouldShowWelcome(firstRun({})), true);
});

test('Learning Mode never offers onboarding, under any other condition', () => {
  // Every combination that would show the welcome screen in Business Mode.
  for (const overrides of [
    {},
    { forced: true },
    { memoryPresent: false, onboardingStarted: false },
    { snapshotLoaded: false },
  ]) {
    assert.equal(
      shouldShowWelcome(firstRun({ ...overrides, memoryScope: 'learning' })),
      false,
      `onboarding leaked into Learning Mode: ${JSON.stringify(overrides)}`
    );
  }
});

test('the developer first-run override cannot force onboarding in Learning Mode', () => {
  // `forced` outranks everything else in Business Mode...
  assert.equal(shouldShowWelcome(firstRun({ forced: true, memoryPresent: true })), true);
  // ...and still does not reach a mode whose defining property is that
  // onboarding never happens.
  assert.equal(
    shouldShowWelcome(firstRun({ forced: true, memoryPresent: true, memoryScope: 'learning' })),
    false
  );
});

test('Business Mode does not re-offer onboarding once memory exists', () => {
  assert.equal(shouldShowWelcome(firstRun({ memoryPresent: true })), false);
});

/* -------------------------------------------------------------------------- */
/* 3. Session metadata: written once, restored, never mutated                   */
/* -------------------------------------------------------------------------- */

function withStore(body) {
  const root = mkdtempSync(path.join(tmpdir(), 'eis-scope-'));
  try {
    return body(new ConversationStore(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a conversation persists the scope it was created with', async () => {
  await withStore(async (store) => {
    const learning = await store.create('/repo', {
      mode: { kind: 'council', lensId: null, memory: 'learning' },
    });
    assert.equal(learning.value.mode.memory, 'learning');

    const business = await store.create('/repo', {
      mode: { kind: 'council', lensId: null, memory: 'business' },
    });
    assert.equal(business.value.mode.memory, 'business');

    const reloaded = await store.load(learning.value.id);
    assert.equal(reloaded.value.summary.mode.memory, 'learning', 'scope did not survive a reload');
  });
});

test('scope survives every operation that rewrites the index', async () => {
  await withStore(async (store) => {
    const created = await store.create('/repo', {
      mode: { kind: 'lens', lensId: 'cfo', memory: 'learning' },
      title: 'CFO Chat',
    });
    const { id } = created.value;

    const afterAppend = await store.append(id, [
      { id: 'u1', role: 'user', text: 'How do CFOs think about burn?', createdAt: Date.now() },
    ]);
    assert.equal(afterAppend.value.mode.memory, 'learning', 'append lost the scope');

    const afterBind = await store.bindSession(id, '33333333-3333-4333-8333-333333333333');
    assert.equal(afterBind.value.mode.memory, 'learning', 'bindSession lost the scope');

    const afterRename = await store.rename(id, 'Learning about burn');
    assert.equal(afterRename.value.mode.memory, 'learning', 'rename lost the scope');
    assert.equal(afterRename.value.mode.lensId, 'cfo', 'rename lost the executive');

    const listed = await store.list('/repo');
    assert.equal(listed[0].mode.memory, 'learning', 'the index lost the scope');
  });
});

test('there is no write path that can change a stored conversation’s scope', async () => {
  await withStore(async (store) => {
    const created = await store.create('/repo', {
      mode: { kind: 'council', lensId: null, memory: 'learning' },
    });

    // Every mutating method the store exposes, called against the record.
    const mutators = Object.getOwnPropertyNames(Object.getPrototypeOf(store)).filter(
      (name) => !name.startsWith('_') && name !== 'constructor'
    );
    assert.ok(
      !mutators.includes('setMode') && !mutators.includes('updateMode'),
      `the store exposes a mode mutator: ${mutators.join(', ')}`
    );

    const reloaded = await store.load(created.value.id);
    assert.equal(reloaded.value.summary.mode.memory, 'learning');
  });
});

test('a record written before this feature reads back as Business', () => {
  // Not a fallback: those conversations were grounded in the founder's company,
  // because that was the only mode that existed.
  assert.equal(readConversationMode({ kind: 'council', lensId: null }).memory, 'business');
  assert.equal(readConversationMode(undefined).memory, 'business');
  assert.equal(COUNCIL_CONVERSATION_MODE.memory, 'business');
});

test('changing the default cannot reach an existing conversation', async () => {
  await withStore(async (store, root) => {
    const created = await store.create('/repo', {
      mode: { kind: 'council', lensId: null, memory: 'business' },
    });

    /*
     * The store is the only thing that can write this record, and it takes the
     * scope only at creation. Simulating "the founder flipped the toggle" is
     * therefore simulating a later `create` — which produces a *different*
     * conversation, never a mutation of this one.
     */
    const later = await store.create('/repo', {
      mode: { kind: 'council', lensId: null, memory: 'learning' },
    });
    assert.notEqual(later.value.id, created.value.id);

    const original = await store.load(created.value.id);
    assert.equal(
      original.value.summary.mode.memory,
      'business',
      'an existing conversation changed mode'
    );

    // And on disk, not just in the returned object.
    const index = JSON.parse(readFileSync(path.join(root, 'index.json'), 'utf8'));
    const stored = index.conversations.find((c) => c.id === created.value.id);
    assert.equal(stored.mode.memory, 'business');
  });
});

/* -------------------------------------------------------------------------- */
/* 4. The engine owns the semantics                                             */
/* -------------------------------------------------------------------------- */

test('the /learning command exists and owns every rule the GUI does not', () => {
  const command = readFileSync(path.join(REPO, '.claude', 'commands', 'learning.md'), 'utf8');

  // The behaviours the sprint requires, each stated in the repository rather
  // than implemented in the renderer.
  for (const required of [
    'core/business_memory.md',
    'core/calibration_journal.md',
    'journal/',
    'dossier/',
  ]) {
    assert.ok(command.includes(required), `the command does not mention ${required}`);
  }
  assert.match(command, /Do not enter onboarding/i, 'onboarding suppression is not stated');
  assert.match(command, /Never substitute/i, 'fabrication is not forbidden');
});

test('the kernel exposes the mode, so the command does not contradict it', () => {
  const kernel = readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');
  // §4 routes an absent memory into onboarding and §14 defines first run. Both
  // must acknowledge the mode, or the kernel silently wins over the command.
  assert.match(kernel, /`\/learning` sets Business Memory, calibration, and the journal aside/);
  assert.match(kernel, /`\/learning` is the exception/);
});

test('no reasoning rule about Learning Mode lives in the application', () => {
  /*
   * The GUI may name the command and label the choice. It may not describe what
   * the mode does to reasoning — that is the engine's, and a copy here would go
   * stale against `.claude/commands/learning.md` without anything failing.
   *
   * `MemoryScopeBadge` carries founder-facing descriptions of what is and is not
   * read, which is disclosure rather than instruction: it is rendered to the
   * screen and never transmitted. The check therefore targets the two files that
   * actually compose a turn.
   */
  for (const file of ['shared/runtime-modes.ts', 'shared/conversations.ts']) {
    const source = readFileSync(path.join(HERE, '..', file), 'utf8');
    const code = source
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'));
      })
      .join('\n');

    for (const phrase of ['business_memory', 'calibration_journal', 'journal/', 'Decision Record']) {
      assert.ok(
        !code.includes(phrase),
        `${file} names an engine concept outside a comment: "${phrase}"`
      );
    }
  }
});
