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
import { existsSync } from 'node:fs';
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

  /* -------------------------------------------------------- runtime present */
  console.log('\n[1] runtime detection');
  {
    const { runtime } = collector();
    const available = await runtime.isAvailable();
    check('runtime is available', available === true);
    const diag = await runtime.getDiagnostics();
    check('transport version is v1', diag.transportVersion === 'v1', diag.transportVersion);
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

main().catch((error) => {
  console.error('harness error:', error);
  process.exit(1);
});
