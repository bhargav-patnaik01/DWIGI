/**
 * PERMANENT SESSION CONTINUITY TESTS
 *
 * Conversation history is only worth keeping if the advisor can actually continue
 * the conversation it names. That depends entirely on one decision inside the
 * runtime — whether a turn is spawned with `--resume` or `--session-id` — and on
 * what happens when that decision turns out to be wrong.
 *
 * Neither was testable through the live harness (`validate-bridge.mjs`) without
 * spending real tokens, and the failure they guard against is silent: the wrong
 * flag surfaces only as `Runtime exited with code 1`, and the founder is met by
 * an advisor that has forgotten yesterday.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS RUNS WITHOUT A RUNTIME
 * ---------------------------------------------------------------------------
 * `child_process.spawn` is replaced for the duration of each test. The compiled
 * runtime calls it as a property lookup on the module object, so the substitution
 * is total — the real production class under test, driven against a fake child.
 *
 * Nothing real is spawned and no tokens are spent, which is what makes these
 * assertions permanent rather than occasional.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');
const { ClaudeCliRuntime } = require('../dist-electron/electron/bridge/claude-cli.js');

/** A stored session id from an earlier run of the app. */
const STORED = '11111111-1111-4111-8111-111111111111';

/** The engine's own refusal texts, quoted as the CLI emits them. */
const NOT_FOUND = `No conversation found with session ID: ${STORED}`;
const ALREADY_IN_USE = (id) => `Session ID ${id} is already in use.`;

/** A terminal result line, in the shape the real stream carries it. */
const RESULT_LINE = `${JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 1200,
  num_turns: 1,
  total_cost_usd: 0.01,
  session_id: STORED,
})}\n`;

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

  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };

  return child;
}

function harness() {
  const spawns = [];
  const events = [];
  const original = childProcess.spawn;

  childProcess.spawn = (bin, args) => {
    const child = fakeChild();
    spawns.push({ bin, args, child });
    return child;
  };

  const runtime = new ClaudeCliRuntime((event) => events.push(event));

  /*
   * Skip the `claude --version` probe.
   *
   * `runtimeVersion` is private in TypeScript only; the emitted JavaScript has no
   * such barrier. Setting it makes `detectVersion` short-circuit, so this suite
   * touches no executable at all — including on a machine with no CLI installed,
   * where the probe would otherwise decide how long these tests take.
   */
  runtime.runtimeVersion = 'test-harness';

  return {
    spawns,
    events,
    runtime,
    restore: () => {
      childProcess.spawn = original;
    },
    /** The session flag and id this spawn was given. */
    flagOf(index) {
      const args = spawns[index].args;
      const at = args.findIndex((arg) => arg === '--resume' || arg === '--session-id');
      return { flag: args[at], id: args[at + 1] };
    },
    notices() {
      return events.filter((event) => event.kind === 'runtime-notice');
    },
    errors() {
      return events.filter((event) => event.kind === 'error');
    },
  };
}

/** Run `body` with `spawn` replaced, restoring it whatever happens. */
async function withHarness(body) {
  const h = harness();
  try {
    await body(h);
  } finally {
    h.restore();
  }
}

test('a new session is established once, then continued', async () => {
  await withHarness(async (h) => {
    const { sessionId } = await h.runtime.open({ workspacePath: '/workspace' });

    await h.runtime.send('first');
    assert.deepEqual(h.flagOf(0), { flag: '--session-id', id: sessionId });

    h.spawns[0].child.stdout.emit('data', RESULT_LINE);
    h.spawns[0].child.emit('exit', 0);

    await h.runtime.send('second');
    assert.deepEqual(h.flagOf(1), { flag: '--resume', id: sessionId });
  });
});

test('a stored session resumes on the FIRST turn after a restart', async () => {
  // The regression that made conversation history worthless: a fresh process has
  // spawned nothing, so "have we spawned before" said `--session-id`, the engine
  // refused the id as already in use, and every launch began a new conversation.
  await withHarness(async (h) => {
    const { sessionId } = await h.runtime.open({
      workspacePath: '/workspace',
      resumeSessionId: STORED,
    });

    assert.equal(sessionId, STORED, 'the stored id is adopted, not replaced');

    await h.runtime.send('what did we decide yesterday?');
    assert.deepEqual(h.flagOf(0), { flag: '--resume', id: STORED });
  });
});

/**
 * The stdin lifecycle, which changed in transport v2.
 *
 * This test previously asserted the opposite — that stdin was closed as soon as
 * the message had been written. That was the defect: stdin carries the
 * permission control channel in both directions, so closing it after the user
 * message left the engine unable to ask, and it fell back to refusing every
 * tool call. The old assertion was a green tick over a real bug.
 *
 * The invariant is now two-sided, and both halves matter. Closing too early
 * breaks permissions; never closing leaves the child waiting for input forever.
 */
