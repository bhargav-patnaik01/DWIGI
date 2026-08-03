#!/usr/bin/env node
/**
 * Pipeline benchmark — shared-context Council vs isolated executive execution.
 *
 * Drives the real engine, so it costs real tokens and real minutes. A single
 * isolated-arm run measured $3.22 and 9.5 minutes; budget accordingly.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MEASURES, AND WHAT IT REFUSES TO
 * ---------------------------------------------------------------------------
 * Mechanical and computable quantities only — latency, tokens, cost, lens
 * counts, verdicts, and pairwise lexical overlap between lens positions as an
 * objective proxy for anchoring.
 *
 * It does NOT score recommendation quality, originality, or synthesis quality.
 * The advisor generates both arms; asking it to then rank them makes defendant
 * and judge the same process, which `docs/validation/VALIDATION_MATRIX.md` §1
 * exists to forbid. Transcripts are written out in full so a human can make
 * that comparison from evidence rather than from a self-report.
 *
 *   node scripts/benchmark-pipelines.mjs pricing founder-conflict churn
 *   node scripts/benchmark-pipelines.mjs --all
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WORKSPACE =
  process.env.EIS_BENCH_WORKSPACE || path.resolve(ROOT, '..', '..', 'eis-sandbox');
const OUT_DIR = path.join(ROOT, 'benchmark');

const IS_WINDOWS = process.platform === 'win32';
const CLI = IS_WINDOWS ? 'claude.cmd' : 'claude';

/** Fixed wording. See `docs/validation/BENCHMARK.md` §3. */
const SCENARIOS = {
  hiring: {
    domain: 'Hiring',
    text: "I've got one strong senior engineer candidate and I can just about afford them. My other option is two juniors for the same money. We're behind on the roadmap and I'm the bottleneck on every code review. Which way?",
  },
  fundraising: {
    domain: 'Fundraising & dilution',
    text: 'An angel I respect has offered 400k at a valuation I think is 30% too low, and they want it closed in three weeks. Taking it means I stop worrying about payroll for a year. Should I take it?',
  },
  pricing: {
    domain: 'Pricing & packaging',
    text: "Two customers have told me we're cheap. I want to raise prices 40% next month across the board, existing customers included. Talk me out of it or tell me to go.",
  },
  'product-strategy': {
    domain: 'Product scope & roadmap',
    text: "Our biggest customer wants a reporting module nobody else has asked for. It's about six weeks of work. They're 30% of revenue. Do we build it?",
  },
  'founder-conflict': {
    domain: 'Founder capacity & burnout',
    text: "My co-founder and I have argued about the same roadmap decision four times in three weeks. I'm starting to think one of us has to go and it probably isn't me. I haven't slept properly since the last one.",
  },
  churn: {
    domain: 'Churn & retention',
    text: "We lost three of eleven customers this quarter. Two said 'not the right time', one didn't reply. I want to hire a salesperson to replace the revenue. Sanity check me.",
  },
  'technical-debt': {
    domain: 'Technical architecture & pivot',
    text: 'The codebase is slowing us down badly — every feature takes three times what it should. A rewrite is maybe two months during which we ship nothing. We have nine months of runway.',
  },
  'go-to-market': {
    domain: 'Go-to-market & channel',
    text: "Inbound has stalled at about four demos a month. I'm considering going all-in on cold outbound, which I've never done and don't enjoy. The alternative is content, which is slower. Pick one.",
  },
};

/** Canonical display names, for parsing arm A's stress-test prose. */
const LENS_NAMES = [
  ['ceo', 'CEO'],
  ['cfo', 'CFO'],
  ['coo', 'COO'],
  ['sales-gtm', 'Sales/GTM'],
  ['product', 'Product'],
  ['coach', 'Coach'],
  ['risk-officer', 'Risk Officer'],
  ['devils-advocate', "Devil's Advocate"],
];

/* -------------------------------------------------------------------------- */
/* Engine invocation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One turn against the real CLI.
 *
 * ---------------------------------------------------------------------------
 * THE PROMPT TRAVELS ON STDIN. IT MUST NEVER BE AN ARGUMENT.
 * ---------------------------------------------------------------------------
 * The first version passed it positionally. On Windows the CLI is reached
 * through a `.cmd` shim, which Node will only spawn with `shell: true`, and a
 * shell concatenates arguments instead of escaping them (DEP0190). The scenario
 * text contains apostrophes and quotes, so it was destroyed in transit: the
 * engine received a bare `/deliberate` with no decision attached.
 *
 * It failed in the most expensive possible way — quietly and plausibly. Both
 * commands did exactly what their failure sections say and asked "What's the
 * decision?", each run cost real money, and the summary reported "0 positions"
 * rather than an error.
 *
 * With the prompt on stdin, every argument is a literal flag or a generated
 * UUID, which is the same invariant `electron/bridge/claude-cli.ts` holds and
 * asserts. `--output-format json` gives usage, cost and duration in the reply,
 * so nothing here estimates a number it could measure.
 */
