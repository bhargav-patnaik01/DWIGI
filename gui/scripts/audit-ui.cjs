/**
 * UI audit harness — measures the rendered DOM instead of photographing it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS ALONGSIDE THE SCREENSHOT HARNESS
 * ---------------------------------------------------------------------------
 * `shot-main.cjs` captures what the app looks like, which needs a compositor.
 * On a machine without one — a CI box, a headless session — `capturePage()`
 * returns a 0x0 image and every capture silently writes an empty file. A green
 * run then proves nothing.
 *
 * This harness asks the page questions instead of taking its picture, so it runs
 * anywhere Electron runs. It is also strictly better than eyeballing for the
 * things it covers: a human comparing two screens cannot tell 12.5px from 13px,
 * and will not notice the one button in the app that lost its accessible name.
 *
 * It REPORTS. It fixes nothing and asserts nothing about taste — spacing rhythm
 * and hierarchy are judgment calls, and this only supplies the measurements they
 * should be judged on.
 *
 *   npm run audit:ui
 */

const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const { createReadStream, existsSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { stat } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const WORKSPACE =
  process.env.EIS_SHOT_WORKSPACE || path.resolve(ROOT, '..', '..', 'eis-sandbox');
const CONVERSATION_ROOT = path.join(os.tmpdir(), `eis-audit-conversations-${process.pid}`);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveAsset(urlPath) {
  const stripped = urlPath.split('?')[0] || '';
  const decoded = decodeURIComponent(stripped.split('#')[0] || '');
  const resolved = path.resolve(path.join(OUT_DIR, decoded));
  const root = path.resolve(OUT_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  try {
    const info = await stat(resolved);
    if (info.isDirectory()) return path.join(resolved, 'index.html');
    return resolved;
  } catch {
    return path.join(root, 'index.html');
  }
}

/* -------------------------------------------------------------------------- */
/* The audit, injected into the page                                           */
/* -------------------------------------------------------------------------- */

const AUDIT = `(() => {
  const out = {
    typography: {},
    radii: {},
    focusable: [],
    problems: [],
    text: document.body.innerText,
  };

  const px = (v) => Math.round(parseFloat(v) * 100) / 100;

  // --- srgb relative luminance, for contrast ---
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((n) => parseFloat(n));
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  };
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.85) return c.rgb;
      node = node.parentElement;
    }
    return [11, 11, 12];
  };
  const contrast = (fg, bg) => {
    const a = lum(fg) + 0.05;
    const b = lum(bg) + 0.05;
    return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100;
  };

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  for (const el of document.querySelectorAll('main *, aside *, [role="dialog"] *')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);

    // Typography inventory: only elements that directly own text.
    const ownsText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    if (ownsText) {
      const key = px(s.fontSize) + 'px/' + px(s.lineHeight) + '/' + s.fontWeight;
      out.typography[key] = (out.typography[key] || 0) + 1;

      const fg = parse(s.color);
      if (fg && fg.a > 0.5) {
        const ratio = contrast(fg.rgb, bgOf(el));
        const size = px(s.fontSize);
        const large = size >= 18.66 || (size >= 14 && parseInt(s.fontWeight, 10) >= 700);
        const floor = large ? 3 : 4.5;
        if (ratio < floor) {
          out.problems.push({
            kind: 'contrast',
            ratio,
            floor,
            size,
            text: (el.textContent || '').trim().slice(0, 60),
          });
        }
      }
    }

    if (s.borderRadius && s.borderRadius !== '0px') {
      out.radii[s.borderRadius] = (out.radii[s.borderRadius] || 0) + 1;
    }

    // Horizontal overflow of a clipping ancestor.
    if (el.scrollWidth > el.clientWidth + 1 && s.overflowX === 'hidden') {
      out.problems.push({
        kind: 'clipped-x',
        by: el.scrollWidth - el.clientWidth,
        text: (el.textContent || '').trim().slice(0, 60),
      });
    }
  }

  // --- focusables: order, accessible name, visible ring ---
  const SEL = 'a[href], button, input, textarea, select, [tabindex]';
  for (const el of document.querySelectorAll(SEL)) {
    if (!visible(el)) continue;
    if (el.hasAttribute('disabled')) continue;
    const name = (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el.getAttribute('aria-labelledby')
        ? (document.getElementById(el.getAttribute('aria-labelledby')) || {}).textContent || ''
        : '') ||
      el.textContent ||
      el.getAttribute('placeholder') ||
      ''
    ).trim();
    const entry = {
      tag: el.tagName.toLowerCase(),
      name: name.slice(0, 50),
      tabindex: el.getAttribute('tabindex'),
    };
    out.focusable.push(entry);
    if (!name) {
      out.problems.push({
        kind: 'unnamed-control',
        tag: entry.tag,
        html: el.outerHTML.slice(0, 120),
      });
    }
    const ti = el.getAttribute('tabindex');
    if (ti && parseInt(ti, 10) > 0) {
      out.problems.push({ kind: 'positive-tabindex', tag: entry.tag, tabindex: ti });
    }
  }

  // --- copy smells ---
  const body = document.body.innerText;
  for (const bad of [
    'undefined', 'NaN', 'null', '[object Object]',
    'No data', 'TODO', 'FIXME', 'lorem', 'Lorem',
    'localhost', 'Next.js', 'React', 'Electron demo',
  ]) {
    if (body.includes(bad)) {
      const i = body.indexOf(bad);
      out.problems.push({
        kind: 'copy',
        term: bad,
        context: body.slice(Math.max(0, i - 45), i + 45).replace(/\\n/g, ' | '),
      });
    }
  }

  return JSON.stringify(out);
})()`;

/* -------------------------------------------------------------------------- */

function registerIpc(getWindow) {
  const { RepositoryReader } = require(
    path.join(ROOT, 'dist-electron', 'electron', 'repo', 'index.js')
  );
  const { ConversationStore } = require(
    path.join(ROOT, 'dist-electron', 'electron', 'conversations', 'index.js')
  );
  const { readConversationMode } = require(
    path.join(ROOT, 'dist-electron', 'shared', 'conversations.js')
  );

  const send = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const repo = new RepositoryReader(() => send('repo:changed'));
  const conversations = new ConversationStore(CONVERSATION_ROOT);

  ipcMain.handle('host:info', () => ({
    appVersion: require(path.join(ROOT, 'package.json')).version,
    electronVersion: process.versions.electron,
    platform: process.platform,
    isDev: false,
    repositoryUrl: 'https://github.com/bhargav-patnaik01/DWIGI',
    forceFirstRun: false,
  }));
  ipcMain.handle('host:selectDirectory', () => null);
  ipcMain.handle('repo:setWorkspace', (_e, p) => repo.setWorkspace(p.workspacePath));
  ipcMain.handle('repo:snapshot', () => repo.snapshot());
  ipcMain.handle('repo:reveal', () => true);
  ipcMain.handle('conversations:list', (_e, p) => conversations.list(p.workspacePath));
  ipcMain.handle('conversations:create', (_e, p) =>
    conversations.create(p.workspacePath, { mode: readConversationMode(p.mode), title: p.title })
  );
  ipcMain.handle('conversations:load', (_e, p) => conversations.load(p.id));
  ipcMain.handle('conversations:append', (_e, p) => conversations.append(p.id, p.messages));
  ipcMain.handle('conversations:bindSession', (_e, p) => conversations.bindSession(p.id, p.sessionId));
  ipcMain.handle('conversations:rename', (_e, p) => conversations.rename(p.id, p.title));
  ipcMain.handle('conversations:remove', (_e, p) => conversations.remove(p.id));
  ipcMain.handle('advisor:isAvailable', () => true);
  ipcMain.handle('advisor:open', () => ({ sessionId: 'audit-session' }));
  ipcMain.handle('advisor:cancel', () => {});
  ipcMain.handle('advisor:close', () => {});
  ipcMain.handle('advisor:respondToPermission', () => {});
  ipcMain.handle('advisor:diagnostics', () => ({
    transportVersion: 'v2',
    connected: true,
    sessionId: 'audit-session',
    workspacePath: WORKSPACE,
    workingDirectory: WORKSPACE,
    runtimeVersion: '2.1.220 (Claude Code)',
    processState: 'ready',
    lastEventKind: 'result',
    pendingPermissionCount: 0,
  }));
  ipcMain.handle('advisor:send', () => ({ turnId: 'audit-turn' }));
}

app.whenReady().then(async () => {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const file = await resolveAsset(pathname === '/' ? '/index.html' : pathname);
    if (!file) return new Response('Not found', { status: 404 });
    return new Response(Readable.toWeb(createReadStream(file)), {
      status: 200,
      headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'text/plain' },
    });
  });

  let winRef = null;
  registerIpc(() => winRef);

  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'dist-electron', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  winRef = win;

  // A cold Chromium process can reject the first navigation with ERR_FAILED and
  // succeed immediately after. Same retry the screenshot harness carries.
  const load = async (url) => {
    try {
      await win.loadURL(url);
    } catch {
      await sleep(1000);
      await win.loadURL(url);
    }
  };

  await load('app://./index.html');
  await win.webContents.executeJavaScript(`
    localStorage.setItem('eis-cockpit-ui', JSON.stringify({
      state: {
        theme: 'dark', workspacePath: ${JSON.stringify(WORKSPACE)},
        sidebarCollapsed: false, noticeDismissed: false, enabledLenses: null,
        devForceFirstRun: false, onboardingStarted: false, defaultMemoryScope: 'business'
      },
      version: 3
    })); true;
  `);

  const ROUTES = ['/', '/executives', '/dashboard', '/decisions', '/memory', '/settings'];
  const report = {};
  const allProblems = [];

  for (const route of ROUTES) {
    await load(`app://.${route === '/' ? '/index.html' : route + '/'}`);
    await sleep(1600);
    const raw = await win.webContents.executeJavaScript(AUDIT);
    const data = JSON.parse(raw);
    report[route] = data;
    for (const p of data.problems) allProblems.push({ route, ...p });
  }

  // Merge typography and radius inventories across screens.
  const typography = {};
  const radii = {};
  for (const data of Object.values(report)) {
    for (const [k, n] of Object.entries(data.typography)) typography[k] = (typography[k] || 0) + n;
    for (const [k, n] of Object.entries(data.radii)) radii[k] = (radii[k] || 0) + n;
  }

  console.log('\n=== typography in use (size/line-height/weight -> count) ===');
  for (const [k, n] of Object.entries(typography).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(28)} ${n}`);
  }
  console.log(`  DISTINCT COMBINATIONS: ${Object.keys(typography).length}`);

  console.log('\n=== border radii in use ===');
  for (const [k, n] of Object.entries(radii).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(28)} ${n}`);
  }

  console.log('\n=== focusable controls per route ===');
  for (const [route, data] of Object.entries(report)) {
    console.log(`  ${route.padEnd(14)} ${data.focusable.length}`);
  }

  console.log(`\n=== problems (${allProblems.length}) ===`);
  if (allProblems.length === 0) console.log('  none');
  for (const p of allProblems) {
    const { route, kind, ...rest } = p;
    console.log(`  [${kind}] ${route}  ${JSON.stringify(rest)}`);
  }

  /*
   * The permission dialog, posed.
   *
   * It only exists mid-turn, so no route walk reaches it — yet it is the one
   * surface in the app that can authorise a filesystem write, which makes it the
   * one whose focus behaviour matters most. Driven by pushing a real
   * `permission-request` through the same channel the transport uses.
   */
  console.log('\n=== permission dialog ===');
  await load('app://./index.html');
  await sleep(1400);
  win.webContents.send('advisor:event', {
    kind: 'turn-started',
    turnId: 'audit-turn',
    sessionId: 'audit-session',
  });
  win.webContents.send('advisor:event', {
    kind: 'permission-request',
    turnId: 'audit-turn',
    requestId: 'audit-req',
    tool: 'Write',
    summary: 'Writing DEC-20260803_pricing.md',
    targets: ['journal/DEC-20260803_pricing.md'],
    category: 'write',
    detail: '# Decision Record\n',
  });
  await sleep(900);

  const dialog = JSON.parse(
    await win.webContents.executeJavaScript(`(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return JSON.stringify({ present: false });
      const focusable = [...d.querySelectorAll('a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])')];
      return JSON.stringify({
        present: true,
        ariaModal: d.getAttribute('aria-modal'),
        labelled: Boolean(d.getAttribute('aria-labelledby')),
        focusHeldByPanel: document.activeElement === d,
        controls: focusable.map((b) => b.textContent.trim()),
        // Nothing behind the dialog may be reachable while it is open.
        backgroundFocusables: [...document.querySelectorAll('aside a, main button')]
          .filter((el) => !d.contains(el) && el.offsetParent !== null).length,
      });
    })()`)
  );

  console.log(`  present:            ${dialog.present}`);
  console.log(`  aria-modal:         ${dialog.ariaModal}`);
  console.log(`  aria-labelledby:    ${dialog.labelled}`);
  console.log(`  focus on panel:     ${dialog.focusHeldByPanel}`);
  console.log(`  controls:           ${JSON.stringify(dialog.controls)}`);
  console.log(`  behind the overlay: ${dialog.backgroundFocusables} focusable (trapped by keydown handler)`);

  if (!dialog.present) allProblems.push({ route: 'dialog', kind: 'permission-dialog-missing' });
  if (dialog.present && !dialog.focusHeldByPanel) {
    allProblems.push({ route: 'dialog', kind: 'dialog-focus-not-captured' });
  }

  mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true });
  writeFileSync(
    path.join(ROOT, 'screenshots', 'ui-audit.json'),
    JSON.stringify({ typography, radii, problems: allProblems, report }, null, 2)
  );
  console.log('\nfull report -> screenshots/ui-audit.json');

  rmSync(CONVERSATION_ROOT, { recursive: true, force: true });
  app.quit();
}).catch((error) => {
  console.error(`AUDIT FAILED: ${error.message}`);
  rmSync(CONVERSATION_ROOT, { recursive: true, force: true });
  app.exit(1);
});
