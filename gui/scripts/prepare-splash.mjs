#!/usr/bin/env node
/**
 * Stage the startup animation for the renderer bundle.
 *
 * `gui/start.mp4` is the tracked source of truth, exactly as `gui/icon.png` is
 * for the icon. Next only serves what lives under `public/`, so the video is
 * copied there at build time and that copy is gitignored — committing it would
 * create a second authority that silently outlives a change to the real asset.
 *
 * Absence is an ordinary state, not an error. A clone without the video builds
 * fine and simply starts without a splash; `electron/splash.ts` degrades to
 * showing the application immediately.
 *
 *   node scripts/prepare-splash.mjs
 */

import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUI = path.resolve(HERE, '..');

const SOURCE = path.join(GUI, 'start.mp4');
const TARGET = path.join(GUI, 'public', 'start.mp4');

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(path.dirname(TARGET), { recursive: true });

  if (!(await exists(SOURCE))) {
    /*
     * Remove a stale copy rather than leaving it.
     *
     * Deleting the source but keeping a previously staged copy would ship an
     * animation nobody can find the origin of — the exact "second authority"
     * this staging step exists to prevent.
     */
    if (await exists(TARGET)) {
      await rm(TARGET, { force: true });
      console.log('splash   removed a staged copy left by an earlier build');
    }
    console.log('splash   start.mp4 absent — the app will start without a splash');
    return;
  }

  await copyFile(SOURCE, TARGET);
  const { size } = await stat(TARGET);
  console.log(`splash   staged start.mp4 (${(size / 1048576).toFixed(2)} MB)`);
}

main().catch((error) => {
  // Never fail the build over a decorative asset.
  console.error(`splash   could not stage start.mp4: ${error.message}`);
});
