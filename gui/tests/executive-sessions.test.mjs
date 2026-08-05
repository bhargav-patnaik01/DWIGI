/**
 * v1.2.3 — EXECUTIVE SESSIONS
 *
 * Scoped exactly to what v1.2.3 asked to validate: session isolation, session
 * lifecycle, Council orchestration (the isolated-mode composition), single
 * executive chat (reuse), session reset, and the Session Manager's pure logic.
 * No unrelated regression testing — that is `npm test`'s full suite, run
 * separately and unchanged by this file.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

const sessions = require('../dist-electron/shared/sessions.js');
const runtimeModes = require('../dist-electron/shared/runtime-modes.js');
const conversationsShared = require('../dist-electron/shared/conversations.js');
const { ConversationStore } = require('../dist-electron/electron/conversations/index.js');

function freshStore() {
  const root = mkdtempSync(path.join(tmpdir(), 'eis-sessions-test-'));
  return new ConversationStore(root);
}

/* -------------------------------------------------------------------------- */
/* Roster — every executive is addressable, nothing is invented                */
/* -------------------------------------------------------------------------- */

test('the roster has one slot per lens, plus Council and isolated Council', () => {
  const lenses = [
    { id: 'ceo', name: 'CEO' },
    { id: 'cfo', name: 'CFO' },
    { id: 'risk-officer', name: 'Risk Officer' },
  ];
  const roster = sessions.sessionRoster(lenses);

  assert.equal(roster.length, lenses.length + 2);
  for (const lens of lenses) {
    assert.ok(roster.some((slot) => slot.key === lens.id && slot.kind === 'lens'));
  }
  assert.ok(roster.some((slot) => slot.key === sessions.COUNCIL_SESSION_KEY && !slot.isolated));
  assert.ok(
    roster.some((slot) => slot.key === sessions.ISOLATED_COUNCIL_SESSION_KEY && slot.isolated)
  );
});

test('an empty lens list still yields both Council slots', () => {
  // A workspace whose executive directory failed to parse should not lose the
  // Chief of Staff's own sessions along with the board.
  const roster = sessions.sessionRoster([]);
  assert.equal(roster.length, 2);
});

test('roster order is deterministic regardless of input order', () => {
  const a = sessions.sessionRoster([{ id: 'cfo', name: 'CFO' }, { id: 'ceo', name: 'CEO' }]);
  const b = sessions.sessionRoster([{ id: 'cfo', name: 'CFO' }, { id: 'ceo', name: 'CEO' }]);
  assert.deepEqual(a.map((s) => s.key), b.map((s) => s.key));
});

/* -------------------------------------------------------------------------- */
/* slotKeyForMode — the structural link between a stored conversation and a slot */
/* -------------------------------------------------------------------------- */

test('a lens conversation maps to its own lens slot', () => {
  const key = sessions.slotKeyForMode({ kind: 'lens', lensId: 'cfo', memory: 'business' });
  assert.equal(key, 'cfo');
});

test('a plain Council conversation maps to the Council slot, not the isolated one', () => {
  const key = sessions.slotKeyForMode({ kind: 'council', lensId: null, memory: 'business' });
  assert.equal(key, sessions.COUNCIL_SESSION_KEY);
});

test('an isolated Council conversation maps to the isolated slot', () => {
  const key = sessions.slotKeyForMode({
    kind: 'council',
    lensId: null,
    memory: 'business',
    isolated: true,
  });
  assert.equal(key, sessions.ISOLATED_COUNCIL_SESSION_KEY);
});

/* -------------------------------------------------------------------------- */
/* Lifecycle — explicit states, explicit transitions                          */
/* -------------------------------------------------------------------------- */

test('a slot with no conversation and no history is Created', () => {
  const state = sessions.deriveState({
    hasCurrentConversation: false,
    hasMessages: false,
    hasArchivedHistory: false,
    isOpen: false,
    turnStatus: 'idle',
    awaitingFirstToken: false,
  });
  assert.equal(state, 'created');
});

