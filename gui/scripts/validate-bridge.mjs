#!/usr/bin/env node
/**
 * End-to-end validation of the advisor bridge.
 *
 * Drives the COMPILED production runtime — `dist-electron/electron/bridge/
 * claude-cli.js` — against the disposable sandbox. Nothing is mocked: this is the
 * same spawn, the same NDJSON parser, and the same event translation the GUI uses.
 *
 * It runs in plain Node because the runtime deliberately imports nothing from
 * Electron. That is a design property worth preserving: it keeps the bridge
 * testable without a window, and it is what allows a future Tauri host to reuse
 * it unchanged.
 *
 *   npm run build:electron
 *   node scripts/validate-bridge.mjs
 *
 * Costs real tokens. Points at the sandbox only — never production.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffFingerprints, fingerprintGuarded, GUARDED } from './lib/fingerprint.mjs';

const require = createRequire(import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTION = path.resolve(HERE, '..', '..');

/**
 * The disposable repository this harness drives.
 *
 * Derived as a sibling of the production repository — the same location
 * `make-sandbox.mjs` creates it in — so the harness works on any machine. An
 * absolute path here would have made this script run only on the author's.
 *
 * `EIS_SANDBOX` overrides it, for a sandbox kept somewhere else.
 */
const SANDBOX = process.env.EIS_SANDBOX ?? path.resolve(PRODUCTION, '..', 'eis-sandbox');

/** A path that cannot exist, for the graceful-failure phase. */
const NONEXISTENT = path.join(PRODUCTION, '..', 'eis-nonexistent-workspace-xyz');

/**
 * Run the safety phase and stop.
 *
 * The rest of this harness drives the real runtime and costs real tokens, so the
 * fence around production is worth being able to check on its own — and worth
 * checking after any change to the fence itself.
 *
 *   node scripts/validate-bridge.mjs --safety-only
 */
const SAFETY_ONLY = process.argv.includes('--safety-only');

/**
 * Run only the native permission phase.
 *
 * The rest of the harness costs tokens on turns that have nothing to do with
 * consent, and the permission path is the one that needs re-running after any
 * change to the transport's stdin handling.
 *
 *   node scripts/validate-bridge.mjs --permissions-only
 */
const PERMISSIONS_ONLY = process.argv.includes('--permissions-only');

/**
 * The fence itself lives in `scripts/lib/fingerprint.mjs` and is exercised by
 * `tests/fingerprint.test.mjs` on every `npm test` — a safety check that only
 * this token-spending harness could reach would be a safety check nobody tests.
 */
const fingerprintProduction = () => fingerprintGuarded(PRODUCTION);

const { ClaudeCliRuntime } = require('../dist-electron/electron/bridge/claude-cli.js');

let pass = 0;
let fail = 0;

