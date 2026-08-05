/**
 * Tier 1 — the runtime platform's load-bearing contracts.
 *
 * Hermetic: spawns no runtime, contacts no network, spends no tokens. Everything
 * under test is pure, which is the reason the platform's rules were put in pure
 * modules in the first place — a capability gate that could only be exercised by
 * launching Electron would not be exercised.
 *
 * What these tests are actually defending, in order of how badly they would fail:
 *
 *   1. A provider cannot be made to look Council-capable when it is not. That is
 *      the failure that puts a founder in front of a chat box wearing their
 *      board's name.
 *   2. `unknown` cannot collapse into `unsupported`. That is the failure that
 *      turns an open question into a permanent, invisible absence.
 *   3. A deep link cannot carry a path. That is the failure that turns a
 *      navigation layer into a filesystem one.
 *   4. A diagnostics export cannot carry a secret or a person's name.
 *   5. The workspace manifest cannot accumulate business content.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const capabilities = await import('../dist-electron/shared/runtime/capabilities.js');
const contract = await import('../dist-electron/shared/runtime/contract.js');
const manifests = await import('../dist-electron/shared/runtime/manifests.js');
const deeplink = await import('../dist-electron/shared/deeplink.js');
const redact = await import('../dist-electron/shared/redact.js');
const workspace = await import('../dist-electron/shared/workspace.js');

/* -------------------------------------------------------------------------- */
/* Capability system                                                          */
/* -------------------------------------------------------------------------- */

test('an unstated capability is unknown, never unsupported', () => {
  const declared = capabilities.declare({ streaming: 'supported' });
  assert.equal(declared.states.streaming, 'supported');
  // The whole vocabulary is present, so a missing key and `unknown` cannot be two
  // representations of one fact.
  for (const capability of capabilities.CAPABILITY_ORDER) {
    assert.ok(declared.states[capability], `${capability} has no state`);
  }
  assert.equal(declared.states.resume, 'unknown');
  assert.notEqual(declared.states.resume, 'unsupported');
});

test('unsupported hides a feature; unknown disables it', () => {
  const absent = capabilities.declare({ resume: 'unsupported' });
  const unmeasured = capabilities.declare({ resume: 'unknown' });
  const feature = capabilities.FEATURES.conversationResume;

  const hidden = capabilities.gate(absent, feature);
  assert.equal(hidden.available, false);
  assert.equal(hidden.presentation, 'hidden');

  const disabled = capabilities.gate(unmeasured, feature);
  assert.equal(disabled.available, false);
  assert.equal(disabled.presentation, 'disabled');

  // The distinction is the point of the three-state system. If these ever collapse
  // to one presentation, the open question stops being visible and nobody resolves it.
  assert.notEqual(hidden.presentation, disabled.presentation);
});

test('a verified absence outranks an open question', () => {
  const mixed = capabilities.declare({
    engineDiscovery: 'unsupported',
    filesystem: 'unknown',
    toolCalling: 'supported',
  });
  const outcome = capabilities.gate(mixed, capabilities.COUNCIL_FEATURE);
  assert.equal(outcome.available, false);
  // Hidden, not disabled: resolving the unknown could not make this work, so a
  // disabled control would imply a path forward that does not exist.
  assert.equal(outcome.presentation, 'hidden');
  assert.deepEqual(outcome.missing, ['engineDiscovery']);
});

test('every unavailable feature carries an explanation', () => {
  const declared = capabilities.declare(
    { filesystem: 'unsupported' },
    {},
    { filesystem: 'The API has no access to files on this machine.' }
  );
  const outcome = capabilities.gate(declared, capabilities.COUNCIL_FEATURE);
  assert.equal(outcome.available, false);
  assert.ok(outcome.reason.length > 0);
  // The provider's own words are preferred over the generic fallback.
  assert.match(outcome.reason, /no access to files/);
});

test('a feature with no declared reason still explains itself', () => {
  const declared = capabilities.declare({ vision: 'unsupported' });
  const outcome = capabilities.gate(declared, capabilities.FEATURES.imageInput);
  assert.equal(outcome.available, false);
  assert.ok(outcome.reason.trim().length > 0, 'silence is not an explanation');
});

