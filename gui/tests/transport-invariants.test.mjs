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

/**
 * Replay a captured stream through the real parser exactly as the runtime does.
 *
 * `adjudicated` names tool calls this cockpit is pretending to have answered
 * itself, which is what suppresses a duplicate denial notice for a decision the
 * founder already made.
 */
function replay(file, { adjudicated = [] } = {}) {
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  const answered = new Set(adjudicated);
  const state = { textIndex: null };
  const events = [];
  const sightings = [];

  for (const line of lines) {
    const { events: produced } = toAdvisorEvents(JSON.parse(line), {
      turnId: 'test-turn',
      state,
      onControlRequest: (sighting) => sightings.push(sighting),
      wasAdjudicated: (id) => answered.has(id),
    });
    events.push(...produced);
  }

  return { events, sightings, lineCount: lines.length };
}

/** Parse one frame in isolation, collecting both events and control sightings. */
function parseOne(raw, { adjudicated = [], state = { textIndex: null } } = {}) {
  const answered = new Set(adjudicated);
  const sightings = [];
  const { events } = toAdvisorEvents(raw, {
    turnId: 't',
    state,
    onControlRequest: (sighting) => sightings.push(sighting),
    wasAdjudicated: (id) => answered.has(id),
  });
  return { events, sightings };
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

  for (const shape of [
    null,
    42,
    'string',
    {},
    { type: 'totally_unknown_event' },
    { type: 'system', subtype: 'init' },
    { type: 'stream_event', event: { type: 'unknown_inner' } },
  ]) {
    const { events } = parseOne(shape, { state });
    assert.deepEqual(events, [], `expected no events for ${JSON.stringify(shape)}`);
  }
});

/* -------------------------------------------------------------------------- */
/* Native permission protocol                                                  */
/* -------------------------------------------------------------------------- */

/** The shape the runtime actually sends, captured from CLI 2.1.220. */
function canUseTool(overrides = {}) {
  return {
    type: 'control_request',
    request_id: 'req_1',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'Write',
      display_name: 'Write',
      tool_use_id: 'toolu_abc',
      input: { file_path: 'C:\\sandbox\\probe.txt', content: 'GRANTED' },
      ...overrides,
    },
  };
}

test('a can_use_tool control request becomes a blocking permission-request', () => {
  const { events, sightings } = parseOne(canUseTool());

  const request = events.find((e) => e.kind === 'permission-request');
  assert.ok(request, 'no permission-request event');
  assert.equal(request.requestId, 'req_1', 'runtime token must be echoed verbatim');
  assert.equal(request.tool, 'Write');
  assert.equal(request.category, 'write');
  assert.deepEqual(request.targets, ['C:\\sandbox\\probe.txt']);
  assert.equal(request.detail, 'GRANTED');

  assert.equal(sightings.length, 1, 'the transport was not told about the request');
  assert.equal(sightings[0].understood, true);
  assert.equal(sightings[0].toolUseId, 'toolu_abc');
});

test('the request id is the runtime token, never a fabricated one', () => {
  const { events } = parseOne(canUseTool({}));
  const request = events.find((e) => e.kind === 'permission-request');
  // A minted id would resolve nothing and leave the engine blocked forever.
  assert.equal(request.requestId, 'req_1');
});

test('a Bash request exposes the command it would run', () => {
  const { events } = parseOne(
    canUseTool({
      tool_name: 'Bash',
      input: { command: 'rm -rf build', description: 'Clean build output' },
    })
  );
  const request = events.find((e) => e.kind === 'permission-request');
  assert.equal(request.tool, 'Bash');
  assert.equal(request.category, 'run');
  assert.equal(request.detail, 'rm -rf build');
  // The founder must be able to read the command before authorising it.
  assert.ok(request.targets.includes('rm -rf build'));
});

