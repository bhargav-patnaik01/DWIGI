#!/usr/bin/env node
/**
 * BUSINESS MEMORY MODES — LIVE VALIDATION
 *
 * Drives the COMPILED production transport against the disposable sandbox, in
 * both modes, with identical prompts. Nothing is mocked: the same spawn, the
 * same directive composition, and the same engine the GUI drives.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS CANNOT BE A UNIT TEST
 * ---------------------------------------------------------------------------
 * The unit suite proves the cockpit *sends* `/learning`. It cannot prove the
 * engine *honours* it, because honouring it is prose in `.claude/commands/` and
 * the only interpreter is the model. A mode that composed a perfect directive
 * the engine ignored would pass every offline test and fail the founder on the
 * first question.
 *
 * So the assertion here is behavioural: the sandbox's Business Memory names a
 * synthetic company, and the question is whether the answer knows it.
 *
 *   npm run build:electron
 *   node scripts/validate-memory-modes.mjs
 *
 * Costs real tokens. Points at the sandbox only — never production.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffFingerprints, fingerprintGuarded, GUARDED } from './lib/fingerprint.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTION = path.resolve(HERE, '..', '..');
const SANDBOX = process.env.EIS_SANDBOX ?? path.resolve(PRODUCTION, '..', 'eis-sandbox');

const { ClaudeCliRuntime } = require('../dist-electron/electron/bridge/claude-cli.js');
const {
  councilMode,
  lensMode,
  withMemoryScope,
  directiveFor,
} = require('../dist-electron/shared/runtime-modes.js');

const MEMORY_FILE = path.join(SANDBOX, 'core', 'business_memory.md');
const MEMORY_PARKED = `${MEMORY_FILE}.parked`;

/**
 * Facts that exist only in the sandbox's Business Memory.
 *
 * ---------------------------------------------------------------------------
 * FACTS, NOT THE COMPANY NAME
 * ---------------------------------------------------------------------------
 * An earlier version of this list matched the trading name and its industry —
 * `halyard`, `rigging`, `sailing`. It produced a false failure on a Business
 * Mode answer that was demonstrably grounded: the reply used the apprentice, the
 * two marinas, and the four-inspection ceiling, but wrote "rigger" rather than
 * "rigging" and never named the company. A grounded answer is under no
 * obligation to say who it is about.
 *
 * So the markers are now the *facts* — specifics that cannot be produced by
 * general reasoning and can only have come from reading the record. That is the
 * property actually under test.
 */
const COMPANY_MARKERS = [
  /halyard/i,
  /rigg(er|ing)/i,
  /marina/i,
  /apprentice/i,
  /inspection/i,
  /certif(ied|ication)/i,
];

const POOL = ['ceo', 'cfo', 'coo', 'sales-gtm', 'product', 'coach'];

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