/* -------------------------------------------------------------------------- */
/* The Council gate — the highest-value test in this file                      */
/* -------------------------------------------------------------------------- */

test('Council capability is derived from facts, never declared directly', () => {
  // There is deliberately no `councilCapable` field a manifest could assert.
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    assert.equal(
      'councilCapable' in manifest,
      false,
      `${manifest.id} declares the conclusion instead of the facts`
    );
  }
});

test('a chat-only runtime can never be Council-capable', () => {
  const chatOnly = capabilities.declare({
    streaming: 'supported',
    engineDiscovery: 'unsupported',
    filesystem: 'unsupported',
    toolCalling: 'unsupported',
  });
  assert.equal(capabilities.isCouncilCapable(chatOnly), false);
  const reason = capabilities.councilBlockedReason(chatOnly);
  // Names the consequence, not the conclusion. "Cannot be your Active Brain" is
  // not something a founder can act on.
  assert.ok(reason);
  assert.match(reason, /Business Memory|operating instructions|Decision Record/);
});

test('streaming is not required for the Council', () => {
  const noStreaming = capabilities.declare({
    engineDiscovery: 'supported',
    filesystem: 'supported',
    toolCalling: 'supported',
    streaming: 'unsupported',
  });
  // Requiring it would confuse polish with function and exclude a runtime that works.
  assert.equal(capabilities.isCouncilCapable(noStreaming), true);
});

test('exactly the documented providers can host the Council', () => {
  const capable = manifests.PROVIDER_MANIFESTS.filter((manifest) =>
    capabilities.isCouncilCapable(manifest.capabilities)
  ).map((manifest) => manifest.id);

  // This assertion is a tripwire, not a preference. If it fails because a provider
  // gained the capability, verify it against a live runtime before updating —
  // ADR-013's honesty rests on this set being earned rather than asserted.
  assert.deepEqual(capable.sort(), ['claude-code', 'gemini-cli']);
});

test('every non-Council provider explains itself in the founder’s terms', () => {
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    if (capabilities.isCouncilCapable(manifest.capabilities)) continue;
    const reason = capabilities.councilBlockedReason(manifest.capabilities);
    assert.ok(reason, `${manifest.id} is blocked with no reason`);
    assert.ok(reason.length > 40, `${manifest.id}'s reason is too terse to act on`);
  }
});

/* -------------------------------------------------------------------------- */
/* Manifest integrity                                                         */
/* -------------------------------------------------------------------------- */

test('every manifest declares an id that can actually be transmitted', () => {
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    assert.ok(
      contract.isProviderId(manifest.id),
      `${manifest.id} cannot survive the validation on the way in`
    );
  }
});

test('no two providers claim one id', () => {
  const ids = manifests.PROVIDER_MANIFESTS.map((manifest) => manifest.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every manifest declares at least one real authentication method', () => {
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    assert.ok(manifest.authMethods.length > 0, `${manifest.id} declares no auth method`);
    for (const method of manifest.authMethods) {
      assert.ok(contract.isAuthMethod(method), `${manifest.id} invents ${method}`);
    }
  }
});

test('capability declarations carry provenance, and only one is verified live', () => {
  const live = manifests.PROVIDER_MANIFESTS.filter(
    (manifest) => manifest.verification === 'verified-live'
  ).map((manifest) => manifest.id);

  // Honesty tripwire. Promoting a manifest to `verified-live` without having run
  // it against a real runtime is precisely the failure `permission-policy.ts`
  // records — a belief written down as a finding, surviving for milestones.
  assert.deepEqual(live, ['claude-code']);

  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    assert.ok(
      ['verified-live', 'vendor-documented', 'unverified'].includes(manifest.verification),
      `${manifest.id} has no capability provenance`
    );
  }
});

test('a Council-capable provider declares the instruction file it discovers', () => {
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    if (!capabilities.isCouncilCapable(manifest.capabilities)) continue;
    assert.ok(
      typeof manifest.instructionFile === 'string' && manifest.instructionFile.endsWith('.md'),
      `${manifest.id} claims engineDiscovery with nothing to discover`
    );
  }
});

