/**
 * v1.2.3 APPENDIX — HOSTED ENGINE RUNTIME
 *
 * Scoped exactly to what the appendix asks to validate: hosted runtime
 * injection, native runtime exclusion, and the installation-assistant
 * skill-selection logic. No unrelated regression testing — see `npm test`'s
 * full suite for everything else, unchanged by this file.
 *
 * v1.3 extended this file: a fixed, read-only tool set is now real for
 * connections whose manifest declares `readOnlyTools: 'supported'` or
 * `'unknown'` — see `shared/runtime/tools.ts`,
 * `electron/runtime/tools/execute.ts`, and `tests/hosted-tools.test.mjs` for
 * that execution path. What is asserted here is narrower and unchanged in
 * kind: that the disclosure text says exactly what is true for each
 * connection's declared capability, never more.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUI = path.resolve(HERE, '..');
const REPO = path.resolve(GUI, '..');

const manifests = await import('../dist-electron/shared/runtime/manifests.js');
const capabilities = await import('../dist-electron/shared/runtime/capabilities.js');
const injection = await import('../dist-electron/shared/runtime/injection.js');

/* -------------------------------------------------------------------------- */
/* Part M — execution modes, no provider-specific branching                   */
/* -------------------------------------------------------------------------- */

test('every manifest declares an execution mode', () => {
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    assert.ok(
      manifest.executionMode === 'native' || manifest.executionMode === 'hosted',
      `${manifest.id} has no valid executionMode`
    );
  }
});

test('Native and Hosted assignments match the providers this project actually built', () => {
  // A tripwire, not a preference — promoting a provider from hosted to native
  // means it gained engineDiscovery/filesystem/toolCalling for real, which is
  // a claim to verify before this list changes, not a flag to flip.
  const native = manifests.PROVIDER_MANIFESTS.filter((m) => m.executionMode === 'native').map(
    (m) => m.id
  );
  const hosted = manifests.PROVIDER_MANIFESTS.filter((m) => m.executionMode === 'hosted').map(
    (m) => m.id
  );
  assert.deepEqual(native.sort(), ['claude-code', 'gemini-cli']);
  assert.deepEqual(hosted.sort(), ['azure-openai', 'lmstudio', 'ollama', 'openai', 'openrouter']);
});

test('executionMode agrees with Council capability for every provider', () => {
  // Two independent declarations describing the same underlying reality from
  // different angles must not disagree — see `skills/provider_runtime.md` on
  // why this is asserted rather than derived one from the other.
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    const councilCapable = capabilities.isCouncilCapable(manifest.capabilities);
    if (manifest.executionMode === 'native') {
      assert.ok(councilCapable, `${manifest.id} is native but cannot host the Council`);
    } else {
      assert.ok(!councilCapable, `${manifest.id} is hosted but reports Council-capable`);
    }
  }
});

test('the hosted/native injection decision reads executionMode, never a provider id', () => {
  /*
   * ---------------------------------------------------------------------------
   * SCOPED TO THE ONE FUNCTION PART M ACTUALLY CONSTRAINS
   * ---------------------------------------------------------------------------
   * `selectInstallationSkills` legitimately names 'claude-code'/'gemini-cli' —
   * Part P asks for a per-target install guide, and "which guide matches this
   * target" is inherently id-based. Scanning the whole file for any provider id
   * at all would fail on that intentional code and prove nothing about the rule
   * Part M actually states, which is narrower: the decision to inject *at all*
   * must switch on the declared field, not a name comparison.
   */
  const injectionSource = readFileSync(path.join(GUI, 'shared', 'runtime', 'injection.ts'), 'utf8');
  const decisionFn = /export function requiresHostedContext\([\s\S]*?\n\}/.exec(injectionSource);
  assert.ok(decisionFn, 'requiresHostedContext not found');
  assert.match(decisionFn[0], /executionMode/);
  for (const id of ['openai', 'ollama', 'lmstudio', 'claude-code', 'gemini-cli']) {
    assert.ok(!decisionFn[0].includes(id), `requiresHostedContext names "${id}" instead of executionMode`);
  }
});

/* -------------------------------------------------------------------------- */
/* Part N — hosted injection is real; native exclusion is structural          */
/* -------------------------------------------------------------------------- */

test('requiresHostedContext is true for every hosted manifest and false for every native one', () => {
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    const expected = manifest.executionMode === 'hosted';
    assert.equal(injection.requiresHostedContext(manifest), expected, manifest.id);
  }
});