function check(label, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function collector() {
  const events = [];
  const runtime = new ClaudeCliRuntime((event) => events.push(event));
  return { runtime, events };
}

/**
 * Answer permission requests as they arrive, recording what happened.
 *
 * `decide` receives the request and returns 'allow' or 'deny'. Timing is
 * captured around each answer because the property under test is not merely
 * that the engine asks — it is that it *waits*, which only a measured gap can
 * demonstrate.
 */
function autoResponder(runtime, events, decide) {
  const seen = new Map();
  const answered = [];
  let stop = false;

  const pump = async () => {
    while (!stop) {
      for (const event of events) {
        if (event.kind !== 'permission-request') continue;
        if (seen.has(event.requestId)) continue;
        seen.set(event.requestId, event);

        const decision = decide(event);
        // A deliberate stall. If the engine were auto-denying rather than
        // blocking, the tool result would already have arrived by now.
        const askedAt = Date.now();
        await new Promise((r) => setTimeout(r, 2500));
        await runtime.respondToPermission(event.requestId, decision);
        answered.push({ request: event, decision, stalledMs: Date.now() - askedAt });
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  void pump();
  return { answered, seen, stop: () => { stop = true; } };
}

function waitForTurnEnd(events, timeoutMs = 180_000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = setInterval(() => {
      const done = events.some((e) => e.kind === 'turn-complete');
      const fatal = events.some((e) => e.kind === 'error' && e.fatal);
      if (done || fatal || Date.now() - started > timeoutMs) {
        clearInterval(tick);
        resolve(done);
      }
    }, 200);
  });
}

async function main() {
  console.log('bridge validation');
  console.log(`sandbox: ${SANDBOX}`);
  console.log('');

  /* ---------------------------------------------------------- safety first */
  console.log('[0] safety');
  check('sandbox exists', existsSync(SANDBOX));
  check(
    'sandbox is NOT the production repository',
    path.resolve(SANDBOX) !== PRODUCTION,
    `${path.resolve(SANDBOX)} vs ${PRODUCTION}`
  );
  const before = fingerprintProduction();
  check(
    'production files fingerprinted for comparison',
    before.size > 0,
    `${before.size} files under ${GUARDED.join('/, ')}/`
  );
  if (fail > 0) {
    console.log('\nsafety checks failed; refusing to run');
    process.exit(1);
  }

  if (SAFETY_ONLY) {
    console.log(`\n${pass} passed, ${fail} failed — safety only, runtime not driven`);
    process.exit(0);
  }

  if (PERMISSIONS_ONLY) {
    await permissionPhase();
    console.log('\n[6] production untouched');
    const untouched = diffFingerprints(before, fingerprintProduction());
    check(
      `production ${GUARDED.join('/, ')}/ byte-identical`,
      untouched.length === 0,
      untouched.join('; ')
    );
    console.log('');
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  }

  /* -------------------------------------------------------- runtime present */
  console.log('\n[1] runtime detection');
  {
    const { runtime } = collector();
    const available = await runtime.isAvailable();
    check('runtime is available', available === true);
    const diag = await runtime.getDiagnostics();
    check('transport version is v2', diag.transportVersion === 'v2', diag.transportVersion);
    check('runtime version detected', typeof diag.runtimeVersion === 'string', String(diag.runtimeVersion));
    check('starts disconnected', diag.connected === false);
    await runtime.close();
  }

  /* -------------------------------------------------- streaming + lifecycle */
  console.log('\n[2] streaming turn');
  const session = collector();
  {
    const { runtime, events } = session;
    const { sessionId } = await runtime.open({ workspacePath: SANDBOX });
    check('open returns a session id', typeof sessionId === 'string' && sessionId.length > 0);

    await runtime.send('Reply with exactly: ACK-ONE. Nothing else.');
    const completed = await waitForTurnEnd(events);

    check('turn completed', completed);
    check('turn-started emitted', events.some((e) => e.kind === 'turn-started'));
    check('text deltas streamed', events.filter((e) => e.kind === 'text-delta').length > 0);
    check('message-complete emitted', events.some((e) => e.kind === 'message-complete'));

    const complete = events.find((e) => e.kind === 'message-complete');
    check(
      'advisor text reached the reducer',
      Boolean(complete && complete.text.length > 0),
      complete ? `"${complete.text.slice(0, 60)}"` : 'none'
    );

    const done = events.find((e) => e.kind === 'turn-complete');
    check('turn-complete carries stats', Boolean(done?.stats), JSON.stringify(done?.stats ?? {}));
    check('no fatal errors', !events.some((e) => e.kind === 'error' && e.fatal));

    // Deltas must arrive in order and reconcile with the authoritative message.
    const streamed = events
      .filter((e) => e.kind === 'text-delta')
      .map((e) => e.text)
      .join('');
    check(
      'streamed text matches complete message',
      Boolean(complete && streamed.trim() === complete.text.trim()),
      `streamed ${streamed.length} chars vs complete ${complete?.text.length ?? 0}`
    );
  }

  /* ------------------------------------------------------------ session resume */
  console.log('\n[3] session resume');
  {
    const { runtime, events } = session;
    events.length = 0;
    await runtime.send('What exact token did you just reply with? Answer in one word.');
    const completed = await waitForTurnEnd(events);
    check('second turn completed', completed);

    const complete = events.find((e) => e.kind === 'message-complete');
    const text = complete?.text ?? '';
    check(
      'context carried across turns (resume works)',
      /ACK-ONE/i.test(text),
      `"${text.slice(0, 80)}"`
    );
    await runtime.close();
  }

  /* ----------------------------------------------------------------- cancel */
  console.log('\n[4] cancellation');
  {
    const { runtime, events } = collector();
    await runtime.open({ workspacePath: SANDBOX });
    await runtime.send('Count slowly from 1 to 40, one number per line.');
    await new Promise((r) => setTimeout(r, 4000));
    await runtime.cancel();
    await new Promise((r) => setTimeout(r, 1500));

    const diag = await runtime.getDiagnostics();
    check('process released after cancel', diag.connected === false);
    check('cancel closed the turn', events.some((e) => e.kind === 'turn-complete'));
    await runtime.close();
  }

  /* ------------------------------------------------------- graceful failure */
  console.log('\n[5] graceful failure');
  {
    const { runtime, events } = collector();
    let threw = false;
    try {
      await runtime.send('this should fail: no session was opened');
    } catch {
      threw = true;
    }
    check('send without open is rejected', threw);

    await runtime.open({ workspacePath: NONEXISTENT });
    await runtime.send('hello');
    await new Promise((r) => setTimeout(r, 8000));
    check(
      'bad workspace surfaces an error event rather than crashing',
      events.some((e) => e.kind === 'error' || e.kind === 'runtime-notice')
    );
    check('harness still alive', true);
    await runtime.close();
  }

  await permissionPhase();

  /* ------------------------------------------------------------ final safety */
  console.log('\n[6] production untouched');
  const changed = diffFingerprints(before, fingerprintProduction());
  check(
    `production ${GUARDED.join('/, ')}/ byte-identical`,
    changed.length === 0,
    changed.join('; ')
  );

  console.log('');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

/**
 * NATIVE PERMISSION HANDSHAKE, against the real runtime.
 *
 * The unit tests drive a scripted fake that speaks the protocol. This phase
 * proves the protocol is the one CLI 2.1.220 actually speaks — that the flag is
 * accepted, that the engine blocks rather than auto-denying, that allow
 * completes the call in the same turn, and that none of it costs a respawn.
 *
 * Everything here writes inside the sandbox and nowhere else; the fingerprint
 * check at the end of the harness is what enforces that.
 */
async function permissionPhase() {
  console.log('\n[5b] native permission handshake');

  const probe = path.join(SANDBOX, 'permission-probe.txt');
  const timings = [];

  /* ------------------------------------------------------- allow: Write */
  {
    const { runtime, events } = collector();
    await runtime.open({ workspacePath: SANDBOX });
    const responder = autoResponder(runtime, events, () => 'allow');

    const started = Date.now();
    await runtime.send(
      `Use the Write tool to create permission-probe.txt in the current directory ` +
        `containing exactly the word GRANTED. Do not ask me anything first.`
    );
    const completed = await waitForTurnEnd(events);
    responder.stop();
    const elapsed = Date.now() - started;

    check('Write: turn completed', completed);
    check(
      'Write: engine asked before acting',
      responder.answered.length > 0,
      `${responder.answered.length} request(s)`
    );

    const first = responder.answered[0];
    check(
      'Write: engine BLOCKED while waiting (did not auto-deny)',
      Boolean(first) && first.stalledMs >= 2000,
      first ? `stalled ${first.stalledMs}ms` : 'never asked'
    );
    check(
      'Write: request named the tool and target',
      Boolean(first) && first.request.tool === 'Write' && first.request.targets.length > 0,
      first ? `${first.request.tool} -> ${first.request.targets.join(', ')}` : 'n/a'
    );
    check(
      'Write: allow executed the call in the SAME turn',
      existsSync(probe),
      existsSync(probe) ? 'file created' : 'file was not created'
    );
    check(
      'Write: exactly one turn (no retry, no restart)',
      events.filter((e) => e.kind === 'turn-started').length === 1,
      `${events.filter((e) => e.kind === 'turn-started').length} turn-started`
    );
    check(
      'Write: no post-hoc denial reported for our own decision',
      events.filter((e) => e.kind === 'permission-denied').length === 0
    );
    timings.push(['Write / allow', elapsed, first?.stalledMs ?? 0]);
    await runtime.close();
  }

  /* -------------------------------------------------------- allow: Edit */
  {
    const { runtime, events } = collector();
    await runtime.open({ workspacePath: SANDBOX });
    const responder = autoResponder(runtime, events, () => 'allow');

    const started = Date.now();
    await runtime.send(
      `Use the Edit tool to change the word GRANTED to EDITED in permission-probe.txt. ` +
        `Do not ask me anything first.`
    );
    const completed = await waitForTurnEnd(events);
    responder.stop();
    const elapsed = Date.now() - started;

    const contents = existsSync(probe) ? readFileSync(probe, 'utf8') : '';
    const asked = responder.answered[0];

    check('Edit: turn completed', completed);
    check('Edit: engine asked before acting', responder.answered.length > 0);
    check(
      'Edit: engine BLOCKED while waiting',
      Boolean(asked) && asked.stalledMs >= 2000,
      asked ? `stalled ${asked.stalledMs}ms` : 'never asked'
    );
    check('Edit: allow applied the edit in the same turn', /EDITED/.test(contents), contents.trim());
    check(
      'Edit: exactly one turn',
      events.filter((e) => e.kind === 'turn-started').length === 1
    );
    timings.push(['Edit / allow', elapsed, asked?.stalledMs ?? 0]);
    await runtime.close();
  }

  /* --------------------------------------------------------- allow: Bash */
  {
    /*
     * The command must genuinely mutate something.
     *
     * An earlier version of this probe used `echo BASH-OK` and recorded a
     * failure when no prompt appeared. That was the probe being wrong, not the
     * transport: the runtime classifies read-only commands as auto-allowed and
     * never routes them to a prompt — in the terminal either. Asserting that a
     * harmless echo prompts would have encoded a demand for behaviour the
     * engine correctly does not have.
     */
    const dir = path.join(SANDBOX, 'bash-probe-dir');
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });

    const { runtime, events } = collector();
    await runtime.open({ workspacePath: SANDBOX });
    const responder = autoResponder(runtime, events, () => 'allow');

    const started = Date.now();
    await runtime.send(
      `Use the Bash tool to run exactly: mkdir bash-probe-dir. Do not use any other ` +
        `tool, and do not ask me anything first.`
    );
    const completed = await waitForTurnEnd(events);
    responder.stop();
    const elapsed = Date.now() - started;

    const asked = responder.answered.find((a) => a.request.tool === 'Bash');

    check('Bash: turn completed', completed);
    check('Bash: engine asked before running', Boolean(asked), `${responder.answered.length} request(s)`);
    check(
      'Bash: engine BLOCKED while waiting',
      Boolean(asked) && asked.stalledMs >= 2000,
      asked ? `stalled ${asked.stalledMs}ms` : 'never asked'
    );
    check(
      'Bash: request exposed the command for review',
      /mkdir bash-probe-dir/.test(asked?.request.detail ?? ''),
      asked?.request.detail ?? 'no detail'
    );
    check(
      'Bash: allow ran the command in the same turn',
      existsSync(dir),
      existsSync(dir) ? 'directory created' : 'directory absent'
    );
    timings.push(['Bash / allow', elapsed, asked?.stalledMs ?? 0]);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    await runtime.close();
  }

  /* ------------------------------------- read-only commands are not asked */
  {
    /*
     * The complement of the phase above, and worth asserting rather than
     * assuming: over-prompting is its own failure. A cockpit that interrupted
     * the founder for every `ls` would train them to click Allow without
     * reading, which is worse than not asking at all.
     */
    const { runtime, events } = collector();
    await runtime.open({ workspacePath: SANDBOX });
    const responder = autoResponder(runtime, events, () => 'allow');

    await runtime.send(
      `Use the Bash tool to run exactly: echo BASH-OK. Report what it printed. ` +
        `Do not ask me anything first.`
    );
    const completed = await waitForTurnEnd(events);
    responder.stop();

    const reply = events.filter((e) => e.kind === 'message-complete').map((e) => e.text).join('\n');
    check('Read-only Bash: turn completed', completed);
    check(
      'Read-only Bash: ran without interrupting the founder',
      responder.answered.length === 0,
      `${responder.answered.length} unnecessary prompt(s)`
    );
    check('Read-only Bash: still executed', /BASH-OK/.test(reply), reply.slice(0, 80));
    await runtime.close();
  }

  /* ------------------------------------------------------ deny suppresses */
  {
    const denied = path.join(SANDBOX, 'must-not-exist.txt');
    if (existsSync(denied)) rmSync(denied);

    const { runtime, events } = collector();
    await runtime.open({ workspacePath: SANDBOX });
    const responder = autoResponder(runtime, events, () => 'deny');

    await runtime.send(
      `Use the Write tool to create must-not-exist.txt containing the word NOPE. ` +
        `Do not ask me anything first.`
    );
    const completed = await waitForTurnEnd(events);
    responder.stop();

    check('Deny: turn completed', completed);
    check('Deny: engine asked first', responder.answered.length > 0);
    check(
      'Deny: the file was NOT written',
      !existsSync(denied),
      existsSync(denied) ? 'FILE EXISTS — deny did not suppress the write' : 'absent'
    );
    check(
      'Deny: no retry was attempted',
      events.filter((e) => e.kind === 'turn-started').length === 1
    );
    await runtime.close();
  }

  /* ------------------------------------- multiple permissions in one turn */
  {
    const a = path.join(SANDBOX, 'multi-a.txt');
    const b = path.join(SANDBOX, 'multi-b.txt');
    for (const f of [a, b]) if (existsSync(f)) rmSync(f);

    const { runtime, events } = collector();
    await runtime.open({ workspacePath: SANDBOX });
    const responder = autoResponder(runtime, events, () => 'allow');

    const started = Date.now();
    await runtime.send(
      `Use the Write tool twice: create multi-a.txt containing A, then multi-b.txt ` +
        `containing B. Do not ask me anything first.`
    );
    const completed = await waitForTurnEnd(events);
    responder.stop();
    const elapsed = Date.now() - started;

    check('Multi: turn completed', completed);
    check(
      'Multi: more than one permission request in a single turn',
      responder.answered.length >= 2,
      `${responder.answered.length} request(s)`
    );
    check(
      'Multi: every request carried a distinct runtime token',
      new Set(responder.answered.map((r) => r.request.requestId)).size ===
        responder.answered.length
    );
    check(
      'Multi: both files written',
      existsSync(a) && existsSync(b),
      `a=${existsSync(a)} b=${existsSync(b)}`
    );
    check(
      'Multi: still exactly one turn and one spawn',
      events.filter((e) => e.kind === 'turn-started').length === 1 &&
        events.filter((e) => e.kind === 'turn-complete').length === 1
    );
    timings.push([`Multi (${responder.answered.length} asks)`, elapsed, 0]);
    await runtime.close();
  }

  console.log('\n  timings (wall clock includes a deliberate 2.5s stall per request)');
  for (const [label, total, stalled] of timings) {
    console.log(
      `    ${label.padEnd(22)} ${String(total).padStart(7)}ms total` +
        (stalled ? `  (${stalled}ms of it blocked on us)` : '')
    );
  }
}

main().catch((error) => {
  console.error('harness error:', error);
  process.exit(1);
});