function turn(prompt, { sessionId, resume }) {
  const args = ['-p', '--output-format', 'json'];
  if (resume) args.push('--resume', resume);
  else if (sessionId) args.push('--session-id', sessionId);

  // Guard the invariant rather than trusting it to survive future edits.
  for (const arg of args) {
    if (!/^[A-Za-z0-9_.:\-=/\\]+$/.test(arg)) {
      throw new Error(`refusing to spawn: argument carries unsafe input (${arg})`);
    }
  }

  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(CLI, args, {
      cwd: WORKSPACE,
      shell: IS_WINDOWS,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      if (!settled) child.kill();
    }, 30 * 60 * 1000);

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const wallMs = Date.now() - startedAt;
      let payload = null;
      try {
        payload = JSON.parse(stdout);
      } catch {
        /* left null; reported below */
      }
      resolve({
          ok: Boolean(payload) && payload.is_error !== true,
          wallMs,
          text: payload?.result ?? '',
          sessionId: payload?.session_id ?? null,
          metrics: payload
            ? {
                apiMs: payload.duration_api_ms ?? null,
                turns: payload.num_turns ?? null,
                costUsd: payload.total_cost_usd ?? null,
                outputTokens: payload.usage?.output_tokens ?? null,
                inputTokens: payload.usage?.input_tokens ?? null,
                cacheReadTokens: payload.usage?.cache_read_input_tokens ?? null,
                cacheCreateTokens: payload.usage?.cache_creation_input_tokens ?? null,
                permissionDenials: (payload.permission_denials ?? []).map((d) => d.tool_name),
              }
            : null,
        error: error ? String(error.message).slice(0, 300) : stderr ? stderr.slice(0, 300) : null,
      });
    };

    child.on('error', (error) => finish(error));
    child.on('close', () => finish(null));

    // The whole prompt, then EOF. Print mode consumes one turn and exits.
    child.stdin.end(prompt, 'utf8');
  });
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                 */
/* -------------------------------------------------------------------------- */

/** The isolated pipeline's own trace block. */
function parseTrace(text) {
  const match = /```eis-trace\s*([\s\S]*?)```/.exec(text);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Best-effort per-lens positions out of `/stress-test` prose.
 *
 * Arm A has no structured output — the shared-context pipeline was never built
 * to emit one, and giving it one would have changed the thing under test. So
 * this splits on canonical lens names and takes the text up to the next.
 *
 * Reported as best-effort in the output, because it is: a stress-test that
 * discusses a lens without heading it will under-capture, and that biases arm A
 * toward shorter positions. Any conclusion has to survive that.
 */
function parsePositions(text) {
  const marks = [];
  for (const [id, name] of LENS_NAMES) {
    const pattern = new RegExp(
      `(?:^|\\n)[^\\S\\n]{0,4}(?:[#*\\-\\d.]{0,6}[^\\S\\n]{0,2})?\\*{0,2}${name.replace(
        /[.*+?^${}()|[\]\\/]/g,
        '\\$&'
      )}\\*{0,2}\\s*(?:—|-|:|\\()`,
      'gi'
    );
    let m;
    while ((m = pattern.exec(text)) !== null) marks.push({ id, index: m.index });
  }
  marks.sort((a, b) => a.index - b.index);

  const positions = {};
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    // Keep the longest occurrence: a lens named in a list and again with its
    // actual position should contribute the position.
    if (!positions[marks[i].id] || body.length > positions[marks[i].id].length) {
      positions[marks[i].id] = body;
    }
  }
  return positions;
}

/* -------------------------------------------------------------------------- */
/* The anchoring proxy                                                        */
/* -------------------------------------------------------------------------- */

const STOPWORDS = new Set(
  ('a an the and or but if then than that this these those is are was were be been being do does did' +
    ' of to in on at by for with from as it its into over under about not no nor so too very can will' +
    ' would should could may might must have has had i you we they he she them us our your their my me' +
    ' what which who whom when where why how all any both each few more most other some such only own' +
    ' same s t just don now also because before after above below up down out off again further once' +
    ' here there because while during between against upon per via yes')
    .split(/\s+/)
);