test('the hosted context names the provider and states its real limits', () => {
  const openai = manifests.manifestFor('openai');
  const text = injection.hostedRuntimeContext(openai);
  assert.match(text, /OpenAI/);
  assert.match(text, /Hosted/);
  assert.match(text, /no direct access|do not have direct access/i);
  assert.match(text, /Executive Council/);
});

test('the hosted context never claims tool or filesystem access', () => {
  /*
   * Checked as an affirmative claim, not a bare substring.
   *
   * The context's own `RUNTIME_INSTRUCTIONS_STATEMENT` legitimately contains
   * "Never claim you can read a file" — an instruction *forbidding* the claim —
   * and a naive `/you can read/i` scan matches that sentence as if it were the
   * violation it warns against. Matched here against the assertion form
   * specifically ("you can read/run/access" with no preceding negation),
   * exactly the shape this codebase has been bitten by twice already this
   * project (a "dismissible" comment tripping a "no dismiss" check; "revenue"
   * in a lens-name sentence tripping a business-question check).
   */
  const affirmativeClaim = /\b(?<!never claim |cannot |can't )you (can|have access to) (read|run|access|see) (their|the|your)? ?(files?|terminal|command)/i;
  for (const manifest of manifests.PROVIDER_MANIFESTS.filter((m) => m.executionMode === 'hosted')) {
    const text = injection.hostedRuntimeContext(manifest);
    assert.ok(
      !affirmativeClaim.test(text),
      `${manifest.id}'s context appears to claim tool/filesystem access`
    );
  }
  // And the positive we actually want: every hosted context states the
  // negation explicitly, in these words or ones just as direct.
  for (const manifest of manifests.PROVIDER_MANIFESTS.filter((m) => m.executionMode === 'hosted')) {
    const text = injection.hostedRuntimeContext(manifest);
    assert.match(text, /do not have direct access|no direct access|no path to do/i);
  }
});

test('Native engines are structurally excluded from injection, not merely skipped by a flag', () => {
  // Claude Code and Gemini CLI's provider classes never import injection.ts at
  // all — checked directly, so "native engines must never receive these
  // prompts" is a fact about which code paths exist, not a runtime check that
  // could be disabled or bypassed.
  for (const file of ['electron/runtime/providers/claude/provider.ts', 'electron/runtime/providers/gemini/provider.ts']) {
    const source = readFileSync(path.join(GUI, file), 'utf8');
    assert.ok(
      !source.includes('injection'),
      `${file} references the hosted injection module — a native provider must not`
    );
  }
});

test('HttpChatSession seeds a system message only for hosted manifests', () => {
  const source = readFileSync(
    path.join(GUI, 'electron', 'runtime', 'providers', 'http-chat.ts'),
    'utf8'
  );
  assert.match(source, /requiresHostedContext\(manifest\)/);
  assert.match(source, /role: 'system'/);
});

test('the hosted context is disclosed in the interface, not composed silently', () => {
  // Mirrors `directiveFor` being exported so runtime-mode UI can show a
  // founder-selected mode verbatim — a context the founder cannot see would be
  // a hidden prompt.
  const card = readFileSync(
    path.join(GUI, 'src', 'components', 'runtime', 'ProviderCard.tsx'),
    'utf8'
  );
  assert.match(card, /executionMode === 'hosted'/);
});

/* -------------------------------------------------------------------------- */
/* Part O — modular skills, selected narrowly per request                     */
/* -------------------------------------------------------------------------- */

test('every skill document Part O names exists', () => {
  const skills = [
    'filesystem.md',
    'terminal.md',
    'workspace.md',
    'git.md',
    'memory.md',
    'reasoning.md',
    'permissions.md',
    'provider_runtime.md',
  ];
  for (const name of skills) {
    const p = path.join(REPO, 'skills', name);
    assert.ok(existsSync(p), `missing skills/${name}`);
    assert.ok(readFileSync(p, 'utf8').trim().length > 200, `skills/${name} looks like a stub`);
  }
});

test('every installation skill Part P names exists', () => {
  for (const name of injection.INSTALLATION_SKILLS) {
    const p = path.join(REPO, 'skills', 'installation', `${name}.md`);
    assert.ok(existsSync(p), `missing skills/installation/${name}.md`);
    assert.ok(readFileSync(p, 'utf8').trim().length > 200, `${name}.md looks like a stub`);
  }
});

test('selection is narrow by default: no target names no install guide', () => {
  const selected = injection.selectInstallationSkills({
    targetProviderId: null,
    hasDetectionRun: false,
    authInProgress: false,
  });
  assert.ok(selected.includes('environment_check'));
  assert.ok(selected.includes('provider_detection'));
  assert.ok(!selected.includes('install_claude_code'));
  assert.ok(!selected.includes('install_gemini'));
  assert.ok(!selected.includes('browser_auth'));
});

test('naming a target adds only that provider’s install guide, never the other’s', () => {
  const forClaude = injection.selectInstallationSkills({
    targetProviderId: 'claude-code',
    hasDetectionRun: true,
    authInProgress: false,
  });
  assert.ok(forClaude.includes('install_claude_code'));
  assert.ok(!forClaude.includes('install_gemini'));

  const forGemini = injection.selectInstallationSkills({
    targetProviderId: 'gemini-cli',
    hasDetectionRun: true,
    authInProgress: false,
  });
  assert.ok(forGemini.includes('install_gemini'));
  assert.ok(!forGemini.includes('install_claude_code'));
});

test('browser_auth is selected only while an auth flow is actually in progress', () => {
  const idle = injection.selectInstallationSkills({
    targetProviderId: 'claude-code',
    hasDetectionRun: true,
    authInProgress: false,
  });
  const authing = injection.selectInstallationSkills({
    targetProviderId: 'claude-code',
    hasDetectionRun: true,
    authInProgress: true,
  });
  assert.ok(!idle.includes('browser_auth'));
  assert.ok(authing.includes('browser_auth'));
});

test('the general-purpose tool skills are never selected for hosted injection', () => {
  // Part O's full list mixes general skills with installation skills. This
  // module must select only from the installation set — describing
  // filesystem/terminal/git/workspace/reasoning to a Hosted engine would
  // advertise tools nothing wires to execution for it.
  const anyContext = injection.selectInstallationSkills({
    targetProviderId: 'claude-code',
    hasDetectionRun: true,
    authInProgress: true,
  });
  for (const general of ['filesystem', 'terminal', 'git', 'workspace', 'reasoning']) {
    assert.ok(!anyContext.includes(general));
  }
});

/* -------------------------------------------------------------------------- */
/* Part Q — browser auth: architecture present, nothing fabricated            */
/* -------------------------------------------------------------------------- */

test('browser is a legal auth method, and no current provider is forced into it', () => {
  const contract = readFileSync(path.join(GUI, 'shared', 'runtime', 'contract.ts'), 'utf8');
  assert.match(contract, /browser: 'browser'/);

  // Honesty check: as of this appendix, nobody has been given browser auth
  // that they cannot actually complete. See skills/installation/browser_auth.md.
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    assert.ok(
      !manifest.authMethods.includes('browser'),
      `${manifest.id} declares browser auth — is a real OAuth flow implemented for it?`
    );
  }
});

