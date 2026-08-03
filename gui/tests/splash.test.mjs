/**
 * STARTUP SPLASH TESTS
 *
 * The splash sits between the founder and their application, so its failure
 * mode is the worst one available: a window that never appears looks exactly
 * like an application that will not start.
 *
 * These check the parts that can be checked without a display — the staging
 * step, the page's own contract, and the wiring in the host. Playback itself is
 * verified by launching the real app under `EIS_SMOKE=1`, which reports which
 * gate released the window and when.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUI = path.resolve(HERE, '..');

const read = (rel) => readFileSync(path.join(GUI, rel), 'utf8');

/**
 * Source with comments removed.
 *
 * These tests assert on what the code does, and comments here discuss the very
 * constructs being forbidden — the note explaining why `requestAnimationFrame`
 * must not come back contains the word `requestAnimationFrame`. Matching raw
 * text made the tests fail on their own documentation.
 */
const code = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '');

/* -------------------------------------------------------------------------- */
/* The page's contract with the host                                          */
/* -------------------------------------------------------------------------- */

test('the splash page publishes a promise and never a channel', () => {
  const js = read('public/splash.js');

  // The host reads `window.splashFinished` with executeJavaScript. Renaming it
  // would strand the host waiting on a promise that no longer exists.
  assert.match(js, /window\.splashFinished\s*=\s*new Promise/);

  // A splash is the least-privileged surface in the app. It must not acquire a
  // bridge into the host — the whole point of the promise handshake is that no
  // channel has to exist.
  for (const forbidden of ['ipcRenderer', 'require(', 'window.eis', 'contextBridge']) {
    assert.ok(!js.includes(forbidden), `the splash must not reference ${forbidden}`);
  }
});

test('every playback outcome settles the promise', () => {
  const js = read('public/splash.js');

  // Each of these is a way playback can end. A path that did not settle would
  // hold the application behind the splash until the host timed out.
  for (const outcome of ['ended', 'error', 'skipped', 'blocked']) {
    assert.ok(js.includes(`'${outcome}'`), `no settle path for "${outcome}"`);
  }

  // Autoplay rejection is a promise rejection, not an event, and is the failure
  // mode on Linux builds shipped without an H.264 decoder.
  assert.match(js, /\.catch\(\(\)\s*=>\s*settle\('blocked'\)\)/);
});

test('the splash offers a way out of a ten-second animation', () => {
  const js = read('public/splash.js');
  assert.match(js, /keydown/, 'no keyboard skip');
  assert.match(js, /click/, 'no pointer skip');
  for (const key of ['Escape', 'Enter']) {
    assert.ok(js.includes(key), `${key} should skip the splash`);
  }
});

test('the video carries no player chrome and cannot loop', () => {
  const html = code('public/splash.html');

  // Assert on the tag's own attributes rather than on the file's prose.
  const tag = /<video\b[^>]*>/.exec(html);
  assert.ok(tag, '<video> element not found');

  assert.ok(!/\bcontrols\b/.test(tag[0]), 'playback controls must not be shown');
  assert.ok(!/\bloop\b/.test(tag[0]), 'the animation plays exactly once');
  assert.match(tag[0], /\bmuted\b/, 'muted is what makes autoplay permissible');
  assert.match(tag[0], /\bplaysinline\b/);
});

test('the splash is a square centre crop, not a letterbox or a squash', () => {
  const html = code('public/splash.html');
  const splash = code('electron/splash.ts');

  /*
   * `cover` is what keeps the full height and cuts the width evenly.
   *
   * `contain` would letterbox a 16:9 source in a square window, and an explicit
   * width/height with no object-fit would squash it. Both are silent: the video
   * still plays, it just looks wrong, and nothing in a headless check would
   * notice.
   */
  assert.match(html, /object-fit:\s*cover/, 'the crop depends on object-fit: cover');
  assert.ok(!/object-fit:\s*contain/.test(html), 'contain would letterbox, not crop');

  // Square window, or `cover` crops toward the wrong axis.
  assert.match(splash, /const SPLASH_SIZE = \d+;/);
  assert.match(splash, /width:\s*SPLASH_SIZE,\s*\n\s*height:\s*SPLASH_SIZE,/);
});

test('rounded corners are backed by a transparent window', () => {
  const html = code('public/splash.html');
  const splash = code('electron/splash.ts');

  assert.match(html, /--splash-radius:\s*\d+px/, 'no radius defined');
  assert.match(html, /border-radius:\s*var\(--splash-radius\)/);
  assert.match(html, /overflow:\s*hidden/, 'the radius only crops with overflow hidden');

  /*
   * Without `transparent: true` the CSS radius clips the page while the native
   * window stays rectangular, so the corners show the window's own background
   * — four pale arcs on a dark square rather than a rounded window.
   */
  assert.match(splash, /transparent:\s*true/);
  assert.match(
    splash,
    /backgroundColor:\s*'#00000000'/,
    'an opaque window background fills the corners the radius removed'
  );
});

/* -------------------------------------------------------------------------- */
/* Host wiring                                                                */
/* -------------------------------------------------------------------------- */

