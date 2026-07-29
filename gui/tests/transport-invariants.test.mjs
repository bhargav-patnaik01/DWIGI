/**
 * PERMANENT TRANSPORT REGRESSION TESTS
 *
 * These run against a captured real NDJSON stream rather than a hand-written
 * mock, so they encode verified runtime behaviour rather than assumptions about
 * it. Regenerate the fixture only from a real session; never edit it by hand to
 * make a test pass — that would convert a real regression into a green tick.
 *
 * Costs nothing and requires no network, so it can run on every change.
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

// The production parser, compiled. Not a copy, not a mock.
const { toAdvisorEvents } = require('../dist-electron/electron/bridge/events.js');

const FIXTURE = path.join(HERE, 'fixtures', 'stream-turn.ndjson');

/** Replay a captured stream through the real parser exactly as the runtime does. */
function replay(file) {
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  const state = { textIndex: null };
  const events = [];
  const grants = [];

  for (const line of lines) {
    const { events: produced } = toAdvisorEvents(JSON.parse(line), {
      turnId: 'test-turn',
      state,
      registerGrant: (requestId, tool) => grants.push({ requestId, tool }),
    });
    events.push(...produced);
  }

  return { events, grants, lineCount: lines.length };
}

test('fixture is a real captured stream', () => {
  const { lineCount } = replay(FIXTURE);
  assert.ok(lineCount > 5, `expected a multi-line stream, got ${lineCount}`);
});

/**
 * THE CORE INVARIANT, mandated permanently.
 *
 * Concatenating every streamed text delta must equal the final completed message.
 *
 * Why this specific test earns permanent status: the streaming buffer is what the
 * user reads while waiting, and the completed message is what is stored, copied,
 * and journaled. If they diverge, the interface shows one thing and records
 * another — and because both look plausible, nothing else would catch it. A
 * silently truncated recommendation is worse than a visibly missing one.
 */
test('concatenated deltas equal the final completed message', () => {
  const { events } = replay(FIXTURE);

  const streamed = events
    .filter((e) => e.kind === 'text-delta')
    .map((e) => e.text)
    .join('');

  const completed = events
    .filter((e) => e.kind === 'message-complete')
    .map((e) => e.text)
    .join('');

  assert.ok(streamed.length > 0, 'no text deltas were produced');
  assert.ok(completed.length > 0, 'no completed message was produced');
  assert.equal(
    streamed,
    completed,
    'streamed text diverged from the authoritative completed message'
  );
});

test('a terminal turn-complete is always produced', () => {
  const { events } = replay(FIXTURE);
  const done = events.filter((e) => e.kind === 'turn-complete');
  assert.equal(done.length, 1, `expected exactly one turn-complete, got ${done.length}`);
});

/**
 * Regression guard for a real bug: the terminal event carries `type: "result"`
 * with that field late in the object. An earlier parser matched only
 * `type === undefined`, so no turn ever completed and the UI spinner ran forever.
 */
test('turn-complete carries runtime stats', () => {
  const { events } = replay(FIXTURE);
  const done = events.find((e) => e.kind === 'turn-complete');
  assert.ok(done, 'no turn-complete event');
  assert.ok(done.stats, 'turn-complete carried no stats object');
  assert.equal(typeof done.stats.durationMs, 'number');
  assert.equal(typeof done.stats.turns, 'number');
});

test('no fatal errors are produced from a healthy stream', () => {
  const { events } = replay(FIXTURE);
  const fatal = events.filter((e) => e.kind === 'error' && e.fatal);
  assert.equal(fatal.length, 0, `unexpected fatal errors: ${JSON.stringify(fatal)}`);
});

test('unparseable and unknown shapes are ignored rather than guessed at', () => {
  const state = { textIndex: null };
  const noop = () => {};

  for (const shape of [
    null,
    42,
    'string',
    {},
    { type: 'totally_unknown_event' },
    { type: 'system', subtype: 'init' },
    { type: 'stream_event', event: { type: 'unknown_inner' } },
  ]) {
    const { events } = toAdvisorEvents(shape, {
      turnId: 't',
      state,
      registerGrant: noop,
    });
    assert.deepEqual(events, [], `expected no events for ${JSON.stringify(shape)}`);
  }
});

/**
 * A refusal must surface as `permission-denied` and register a grant handle, so
 * the UI has something to attach the user's decision to.
 */
test('a refused tool call produces permission-denied and registers a grant', () => {
  const state = { textIndex: null };
  const grants = [];

  const refusal = {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          content:
            "Claude requested permissions to write to C:\\sandbox\\probe.txt, but you haven't granted it yet.",
          is_error: true,
          tool_use_id: 'toolu_test',
        },
      ],
    },
    tool_result_meta: [{ id: 'toolu_test', non_execution_kind: 'user-rejected' }],
  };

  const { events } = toAdvisorEvents(refusal, {
    turnId: 't',
    state,
    registerGrant: (requestId, tool) => grants.push({ requestId, tool }),
  });

  const denied = events.find((e) => e.kind === 'permission-denied');
  assert.ok(denied, 'no permission-denied event');
  assert.equal(denied.tool, 'Write');
  assert.ok(denied.targets.length > 0, 'no target path extracted');
  assert.equal(grants.length, 1, 'no grant handle registered');
  assert.equal(grants[0].requestId, denied.requestId);
});

/** An ordinary tool failure must NOT be mistaken for a permission refusal. */
test('a non-refusal tool error does not produce permission-denied', () => {
  const state = { textIndex: null };
  const { events } = toAdvisorEvents(
    {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            content: 'File not found',
            is_error: true,
            tool_use_id: 'toolu_other',
          },
        ],
      },
      tool_result_meta: [],
    },
    { turnId: 't', state, registerGrant: () => {} }
  );

  assert.equal(events.filter((e) => e.kind === 'permission-denied').length, 0);
  const activity = events.find((e) => e.kind === 'activity');
  assert.ok(activity);
  assert.equal(activity.state, 'failed');
});
