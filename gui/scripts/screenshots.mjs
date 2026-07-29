#!/usr/bin/env node
/**
 * Launch the screenshot harness. Requires `npm run build` first.
 *
 *   node scripts/screenshots.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const electron = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');

const child = spawn(electron, [path.join(HERE, 'shot-main.cjs')], {
  cwd: ROOT,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => process.exit(code ?? 0));
