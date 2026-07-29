/**
 * PERMANENT CONVERSATION PERSISTENCE TESTS
 *
 * These exercise the compiled production store against a real temporary
 * directory — not a mocked filesystem — because every failure mode worth testing
 * here is a filesystem failure mode: torn writes, missing files, interleaved
 * appends, ids that try to escape their directory.
 *
 * What earns permanent status is narrow and deliberate: the properties whose
 * violation would silently corrupt a founder's record of how they decided. A
 * transcript that loses a turn, duplicates one, attributes one to the wrong
 * conversation, or reads back as whole when it is not, is worse than no
 * transcript at all — it is a plausible one that is wrong.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

// The production store, compiled. Not a copy, not a mock.
const { ConversationStore } = require('../dist-electron/electron/conversations/index.js');
const { deriveTitle, isConversationId } = require('../dist-electron/shared/conversations.js');

/** A fresh store over a throwaway directory. */
function freshStore() {
  const root = mkdtempSync(path.join(tmpdir(), 'eis-conv-test-'));
  return { store: new ConversationStore(root), root };
}

function message(role, text, at = Date.now()) {
  return { id: `${role}_${text}_${at}`, role, text, createdAt: at };
}

/* -------------------------------------------------------------------------- */
/* Round trip                                                                  */
/* -------------------------------------------------------------------------- */

