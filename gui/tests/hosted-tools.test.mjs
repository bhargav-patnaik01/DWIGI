/**
 * v1.3 — Read-only Tool Adapter for Hosted engines.
 *
 * Scoped to the user's exact governing spec: six generic read-only tools
 * (`shared/runtime/tools.ts`) plus two D.W.I.G.I-domain reads, executed only
 * through `electron/runtime/tools/execute.ts`, gated by the `readOnlyTools`
 * capability, never write/delete/install/terminal/network, and no remembered
 * consent introduced anywhere in this path.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUI = path.resolve(HERE, '..');

const tools = await import('../dist-electron/shared/runtime/tools.js');
const execute = await import('../dist-electron/electron/runtime/tools/execute.js');
const manifests = await import('../dist-electron/shared/runtime/manifests.js');
const capabilities = await import('../dist-electron/shared/runtime/capabilities.js');

/* -------------------------------------------------------------------------- */
/* The tool definitions themselves                                            */
/* -------------------------------------------------------------------------- */

test('exactly the eight tools the governing spec named, no more', () => {
  assert.deepEqual(
    [...tools.READ_ONLY_TOOL_NAMES].sort(),
    [
      'git_diff',
      'git_log',
      'git_status',
      'list_directory',
      'read_business_memory',
      'read_file',
      'read_imported_context',
      'search_workspace',
    ]
  );
});

test('every tool compiles to a well-formed OpenAI function spec', () => {
  const specs = tools.toOpenAIToolSpecs();
  assert.equal(specs.length, tools.READ_ONLY_TOOL_NAMES.length);
  for (const spec of specs) {
    assert.equal(spec.type, 'function');
    assert.ok(tools.isReadOnlyToolName(spec.function.name), spec.function.name);
    assert.equal(spec.function.parameters.type, 'object');
    assert.equal(spec.function.parameters.additionalProperties, false);
    assert.ok(spec.function.description.length > 10);
  }
});

test('isReadOnlyToolName rejects anything outside the closed vocabulary', () => {
  assert.ok(!tools.isReadOnlyToolName('terminal'));
  assert.ok(!tools.isReadOnlyToolName('write_file'));
  assert.ok(!tools.isReadOnlyToolName('delete_file'));
  assert.ok(!tools.isReadOnlyToolName(123));
});

/* -------------------------------------------------------------------------- */
/* Capability declarations                                                    */
/* -------------------------------------------------------------------------- */

test('readOnlyTools is declared honestly, not uniformly, across manifests', () => {
  const state = (id) =>
    capabilities.stateOf(manifests.manifestFor(id).capabilities, 'readOnlyTools');

  // Native engines have their own tools; the hosted read-only set is not
  // offered to them at all.
  assert.equal(state('claude-code'), 'unsupported');
  assert.equal(state('gemini-cli'), 'unsupported');

  // Stable, documented function-calling APIs: genuinely supported.
  assert.equal(state('openai'), 'supported');
  assert.equal(state('azure-openai'), 'supported');

  // Model-dependent, not transport-dependent: honestly unknown, never
  // asserted as either supported or unsupported.
  assert.equal(state('ollama'), 'unknown');
  assert.equal(state('lmstudio'), 'unknown');
  assert.equal(state('openrouter'), 'unknown');
});

test('readOnlyTools never widens the Council-capability gate', () => {
  // The gate is exactly engineDiscovery + filesystem + toolCalling — adding a
  // new capability key must not have changed which providers pass it.
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    const expectedCouncilCapable = manifest.id === 'claude-code' || manifest.id === 'gemini-cli';
    assert.equal(capabilities.isCouncilCapable(manifest.capabilities), expectedCouncilCapable, manifest.id);
  }
});

test('every unsupported or unknown readOnlyTools declaration explains itself', () => {
  for (const manifest of manifests.PROVIDER_MANIFESTS) {
    const state = capabilities.stateOf(manifest.capabilities, 'readOnlyTools');
    if (state === 'supported') continue;
    assert.ok(
      typeof manifest.capabilities.reasons?.readOnlyTools === 'string' &&
        manifest.capabilities.reasons.readOnlyTools.length > 10,
      `${manifest.id} declares readOnlyTools=${state} with no reason`
    );
  }
});

