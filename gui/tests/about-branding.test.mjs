/**
 * Micro-sprint — About screen branding.
 *
 * Static assertions over the component source. Lightweight by instruction, and
 * scoped to the two things this sprint changed: what About leads with, and that
 * Diagnostics was not touched while doing it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GUI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(GUI, file), 'utf8');

test('About leads with the product, not the toolchain', () => {
  const about = read('src/components/settings/AgentManagement.tsx');
  const start = about.indexOf('export function About');
  assert.ok(start > 0, 'About component not found');
  const body = about.slice(start);

  const positionOf = (needle) => {
    const at = body.indexOf(needle);
    assert.ok(at > 0, `About does not mention ${needle}`);
    return at;
  };

  const product = positionOf('D.W.I.G.I');
  const version = positionOf('appVersion');
  const electron = positionOf('electronVersion');

  // The ordering IS the requirement. Electron appeared first before this sprint
  // — "About this build / Electron 34.5.8 / win32" — which told a founder they
  // had opened a developer tool.
  assert.ok(product < electron, 'Electron must never precede the product name');
  assert.ok(version < electron, "the application's own version must come first");
});

test('About states the product description and its author', () => {
  const about = read('src/components/settings/AgentManagement.tsx');
  const body = about.slice(about.indexOf('export function About'));
  assert.match(body, /An AI executive council for founders who decide alone\./);
  assert.match(body, /Bhargav Patnaik/);
  assert.match(body, /Created by/);
});

test('runtime detail is present but behind a disclosure', () => {
  const about = read('src/components/settings/AgentManagement.tsx');
  const body = about.slice(about.indexOf('export function About'));

  // Still reachable — the requirement is that it is demoted, not removed.
  for (const field of ['electronVersion', 'chromeVersion', 'nodeVersion']) {
    assert.ok(body.includes(field), `${field} is no longer reachable from About`);
  }

  assert.match(body, /Runtime information/);
  assert.match(body, /aria-expanded=\{showRuntime\}/, 'the disclosure must be announced');
  assert.match(body, /showRuntime && \(/, 'runtime detail must be collapsed by default');
});

test('the operating system is named, not printed as a build target', () => {
  const about = read('src/components/settings/AgentManagement.tsx');
  const body = about.slice(about.indexOf('export function About'));
  // `win32` reads as 32-bit on a 64-bit machine and is a build target, not a
  // product. Diagnostics still reports the raw token, because a bug report needs it.
  assert.match(body, /'Windows'/);
  assert.match(body, /'macOS'/);
  assert.match(body, /Architecture/);
});

test('the host actually supplies what About renders', () => {
  const host = read('shared/host.ts');
  const main = read('electron/main.ts');
  for (const field of ['chromeVersion', 'nodeVersion', 'arch']) {
    assert.ok(host.includes(field), `HostInfo does not declare ${field}`);
    assert.ok(main.includes(field), `host:info does not supply ${field}`);
  }
});

test('Diagnostics was not modified by this sprint', () => {
  const diagnostics = read('src/app/diagnostics/page.tsx');

  // The brief is explicit: redesign About only. Diagnostics must keep exposing
  // every runtime value exactly as before, with its redaction intact.
  assert.match(diagnostics, /electronVersion/);
  assert.match(diagnostics, /host\?\.platform/);
  assert.match(diagnostics, /findLeaks/, 'the export gate must still be present');
  assert.match(diagnostics, /redactDeep/);
  // And it must not have grown a collapsed section of its own.
  assert.ok(
    !/Runtime information/.test(diagnostics),
    'Diagnostics should not have inherited the About disclosure'
  );
});

test('Settings no longer carries a duplicate build row', () => {
  const settings = read('src/app/settings/page.tsx');
  assert.ok(
    !/label="About this build"/.test(settings),
    'the Electron-first build row should be gone, not duplicated beside About'
  );
  assert.match(settings, /<About host=\{host\}/, 'About must receive the full host record');
});
