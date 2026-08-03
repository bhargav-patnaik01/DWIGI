#!/usr/bin/env node
/**
 * Compute CSP hashes for the inline scripts Next emits into the static export.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS TO FIX
 * ---------------------------------------------------------------------------
 * The packaged application served every page with `script-src 'self' app:`.
 * Next's export puts its bootstrap and hydration payload in inline `<script>`
 * tags, so Chromium refused all of them and **React never hydrated**. The window
 * showed correct-looking static HTML with no interactivity behind it: no store,
 * no effects, no IPC.
 *
 * It survived because every development harness serves pages WITHOUT the CSP
 * header — only `electron/main.ts` attaches it — so screenshots and DOM audits
 * were taken against a hydrated app that the shipped one did not resemble.
 *
 * ---------------------------------------------------------------------------
 * WHY HASHES RATHER THAN 'unsafe-inline'
 * ---------------------------------------------------------------------------
 * `'unsafe-inline'` would fix it in one line and discard the reason the policy
 * exists: any injected `<script>` would then execute. Hashes keep the policy
 * absolute — these exact scripts and nothing else — and they are regenerated on
 * every build, so they cannot drift from what is actually shipped.
 *
 * A nonce is the other standard answer and is unavailable here: nonces must be
 * unique per response, and a static export has no server to mint one.
 *
 *   node scripts/csp-hashes.mjs        # after `next build`
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'out');
const TARGET = path.join(OUT, 'csp-hashes.json');

/** Every `.html` under the export. */
async function htmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

/**
 * Inline script bodies, in document order.
 *
 * Only tags with no `src`: an external script is already covered by `'self'`.
 * The hash is over the exact bytes between the tags, which is what CSP
 * specifies — any whitespace change produces a different hash, and that is the
 * point.
 */
function inlineScripts(html) {
  const bodies = [];
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const body = match[1];
    if (body.length > 0) bodies.push(body);
  }
  return bodies;
}

async function main() {
  let files;
  try {
    files = await htmlFiles(OUT);
  } catch {
    console.error('csp      no out/ directory — run `next build` first');
    process.exit(1);
  }

  const hashes = new Set();
  for (const file of files) {
    for (const body of inlineScripts(await readFile(file, 'utf8'))) {
      hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
    }
  }

  const sorted = [...hashes].sort();
  await writeFile(TARGET, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');

  console.log(
    `csp      ${sorted.length} inline script hash${sorted.length === 1 ? '' : 'es'} ` +
      `across ${files.length} page${files.length === 1 ? '' : 's'} -> out/csp-hashes.json`
  );

  /*
   * Zero hashes means either Next stopped emitting inline scripts — good, and
   * this step becomes a no-op — or the scan failed to match them, which would
   * silently restore the very bug this script fixes. Loud either way.
   */
  if (sorted.length === 0) {
    console.warn('csp      WARNING: no inline scripts found. If the app does not hydrate,');
    console.warn('csp               this scan is matching nothing and needs revisiting.');
  }
}

main().catch((error) => {
  console.error(`csp      failed: ${error.message}`);
  process.exit(1);
});
