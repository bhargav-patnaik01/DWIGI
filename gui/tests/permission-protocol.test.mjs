/**
 * NATIVE PERMISSION PROTOCOL — TRANSPORT REGRESSION TESTS
 *
 * These drive the real `ClaudeCliRuntime` — real `spawn`, real shell, real
 * pipes, real NDJSON — against a scripted fake CLI placed on PATH. Nothing
 * above the process boundary is mocked.
 *
 * That choice is the point. The defect these tests exist to prevent was a
 * misplaced `child.stdin.end()`, and every form of mocking that replaces the
 * child process also replaces the bug. A test suite that stubbed `spawn` would
 * have passed against the broken implementation.
 *
 * Costs nothing and needs no network or API key: the fake speaks the protocol,
 * not the model.
 *
 *   npm test
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_DIR = path.join(HERE, 'fake-runtime');

const { ClaudeCliRuntime } = require('../dist-electron/electron/bridge/claude-cli.js');

let workspace;

before(() => {
  // The fake must win the PATH lookup for `claude` / `claude.cmd`.
  process.env.PATH = `${FAKE_DIR}${path.delimiter}${process.env.PATH}`;
  workspace = mkdtempSync(path.join(tmpdir(), 'dwigi-perm-'));
});

after(() => {
  // Best effort. On Windows a just-killed child can still hold a log handle for
  // a moment, and failing the whole file over a temp directory would report a
  // cleanup hiccup as a protocol regression.
  if (!workspace || !existsSync(workspace)) return;
  try {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.error(`  (left ${workspace} behind: ${error.code ?? error.message})`);
  }
});

/** Fresh runtime, fresh scenario, fresh observation log. */
function harness(scenario) {
  const log = path.join(workspace, `log-${scenario}-${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(log, '');
  process.env.FAKE_SCENARIO = scenario;
  process.env.FAKE_LOG = log;

  const events = [];
  const runtime = new ClaudeCliRuntime((event) => events.push(event));

  const observations = () =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

  return { runtime, events, observations };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for a predicate over the event list, or give up. */
async function until(events, predicate, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate(events)) return true;
    await sleep(25);
  }
  return false;
}

const firstOf = (events, kind) => events.find((e) => e.kind === kind);
const countOf = (events, kind) => events.filter((e) => e.kind === kind).length;

/* -------------------------------------------------------------------------- */

test('the runtime is spawned with the native permission channel and no allowlist', async () => {
  const { runtime, events, observations } = harness('plain');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('hello');
  await until(events, (e) => e.some((x) => x.kind === 'turn-complete'));
  await runtime.close();

  const flags = observations().find((o) => o.event === 'flags');
  assert.ok(flags, 'the fake never started');
  assert.equal(flags.permissionPromptTool, 'stdio', '--permission-prompt-tool stdio missing');
  assert.equal(flags.allowedTools, false, '--allowedTools must not be passed: it pre-approves');
  assert.equal(flags.inputFormat, 'stream-json');
});

/**
 * THE REGRESSION THIS SPRINT EXISTS FOR.
 *
 * v1 closed stdin immediately after the user message, which destroyed the
 * channel the permission question arrives on. The fake records whether stdin
 * was open at the moment it asked; if it was not, the old bug is back.
 */
test('stdin stays open while the engine is asking', async () => {
  const { runtime, events, observations } = harness('one-permission');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('write a file');

  const asked = await until(events, (e) => e.some((x) => x.kind === 'permission-request'));
  assert.ok(asked, 'no permission-request was emitted');

  const ask = observations().find((o) => o.event === 'ask');
  assert.ok(ask, 'the engine never got to ask');
  assert.equal(ask.stdinOpen, true, 'stdin was closed before the question could be asked');
  assert.equal(
    observations().some((o) => o.event === 'ask-on-closed-stdin'),
    false,
    'the v1 stdin.end() regression is back'
  );

  const request = firstOf(events, 'permission-request');
  await runtime.respondToPermission(request.requestId, 'allow');
  await until(events, (e) => e.some((x) => x.kind === 'turn-complete'));
  await runtime.close();
});

test('stdin closes only after the turn completes', async () => {
  const { runtime, events, observations } = harness('one-permission');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('write a file');

  await until(events, (e) => e.some((x) => x.kind === 'permission-request'));
  const request = firstOf(events, 'permission-request');
  await runtime.respondToPermission(request.requestId, 'allow');
  await until(events, (e) => e.some((x) => x.kind === 'turn-complete'));
  await sleep(300);

  const seen = observations();
  const finished = seen.find((o) => o.event === 'turn-finished');
  const ended = seen.find((o) => o.event === 'stdin-end');

  assert.ok(finished, 'the fake never finished its turn');
  assert.equal(
    finished.stdinEndedBeforeFinish,
    false,
    'stdin was closed before the turn finished'
  );
  assert.ok(ended, 'stdin was never closed — the child would hang forever');
  await runtime.close();
});

test('allow completes the tool inside the same turn, with no retry or respawn', async () => {
  const { runtime, events, observations } = harness('one-permission');
  await runtime.open({ workspacePath: workspace });
  const { turnId } = await runtime.send('write a file');

  await until(events, (e) => e.some((x) => x.kind === 'permission-request'));
  const request = firstOf(events, 'permission-request');
  assert.equal(request.turnId, turnId, 'the request belongs to a different turn');

  await runtime.respondToPermission(request.requestId, 'allow');
  await until(events, (e) => e.some((x) => x.kind === 'turn-complete'));
  await sleep(200);

  const seen = observations();
  assert.equal(
    seen.filter((o) => o.event === 'spawn').length,
    1,
    'the runtime was spawned more than once: this is the retry that was removed'
  );
  assert.equal(
    seen.find((o) => o.event === 'decision').allowed,
    true,
    'the allow decision did not reach the engine'
  );
  assert.equal(
    countOf(events, 'turn-started'),
    1,
    'a second turn was started: allow must not open a new turn'
  );
  assert.equal(countOf(events, 'turn-complete'), 1, 'the turn completed more than once');
  await runtime.close();
});

test('deny suppresses the tool and is not reported twice', async () => {
  const { runtime, events, observations } = harness('one-permission');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('write a file');

  await until(events, (e) => e.some((x) => x.kind === 'permission-request'));
  const request = firstOf(events, 'permission-request');
  await runtime.respondToPermission(request.requestId, 'deny');
  await until(events, (e) => e.some((x) => x.kind === 'turn-complete'));
  await sleep(200);

  const decision = observations().find((o) => o.event === 'decision');
  assert.equal(decision.allowed, false, 'the deny did not reach the engine');
  assert.equal(
    observations().filter((o) => o.event === 'spawn').length,
    1,
    'deny must not respawn anything'
  );
  assert.equal(
    countOf(events, 'permission-denied'),
    0,
    'the founder was told about their own decision as though it were news'
  );
  await runtime.close();
});

test('answering the same request twice is a no-op, not a fault', async () => {
  const { runtime, events, observations } = harness('one-permission');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('write a file');

  await until(events, (e) => e.some((x) => x.kind === 'permission-request'));
  const request = firstOf(events, 'permission-request');

  // Double-click, then a contradictory late answer.
  await runtime.respondToPermission(request.requestId, 'allow');
  await runtime.respondToPermission(request.requestId, 'allow');
  await runtime.respondToPermission(request.requestId, 'deny');
  await runtime.respondToPermission('req_does_not_exist', 'allow');

  await until(events, (e) => e.some((x) => x.kind === 'turn-complete'));
  await sleep(200);

  const answers = observations().filter((o) => o.event === 'control_response');
  assert.equal(answers.length, 1, `expected exactly one answer on the wire, got ${answers.length}`);
  assert.equal(answers[0].body.behavior, 'allow', 'a later answer overwrote the first');
  await runtime.close();
});

test('two requests in one turn are answered independently and in order', async () => {
  const { runtime, events, observations } = harness('two-permissions');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('do two things');

  await until(events, (e) => e.some((x) => x.kind === 'permission-request'));
  const first = firstOf(events, 'permission-request');
  await runtime.respondToPermission(first.requestId, 'allow');

  await until(events, (e) => e.filter((x) => x.kind === 'permission-request').length === 2);
  const second = events.filter((e) => e.kind === 'permission-request')[1];
  assert.notEqual(second.requestId, first.requestId, 'the same request was asked twice');
  assert.equal(second.tool, 'Bash');
  await runtime.respondToPermission(second.requestId, 'deny');

  await until(events, (e) => e.some((x) => x.kind === 'turn-complete'));
  await sleep(200);

  const decisions = observations().filter((o) => o.event === 'decision');
  assert.deepEqual(
    decisions.map((d) => [d.requestId, d.allowed]),
    [
      ['req_1', true],
      ['req_2', false],
    ],
    'decisions were mismatched to requests'
  );
  assert.equal(observations().filter((o) => o.event === 'spawn').length, 1);
  await runtime.close();
});

/**
 * A control request this bridge does not implement must still be answered.
 *
 * Silence would hang the engine. Failing closed — an explicit deny plus a
 * visible notice — is the only degradation that neither stalls nor guesses.
 */
test('an unrecognised control request is refused rather than dropped', async () => {
  const { runtime, events, observations } = harness('unknown-control');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('trigger something unknown');

  const finished = await until(events, (e) => e.some((x) => x.kind === 'turn-complete'));
  assert.ok(finished, 'the turn hung on an unrecognised control request');

  const answer = observations().find((o) => o.event === 'control_response');
  assert.ok(answer, 'nothing was written back: the engine would block forever');
  assert.equal(answer.body.behavior, 'deny', 'an unknown request must fail closed');

  assert.equal(
    countOf(events, 'permission-request'),
    0,
    'the founder was asked to authorise something the cockpit cannot describe'
  );
  assert.ok(firstOf(events, 'runtime-notice'), 'the degradation was silent');
  await runtime.close();
});

/**
 * The escape hatch. There is deliberately no auto-deny timeout — answering on
 * the founder's behalf is forbidden — so cancellation is the only way out of an
 * unanswered prompt, and it must be complete.
 */
test('cancel ends an unanswered request cleanly and leaves no process behind', async () => {
  const { runtime, events } = harness('hang');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('ask and never finish');

  await until(events, (e) => e.some((x) => x.kind === 'permission-request'));
  const before = await runtime.getDiagnostics();
  assert.equal(before.pendingPermissionCount, 1, 'the request was not tracked as outstanding');
  assert.equal(before.connected, true);

  await runtime.cancel();
  await sleep(500);

  const after = await runtime.getDiagnostics();
  assert.equal(after.connected, false, 'the child process was left running');
  assert.equal(after.pendingPermissionCount, 0, 'an unanswerable request was left outstanding');
  assert.ok(firstOf(events, 'turn-complete'), 'cancel did not close the turn');
  assert.equal(
    countOf(events, 'turn-started'),
    1,
    'cancel resent the turn instead of ending it'
  );
  await runtime.close();
});

test('an unanswered request blocks rather than resolving itself', async () => {
  const { runtime, events, observations } = harness('hang');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('ask and never finish');

  await until(events, (e) => e.some((x) => x.kind === 'permission-request'));
  // Long enough that any implicit timeout would have fired.
  await sleep(2000);

  assert.equal(
    observations().filter((o) => o.event === 'control_response').length,
    0,
    'something answered on the founder behalf: invariant 4 violated'
  );
  assert.equal(countOf(events, 'turn-complete'), 0, 'the turn ended without an answer');

  const diag = await runtime.getDiagnostics();
  assert.equal(diag.pendingPermissionCount, 1);

  await runtime.cancel();
  await runtime.close();
});

/**
 * Holding stdin open makes an abandoned child immortal.
 *
 * Print mode exits on end-of-input. Before this sprint an abandoned turn closed
 * its own stdin and died; now nothing would ever close it, so an overlapping
 * send would leak a process per call — and both children would write into the
 * same stdout buffer, closing the wrong stdin and interleaving two turns.
 */
test('starting a turn while one is in flight abandons the first cleanly', async () => {
  const { runtime, events, observations } = harness('hang');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('ask and never finish');
  await until(events, (e) => e.some((x) => x.kind === 'permission-request'));

  // The interface does not permit this; the transport must survive it anyway.
  await runtime.send('a second question');
  await until(events, (e) => e.filter((x) => x.kind === 'permission-request').length === 2);

  assert.equal(
    observations().filter((o) => o.event === 'spawn').length,
    2,
    'expected exactly one spawn per send'
  );
  assert.equal(countOf(events, 'turn-started'), 2, 'the second turn did not start');

  /*
   * The replacement's request is answerable; the abandoned one is not.
   *
   * Both children run the same script and therefore mint the same correlation
   * token, so a count cannot tell them apart — the map is keyed by token and
   * holds one entry either way. What distinguishes them is where the answer
   * lands: it must reach the live process and no other.
   */
  const second = events.filter((e) => e.kind === 'permission-request')[1];
  await runtime.respondToPermission(second.requestId, 'allow');
  await sleep(400);

  const seen = observations();
  const secondSpawnAt = seen.findIndex(
    (o, i) => o.event === 'spawn' && seen.slice(0, i).some((p) => p.event === 'spawn')
  );
  const answersAfterRespawn = seen
    .slice(secondSpawnAt)
    .filter((o) => o.event === 'control_response');
  assert.equal(
    answersAfterRespawn.length,
    1,
    'the answer did not reach the live child'
  );
  assert.equal(
    seen.filter((o) => o.event === 'control_response').length,
    1,
    'something was written to the abandoned child'
  );

  /*
   * The replacement must still be reachable by `cancel()`.
   *
   * The abandoned child's `exit` fires asynchronously, after the replacement
   * has spawned. An exit handler that clears shared state unconditionally
   * nulls the reference to the LIVE child, and both `cancel()` and `close()`
   * begin `if (!this.child) return` — so the running process becomes
   * unkillable and leaks forever, because stdin is deliberately held open for
   * the whole turn.
   *
   * This is asserted on `connected` rather than on a process count because it
   * is the transport's own reachability that breaks first.
   */
  await sleep(600); // let the abandoned child's exit event land
  const mid = await runtime.getDiagnostics();
  assert.equal(
    mid.connected,
    true,
    'the dead child’s exit cleared the reference to the live one'
  );

  await runtime.close();
  await sleep(300);
  const after = await runtime.getDiagnostics();
  assert.equal(after.connected, false, 'a child process was left running');
});

test('closing the session releases an outstanding request', async () => {
  const { runtime, events } = harness('hang');
  await runtime.open({ workspacePath: workspace });
  await runtime.send('ask and never finish');
  await until(events, (e) => e.some((x) => x.kind === 'permission-request'));

  await runtime.close();
  await sleep(300);

  const diag = await runtime.getDiagnostics();
  assert.equal(diag.pendingPermissionCount, 0, 'close left a request outstanding');
  assert.equal(diag.connected, false);
});