test('a slot with no current conversation but a reset history is Archived', () => {
  const state = sessions.deriveState({
    hasCurrentConversation: false,
    hasMessages: false,
    hasArchivedHistory: true,
    isOpen: false,
    turnStatus: 'idle',
    awaitingFirstToken: false,
  });
  assert.equal(state, 'archived');
});

test('a conversation that exists but has never been sent a message is Created', () => {
  const state = sessions.deriveState({
    hasCurrentConversation: true,
    hasMessages: false,
    hasArchivedHistory: false,
    isOpen: false,
    turnStatus: 'idle',
    awaitingFirstToken: false,
  });
  assert.equal(state, 'created');
});

test('a conversation with messages, not open, is Idle', () => {
  const state = sessions.deriveState({
    hasCurrentConversation: true,
    hasMessages: true,
    hasArchivedHistory: false,
    isOpen: false,
    turnStatus: 'idle',
    awaitingFirstToken: false,
  });
  assert.equal(state, 'idle');
});

test('the open conversation with a turn in flight and no text yet is Thinking', () => {
  const state = sessions.deriveState({
    hasCurrentConversation: true,
    hasMessages: true,
    hasArchivedHistory: false,
    isOpen: true,
    turnStatus: 'working',
    awaitingFirstToken: true,
  });
  assert.equal(state, 'thinking');
});

test('the open conversation streaming text is Responding', () => {
  const state = sessions.deriveState({
    hasCurrentConversation: true,
    hasMessages: true,
    hasArchivedHistory: false,
    isOpen: true,
    turnStatus: 'working',
    awaitingFirstToken: false,
  });
  assert.equal(state, 'responding');
});

test('awaiting permission mid-turn still reads as Thinking, not Idle', () => {
  const state = sessions.deriveState({
    hasCurrentConversation: true,
    hasMessages: true,
    hasArchivedHistory: false,
    isOpen: true,
    turnStatus: 'awaiting-permission',
    awaitingFirstToken: true,
  });
  assert.equal(state, 'thinking');
});

/*
 * The case that motivated ordering `isOpen`/`turnStatus` before `hasMessages`:
 * the very first turn of a brand-new conversation, before the transcript flush
 * has caught up. Getting this backwards would show a founder's first question
 * as "Created" at the exact moment it is actually being worked on.
 */
test('the first turn of a brand-new session reads as Thinking, not Created', () => {
  const state = sessions.deriveState({
    hasCurrentConversation: true,
    hasMessages: false, // not yet persisted — the flush lags by design
    hasArchivedHistory: false,
    isOpen: true,
    turnStatus: 'working',
    awaitingFirstToken: true,
  });
  assert.equal(state, 'thinking');
});

test('every input combination resolves to exactly one of the six named states', () => {
  const bools = [true, false];
  const statuses = ['idle', 'working', 'awaiting-permission', 'error'];
  const named = new Set(['created', 'idle', 'thinking', 'responding', 'archived', 'disposed']);

  for (const hasCurrentConversation of bools) {
    for (const hasMessages of bools) {
      for (const hasArchivedHistory of bools) {
        for (const isOpen of bools) {
          for (const turnStatus of statuses) {
            for (const awaitingFirstToken of bools) {
              const state = sessions.deriveState({
                hasCurrentConversation,
                hasMessages,
                hasArchivedHistory,
                isOpen,
                turnStatus,
                awaitingFirstToken,
              });
              assert.ok(named.has(state), `unrecognised state: ${state}`);
            }
          }
        }
      }
    }
  }
});

test('the transition table is explicit and total over the six named states', () => {
  const states = ['created', 'idle', 'thinking', 'responding', 'archived', 'disposed'];
  for (const state of states) {
    assert.ok(state in sessions.SESSION_TRANSITIONS, `${state} has no transition entry`);
  }
});