/**
 * THE DEADLOCK GUARD.
 *
 * The runtime blocks on every control request. A malformed one that produced no
 * event AND no sighting would be silently dropped, and the turn would hang with
 * nothing on screen to explain it. The parser must always report the sighting,
 * so the transport can refuse explicitly.
 */
test('a malformed control request is still reported so it can be answered', () => {
  const cases = [
    { label: 'no tool name', frame: canUseTool({ tool_name: undefined }) },
    { label: 'unknown subtype', frame: canUseTool({ subtype: 'some_future_thing' }) },
    {
      label: 'no request id',
      frame: { type: 'control_request', request: { subtype: 'can_use_tool', tool_name: 'Write' } },
    },
  ];

  for (const { label, frame } of cases) {
    const { events, sightings } = parseOne(frame);
    assert.equal(sightings.length, 1, `${label}: transport was not notified`);
    assert.equal(sightings[0].understood, false, `${label}: should not be understood`);
    assert.equal(
      events.filter((e) => e.kind === 'permission-request').length,
      0,
      `${label}: must not ask the founder to authorise something it cannot describe`
    );
  }
});

test('multiple control requests in one turn each produce their own event', () => {
  const first = parseOne(canUseTool({ tool_use_id: 'toolu_1' }));
  const second = parseOne({
    ...canUseTool({ tool_name: 'Edit', tool_use_id: 'toolu_2' }),
    request_id: 'req_2',
  });

  assert.equal(first.events[0].requestId, 'req_1');
  assert.equal(second.events[0].requestId, 'req_2');
  assert.equal(first.sightings[0].toolUseId, 'toolu_1');
  assert.equal(second.sightings[0].toolUseId, 'toolu_2');
});

/**
 * A denial the founder made themselves must not be reported back to them as
 * news. They answered the question; the tool result is the consequence.
 */
test('a refusal this cockpit adjudicated does not also surface as a notice', () => {
  const refusal = {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          content: 'The founder declined this action.',
          is_error: true,
          tool_use_id: 'toolu_abc',
        },
      ],
    },
    tool_result_meta: [{ id: 'toolu_abc', non_execution_kind: 'user-rejected' }],
  };

  const answered = parseOne(refusal, { adjudicated: ['toolu_abc'] });
  assert.equal(
    answered.events.filter((e) => e.kind === 'permission-denied').length,
    0,
    'the founder was told twice about one decision'
  );

  // The activity still resolves, so the timeline does not strand a spinner.
  const activity = answered.events.find((e) => e.kind === 'activity');
  assert.ok(activity);
  assert.equal(activity.state, 'failed');
});

/**
 * A refusal the engine issued on its own authority — a deny rule, a classifier —
 * never reached a dialog, so it must still surface or the founder sees only an
 * opaque tool failure.
 */
test('a refusal the engine made on its own still surfaces as a notice', () => {
  const refusal = {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          content: "Claude requested permissions to write to C:\\sandbox\\probe.txt, but you haven't granted it yet.",
          is_error: true,
          tool_use_id: 'toolu_rule',
        },
      ],
    },
    tool_result_meta: [{ id: 'toolu_rule', non_execution_kind: 'user-rejected' }],
  };

  const { events } = parseOne(refusal);
  const denied = events.find((e) => e.kind === 'permission-denied');
  assert.ok(denied, 'engine-side denial was swallowed');
  assert.equal(denied.tool, 'Write');
  assert.ok(denied.targets.length > 0, 'no target path extracted');
  // v2 removed the handle: there is nothing to answer on a notice.
  assert.equal(denied.requestId, undefined);
});

/** An ordinary tool failure must NOT be mistaken for a permission refusal. */
test('a non-refusal tool error does not produce permission-denied', () => {
  const { events } = parseOne({
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
  });

  assert.equal(events.filter((e) => e.kind === 'permission-denied').length, 0);
  const activity = events.find((e) => e.kind === 'activity');
  assert.ok(activity);
  assert.equal(activity.state, 'failed');
});