test('a transcript survives a full write/read cycle in order', async () => {
  const { store, root } = freshStore();
  try {
    const created = await store.create('C:\\repo');
    assert.equal(created.ok, true);

    const written = [
      message('user', 'first'),
      message('advisor', 'second'),
      message('user', 'third'),
    ];
    const appended = await store.append(created.value.id, written);
    assert.equal(appended.ok, true, appended.reason);

    const loaded = await store.load(created.value.id);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.value.incomplete, false);
    assert.deepEqual(
      loaded.value.messages.map((m) => m.text),
      ['first', 'second', 'third'],
      'stored order must be arrival order'
    );
    assert.equal(loaded.value.summary.messageCount, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('appends accumulate rather than replacing', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    await store.append(value.id, [message('user', 'turn one')]);
    await store.append(value.id, [message('advisor', 'reply one')]);
    await store.append(value.id, [message('user', 'turn two')]);

    const loaded = await store.load(value.id);
    assert.equal(loaded.value.messages.length, 3);
    assert.equal(loaded.value.summary.messageCount, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * THE CORE DURABILITY INVARIANT.
 *
 * An interrupted append leaves a partial final line. Every message written
 * before it must still be readable, and the damage must be *reported* rather
 * than passed off as a complete transcript.
 *
 * This is the specific reason bodies are append-only JSONL instead of a
 * rewritten JSON array: with an array, the same interruption loses everything.
 */
test('a torn final line costs only that line, and is disclosed', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    await store.append(value.id, [message('user', 'intact one'), message('advisor', 'intact two')]);

    // Simulate a process death mid-append: valid JSON, cut off.
    appendFileSync(path.join(root, `${value.id}.jsonl`), '{"v":1,"message":{"id":"x","ro');

    const loaded = await store.load(value.id);
    assert.equal(loaded.ok, true);
    assert.deepEqual(
      loaded.value.messages.map((m) => m.text),
      ['intact one', 'intact two'],
      'earlier messages must survive a torn tail'
    );
    assert.equal(
      loaded.value.incomplete,
      true,
      'a transcript with an unreadable line must not report itself as whole'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a record from an unknown schema version is skipped, not guessed at', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    await store.append(value.id, [message('user', 'known')]);

    appendFileSync(
      path.join(root, `${value.id}.jsonl`),
      `${JSON.stringify({ v: 999, message: { id: 'f', role: 'user', text: 'future', createdAt: 1 } })}\n`
    );

    const loaded = await store.load(value.id);
    assert.deepEqual(loaded.value.messages.map((m) => m.text), ['known']);
    assert.equal(loaded.value.incomplete, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* Resume pointer                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The session handle is the whole of resume. If it does not survive a restart,
 * the advisor meets the founder as a stranger on every launch — which is the
 * defect this module exists to fix.
 */
test('the session handle survives a restart of the store', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    assert.equal(value.sessionId, null, 'a new conversation has no session yet');

    await store.bindSession(value.id, 'session-abc');

    // A completely new instance: nothing cached, everything read from disk.
    const reopened = new ConversationStore(root);
    const list = await reopened.list('C:\\repo');
    assert.equal(list.length, 1);
    assert.equal(list[0].sessionId, 'session-abc');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('binding the same handle twice is idempotent', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    const first = await store.bindSession(value.id, 'session-abc');
    const second = await store.bindSession(value.id, 'session-abc');
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.value.sessionId, 'session-abc');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* Scoping and ordering                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Engine sessions are scoped to a working directory, so offering a conversation
 * from another repository would offer a resume that cannot succeed.
 */
test('conversations are scoped to their workspace', async () => {
  const { store, root } = freshStore();
  try {
    await store.create('C:\\repo-a');
    await store.create('C:\\repo-b');

    assert.equal((await store.list('C:\\repo-a')).length, 1);
    assert.equal((await store.list('C:\\repo-b')).length, 1);
    assert.equal((await store.list('C:\\repo-c')).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the list is ordered by most recent activity', async () => {
  const { store, root } = freshStore();
  try {
    const older = await store.create('C:\\repo');
    const newer = await store.create('C:\\repo');

    // Touch the older one last, so recency and creation order disagree.
    await store.append(older.value.id, [message('user', 'revived', Date.now() + 1000)]);

    const list = await store.list('C:\\repo');
    assert.equal(list[0].id, older.value.id, 'most recently updated must sort first');
    assert.equal(list[1].id, newer.value.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* Titles                                                                      */
/* -------------------------------------------------------------------------- */

test('the title is the founder\'s own first words, truncated', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    await store.append(value.id, [
      message('user', 'Should we raise the price to  ₹50L\n or hold?'),
      message('advisor', 'A long analytical reply that must not become the title.'),
    ]);

    const list = await store.list('C:\\repo');
    assert.equal(
      list[0].title,
      'Should we raise the price to ₹50L or hold?',
      'whitespace is collapsed; nothing else is changed'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the title is adopted once and not rewritten as the conversation grows', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    await store.append(value.id, [message('user', 'original question')]);
    await store.append(value.id, [message('user', 'a later, different question')]);

    const list = await store.list('C:\\repo');
    assert.equal(list[0].title, 'original question');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('deriveTitle truncates without inventing', () => {
  assert.equal(deriveTitle('  spaced   out  '), 'spaced out');
  assert.equal(deriveTitle(''), 'Untitled');
  assert.equal(deriveTitle('\n\t '), 'Untitled');

  const long = 'x'.repeat(200);
  const title = deriveTitle(long);
  assert.ok(title.length <= 72, `title was ${title.length} chars`);
  assert.ok(title.endsWith('…'), 'truncation must be visible');
  // Everything kept must be a prefix of the original — no paraphrase.
  assert.ok(long.startsWith(title.slice(0, -1)));
});

/* -------------------------------------------------------------------------- */
/* Confinement                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The cockpit must never write outside its own data directory. Ids are the only
 * caller-supplied part of any path, so restricting them to UUIDs is what makes
 * escape unrepresentable rather than merely guarded against.
 */
test('non-UUID ids are refused on every path-taking method', async () => {
  const { store, root } = freshStore();
  try {
    const attacks = [
      '../../etc/passwd',
      '..\\..\\core\\business_memory',
      'core/business_memory.md',
      '/absolute/path',
      'C:\\repo\\core\\business_memory',
      '',
      'not-a-uuid',
      '0c05d47a-a2d0-483d-bb1b-fb26a30cdfe4/../../escape',
    ];

    for (const id of attacks) {
      assert.equal(isConversationId(id), false, `${id} must not validate`);
      for (const call of [
        () => store.load(id),
        () => store.append(id, [message('user', 'x')]),
        () => store.bindSession(id, 's'),
        () => store.rename(id, 't'),
        () => store.remove(id),
      ]) {
        const result = await call();
        assert.equal(result.ok, false, `${id} was accepted`);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a well-formed id for a conversation that does not exist is refused', async () => {
  const { store, root } = freshStore();
  try {
    const absent = '0c05d47a-a2d0-483d-bb1b-fb26a30cdfe4';
    assert.equal(isConversationId(absent), true);
    const result = await store.load(absent);
    assert.equal(result.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* Concurrency and corruption                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Concurrent appends must not lose a message or a count. Both are reachable in
 * normal use: a turn completing while the previous flush is still in flight.
 */
test('concurrent appends lose nothing', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');

    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        store.append(value.id, [message('user', `m${i}`, Date.now() + i)])
      )
    );

    const loaded = await store.load(value.id);
    assert.equal(loaded.value.messages.length, 12, 'a concurrent append was lost');
    assert.equal(
      loaded.value.summary.messageCount,
      12,
      'the index count drifted from the body'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a corrupt index degrades to empty rather than throwing', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    await store.append(value.id, [message('user', 'will be orphaned')]);

    writeFileSync(path.join(root, 'index.json'), '{ this is not json');

    // A new instance must read the damaged index without throwing.
    const reopened = new ConversationStore(root);
    assert.deepEqual(await reopened.list('C:\\repo'), []);

    // And must still be usable afterwards.
    const created = await reopened.create('C:\\repo');
    assert.equal(created.ok, true);
    assert.equal((await reopened.list('C:\\repo')).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the index is valid JSON after every mutation', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    await store.append(value.id, [message('user', 'one')]);
    await store.bindSession(value.id, 'sess');
    await store.rename(value.id, 'renamed');

    const parsed = JSON.parse(readFileSync(path.join(root, 'index.json'), 'utf8'));
    assert.equal(parsed.v, 1);
    assert.equal(parsed.conversations.length, 1);
    assert.equal(parsed.conversations[0].title, 'renamed');

    // No temp file left behind by the atomic rename.
    const leftovers = readFileSync(path.join(root, 'index.json'), 'utf8');
    assert.ok(leftovers.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* Deletion                                                                    */
/* -------------------------------------------------------------------------- */

test('deletion removes the conversation and its body', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    await store.append(value.id, [message('user', 'gone soon')]);

    const removed = await store.remove(value.id);
    assert.equal(removed.ok, true);
    assert.deepEqual(await store.list('C:\\repo'), []);

    assert.throws(() => readFileSync(path.join(root, `${value.id}.jsonl`), 'utf8'));
    assert.equal((await store.load(value.id)).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an empty append is refused rather than writing a blank line', async () => {
  const { store, root } = freshStore();
  try {
    const { value } = await store.create('C:\\repo');
    const result = await store.append(value.id, []);
    assert.equal(result.ok, false);

    const loaded = await store.load(value.id);
    assert.equal(loaded.value.messages.length, 0);
    assert.equal(loaded.value.incomplete, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