/* -------------------------------------------------------------------------- */
/* The executor — a real temp workspace, real filesystem, real git            */
/* -------------------------------------------------------------------------- */

function makeWorkspace() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'dwigi-tools-')));
  mkdirSync(path.join(root, 'core'), { recursive: true });
  writeFileSync(path.join(root, 'core', 'business_memory.md'), '# Business Memory\n\nfield: value\n');
  writeFileSync(path.join(root, 'notes.md'), 'first line\nfindme here\nlast line\n');
  mkdirSync(path.join(root, 'sub'), { recursive: true });
  writeFileSync(path.join(root, 'sub', 'file.txt'), 'nested content\n');
  return root;
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

test('read_file returns the real contents of a real workspace file', async () => {
  const root = makeWorkspace();
  try {
    const result = await execute.executeReadOnlyTool('read_file', { path: 'notes.md' }, { workspacePath: root });
    assert.ok(result.ok);
    const payload = JSON.parse(result.content);
    assert.match(payload.content, /findme here/);
    assert.equal(payload.truncated, false);
  } finally {
    cleanup(root);
  }
});

test('read_file refuses a path that resolves outside the workspace', async () => {
  const root = makeWorkspace();
  try {
    const result = await execute.executeReadOnlyTool(
      'read_file',
      { path: '../../../../../../etc/passwd' },
      { workspacePath: root }
    );
    assert.equal(result.ok, false);
    const payload = JSON.parse(result.content);
    assert.equal(payload.error, 'outside_workspace');
  } finally {
    cleanup(root);
  }
});