test('pointer files are generated for every non-kernel convention', () => {
  const pointers = manifests.pointerFilenames('CLAUDE.md');
  // The kernel is copied as itself, never generated as a pointer to itself.
  assert.equal(pointers.includes('CLAUDE.md'), false);
  assert.ok(pointers.includes('GEMINI.md'));
});

/* -------------------------------------------------------------------------- */
/* Deep link — navigation only                                                */
/* -------------------------------------------------------------------------- */

test('every documented route parses', () => {
  for (const { url } of deeplink.describeRoutes()) {
    // Substitute the placeholder with a real provider id for the parametrised route.
    const concrete = url.replace('<provider>', 'claude-code');
    const result = deeplink.parseDeepLink(concrete);
    assert.equal(result.ok, true, `${concrete} did not parse`);
  }
});

test('no route accepts a filesystem path, in any encoding', () => {
  const attempts = [
    'dwigi://workspace/open?path=/etc/passwd',
    'dwigi://workspace/open/../../etc/passwd',
    'dwigi://workspace/open/%2e%2e%2f%2e%2e%2fetc',
    'dwigi://workspace/open/C:%5CWindows',
    'dwigi://connect/../../../secret',
  ];
  for (const attempt of attempts) {
    const result = deeplink.parseDeepLink(attempt);
    if (result.ok) {
      // A query string is discarded rather than parsed, so the bare route may
      // legitimately match — but it must carry no parameter out of it.
      assert.equal(result.intent.param, undefined, `${attempt} smuggled a parameter`);
    }
  }
});

test('a percent-encoded separator cannot introduce a path segment', () => {
  const result = deeplink.parseDeepLink('dwigi://connect/claude%2Fcode');
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'malformed');
});

test('unknown routes are refused rather than best-guessed', () => {
  const result = deeplink.parseDeepLink('dwigi://setting');
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'unknown-route');
});

test('a reserved future route is refused with a specific reason', () => {
  const result = deeplink.parseDeepLink('dwigi://journal');
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'reserved');
  // Distinguishable from unknown, so the notice can say "not in this version"
  // rather than "that is not a thing".
  assert.match(result.reason, /not available in this version/);
});

test('another scheme is refused', () => {
  const result = deeplink.parseDeepLink('file:///etc/passwd');
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'wrong-scheme');
});

test('a malformed provider id is refused', () => {
  const result = deeplink.parseDeepLink('dwigi://connect/Claude_Code!');
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'bad-parameter');
});

test('control characters and oversized links are refused before parsing', () => {
  assert.equal(deeplink.parseDeepLink('dwigi://settings\u0000').ok, false);
  assert.equal(deeplink.parseDeepLink(`dwigi://settings${'a'.repeat(600)}`).ok, false);
});

test('every honoured intent has a screen to land on', () => {
  for (const route of deeplink.ROUTES) {
    const mapped = deeplink.INTENT_ROUTES[route.intent];
    assert.ok(mapped, `${route.intent} validates and navigates nowhere`);
  }
});

/* -------------------------------------------------------------------------- */
/* Redaction                                                                  */
/* -------------------------------------------------------------------------- */

test('credential shapes are redacted wherever they appear', () => {
  const samples = [
    'sk-abcdefghijklmnopqrstuvwxyz012345',
    'sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
    'ghp_abcdefghijklmnopqrstuvwxyz012345',
    'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N',
    'Authorization: Bearer abcdefghijklmnopqrst',
    'api_key=supersecretvalue',
  ];
  for (const sample of samples) {
    const cleaned = redact.redactText(sample);
    assert.equal(redact.findLeaks(cleaned).length, 0, `leaked: ${sample}`);
  }
});

test('the founder’s own name is redacted out of paths', () => {
  const windows = redact.redactText('C:\\Users\\Sample\\Documents\\Acme');
  assert.equal(windows.includes('Sample'), false);
  // The rest of the path survives, because it explains a whole class of failure.
  assert.ok(windows.includes('Documents'));

  assert.equal(redact.redactText('/Users/sample/dev').includes('sample'), false);
  assert.equal(redact.redactText('/home/sample/dev').includes('sample'), false);
});