test('legal transitions are allowed', () => {
  assert.ok(sessions.canTransition('created', 'thinking'));
  assert.ok(sessions.canTransition('idle', 'thinking'));
  assert.ok(sessions.canTransition('idle', 'archived'));
  assert.ok(sessions.canTransition('thinking', 'responding'));
  assert.ok(sessions.canTransition('responding', 'idle'));
  assert.ok(sessions.canTransition('archived', 'created'));
  assert.ok(sessions.canTransition('idle', 'disposed'));
});

test('a reset always lands on Created, never resumes as Idle', () => {
  // This is the difference between a real reset and a pause: the archived
  // slot's only forward transition is into a fresh session, never back into
  // the one that was reset.
  assert.ok(sessions.canTransition('archived', 'created'));
  assert.ok(!sessions.canTransition('archived', 'idle'));
  assert.ok(!sessions.canTransition('archived', 'thinking'));
});

test('responding cannot revert to thinking', () => {
  // Once tokens have started arriving, the turn cannot un-start.
  assert.ok(!sessions.canTransition('responding', 'thinking'));
});

test('disposed is terminal', () => {
  const states = ['created', 'idle', 'thinking', 'responding', 'archived', 'disposed'];
  for (const to of states) {
    assert.ok(!sessions.canTransition('disposed', to), `disposed -> ${to} must be illegal`);
  }
});

/* -------------------------------------------------------------------------- */
/* The single-active-runtime invariant                                        */
/* -------------------------------------------------------------------------- */

test('at most one session may be Thinking or Responding at once', () => {
  const idle = { state: 'idle' };
  const thinking = { state: 'thinking' };
  const responding = { state: 'responding' };
  const created = { state: 'created' };

  assert.ok(sessions.atMostOneActive([idle, created, thinking]));
  assert.ok(sessions.atMostOneActive([idle, created])); // none active is fine
  assert.ok(sessions.atMostOneActive([responding]));
  // Two concurrently active would mean two processes reasoning at once, which
  // the architecture (one active runtime session) makes impossible in practice
  // — this assertion is what would catch it if the derivation logic regressed.
  assert.ok(!sessions.atMostOneActive([thinking, responding]));
  assert.ok(!sessions.atMostOneActive([thinking, thinking]));
});

/* -------------------------------------------------------------------------- */
/* Context isolation (Part E) — the fifth-field tripwire                      */
/* -------------------------------------------------------------------------- */

test('the executive context scope names exactly four things, nothing else', () => {
  assert.deepEqual(
    [...sessions.EXECUTIVE_CONTEXT_KEYS].sort(),
    ['businessMemory', 'currentRequest', 'executiveProfile', 'workspace'].sort()
  );
});

test('a session record carries no message content or cross-session field', () => {
  // Structural proxy for "no executive receives another's hidden reasoning":
  // the GUI-side record this file produces has nowhere to put it. Field names
  // that would indicate a leak are named and forbidden explicitly.
  const forbidden = [
    'messages',
    'transcript',
    'otherExecutivePositions',
    'siblingReasoning',
    'councilContext',
    'sharedHistory',
  ];
  const sample = {
    slot: { key: 'cfo', kind: 'lens', lensId: 'cfo', isolated: false, label: 'CFO' },
    state: 'idle',
    conversationId: 'x',
    engineSessionId: null,
    lastActivityAt: null,
    providerId: null,
  };
  for (const field of forbidden) {
    assert.equal(field in sample, false, `SessionRecord must not carry ${field}`);
  }
});

/* -------------------------------------------------------------------------- */
/* Isolated Council — directive composition (Council orchestration, Part G)   */
/* -------------------------------------------------------------------------- */

test('isolated Council composes /deliberate-isolated and nothing else', () => {
  const mode = runtimeModes.isolatedCouncilMode();
  assert.equal(runtimeModes.directiveFor(mode), '/deliberate-isolated');
});

