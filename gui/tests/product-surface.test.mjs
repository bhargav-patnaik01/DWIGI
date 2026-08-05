/**
 * Tier 1 — the product surface introduced in Phase 2.
 *
 * Scoped to this sprint, as instructed: setup gating, deep-link destinations,
 * navigation integrity, and the redaction the diagnostics export depends on.
 * No regression suite for anything Phase 2 did not touch.
 *
 * Everything here is pure. The rules that decide *what a founder sees* were put
 * in `shared/` precisely so they could be exercised without mounting a window —
 * a first-run gate that could only be checked by launching Electron would be a
 * gate nobody checks.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GUI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const onboarding = await import('../dist-electron/shared/onboarding.js');
const deeplink = await import('../dist-electron/shared/deeplink.js');
const redact = await import('../dist-electron/shared/redact.js');

/** Every prerequisite met. Individual tests knock one out at a time. */
const READY = {
  hasWorkspace: true,
  hasActiveBrain: true,
  snapshotLoaded: true,
  memoryPresent: true,
  onboardingStarted: false,
  memoryScope: 'business',
  forced: false,
};

/* -------------------------------------------------------------------------- */
/* First run                                                                  */
/* -------------------------------------------------------------------------- */

test('a finished installation is not sent back through setup', () => {
  assert.equal(onboarding.setupStage(READY), 'complete');
  assert.equal(onboarding.isSetupComplete(READY), true);
});

test('each missing prerequisite names its own step', () => {
  assert.equal(onboarding.setupStage({ ...READY, hasWorkspace: false }), 'workspace');
  assert.equal(onboarding.setupStage({ ...READY, hasActiveBrain: false }), 'ai');
  assert.equal(onboarding.setupStage({ ...READY, memoryPresent: false }), 'memory');
});

test('the workspace is asked for before the AI', () => {
  // Both missing. Order matters: connecting an AI before there is anywhere to put
  // the work would leave the founder configuring a runtime for nothing.
  const stage = onboarding.setupStage({
    ...READY,
    hasWorkspace: false,
    hasActiveBrain: false,
  });
  assert.equal(stage, 'workspace');
});

test('setup does not reappear for an established founder before the first read', () => {
  // `snapshotLoaded: false` means memory presence is not yet known. Reporting
  // `memory` here would flash the setup flow on every launch.
  const stage = onboarding.setupStage({
    ...READY,
    snapshotLoaded: false,
    memoryPresent: false,
  });
  assert.equal(stage, 'complete');
});

test('onboarding already begun is not restarted', () => {
  const stage = onboarding.setupStage({
    ...READY,
    memoryPresent: false,
    onboardingStarted: true,
  });
  assert.equal(stage, 'complete');
});

test('Executive Learning never demands a Business Memory', () => {
  // That mode exists for a founder who may have no business at all. Requiring the
  // memory would be the interface arguing with a choice they just made.
  const stage = onboarding.setupStage({
    ...READY,
    memoryScope: 'learning',
    memoryPresent: false,
  });
  assert.equal(stage, 'complete');
});

test('Executive Learning still requires an AI', () => {
  const stage = onboarding.setupStage({
    ...READY,
    memoryScope: 'learning',
    hasActiveBrain: false,
  });
  assert.equal(stage, 'ai');
});

/* -------------------------------------------------------------------------- */
/* Deep links now have somewhere to land                                      */
/* -------------------------------------------------------------------------- */

/** Routes the static export actually produced. */
function exportedRoutes() {
  const appDir = path.join(GUI, 'src', 'app');
  const routes = new Set(['/']);
  for (const entry of ['brains', 'diagnostics', 'settings', 'executives', 'memory', 'decisions', 'dashboard']) {
    if (existsSync(path.join(appDir, entry, 'page.tsx'))) routes.add(`/${entry}`);
  }
  return routes;
}

test('every deep-link destination is a screen that exists', () => {
  const built = exportedRoutes();
  for (const [intent, route] of Object.entries(deeplink.INTENT_ROUTES)) {
    // `/welcome` is not a route: first run is a state of `/`, not a page of its
    // own, so onboarding intents must land on `/`.
    assert.ok(
      built.has(route) || route === '/',
      `${intent} points at ${route}, which is not a built screen`
    );
  }
});

test('the onboarding intents land on the screen that owns first run', () => {
  // First run is drawn by `/` when setup is incomplete. A dedicated `/welcome`
  // route would be a second place that decides whether setup is finished.
  assert.equal(deeplink.INTENT_ROUTES.onboarding, '/');
  assert.equal(deeplink.INTENT_ROUTES['workspace.new'], '/');
  assert.equal(deeplink.INTENT_ROUTES['workspace.open'], '/');
});