test('the founder’s text is delivered verbatim, and stdin stays open until the turn ends', async () => {
  await withHarness(async (h) => {
    await h.runtime.open({ workspacePath: '/workspace' });

    const typed = 'Should we raise now?  Two spaces, a "quote", and a — dash.';
    await h.runtime.send(typed);

    const { stdin } = h.spawns[0].child;
    const sent = JSON.parse(stdin.written.trim());
    assert.equal(sent.message.content[0].text, typed, 'no wrapping, no normalising');
    assert.equal(
      stdin.ended,
      false,
      'stdin was closed after the user message: this destroys the permission channel'
    );

    // The terminal result is the one signal that ends input.
    h.spawns[0].child.stdout.emit('data', RESULT_LINE);
    assert.ok(stdin.ended, 'stdin was never closed: the child would wait for input forever');
  });
});

test('an unknown session is recovered from, and the lost continuity is disclosed', async () => {
  await withHarness(async (h) => {
    await h.runtime.open({ workspacePath: '/workspace', resumeSessionId: STORED });
    await h.runtime.send('carry on from yesterday');

    h.spawns[0].child.stderr.emit('data', NOT_FOUND);
    h.spawns[0].child.emit('exit', 1);

    assert.equal(h.spawns.length, 2, 'the turn is retried rather than failed');

    const retry = h.flagOf(1);
    assert.equal(retry.flag, '--session-id', 'a session the engine lacks must be created');
    assert.notEqual(retry.id, STORED, 'and it cannot reuse the id the engine refused');

    // The founder is told that the advisor is answering without memory of the
    // earlier turns. Continuing quietly would be the false-confidence failure.
    assert.ok(
      h.notices().some((notice) => /without memory of the earlier turns/i.test(notice.message)),
      'the loss of continuity is stated plainly'
    );

    // The engine's own refusal text is not shown as well: the cockpit explains the
    // fault in its own words rather than handing over raw diagnostics.
    assert.ok(
      !h.notices().some((notice) => /no conversation found/i.test(notice.message)),
      'the raw refusal is not surfaced'
    );
    assert.deepEqual(h.errors(), [], 'a recovered turn reports no error');

    assert.equal(
      h.spawns[1].child.stdin.written,
      h.spawns[0].child.stdin.written,
      'the resend is byte-identical to the original send'
    );
  });
});

test('a session the engine already holds is reattached on the same id', async () => {
  await withHarness(async (h) => {
    const { sessionId } = await h.runtime.open({ workspacePath: '/workspace' });
    await h.runtime.send('hello');

    h.spawns[0].child.stderr.emit('data', ALREADY_IN_USE(sessionId));
    h.spawns[0].child.emit('exit', 1);

    assert.equal(h.spawns.length, 2);
    assert.deepEqual(
      h.flagOf(1),
      { flag: '--resume', id: sessionId },
      'continuing the session is what was wanted; the id is kept'
    );

    // No context is lost here, so this is worded as a correction, not a warning
    // about forgotten history.
    assert.ok(h.notices().some((notice) => /reattached/i.test(notice.message)));
    assert.ok(
      !h.notices().some((notice) => /without memory/i.test(notice.message)),
      'nothing was forgotten, so nothing is claimed to have been'
    );
    assert.deepEqual(h.errors(), []);
  });
});

test('recovery is attempted at most once per turn', async () => {
  await withHarness(async (h) => {
    await h.runtime.open({ workspacePath: '/workspace', resumeSessionId: STORED });
    await h.runtime.send('question');

    h.spawns[0].child.stderr.emit('data', NOT_FOUND);
    h.spawns[0].child.emit('exit', 1);
    assert.equal(h.spawns.length, 2);

    // The retry fails the same way. A second recovery would be a respawn loop
    // spending the founder's tokens on an unanswerable turn.
    h.spawns[1].child.stderr.emit('data', ALREADY_IN_USE(h.flagOf(1).id));
    h.spawns[1].child.emit('exit', 1);

    assert.equal(h.spawns.length, 2, 'no third attempt');
    assert.ok(
      h.errors().some((error) => /exited with code 1/.test(error.message)),
      'the failure is reported once recovery is exhausted'
    );
  });
});

test('a cancelled turn is never resent', async () => {
  await withHarness(async (h) => {
    await h.runtime.open({ workspacePath: '/workspace' });
    await h.runtime.send('count to a thousand');

    await h.runtime.cancel();
    assert.ok(h.spawns[0].child.killed);

    // The kill lands and the child exits non-zero — which must not be mistaken
    // for a mid-flight death and resend a turn the founder just interrupted.
    h.spawns[0].child.emit('exit', 1);

    assert.equal(h.spawns.length, 1);
    assert.deepEqual(h.errors(), []);
    assert.equal(
      h.events.filter((event) => event.kind === 'turn-complete').length,
      1,
      'cancellation closes the turn exactly once'
    );
  });
});

test('a turn that reached its own conclusion is not recovered from', async () => {
  await withHarness(async (h) => {
    await h.runtime.open({ workspacePath: '/workspace' });
    await h.runtime.send('a question');

    // Terminal result first, then a non-zero exit. The turn already reported its
    // own outcome; repeating it as an exit code would say the same thing twice.
    h.spawns[0].child.stdout.emit('data', RESULT_LINE);
    h.spawns[0].child.emit('exit', 1);

    assert.equal(h.spawns.length, 1, 'a completed turn is not retried');
    assert.deepEqual(h.errors(), []);
    assert.ok(h.events.some((event) => event.kind === 'turn-complete'));
  });
});