function waitForTurnEnd(events, timeoutMs = 240_000) {
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

/** Run one turn and return the advisor's settled text. */
async function ask(text, mode) {
  const { runtime, events } = collector();
  await runtime.open({ workspacePath: SANDBOX });
  const started = Date.now();
  await runtime.send(text, mode);
  const completed = await waitForTurnEnd(events);
  const elapsed = Date.now() - started;

  const reply = events
    .filter((e) => e.kind === 'message-complete')
    .map((e) => e.text)
    .join('\n');

  const reads = events
    .filter((e) => e.kind === 'activity')
    .map((e) => e.label)
    .filter(Boolean);

  await runtime.close();
  return { completed, reply, reads, elapsed };
}

const hits = (text) => COMPANY_MARKERS.filter((re) => re.test(text)).map((re) => String(re));

/** Did the engine actually open the founder's record during the turn? */
const readMemory = (reads) =>
  reads.some((label) => /business_memory|calibration_journal/i.test(label));

async function main() {
  console.log('business memory modes — live validation');
  console.log(`sandbox: ${SANDBOX}`);
  console.log('');

  /* ---------------------------------------------------------- safety first */
  console.log('[0] safety');
  check('sandbox exists', existsSync(SANDBOX));
  check('sandbox is NOT the production repository', path.resolve(SANDBOX) !== PRODUCTION);
  check('sandbox has the /learning command', existsSync(path.join(SANDBOX, '.claude', 'commands', 'learning.md')));
  check('sandbox Business Memory is the synthetic fixture', existsSync(MEMORY_FILE) && /SYNTHETIC FIXTURE/.test(readFileSync(MEMORY_FILE, 'utf8')));
  const before = fingerprintGuarded(PRODUCTION);
  check('production fingerprinted', before.size > 0, `${before.size} files`);
  if (fail > 0) {
    console.log('\nsafety checks failed; refusing to run');
    process.exit(1);
  }

  /* ------------------------------------------------- the directive composes */
  console.log('\n[1] directive composition');
  const businessMode = withMemoryScope(councilMode(POOL, POOL), 'business');
  const learningMode = withMemoryScope(councilMode(POOL, POOL), 'learning');
  check('Business Mode sends no directive', directiveFor(businessMode) === null);
  check('Learning Mode sends /learning', directiveFor(learningMode) === '/learning');
  check(
    'Learning + narrowed pool composes both',
    directiveFor(withMemoryScope(councilMode(['ceo', 'cfo'], POOL), 'learning')) ===
      '/learning /council ceo,cfo'
  );
  check(
    'Learning + single lens composes both',
    directiveFor(withMemoryScope(lensMode('cfo'), 'learning')) === '/learning /lens cfo'
  );

  /* ------------------------------------------ identical prompt in both modes */
  const PROMPT =
    'In two or three sentences: what is the single biggest risk to this business right now?';

  console.log('\n[2] Business Mode — identical prompt');
  const business = await ask(PROMPT, businessMode);
  check('Business: turn completed', business.completed);
  const businessHits = hits(business.reply);
  check(
    'Business: the answer knows the company',
    businessHits.length > 0,
    businessHits.length ? businessHits.join(', ') : `no marker in "${business.reply.slice(0, 120)}"`
  );
  check(
    'Business: the engine read the founder’s record',
    readMemory(business.reads),
    business.reads.join(' | ').slice(0, 160) || 'no file activity reported'
  );

  console.log('\n[3] Executive Learning — identical prompt');
  const learning = await ask(PROMPT, learningMode);
  check('Learning: turn completed', learning.completed);
  const learningHits = hits(learning.reply);
  check(
    'Learning: the answer does NOT know the company',
    learningHits.length === 0,
    learningHits.length ? `leaked: ${learningHits.join(', ')}` : ''
  );
  check(
    'Learning: the engine did not read the founder’s record',
    !readMemory(learning.reads),
    learning.reads.join(' | ').slice(0, 160)
  );

  /* --------------------------------------- a teaching question, both modes */
  console.log('\n[4] a question with no company in it');
  const TEACH = 'In three sentences, teach me how a CFO decides whether a burn rate is healthy.';
  const taught = await ask(TEACH, learningMode);
  check('Learning: teaching question answered', taught.completed && taught.reply.length > 40);
  check(
    'Learning: answered generally, not about this founder',
    hits(taught.reply).length === 0,
    hits(taught.reply).join(', ')
  );

  /* ------------------------------------------------- onboarding, both modes */
  console.log('\n[5] onboarding with no Business Memory');
  renameSync(MEMORY_FILE, MEMORY_PARKED);
  let learningOnboard;
  let businessOnboard;
  try {
    /*
     * The condition CLAUDE.md §4 and §14 define as first run. Business Mode must
     * still treat it as such; Learning Mode must not, and must not ask the
     * founder to describe a business they may not have.
     */
    learningOnboard = await ask('Teach me how a COO thinks about hiring.', learningMode);
    businessOnboard = await ask('What should I be worrying about this quarter?', businessMode);
  } finally {
    renameSync(MEMORY_PARKED, MEMORY_FILE);
  }

  /*
   * Onboarding is *the engine asking the founder to describe their company*.
   *
   * An earlier version of this pattern also matched `onboard` and `first run`,
   * and flagged a perfectly correct Learning-Mode answer about hiring — where
   * "onboarding a new hire" and "the first run of a process" are simply the
   * right English words. That was the probe being wrong, and it is the exact
   * failure mode a loose marker produces: a real behavioural check reporting a
   * defect that is not there, which is worse than no check at all.
   *
   * Every alternative below is now a phrase that only an intake would produce.
   */
  const ONBOARDING_MARKERS = new RegExp(
    [
      String.raw`tell me about your (business|company)`,
      String.raw`what does your (business|company) do`,
      String.raw`describe your (business|company)`,
      String.raw`set up your business memory`,
      String.raw`before we (begin|start),? (I|let)`,
      String.raw`start by getting to know`,
      String.raw`a few questions about your`,
    ].join('|'),
    'i'
  );

  check('Learning: turn completed with no memory present', learningOnboard.completed);
  check(
    'Learning: onboarding did NOT trigger',
    !ONBOARDING_MARKERS.test(learningOnboard.reply),
    learningOnboard.reply.slice(0, 160)
  );
  check(
    'Learning: answered the question that was asked',
    learningOnboard.reply.length > 40 && /hir/i.test(learningOnboard.reply),
    learningOnboard.reply.slice(0, 120)
  );

  check('Business: turn completed with no memory present', businessOnboard.completed);
  check(
    'Business: still recognises first run',
    ONBOARDING_MARKERS.test(businessOnboard.reply) ||
      /don'?t (yet )?(know|have)|no business memory|haven'?t told me/i.test(businessOnboard.reply),
    businessOnboard.reply.slice(0, 200)
  );

  console.log('\n--- no-memory replies, both modes ---\n');
  console.log('### EXECUTIVE LEARNING, memory absent');
  console.log(learningOnboard.reply.trim().slice(0, 700));
  console.log(`  [files touched] ${learningOnboard.reads.join(' | ') || 'none reported'}\n`);
  console.log('### BUSINESS ADVISOR, memory absent');
  console.log(businessOnboard.reply.trim().slice(0, 700));
  console.log(`  [files touched] ${businessOnboard.reads.join(' | ') || 'none reported'}\n`);

  /* ---------------------------------------------------------- final safety */
  console.log('\n[6] production untouched');
  const changed = diffFingerprints(before, fingerprintGuarded(PRODUCTION));
  check(`production ${GUARDED.join('/, ')}/ byte-identical`, changed.length === 0, changed.join('; '));

  /* ------------------------------------------------------------ comparison */
  console.log('\n--- behaviour comparison, identical prompt ---');
  console.log(`\nPROMPT: ${PROMPT}\n`);
  for (const [label, run] of [
    ['BUSINESS ADVISOR', business],
    ['EXECUTIVE LEARNING', learning],
  ]) {
    console.log(`### ${label}  (${run.elapsed}ms)`);
    console.log(run.reply.trim().slice(0, 900));
    console.log(`  [files touched] ${run.reads.join(' | ') || 'none reported'}`);
    console.log('');
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  // Never leave the fixture parked, whatever happened.
  if (existsSync(MEMORY_PARKED) && !existsSync(MEMORY_FILE)) renameSync(MEMORY_PARKED, MEMORY_FILE);
  console.error('harness error:', error);
  process.exit(1);
});