test('a sensitive field is masked whatever it holds', () => {
  const exported = redact.redactDeep({
    apiKey: 'anything at all',
    accessToken: 'x',
    nested: { password: 'hunter2', harmless: 'visible' },
  });
  assert.match(String(exported.apiKey), /redacted/);
  assert.match(String(exported.accessToken), /redacted/);
  assert.match(String(exported.nested.password), /redacted/);
  assert.equal(exported.nested.harmless, 'visible');
});

test('presence is preserved so a bug report can tell absent from masked', () => {
  const exported = redact.redactDeep({ apiKey: null, otherKey: 'value' });
  assert.equal(exported.apiKey, null);
  assert.match(String(exported.otherKey), /redacted/);
});

test('enum-valued auth fields survive so diagnostics stay useful', () => {
  const exported = redact.redactDeep({ authMethod: 'browser', authState: 'authenticated' });
  assert.equal(exported.authMethod, 'browser');
  assert.equal(exported.authState, 'authenticated');
});

test('a secret hidden in an innocently-named field is still caught', () => {
  // Key-matching would miss this; shape-matching is the second, unrelated filter.
  const exported = redact.redactDeep({ note: 'the key is sk-abcdefghijklmnopqrstuvwxyz01' });
  assert.equal(redact.findLeaks(JSON.stringify(exported)).length, 0);
});

test('redaction terminates on a cyclic structure', () => {
  const cyclic = { name: 'root' };
  cyclic.self = cyclic;
  // Would hang without the depth bound, turning "file a bug" into a frozen window.
  const exported = redact.redactDeep(cyclic);
  assert.ok(exported);
});

test('a masked value cannot be mistaken for a usable one', () => {
  const masked = redact.mask('sk-abcdefghijklmnopqrstuvwxyz01');
  assert.match(masked, /redacted/);
  assert.equal(masked.includes('sk-'), false);
});

/* -------------------------------------------------------------------------- */
/* Workspace manifest                                                         */
/* -------------------------------------------------------------------------- */

test('the manifest cannot carry business content', () => {
  const forbidden = [
    'businessMemory',
    'memory',
    'journal',
    'decisions',
    'credentials',
    'apiKey',
    'conversations',
    'transcript',
    'reasoning',
    'executiveOutput',
  ];
  for (const key of forbidden) {
    assert.equal(
      workspace.SCHEMA_KEYS.includes(key),
      false,
      `${key} is not the manifest's to hold — it already has an owner`
    );
  }
});

test('only schema keys reach disk, whatever the input contained', () => {
  const read = workspace.readManifest(
    {
      schemaVersion: 1,
      name: 'Acme',
      // Smuggled in by hand or by a future build. Must not survive a rewrite.
      businessMemory: { runway: 4 },
      apiKey: 'sk-abcdefghijklmnopqrstuvwxyz01',
    },
    { name: 'fallback', appVersion: '1.2.0', now: '2026-08-04T00:00:00.000Z' }
  );
  assert.equal(read.ok, true);
  const serialised = workspace.serialiseManifest(read.manifest);
  assert.equal(serialised.includes('businessMemory'), false);
  assert.equal(serialised.includes('sk-'), false);
});

test('an older manifest migrates rather than being discarded', () => {
  const read = workspace.readManifest(
    { schemaVersion: 0, name: 'Legacy' },
    { name: 'fallback', appVersion: '1.2.0', now: '2026-08-04T00:00:00.000Z' }
  );
  assert.equal(read.ok, true);
  assert.equal(read.manifest.name, 'Legacy');
  assert.equal(read.migratedFrom, 0);
  assert.equal(read.manifest.schemaVersion, workspace.WORKSPACE_SCHEMA_VERSION);
});

test('a newer manifest is refused rather than silently downgraded', () => {
  const read = workspace.readManifest(
    { schemaVersion: 999, name: 'FromTheFuture', unknownField: 'keep me' },
    { name: 'fallback', appVersion: '1.2.0', now: '2026-08-04T00:00:00.000Z' }
  );
  // Rewriting it would drop `unknownField` — settings a newer build wrote.
  assert.equal(read.ok, false);
  assert.equal(read.kind, 'future');
});