test('read_file refuses an absolute path outside the workspace', async () => {
  const root = makeWorkspace();
  const outside = mkdtempSync(path.join(tmpdir(), 'dwigi-outside-'));
  writeFileSync(path.join(outside, 'secret.txt'), 'do not read me\n');
  try {
    const result = await execute.executeReadOnlyTool(
      'read_file',
      { path: path.join(outside, 'secret.txt') },
      { workspacePath: root }
    );
    assert.equal(result.ok, false);
    assert.equal(JSON.parse(result.content).error, 'outside_workspace');
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test('list_directory lists real entries and defaults to the workspace root', async () => {
  const root = makeWorkspace();
  try {
    const result = await execute.executeReadOnlyTool('list_directory', {}, { workspacePath: root });
    assert.ok(result.ok);
    const names = JSON.parse(result.content).entries.map((e) => e.name);
    assert.ok(names.includes('notes.md'));
    assert.ok(names.includes('sub'));
  } finally {
    cleanup(root);
  }
});

test('search_workspace finds a real match and reports how many files it searched', async () => {
  const root = makeWorkspace();
  try {
    const result = await execute.executeReadOnlyTool(
      'search_workspace',
      { pattern: 'findme' },
      { workspacePath: root }
    );
    assert.ok(result.ok);
    const payload = JSON.parse(result.content);
    assert.equal(payload.matches.length, 1);
    assert.equal(payload.matches[0].file, 'notes.md');
    assert.ok(payload.files_searched >= 1);
  } finally {
    cleanup(root);
  }
});

test('search_workspace refuses a scope path outside the workspace', async () => {
  const root = makeWorkspace();
  try {
    const result = await execute.executeReadOnlyTool(
      'search_workspace',
      { pattern: 'x', path: '..' },
      { workspacePath: root }
    );
    assert.equal(result.ok, false);
    assert.equal(JSON.parse(result.content).error, 'outside_workspace');
  } finally {
    cleanup(root);
  }
});

test('search_workspace reports an invalid regular expression rather than throwing', async () => {
  const root = makeWorkspace();
  try {
    const result = await execute.executeReadOnlyTool(
      'search_workspace',
      { pattern: '(unclosed' },
      { workspacePath: root }
    );
    assert.equal(result.ok, false);
    assert.equal(JSON.parse(result.content).error, 'invalid_pattern');
  } finally {
    cleanup(root);
  }
});

test('git_status, git_diff, and git_log read a real repository, read-only', async () => {
  const root = makeWorkspace();
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-q', '-m', 'initial commit'], { cwd: root });
    writeFileSync(path.join(root, 'notes.md'), 'first line\nfindme here\nan added line\nlast line\n');

    const status = await execute.executeReadOnlyTool('git_status', {}, { workspacePath: root });
    assert.ok(status.ok);
    const statusPayload = JSON.parse(status.content);
    assert.ok(statusPayload.unstaged.includes('notes.md'));
    assert.equal(statusPayload.clean, false);

    const diff = await execute.executeReadOnlyTool('git_diff', {}, { workspacePath: root });
    assert.ok(diff.ok);
    const diffPayload = JSON.parse(diff.content);
    assert.match(diffPayload.diff, /an added line/);
    assert.equal(diffPayload.files_changed, 1);

    const log = await execute.executeReadOnlyTool('git_log', {}, { workspacePath: root });
    assert.ok(log.ok);
    const logPayload = JSON.parse(log.content);
    assert.equal(logPayload.commits.length, 1);
    assert.equal(logPayload.commits[0].message, 'initial commit');
  } finally {
    cleanup(root);
  }
});

test('git tools report not_a_repository rather than crashing on a plain directory', async () => {
  const root = makeWorkspace();
  try {
    for (const name of ['git_status', 'git_diff', 'git_log']) {
      const result = await execute.executeReadOnlyTool(name, {}, { workspacePath: root });
      assert.equal(result.ok, false, name);
      assert.equal(JSON.parse(result.content).error, 'not_a_repository', name);
    }
  } finally {
    cleanup(root);
  }
});

test('git tools refuse a cwd outside the workspace', async () => {
  const root = makeWorkspace();
  try {
    const result = await execute.executeReadOnlyTool('git_status', { cwd: '..' }, { workspacePath: root });
    assert.equal(result.ok, false);
    assert.equal(JSON.parse(result.content).error, 'outside_workspace');
  } finally {
    cleanup(root);
  }
});

test('read_business_memory returns the real file, and a clear not-found when absent', async () => {
  const root = makeWorkspace();
  try {
    const found = await execute.executeReadOnlyTool('read_business_memory', {}, { workspacePath: root });
    assert.ok(found.ok);
    assert.match(JSON.parse(found.content).content, /Business Memory/);

    rmSync(path.join(root, 'core', 'business_memory.md'));
    const missing = await execute.executeReadOnlyTool('read_business_memory', {}, { workspacePath: root });
    assert.equal(missing.ok, false);
    assert.equal(JSON.parse(missing.content).error, 'not_found');
  } finally {
    cleanup(root);
  }
});

test('read_imported_context lists and reads only within its own fixed directory', async () => {
  const root = makeWorkspace();
  try {
    mkdirSync(path.join(root, '.dwigi', 'imported-context'), { recursive: true });
    writeFileSync(path.join(root, '.dwigi', 'imported-context', 'pitch.txt'), 'the pitch deck text\n');

    const listed = await execute.executeReadOnlyTool('read_imported_context', {}, { workspacePath: root });
    assert.ok(listed.ok);
    assert.deepEqual(JSON.parse(listed.content).documents, ['pitch.txt']);

    const read = await execute.executeReadOnlyTool(
      'read_imported_context',
      { name: 'pitch.txt' },
      { workspacePath: root }
    );
    assert.ok(read.ok);
    assert.match(JSON.parse(read.content).content, /pitch deck/);

    // A traversal attempt through `name` is stripped to a basename, never
    // followed — it can only ever miss inside the fixed directory, not escape it.
    const traversal = await execute.executeReadOnlyTool(
      'read_imported_context',
      { name: '../../core/business_memory.md' },
      { workspacePath: root }
    );
    assert.equal(traversal.ok, false);
    assert.equal(JSON.parse(traversal.content).error, 'not_found');
  } finally {
    cleanup(root);
  }
});

test('an unrecognised tool name fails cleanly instead of throwing', async () => {
  const root = makeWorkspace();
  try {
    const result = await execute.executeReadOnlyTool('terminal', {}, { workspacePath: root });
    assert.equal(result.ok, false);
    assert.equal(JSON.parse(result.content).error, 'unknown_tool');
  } finally {
    cleanup(root);
  }
});

/* -------------------------------------------------------------------------- */
/* No mutating primitive exists in the executor at all                        */
/* -------------------------------------------------------------------------- */

test('the executor imports no write, delete, or shell-command primitive', () => {
  const raw = readFileSync(path.join(GUI, 'electron', 'runtime', 'tools', 'execute.ts'), 'utf8');
  // Strip comments before scanning — this file's own header documents which
  // primitives it deliberately does not import, using their names in prose,
  // and a bare substring scan would trip on its own documentation the same
  // way this codebase has been bitten before by "dismissible" matching
  // "dismiss".
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const forbidden of ['writeFile', 'mkdir', 'rm(', 'rmdir', 'rename', 'unlink', 'exec(', 'spawn(']) {
    assert.ok(!code.includes(forbidden), `execute.ts imports or calls "${forbidden}"`);
  }
  const source = code;
  // The one process primitive present is `execFile`, called only with a fixed
  // `'git'` binary and a caller-uninfluenced argument shape per tool — never a
  // shell string a caller's arguments could be concatenated into.
  assert.match(source, /execFileAsync\('git', /);
  assert.ok(!source.includes('shell: true'));
});

/* -------------------------------------------------------------------------- */
/* HttpChatSession wiring — graceful degradation, bounded loop, no consent    */
/* -------------------------------------------------------------------------- */

test('tools are gated on readOnlyTools !== unsupported, and never sent otherwise', () => {
  const source = readFileSync(
    path.join(GUI, 'electron', 'runtime', 'providers', 'http-chat.ts'),
    'utf8'
  );
  assert.match(source, /toolsEnabled\s*=\s*stateOf\(manifest\.capabilities, 'readOnlyTools'\) !== 'unsupported'/);
  assert.match(source, /if \(this\.toolsEnabled\) body\.tools = toOpenAIToolSpecs\(\)/);
});

test('a runaway tool-call loop is bounded and reported, not infinite', () => {
  const source = readFileSync(
    path.join(GUI, 'electron', 'runtime', 'providers', 'http-chat.ts'),
    'utf8'
  );
  assert.match(source, /MAX_TOOL_ITERATIONS/);
  assert.match(source, /iteration >= MAX_TOOL_ITERATIONS/);
  assert.match(source, /kind: 'runtime-notice'/);
});

test('a tool call is reported as activity, never as a blocking permission request', () => {
  const source = readFileSync(
    path.join(GUI, 'electron', 'runtime', 'providers', 'http-chat.ts'),
    'utf8'
  );
  // The whole read-only set declares `requires_confirmation: false`
  // (`runtime/tools/*.json`), so nothing in this class should ever construct
  // a `permission-request` event — that would be inventing a consent step for
  // an action the spec says needs none.
  assert.ok(!source.includes("kind: 'permission-request'"));
  assert.match(source, /kind: 'activity'/);
});

test('no remembered-consent or auto-approval mechanism exists for tool calls', () => {
  const source = readFileSync(
    path.join(GUI, 'electron', 'runtime', 'providers', 'http-chat.ts'),
    'utf8'
  );
  // Mirrors the "DELIBERATELY NOT DONE" rule in `electron/bridge/permission-policy.ts`:
  // no allowlist, no remembered decision, no "always allow" — every read-only
  // call executes because the tool itself is unconditionally read-only, never
  // because a prior answer was cached.
  for (const forbidden of ['alwaysAllow', 'rememberedConsent', 'autoApprove', 'allowlist']) {
    assert.ok(!source.toLowerCase().includes(forbidden.toLowerCase()), forbidden);
  }
});

test('every read-only tool JSON spec at the repo root still declares requires_confirmation: false', () => {
  const toolsDir = path.join(path.resolve(GUI, '..'), 'runtime', 'tools');
  for (const name of ['read_file.json', 'list_directory.json', 'search_workspace.json', 'git_status.json', 'git_diff.json', 'git_log.json']) {
    const spec = JSON.parse(readFileSync(path.join(toolsDir, name), 'utf8'));
    assert.equal(spec.read_only, true, name);
    assert.equal(spec.requires_confirmation, false, name);
  }
  const terminalSpec = JSON.parse(readFileSync(path.join(toolsDir, 'terminal.json'), 'utf8'));
  assert.equal(terminalSpec.requires_confirmation, true, 'terminal.json must still require confirmation');
});