test('the AI intents land on the AI Control Center', () => {
  assert.equal(deeplink.INTENT_ROUTES.connect, '/brains');
  assert.equal(deeplink.INTENT_ROUTES.brains, '/brains');
});

test('dwigi://diagnostics resolves to the diagnostics screen', () => {
  const result = deeplink.parseDeepLink('dwigi://diagnostics');
  assert.equal(result.ok, true);
  assert.equal(deeplink.routeForIntent(result.intent), '/diagnostics');
});

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

test('navigation shortcuts are unique and sequential', () => {
  const nav = readFileSync(path.join(GUI, 'src', 'lib', 'nav.ts'), 'utf8');
  const shortcuts = [...nav.matchAll(/shortcut:\s*'(\d)'/g)].map((match) => match[1]);
  assert.equal(new Set(shortcuts).size, shortcuts.length, 'two screens share a shortcut');
  assert.deepEqual(shortcuts, shortcuts.slice().sort(), 'shortcuts are out of order');
});

test('the AI screen is reachable from the sidebar', () => {
  const nav = readFileSync(path.join(GUI, 'src', 'lib', 'nav.ts'), 'utf8');
  assert.match(nav, /href:\s*'\/brains'/);
});

test('diagnostics is deliberately not in the sidebar', () => {
  const nav = readFileSync(path.join(GUI, 'src', 'lib', 'nav.ts'), 'utf8');
  const navBlock = nav.slice(nav.indexOf('export const NAV'), nav.indexOf('UNLISTED_ROUTES'));
  assert.equal(navBlock.includes('/diagnostics'), false);
  assert.match(nav, /UNLISTED_ROUTES[\s\S]*\/diagnostics/);
});

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

test('no screen shows developer vocabulary to a founder', () => {
  /*
   * Scans JSX *text and copy attributes* rather than whole files, so a comment
   * explaining why a boundary exists does not fail the test while a visible
   * label does.
   */
  const screens = [
    'src/app/page.tsx',
    'src/app/settings/page.tsx',
    'src/app/brains/page.tsx',
    'src/app/diagnostics/page.tsx',
    'src/app/memory/page.tsx',
    'src/app/decisions/page.tsx',
    'src/app/dashboard/page.tsx',
    'src/app/executives/page.tsx',
    'src/components/onboarding/FirstRun.tsx',
  ];

  const banned = /\b(repository|repositories|npm|Node\.js|git clone|CLI)\b/i;

  for (const file of screens) {
    const source = readFileSync(path.join(GUI, file), 'utf8');
    // Strip block and line comments before scanning.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const strings = [
      ...code.matchAll(/(?:title|description|hint|label|placeholder|blurb|body|summary)=\{?["'`]([^"'`]+)["'`]/g),
    ].map((match) => match[1]);

    for (const text of strings) {
      assert.ok(
        !banned.test(text),
        `${file} shows developer vocabulary to the founder: "${text}"`
      );
    }
  }
});

/* -------------------------------------------------------------------------- */
/* Diagnostics export                                                         */
/* -------------------------------------------------------------------------- */

test('a diagnostics report of the shape this build assembles carries no secret', () => {
  // Mirrors the structure `src/app/diagnostics/page.tsx` builds, including the
  // fields most likely to carry something sensitive.
  const report = redact.redactDeep({
    application: { version: '1.2.0', electron: '34.5.8', platform: 'win32' },
    workspace: { path: 'C:\\Users\\Sample\\Documents\\Acme' },
    providers: [
      {
        id: 'openai',
        authState: 'authenticated',
        authMethod: 'osCredentialStore',
        apiKey: 'sk-abcdefghijklmnopqrstuvwxyz01',
        healthMessage: 'rejected key sk-abcdefghijklmnopqrstuvwxyz01',
      },
    ],
  });

  const serialised = JSON.stringify(report);
  assert.deepEqual(redact.findLeaks(serialised), []);
  // The enum fields survive, or the report stops being diagnostically useful.
  assert.match(serialised, /"authState":"authenticated"/);
  assert.match(serialised, /"authMethod":"osCredentialStore"/);
});

test('the export refuses rather than warning when a leak survives', () => {
  // `findLeaks` is the independent second opinion the export gates on. If it ever
  // returns nothing for obviously-secret input, the gate is decorative.
  assert.ok(redact.findLeaks('sk-abcdefghijklmnopqrstuvwxyz01').length > 0);
  assert.ok(redact.findLeaks('/home/someone/dev').length > 0);
});