/** Content-word set: lowercased, de-punctuated, stopped, short words dropped. */
function contentWords(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return null;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Mean pairwise overlap across a set of positions.
 *
 * The hypothesis under test: lenses sharing a context converge on each other's
 * language. Lower mean overlap under isolation is evidence for it.
 */
function overlapStats(positions) {
  const ids = Object.keys(positions).filter((id) => id !== '_gaps');
  const sets = ids.map((id) => contentWords(String(positions[id] ?? '')));
  const pairs = [];

  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const value = jaccard(sets[i], sets[j]);
      if (value !== null) pairs.push({ a: ids[i], b: ids[j], jaccard: value });
    }
  }

  const values = pairs.map((p) => p.jaccard);
  const mean = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

  return {
    lensCount: ids.length,
    pairCount: pairs.length,
    meanJaccard: mean === null ? null : Math.round(mean * 10000) / 10000,
    minJaccard: values.length ? Math.round(Math.min(...values) * 10000) / 10000 : null,
    maxJaccard: values.length ? Math.round(Math.max(...values) * 10000) / 10000 : null,
    meanPositionChars: ids.length
      ? Math.round(ids.reduce((s, id) => s + String(positions[id] ?? '').length, 0) / ids.length)
      : null,
    pairs: pairs.map((p) => ({ ...p, jaccard: Math.round(p.jaccard * 10000) / 10000 })),
  };
}

/** Memo sections present, as a coarse structural completeness check. */
function memoSections(text) {
  const required = [
    'The Decision',
    'Recommendation',
    'Why',
    'What Must Be True',
    'Considered & Rejected',
    'Downside',
    'Confidence',
    'Validation',
    'Next Action',
  ];
  return required.filter((s) => new RegExp(s.replace(/&/g, '&'), 'i').test(text));
}

/* -------------------------------------------------------------------------- */
/* Arms                                                                       */
/* -------------------------------------------------------------------------- */

/** Production: shared-context Council, then `/stress-test` for lens positions. */
async function armProduction(scenario) {
  const sessionId = randomUUID();

  const deliberate = await turn(`/deliberate ${scenario.text}`, { sessionId });
  if (!deliberate.ok) return { arm: 'production', failed: true, deliberate };

  // Same session, so the stress-test exposes the deliberation that happened
  // rather than re-deriving a fresh one.
  const stress = await turn('/stress-test', { resume: deliberate.sessionId ?? sessionId });

  const positions = stress.ok ? parsePositions(stress.text) : {};

  return {
    arm: 'production',
    failed: false,
    wallMs: deliberate.wallMs + (stress.wallMs ?? 0),
    memo: deliberate.text,
    stressTest: stress.text,
    metrics: {
      deliberate: deliberate.metrics,
      stressTest: stress.metrics,
      costUsd:
        (deliberate.metrics?.costUsd ?? 0) + (stress.metrics?.costUsd ?? 0),
      outputTokens:
        (deliberate.metrics?.outputTokens ?? 0) + (stress.metrics?.outputTokens ?? 0),
    },
    memoSections: memoSections(deliberate.text),
    positions,
    positionSource: 'best-effort parse of /stress-test prose',
    overlap: overlapStats(positions),
  };
}

/** Experimental: one isolated context per lens, then synthesis. */
async function armIsolated(scenario) {
  const run = await turn(`/deliberate-isolated ${scenario.text}`, {
    sessionId: randomUUID(),
  });
  if (!run.ok) return { arm: 'isolated', failed: true, run };

  const trace = parseTrace(run.text);
  const positions = trace?.positions ?? {};

  return {
    arm: 'isolated',
    failed: false,
    wallMs: run.wallMs,
    memo: run.text,
    metrics: {
      deliberate: run.metrics,
      costUsd: run.metrics?.costUsd ?? 0,
      outputTokens: run.metrics?.outputTokens ?? 0,
    },
    memoSections: memoSections(run.text),
    trace,
    positions,
    positionSource: 'eis-trace block, captured pre-synthesis',
    overlap: overlapStats(positions),
  };
}