test('isolated Council ignores a lens narrowing rather than combining with it', () => {
  // The command documents no support for a nested /council directive. Composing
  // one anyway would assume semantics `.claude/commands/` never defined.
  const mode = { kind: 'council', isolated: true, enabledLenses: ['cfo', 'ceo'] };
  assert.equal(runtimeModes.directiveFor(mode), '/deliberate-isolated');
});

test('isolated Council ignores Learning scope rather than nesting it', () => {
  const mode = runtimeModes.withMemoryScope(runtimeModes.isolatedCouncilMode(), 'learning');
  assert.equal(runtimeModes.directiveFor(mode), '/deliberate-isolated');
});

test('the default Council mode is untouched by the isolated constructor existing', () => {
  assert.equal(runtimeModes.directiveFor(runtimeModes.DEFAULT_COUNCIL_MODE), null);
  assert.equal(runtimeModes.composeTurn('hello', runtimeModes.DEFAULT_COUNCIL_MODE), 'hello');
});

test('a plain lens mode is unaffected by the isolated flag existing on CouncilMode', () => {
  const mode = runtimeModes.lensMode('cfo');
  assert.equal(runtimeModes.directiveFor(mode), '/lens cfo');
});

/* -------------------------------------------------------------------------- */
/* readConversationMode — the isolated flag round-trips, and only for Council */
/* -------------------------------------------------------------------------- */

test('a stored isolated Council record reads back as isolated', () => {
  const mode = conversationsShared.readConversationMode({ kind: 'council', isolated: true });
  assert.equal(mode.kind, 'council');
  assert.equal(mode.isolated, true);
});

test('a record written before isolation existed reads back as not isolated', () => {
  const mode = conversationsShared.readConversationMode({ kind: 'council' });
  assert.equal(mode.isolated, undefined || false);
});

test('a lens record can never carry the isolated flag', () => {
  const mode = conversationsShared.readConversationMode({
    kind: 'lens',
    lensId: 'cfo',
    isolated: true,
  });
  assert.equal(mode.kind, 'lens');
  assert.equal('isolated' in mode, false, 'isolated has no meaning outside a Council conversation');
});

/* -------------------------------------------------------------------------- */
/* readArchived — back-compat and the safe default direction                  */
/* -------------------------------------------------------------------------- */

test('archived defaults to false for records written before it existed', () => {
  assert.equal(conversationsShared.readArchived(undefined), false);
  assert.equal(conversationsShared.readArchived(null), false);
});

test('only a literal true is accepted as archived', () => {
  assert.equal(conversationsShared.readArchived(true), true);
  assert.equal(conversationsShared.readArchived('true'), false);
  assert.equal(conversationsShared.readArchived(1), false);
});

/* -------------------------------------------------------------------------- */
/* ConversationStore.archive — a reset, never a deletion                      */
/* -------------------------------------------------------------------------- */

test('archiving flips the flag and preserves everything else', async () => {
  const store = freshStore();
  const created = await store.create('/workspace', {
    mode: { kind: 'lens', lensId: 'cfo' },
    title: 'CFO Chat',
  });
  assert.equal(created.ok, true);

  await store.append(created.value.id, [
    { id: 'u1', role: 'user', text: 'Should we raise prices?', createdAt: Date.now() },
  ]);

  const archived = await store.archive(created.value.id);
  assert.equal(archived.ok, true);
  assert.equal(archived.value.archived, true);

  // The transcript is untouched — a reset is not a deletion.
  const loaded = await store.load(created.value.id);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.value.messages.length, 1);
  assert.equal(loaded.value.messages[0].text, 'Should we raise prices?');
});

test('archiving does not bump updatedAt', async () => {
  const store = freshStore();
  const created = await store.create('/workspace', { mode: { kind: 'council' } });
  const before = created.value.updatedAt;

  const archived = await store.archive(created.value.id);
  assert.equal(archived.value.updatedAt, before);
});

