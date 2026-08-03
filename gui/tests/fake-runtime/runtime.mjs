#!/usr/bin/env node
/**
 * A scripted stand-in for the Claude Code CLI.
 *
 * ---------------------------------------------------------------------------
 * WHY A FAKE BINARY RATHER THAN A MOCKED TRANSPORT
 * ---------------------------------------------------------------------------
 * The bug this sprint fixed was `child.stdin.end()` in the wrong place. A test
 * that mocked the transport, or stubbed `spawn`, would not have caught it —
 * the defect lived precisely in the real process plumbing that a mock replaces.
 *
 * So this is a real executable, resolved from PATH, spawned by the real
 * `ClaudeCliRuntime` through the real shell, speaking the real NDJSON wire
 * format over real pipes. Everything above the process boundary is production
 * code. Only the model is fake.
 *
 * It also *reports back* on the thing under test: whether stdin was still open
 * when the permission question was asked. That observation is impossible to
 * make from inside the transport, which is why it is made from out here.
 *
 * ---------------------------------------------------------------------------
 * PROTOCOL IMPLEMENTED
 * ---------------------------------------------------------------------------
 * Faithful to CLI 2.1.220 as captured during the V1.1 architecture review:
 *
 *   out  {"type":"control_request","request_id":…,"request":{"subtype":"can_use_tool",…}}
 *   in   {"type":"control_response","response":{"subtype":"success","request_id":…,
 *                                               "response":{"behavior":"allow"|"deny"}}}
 *
 * The engine BLOCKS between those two frames. This fake blocks too — that is
 * the property the tests assert on.
 *
 * Scenario is selected by FAKE_SCENARIO; observations are appended to the JSONL
 * file named by FAKE_LOG.
 */

import { appendFileSync } from 'node:fs';

const SCENARIO = process.env.FAKE_SCENARIO ?? 'plain';
const LOG = process.env.FAKE_LOG;

const record = (entry) => {
  if (!LOG) return;
  appendFileSync(LOG, `${JSON.stringify({ ...entry, at: Date.now() })}\n`);
};

/* `--version` is probed by `detectVersion` before any turn. */
if (process.argv.includes('--version')) {
  process.stdout.write('2.1.220 (Claude Code)\n');
  process.exit(0);
}

record({ event: 'spawn', argv: process.argv.slice(2), scenario: SCENARIO });

/**
 * Did the host ask for the native permission channel?
 *
 * Recorded rather than enforced, so a test can assert on the exact flag pair
 * instead of merely observing that things happened to work.
 */
const args = process.argv.slice(2);
const promptToolIndex = args.indexOf('--permission-prompt-tool');
record({
  event: 'flags',
  permissionPromptTool: promptToolIndex === -1 ? null : args[promptToolIndex + 1],
  allowedTools: args.includes('--allowedTools'),
  inputFormat: args[args.indexOf('--input-format') + 1] ?? null,
});