test('the main window is revealed only by the coordinator', () => {
  const main = read('electron/main.ts');

  // `ready-to-show` means painted, not usable. Showing there is what would let
  // a founder see a half-built screen, and it is the regression most likely to
  // be reintroduced by someone "fixing" a slow start.
  const readyBlock = /win\.once\('ready-to-show'[\s\S]{0,400}?\n  \}\);/.exec(main);
  assert.ok(readyBlock, 'ready-to-show handler not found');
  assert.ok(
    !/win\.show\(\)/.test(readyBlock[0]),
    'the window must not be shown from ready-to-show'
  );

  // Both gates, and a ceiling above them.
  assert.match(main, /rendererReady && videoDone/);
  assert.match(main, /STARTUP_CEILING_MS/);
  assert.match(main, /setTimeout\(\(\) => reveal\('startup ceiling'\), STARTUP_CEILING_MS\)/);
});

test('reveal is idempotent, so no path can show the window twice', () => {
  const main = read('electron/main.ts');
  assert.match(main, /if \(revealed\) return;\s*\n\s*revealed = true;/);
});

test('the renderer signals readiness without waiting for a frame', () => {
  const shell = code('src/components/layout/AppShell.tsx');

  /*
   * The deadlock this guards against: the host hides the window until the
   * renderer reports ready, and Chromium does not run animation frames in a
   * window that has never been shown. Signalling from rAF meant the signal
   * never arrived and every launch waited out the 20-second ceiling.
   */
  assert.ok(
    !/requestAnimationFrame\s*\(/.test(shell),
    'requestAnimationFrame never fires in a window that has not been shown'
  );
  assert.match(shell, /signalReady\(\)/);
});

test('the app scheme can actually stream video', () => {
  const main = read('electron/main.ts');

  // Without `stream`, Chromium's media stack refuses a custom scheme and the
  // element errors within milliseconds — the splash silently never plays.
  assert.match(main, /stream:\s*true/);
  // And without a media MIME type it is served as opaque binary, same outcome.
  assert.match(main, /'\.mp4':\s*'video\/mp4'/);
  assert.match(main, /media-src 'self' app:/);
});

/* -------------------------------------------------------------------------- */
/* Staging                                                                    */
/* -------------------------------------------------------------------------- */

test('staging copies the tracked source and cleans up after itself', () => {
  const script = path.join(GUI, 'scripts', 'prepare-splash.mjs');
  const root = mkdtempSync(path.join(tmpdir(), 'eis-splash-'));

  try {
    // A fake gui/ with a source video.
    mkdirSync(path.join(root, 'scripts'), { recursive: true });
    writeFileSync(path.join(root, 'scripts', 'prepare-splash.mjs'), readFileSync(script));
    writeFileSync(path.join(root, 'start.mp4'), 'not really a video, but bytes are bytes');

    execFileSync(process.execPath, [path.join(root, 'scripts', 'prepare-splash.mjs')], {
      encoding: 'utf8',
    });
    assert.ok(existsSync(path.join(root, 'public', 'start.mp4')), 'source was not staged');

    // Removing the source must remove the staged copy, or the build ships an
    // animation with no origin — the second-authority problem the icon pipeline
    // has the same guard against.
    rmSync(path.join(root, 'start.mp4'));
    execFileSync(process.execPath, [path.join(root, 'scripts', 'prepare-splash.mjs')], {
      encoding: 'utf8',
    });
    assert.ok(
      !existsSync(path.join(root, 'public', 'start.mp4')),
      'a stale staged copy outlived its source'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an absent video never fails the build', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eis-splash-none-'));
  try {
    mkdirSync(path.join(root, 'scripts'), { recursive: true });
    writeFileSync(
      path.join(root, 'scripts', 'prepare-splash.mjs'),
      readFileSync(path.join(GUI, 'scripts', 'prepare-splash.mjs'))
    );
    // Exits zero and says so, rather than breaking a clone that has no asset.
    const out = execFileSync(process.execPath, [path.join(root, 'scripts', 'prepare-splash.mjs')], {
      encoding: 'utf8',
    });
    assert.match(out, /absent/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* The CSP regression this work uncovered                                     */
/* -------------------------------------------------------------------------- */

test('inline script hashes are generated and admitted by the policy', () => {
  /*
   * The packaged app served `script-src 'self' app:` while Next's export
   * bootstraps from inline scripts, so Chromium refused all of them and React
   * never hydrated. Every harness missed it because none of them attach the CSP.
   *
   * This asserts the fix is wired: hashes are read from the build and joined
   * into the directive, and the policy was NOT simply widened to allow any
   * inline script.
   */
  const main = read('electron/main.ts');
  assert.match(main, /readScriptHashes\(\)/);
  assert.match(main, /\["script-src 'self' app:", \.\.\.readScriptHashes\(\)\]\.join\(' '\)/);
  assert.ok(
    !/script-src[^\n]*unsafe-inline/.test(main),
    "script-src must never be widened to 'unsafe-inline'"
  );

  const generated = path.join(GUI, 'out', 'csp-hashes.json');
  if (existsSync(generated)) {
    const hashes = JSON.parse(readFileSync(generated, 'utf8'));
    assert.ok(Array.isArray(hashes) && hashes.length > 0, 'no inline hashes were generated');
    for (const hash of hashes) {
      assert.match(hash, /^'sha256-[A-Za-z0-9+/]+=*'$/, `malformed CSP hash: ${hash}`);
    }
  }
});