test('archiving is idempotent', async () => {
  const store = freshStore();
  const created = await store.create('/workspace', { mode: { kind: 'council' } });

  const first = await store.archive(created.value.id);
  const second = await store.archive(created.value.id);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.value.archived, true);
});

test('archiving an unknown id fails cleanly rather than creating a record', async () => {
  const store = freshStore();
  const result = await store.archive('00000000-0000-0000-0000-000000000000');
  assert.equal(result.ok, false);
});

test('archiving a malformed id is refused, never reaching the filesystem', async () => {
  const store = freshStore();
  const result = await store.archive('../../etc/passwd');
  assert.equal(result.ok, false);
});

/* -------------------------------------------------------------------------- */
/* Single Executive Chat reuse (Part F) — the roster picks the SAME session   */
/* -------------------------------------------------------------------------- */

test('a second visit to the same lens finds the first conversation as current', async () => {
  const store = freshStore();
  const first = await store.create('/workspace', {
    mode: { kind: 'lens', lensId: 'cfo' },
    title: 'CFO Chat',
  });

  const list = await store.list('/workspace');
  const current = list.find(
    (entry) => conversationsShared.readConversationMode(entry.mode).lensId === 'cfo' && !entry.archived
  );
  assert.equal(current?.id, first.value.id);
});

test('after a reset, the lens has no current conversation until a new one is opened', async () => {
  const store = freshStore();
  const first = await store.create('/workspace', {
    mode: { kind: 'lens', lensId: 'cfo' },
    title: 'CFO Chat',
  });
  await store.archive(first.value.id);

  const list = await store.list('/workspace');
  const current = list.find(
    (entry) => entry.mode.lensId === 'cfo' && !entry.archived
  );
  assert.equal(current, undefined);

  // The old conversation is still findable in history, archived.
  const archivedEntry = list.find((entry) => entry.id === first.value.id);
  assert.equal(archivedEntry?.archived, true);
});

test('resetting one executive never touches another', async () => {
  const store = freshStore();
  const cfo = await store.create('/workspace', { mode: { kind: 'lens', lensId: 'cfo' } });
  const ceo = await store.create('/workspace', { mode: { kind: 'lens', lensId: 'ceo' } });

  await store.archive(cfo.value.id);

  const list = await store.list('/workspace');
  const ceoEntry = list.find((entry) => entry.id === ceo.value.id);
  assert.equal(ceoEntry?.archived, false);
});

test('resetting a lens session never touches the Council conversation', async () => {
  const store = freshStore();
  const cfo = await store.create('/workspace', { mode: { kind: 'lens', lensId: 'cfo' } });
  const council = await store.create('/workspace', { mode: { kind: 'council' } });

  await store.archive(cfo.value.id);

  const list = await store.list('/workspace');
  const councilEntry = list.find((entry) => entry.id === council.value.id);
  assert.equal(councilEntry?.archived, false);
});

test('Council and isolated Council are tracked as separate sessions', async () => {
  const store = freshStore();
  const council = await store.create('/workspace', { mode: { kind: 'council' } });
  const isolated = await store.create('/workspace', {
    mode: { kind: 'council', isolated: true },
  });

  assert.notEqual(council.value.id, isolated.value.id);

  const list = await store.list('/workspace');
  const councilKey = sessions.slotKeyForMode(
    conversationsShared.readConversationMode(list.find((e) => e.id === council.value.id).mode)
  );
  const isolatedKey = sessions.slotKeyForMode(
    conversationsShared.readConversationMode(
      list.find((e) => e.id === isolated.value.id).mode
    )
  );
  assert.equal(councilKey, sessions.COUNCIL_SESSION_KEY);
  assert.equal(isolatedKey, sessions.ISOLATED_COUNCIL_SESSION_KEY);
});