const write = (frame) => process.stdout.write(`${JSON.stringify(frame)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------- stdin */

let stdinEnded = false;
let stdinEndedAt = null;
const waiters = new Map();

process.stdin.setEncoding('utf8');

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      record({ event: 'unparseable-input', line: line.slice(0, 200) });
      continue;
    }

    if (msg.type === 'control_response') {
      const id = msg.response?.request_id;
      record({ event: 'control_response', requestId: id, body: msg.response?.response });
      const resolve = waiters.get(id);
      if (resolve) {
        waiters.delete(id);
        resolve(msg.response?.response ?? {});
      }
      continue;
    }

    if (msg.type === 'user') {
      record({ event: 'user-message' });
      continue;
    }
  }
});

process.stdin.on('end', () => {
  stdinEnded = true;
  stdinEndedAt = Date.now();
  record({ event: 'stdin-end' });
  /*
   * EOF means exit, in every scenario including `hang`.
   *
   * Print mode behaves this way, and the harness depends on it: this script is
   * a grandchild behind a `.cmd` shim, so killing the shim does not reach it.
   * End-of-input is the one signal that always arrives, and without acting on
   * it the fake outlives the test run and holds its log file open.
   */
  setTimeout(() => process.exit(0), 30);
});

/**
 * Ask permission and block until answered — the whole point of the exercise.
 *
 * If stdin is already closed there is no channel to be answered on, so this
 * reproduces the real runtime's failure rather than hiding it: it records the
 * closure and reports the abort exactly as CLI 2.1.220 does.
 */
async function ask(requestId, request) {
  if (stdinEnded) {
    record({ event: 'ask-on-closed-stdin', requestId });
    return { behavior: 'deny', message: 'Tool permission request failed: AbortError: Stream closed' };
  }

  record({ event: 'ask', requestId, stdinOpen: true });
  write({ type: 'control_request', request_id: requestId, request });

  return new Promise((resolve) => {
    waiters.set(requestId, resolve);
    // A poll rather than a timeout: the engine really does wait forever, and a
    // test that needs to observe "still blocked" must be able to.
    const poll = setInterval(() => {
      if (!waiters.has(requestId)) clearInterval(poll);
      if (stdinEnded && waiters.has(requestId)) {
        clearInterval(poll);
        waiters.delete(requestId);
        record({ event: 'ask-abandoned', requestId });
        resolve({ behavior: 'deny', message: 'Stream closed' });
      }
    }, 25);
  });
}

const toolUse = (id, name, input) => ({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
});

const toolResult = (id, content, isError) => ({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }],
  },
  ...(isError ? { tool_result_meta: [{ id, non_execution_kind: 'user-rejected' }] } : {}),
});

const result = (text) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: text,
  duration_api_ms: 10,
  num_turns: 1,
  total_cost_usd: 0,
});

/* --------------------------------------------------------------- scenarios */

async function main() {
  // Let the host's user message land first, as the real runtime would.
  await sleep(60);

  switch (SCENARIO) {
    case 'plain': {
      write({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'ACK' }] },
      });
      write(result('ACK'));
      break;
    }

    case 'one-permission': {
      write(toolUse('toolu_1', 'Write', { file_path: 'probe.txt', content: 'GRANTED' }));
      const decision = await ask('req_1', {
        subtype: 'can_use_tool',
        tool_name: 'Write',
        display_name: 'Write',
        tool_use_id: 'toolu_1',
        input: { file_path: 'probe.txt', content: 'GRANTED' },
      });
      const allowed = decision.behavior === 'allow';
      record({ event: 'decision', requestId: 'req_1', allowed });
      write(toolResult('toolu_1', allowed ? 'File created' : decision.message, !allowed));
      write(result(allowed ? 'Wrote the file.' : 'Did not write the file.'));
      break;
    }

    case 'two-permissions': {
      write(toolUse('toolu_1', 'Write', { file_path: 'a.txt', content: 'A' }));
      write(toolUse('toolu_2', 'Bash', { command: 'echo hi', description: 'Say hi' }));

      const first = await ask('req_1', {
        subtype: 'can_use_tool',
        tool_name: 'Write',
        tool_use_id: 'toolu_1',
        input: { file_path: 'a.txt', content: 'A' },
      });
      record({ event: 'decision', requestId: 'req_1', allowed: first.behavior === 'allow' });

      const second = await ask('req_2', {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        tool_use_id: 'toolu_2',
        input: { command: 'echo hi', description: 'Say hi' },
      });
      record({ event: 'decision', requestId: 'req_2', allowed: second.behavior === 'allow' });

      write(toolResult('toolu_1', 'ok', first.behavior !== 'allow'));
      write(toolResult('toolu_2', 'ok', second.behavior !== 'allow'));
      write(result('Both handled.'));
      break;
    }

    case 'unknown-control': {
      // A subtype from a future runtime. The host must still answer it.
      const answer = await ask('req_x', { subtype: 'some_future_request', payload: {} });
      record({ event: 'unknown-answered', answer });
      write(result('Recovered from an unknown control request.'));
      break;
    }

    case 'hang': {
      // Asks, then never finishes. Only cancellation ends this turn.
      write(toolUse('toolu_1', 'Write', { file_path: 'never.txt', content: 'x' }));
      await ask('req_1', {
        subtype: 'can_use_tool',
        tool_name: 'Write',
        tool_use_id: 'toolu_1',
        input: { file_path: 'never.txt', content: 'x' },
      });
      await new Promise(() => {});
      break;
    }

    default:
      write(result('unknown scenario'));
  }

  record({ event: 'turn-finished', stdinEndedBeforeFinish: stdinEnded, stdinEndedAt });

  /*
   * Exit only once the host closes stdin, exactly as print mode does. A fake
   * that exited immediately would mask a host that never closes stdin at all.
   */
  if (stdinEnded) process.exit(0);
  process.stdin.on('end', () => process.exit(0));
}

void main();