/* -------------------------------------------------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const wanted = args.includes('--all')
    ? Object.keys(SCENARIOS)
    : args.filter((a) => Object.hasOwn(SCENARIOS, a));

  if (wanted.length === 0) {
    console.error('usage: benchmark-pipelines.mjs <scenario...> | --all');
    console.error(`scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  /*
   * Refuse to run against anything but a marked sandbox.
   *
   * Every run drives a real advisor that may write Decision Records, and it
   * consumes the pristine first-run state GATE 0 depends on. Same positive
   * assertion the screenshot harness uses, for the same reason.
   */
  if (!existsSync(path.join(WORKSPACE, 'SANDBOX.md'))) {
    console.error(`\nREFUSING TO RUN: ${WORKSPACE} has no SANDBOX.md marker.`);
    console.error('This benchmark drives a real advisor. Create a sandbox first:\n');
    console.error('  node scripts/make-sandbox.mjs --reset\n');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`workspace: ${WORKSPACE}`);
  console.log(`scenarios: ${wanted.join(', ')}`);
  console.log('This drives the real engine. Expect minutes and dollars per scenario.\n');

  const results = [];

  for (const id of wanted) {
    const scenario = { id, ...SCENARIOS[id] };
    console.log(`\n=== ${id} (${scenario.domain}) ===`);

    process.stdout.write('  arm A production ... ');
    const production = await armProduction(scenario);
    console.log(
      production.failed
        ? `FAILED ${production.deliberate?.error ?? ''}`
        : `${(production.wallMs / 1000).toFixed(0)}s  $${production.metrics.costUsd.toFixed(2)}  ` +
          `${production.overlap.lensCount} positions  overlap ${production.overlap.meanJaccard ?? '—'}`
    );

    process.stdout.write('  arm B isolated   ... ');
    const isolated = await armIsolated(scenario);
    console.log(
      isolated.failed
        ? `FAILED ${isolated.run?.error ?? ''}`
        : `${(isolated.wallMs / 1000).toFixed(0)}s  $${isolated.metrics.costUsd.toFixed(2)}  ` +
          `${isolated.overlap.lensCount} positions  overlap ${isolated.overlap.meanJaccard ?? '—'}`
    );

    results.push({ scenario, production, isolated });

    // Written per scenario, so an interrupted run keeps what it paid for.
    writeFileSync(
      path.join(OUT_DIR, `${id}.json`),
      JSON.stringify({ scenario, production, isolated }, null, 2)
    );
  }

  /* ------------------------------------------------------------- summary --- */

  const ok = results.filter((r) => !r.production.failed && !r.isolated.failed);

  const agg = (pick) => {
    const values = ok.map(pick).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (values.length === 0) return null;
    return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10000) / 10000;
  };

  const summary = {
    generatedFrom: wanted,
    completed: ok.map((r) => r.scenario.id),
    failed: results.filter((r) => r.production.failed || r.isolated.failed).map((r) => r.scenario.id),
    production: {
      meanWallSeconds: agg((r) => r.production.wallMs / 1000),
      meanCostUsd: agg((r) => r.production.metrics.costUsd),
      meanOutputTokens: agg((r) => r.production.metrics.outputTokens),
      meanTurns: agg((r) => r.production.metrics.deliberate?.turns),
      meanLensPositions: agg((r) => r.production.overlap.lensCount),
      meanJaccard: agg((r) => r.production.overlap.meanJaccard),
      meanPositionChars: agg((r) => r.production.overlap.meanPositionChars),
      meanMemoSections: agg((r) => r.production.memoSections.length),
    },
    isolated: {
      meanWallSeconds: agg((r) => r.isolated.wallMs / 1000),
      meanCostUsd: agg((r) => r.isolated.metrics.costUsd),
      meanOutputTokens: agg((r) => r.isolated.metrics.outputTokens),
      meanTurns: agg((r) => r.isolated.metrics.deliberate?.turns),
      meanLensPositions: agg((r) => r.isolated.overlap.lensCount),
      meanJaccard: agg((r) => r.isolated.overlap.meanJaccard),
      meanPositionChars: agg((r) => r.isolated.overlap.meanPositionChars),
      meanMemoSections: agg((r) => r.isolated.memoSections.length),
    },
    verdictAgreement: ok.map((r) => ({
      scenario: r.scenario.id,
      isolatedVerdict: r.isolated.trace?.verdict ?? null,
      isolatedConfidence: r.isolated.trace?.confidence ?? null,
      isolatedDomain: r.isolated.trace?.domain ?? null,
      isolatedLenses: (r.isolated.trace?.lenses_s4 ?? []).map((l) => `${l.id}:${l.tier}`),
      productionLenses: Object.keys(r.production.positions),
    })),
    caveats: [
      'n=1 per arm per scenario. Non-determinism means only large effects are meaningful.',
      "Arm A positions are a best-effort parse of /stress-test prose, captured AFTER synthesis; arm B's are captured before it. This biases arm A overlap upward independently of anchoring.",
      'No quality judgment is computed. Class-J comparison requires an independent human reading the captured transcripts.',
    ],
  };

  writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log('\n=== summary ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nartifacts -> ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(`benchmark failed: ${error.message}`);
  process.exit(1);
});