test('OpenAI is never described as browser-authenticated', () => {
  const openai = manifests.manifestFor('openai');
  assert.deepEqual([...openai.authMethods], ['osCredentialStore', 'apiKey']);
});

/* -------------------------------------------------------------------------- */
/* Part S — continuous discovery, scoped and non-destructive                  */
/* -------------------------------------------------------------------------- */

test('startWatching never touches active-brain or connection state', () => {
  // "Nothing on this screen switches itself" (src/app/brains/page.tsx) must
  // survive continuous polling: the watcher may update what was detected, and
  // must not be able to change which provider is selected or connected.
  const store = readFileSync(path.join(GUI, 'src', 'lib', 'store', 'runtime.ts'), 'utf8');
  const watchBlock = /startWatching:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n  \},/.exec(store);
  assert.ok(watchBlock, 'startWatching implementation not found');
  assert.ok(!watchBlock[0].includes('setActive'), 'the watcher must never call setActive');
  assert.ok(!watchBlock[0].includes('submitApiKey'), 'the watcher must never submit credentials');
  assert.match(watchBlock[0], /\.detect\(\)/, 'the watcher should call detect(), the read-only sweep');
});

test('the discovery watch is mount-scoped and stops on unmount', () => {
  const store = readFileSync(path.join(GUI, 'src', 'lib', 'store', 'runtime.ts'), 'utf8');
  assert.match(store, /useEffect\(\(\) => startWatching\(intervalMs\), \[startWatching, intervalMs\]\)/);
  // The effect's cleanup must be the stop function `startWatching` returns —
  // a watcher with no cleanup path would poll forever after the screen closes.
  assert.match(store, /return \(\) => clearInterval\(timer\);/);
});