test('a missing manifest is an ordinary state for a v1.0.1 workspace', () => {
  const read = workspace.readManifest(null, {
    name: 'Existing',
    appVersion: '1.2.0',
    now: '2026-08-04T00:00:00.000Z',
  });
  assert.equal(read.ok, false);
  assert.equal(read.kind, 'absent');
});

test('an unconfigured executive list stays null rather than becoming an empty board', () => {
  const read = workspace.readManifest(
    { schemaVersion: 1, preferredExecutives: ['!!bad', 123] },
    { name: 'n', appVersion: '1.2.0', now: '2026-08-04T00:00:00.000Z' }
  );
  // An empty enabled set would transmit a council of nobody.
  assert.equal(read.manifest.preferredExecutives, null);
});

test('opening stamps the open, never the creation', () => {
  const created = workspace.createManifest({
    name: 'Acme',
    appVersion: '1.0.1',
    now: '2026-01-01T00:00:00.000Z',
  });
  const opened = workspace.stampOpened(created, '1.2.0', '2026-08-04T00:00:00.000Z');
  assert.equal(opened.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(opened.createdVersion, '1.0.1');
  assert.equal(opened.lastOpenedVersion, '1.2.0');
  // Together these tell a bug report that an old workspace was carried forward,
  // which is where a migration bug hides.
  assert.notEqual(opened.createdVersion, opened.lastOpenedVersion);
});

test('recent sessions are bounded, de-duplicated, and newest first', () => {
  let manifest = workspace.createManifest({
    name: 'Acme',
    appVersion: '1.2.0',
    now: '2026-08-04T00:00:00.000Z',
  });
  for (let i = 0; i < 15; i += 1) manifest = workspace.rememberSession(manifest, `s${i}`);
  manifest = workspace.rememberSession(manifest, 's14');
  assert.equal(manifest.recentSessions.length, workspace.RECENT_SESSIONS_MAX);
  assert.equal(manifest.recentSessions[0], 's14');
  assert.equal(new Set(manifest.recentSessions).size, manifest.recentSessions.length);
});

test('serialisation is stable, so an unchanged manifest produces no diff', () => {
  const manifest = workspace.createManifest({
    name: 'Acme',
    appVersion: '1.2.0',
    now: '2026-08-04T00:00:00.000Z',
  });
  assert.equal(workspace.serialiseManifest(manifest), workspace.serialiseManifest(manifest));
});

test('the required structure is one list, shared by creation and validation', () => {
  const essential = workspace.REQUIRED_STRUCTURE.filter((entry) => entry.essential).map(
    (entry) => entry.path
  );
  assert.ok(essential.includes('CLAUDE.md'));
  assert.ok(essential.includes('core/executives'));
  // journal/ and dossier/ do not exist until the advisor writes into them, which
  // v1.0.1 shipped deliberately. Marking them essential would fail every existing
  // installation on open.
  const optional = workspace.REQUIRED_STRUCTURE.filter((entry) => !entry.essential).map(
    (entry) => entry.path
  );
  assert.ok(optional.includes('journal'));
  assert.ok(optional.includes('dossier'));
});

test('provider and lens id shapes agree across modules', () => {
  // `workspace.ts` duplicates the shape rather than importing it, to avoid coupling
  // workspace reading to the provider contract. This is the assertion that pays for
  // the duplication.
  for (const sample of ['claude-code', 'gemini-cli', 'openai', 'sales-gtm']) {
    const read = workspace.readManifest(
      { schemaVersion: 1, preferredRuntime: sample },
      { name: 'n', appVersion: '1.2.0', now: '2026-08-04T00:00:00.000Z' }
    );
    assert.equal(read.manifest.preferredRuntime, sample);
    assert.equal(contract.isProviderId(sample), true);
  }
  for (const bad of ['Claude Code', 'openai!', '-leading', '']) {
    const read = workspace.readManifest(
      { schemaVersion: 1, preferredRuntime: bad },
      { name: 'n', appVersion: '1.2.0', now: '2026-08-04T00:00:00.000Z' }
    );
    assert.equal(read.manifest.preferredRuntime, null);
    assert.equal(contract.isProviderId(bad), false);
  }
});
