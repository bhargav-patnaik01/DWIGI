/**
 * Screenshot harness main process — development tooling, not shipped.
 *
 * Loads the built renderer through the same `app://` scheme the production host
 * uses, seeds a workspace so repository screens have real content, walks every
 * route, and captures a PNG of each.
 *
 * Deliberately a separate main file rather than a flag inside `electron/main.ts`:
 * capture logic in the production host would be code that ships to users purely
 * so a developer could take pictures.
 *
 *   node scripts/screenshots.mjs
 */

const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const { createReadStream, existsSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { stat } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const SHOT_DIR = path.join(ROOT, 'screenshots');

/**
 * Repository the captures are taken against.
 *
 * Derived as a sibling of this repository — where `make-sandbox.mjs` puts the
 * disposable copy — so the harness runs on any machine. `EIS_SHOT_WORKSPACE`
 * overrides it.
 */
const WORKSPACE =
  process.env.EIS_SHOT_WORKSPACE || path.resolve(ROOT, '..', '..', 'eis-sandbox');

/**
 * Refuse to photograph anything but a marked sandbox.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A HARD REFUSAL AND NOT A WARNING
 * ---------------------------------------------------------------------------
 * These captures render real projections — the Dashboard and Memory screens show
 * whatever Business Memory the workspace holds. Pointed at production, this
 * harness writes the founder's cash position and runway into PNG files, and PNGs
 * get attached to issues and pasted into chats long after anyone remembers where
 * they came from.
 *
 * `SANDBOX.md` is written by `make-sandbox.mjs` and exists in no real repository,
 * so requiring it is a positive assertion rather than a blacklist of paths that
 * someone will eventually route around.
 */
function assertSandbox(workspace) {
  if (existsSync(path.join(workspace, 'SANDBOX.md'))) return;
  console.error(
    `\nREFUSING TO CAPTURE: ${workspace} has no SANDBOX.md marker.\n\n` +
      'The screenshot harness renders real Business Memory, so it runs only against a\n' +
      'disposable sandbox. Create one with:\n\n' +
      '  node scripts/make-sandbox.mjs --reset\n'
  );
  process.exit(1);
}

/** Transcripts written during capture. Thrown away on exit. */
const CONVERSATION_ROOT = path.join(os.tmpdir(), `eis-shot-conversations-${process.pid}`);

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

async function resolveAsset(urlPath) {
  const stripped = urlPath.split('?')[0] || '';
  const decoded = decodeURIComponent(stripped.split('#')[0] || '');
  const resolved = path.resolve(path.join(OUT_DIR, decoded));
  const root = path.resolve(OUT_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  try {
    const info = await stat(resolved);
    if (info.isDirectory()) {
      const index = path.join(resolved, 'index.html');
      await stat(index);
      return index;
    }
    return resolved;
  } catch {
    try {
      const fallback = path.join(root, 'index.html');
      await stat(fallback);
      return fallback;
    } catch {
      return null;
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll a predicate inside the page until it holds.
 *
 * ---------------------------------------------------------------------------
 * WHY FIXED SLEEPS WERE NOT ENOUGH
 * ---------------------------------------------------------------------------
 * The renderer is a static export, so every screen's markup exists in the HTML
 * before React hydrates. A click sent into an unhydrated page finds its target,
 * reports success, and runs no handler — so the harness captured a screen in the
 * wrong state and called it a pass. The reverse also happened: a capture taken
 * before a transition finished looked like a broken feature.
 *
 * Waiting on an observable condition removes both. A timeout throws rather than
 * capturing anyway, because a screenshot of the wrong state is worse than no
 * screenshot — it is evidence of something that did not happen.
 */
async function waitFor(win, description, expression, timeoutMs = 15_000) {
  const started = Date.now();
  for (;;) {
    let held = false;
    try {
      held = await win.webContents.executeJavaScript(`Boolean(${expression})`);
    } catch {
      held = false;
    }
    if (held) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timed out waiting for ${description}`);
    }
    await sleep(120);
  }
}

/**
 * Load the shell and wait until React is actually driving it.
 *
 * `loadURL` resolves when the document has loaded, which is well before the
 * bundle has hydrated. Two rapid loads also make the first reject with
 * ERR_FAILED, so this serialises them.
 */
/**
 * Load the shell, retrying once on a transient navigation failure.
 *
 * A cold Chromium process — particularly right after a previous Electron run was
 * killed — can reject the first navigation with ERR_FAILED and succeed
 * immediately afterwards. Retrying once keeps that from failing a QA run, while
 * still failing loudly if the shell genuinely cannot load.
 */
async function loadShell(win) {
  try {
    await win.loadURL('app://./index.html');
  } catch (error) {
    console.log(`  (retrying shell load after ${error.message})`);
    await sleep(1000);
    await win.loadURL('app://./index.html');
  }
}

async function reload(win) {
  await loadShell(win);
  // Hydration is observable: the sidebar's collapse control is rendered by React
  // with an aria-label, and event handlers are attached in the same commit.
  await waitFor(win, 'renderer hydration', 'document.querySelector(\'aside button[aria-label]\')');
  await sleep(400);
}

async function capture(win, name) {
  const image = await win.webContents.capturePage();
  /*
   * An empty capture is a failure, not a screenshot.
   *
   * `capturePage()` returns a 0x0 image when there is no compositor — a headless
   * session, a CI box, a remote shell. Every file then written is zero bytes, the
   * run reports success, and the stale PNGs from the last good run sit in the
   * directory looking like evidence. Fail loudly instead; `npm run audit:ui`
   * measures the DOM and needs no display.
   */
  if (image.isEmpty()) {
    throw new Error(
      `capturePage returned an empty image for "${name}" — this session has no ` +
        'compositor, so visual capture is impossible here. Use `npm run audit:ui`.'
    );
  }
  const file = path.join(SHOT_DIR, `${name}.png`);
  writeFileSync(file, image.toPNG());
  console.log(`  captured ${name}.png`);
}

/**
 * Answer the permission dialog, so navigation is possible again.
 *
 * The scripted turn deliberately ends on a blocking request, and since the
 * permission dialog became application-modal it covers the sidebar too — which
 * is correct behaviour (the engine is blocked app-wide) and which stranded this
 * harness mid-run once it started posing that state.
 */
async function dismissPermission(win) {
  const clicked = await realClick(
    win,
    '[...document.querySelectorAll(\'[role="dialog"] button\')].find((b) => b.textContent.trim() === "Deny")'
  );
  if (clicked) {
    await waitFor(win, 'the permission dialog to close', '!document.querySelector(\'[role="dialog"]\')');
    await sleep(300);
  }
  return clicked;
}

/**
 * Click at a DOM element's centre using a real input event.
 *
 * Programmatic `element.click()` did not reliably trigger React's delegated
 * handlers here, so the harness drives the OS input path instead. That is also
 * closer to what a user does.
 */
async function realClick(win, selectorExpr) {
  const box = await win.webContents.executeJavaScript(
    '(() => { const el = ' + selectorExpr + '; if (!el) return null; const r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); })()'
  );
  if (!box) return false;
  const { x, y } = JSON.parse(box);
  win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  return true;
}

/**
 * Seed persisted UI state so repository screens attach without a click.
 *
 * The version must track `useUi`'s persist version, or the store's migration runs
 * over the seed and the capture shows defaults instead of the state being posed.
 */
async function seed(win, theme, overrides = {}) {
  const state = {
    theme,
    workspacePath: WORKSPACE,
    sidebarCollapsed: false,
    noticeDismissed: false,
    enabledLenses: null,
    devForceFirstRun: false,
    onboardingStarted: false,
    defaultMemoryScope: 'business',
    ...overrides,
  };
  await win.webContents.executeJavaScript(`
    localStorage.setItem('eis-cockpit-ui', JSON.stringify({
      state: ${JSON.stringify(state)},
      version: 3
    }));
    true;
  `);
}

/**
 * Scripted advisor events, for visual validation only.
 *
 * These are UI FIXTURES, not fabricated runtime events. Production emits activity
 * strictly from what the runtime reports; this harness replays a plausible
 * sequence so the streaming view, activity timeline, markdown renderer, and
 * permission notice can be inspected without spending tokens on every capture.
 * Shapes match `shared/advisor.ts` exactly.
 */
const SCRIPTED_REPLY = [
  '## The Decision\n\nWhether to raise prices now or after the next two enterprise renewals.\n\n',
  '**Recommendation** — Raise list price 30% for new customers on 1 September. ',
  'Grandfather existing accounts for twelve months.\n\n',
  '### Why\n\n- Current pricing sits below the cheapest competitor, which reads as a quality signal.\n',
  '- No churn attributable to price in two quarters; the binding constraint is `lead volume`.\n',
  '- Grandfathering removes renewal risk from the two anchor accounts.\n\n',
  '| Signal | By | Stated |\n| :--- | :--- | :-: |\n',
  '| Lead volume within 20% | 15 Oct | 70% |\n| No account renegotiates | 15 Oct | 85% |\n\n',
  '**Confidence** — Moderate. Weakest assumption: that observed price-insensitivity ',
  'extends 30% higher, which has never been tested.\n',
];

function registerHarnessIpc(getWindow) {
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

  // Real repository reader, so repo screens show genuine projections — including
  // the executive matrix behind the Executive Board and Agent Management.
  const repo = new RepositoryReader(() => send('repo:changed'));

  /*
   * Real conversation store over a throwaway directory.
   *
   * The chat screen creates a conversation before every turn, so without these
   * channels the composer's send rejects and the transcript never appears. Using
   * the production store rather than a stub also means the captures exercise the
   * same title, mode, and persistence behaviour a founder gets.
   */
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
    conversations.create(p.workspacePath, {
      mode: readConversationMode(p.mode),
      title: typeof p.title === 'string' ? p.title : undefined,
    })
  );
  ipcMain.handle('conversations:load', (_e, p) => conversations.load(p.id));
  ipcMain.handle('conversations:append', (_e, p) => conversations.append(p.id, p.messages));
  ipcMain.handle('conversations:bindSession', (_e, p) =>
    conversations.bindSession(p.id, p.sessionId)
  );
  ipcMain.handle('conversations:rename', (_e, p) => conversations.rename(p.id, p.title));
  ipcMain.handle('conversations:remove', (_e, p) => conversations.remove(p.id));

  ipcMain.handle('advisor:isAvailable', () => true);
  ipcMain.handle('advisor:open', () => ({ sessionId: 'shot-session-0001' }));
  ipcMain.handle('advisor:cancel', () => {});
  ipcMain.handle('advisor:close', () => {});
  ipcMain.handle('advisor:respondToPermission', () => {});
  ipcMain.handle('advisor:diagnostics', () => ({
    transportVersion: 'v2',
    connected: true,
    sessionId: 'shot-session-0001',
    workspacePath: WORKSPACE,
    workingDirectory: WORKSPACE,
    runtimeVersion: '2.1.220 (Claude Code)',
    processState: 'ready',
    lastEventKind: 'stream_event/content_block_delta',
    pendingPermissionCount: 1,
  }));

  ipcMain.handle('advisor:send', async () => {
    const turnId = 'shot-turn-0001';
    send('advisor:event', { kind: 'turn-started', turnId, sessionId: 'shot-session-0001' });
    send('advisor:event', {
      kind: 'activity', turnId, activityId: 'a1',
      label: 'Reading business_memory.md', category: 'read', state: 'started',
    });
    send('advisor:event', {
      kind: 'activity', turnId, activityId: 'a2',
      label: 'Reading reasoning_rules.md', category: 'read', state: 'started',
    });
    for (const chunk of SCRIPTED_REPLY) {
      send('advisor:event', { kind: 'text-delta', turnId, text: chunk });
      await sleep(20);
    }
    send('advisor:event', {
      kind: 'message-complete', turnId, text: SCRIPTED_REPLY.join(''),
    });
    // Fixture paths are workspace-relative so no capture ships a drive letter.
    const record = path.join(WORKSPACE, 'journal', 'DEC-20260728_pricing.md');
    // A live, blocking request — the engine is stopped until it is answered.
    // `turn-complete` deliberately does NOT follow: the screenshot captures the
    // dialog as the founder actually meets it, mid-turn.
    send('advisor:event', {
      kind: 'permission-request', turnId, requestId: 'r1', tool: 'Write',
      summary: 'Writing DEC-20260728_pricing.md',
      targets: [record],
      category: 'write',
      detail: '# Decision Record — Pricing\n\n**Status**: Committed\n',
    });
    return { turnId };
  });
}

app.whenReady().then(async () => {
  // Before anything is rendered, let alone written to disk.
  assertSandbox(WORKSPACE);

  mkdirSync(SHOT_DIR, { recursive: true });

  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const file = await resolveAsset(pathname === '/' ? '/index.html' : pathname);
    if (!file) return new Response('Not found', { status: 404 });
    return new Response(Readable.toWeb(createReadStream(file)), {
      status: 200,
      headers: {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      },
    });
  });

  let winRef = null;
  registerHarnessIpc(() => winRef);

  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    // MUST be visible: capturePage on a hidden window returns stale compositor
    // frames, which produced screenshots mixing dark layers into a light theme.
    show: true,
    backgroundColor: '#0b0b0c',
    webPreferences: {
      preload: path.join(ROOT, 'dist-electron', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The harness has no advisor/repo IPC handlers, so the renderer's calls reject.
  // That is fine and deliberate: it exercises the disconnected-state rendering,
  // and the repo screens are seeded separately below.
  winRef = win;
  win.webContents.on('console-message', () => {});

  /*
   * Establish the `app://` origin before anything is seeded.
   *
   * `seed` writes to `localStorage`, which is per-origin. A window that has not
   * loaded a URL yet is on `about:blank` with an opaque origin, so seeding there
   * writes nothing the application will ever read — and the first capture then
   * waits forever for a screen that cannot appear.
   */
  await loadShell(win);

  /**
   * Navigate the way a user does: click the sidebar link.
   *
   * A full `loadURL` per route was the original approach and it was wrong — it
   * resets the persisted store on every capture and races its hydration, which
   * produced screenshots showing "No repository selected" on one screen and real
   * data on the next. Client-side navigation also matches what the app actually
   * does in use.
   */
  async function goto(label) {
    const clicked = await realClick(
      win,
      '[...document.querySelectorAll("aside a")].find((a) => a.textContent.trim().startsWith(' +
        JSON.stringify(label) +
        '))'
    );
    if (!clicked) throw new Error(`nav link not found: ${label}`);
    // The clicked link becomes the active one. Waiting on that rather than on a
    // fixed delay is what makes a failed click fail loudly.
    await waitFor(
      win,
      `navigation to ${label}`,
      '[...document.querySelectorAll("aside a")].some((a) => ' +
        'a.textContent.trim().startsWith(' + JSON.stringify(label) + ') && ' +
        'a.getAttribute("aria-current") === "page")'
    );
    await sleep(500);
  }

  /** Scroll a screen's own pane to the bottom, and report whether it moved. */
  async function scrollToEnd() {
    const moved = await win.webContents.executeJavaScript(`
      (() => {
        const pane = document.querySelector('main .overflow-y-auto');
        if (!pane) return 'no-pane';
        pane.scrollTop = pane.scrollHeight;
        return pane.scrollTop > 0 ? 'scrolled' : 'nothing-to-scroll';
      })()
    `);
    await sleep(500);
    return moved;
  }

  /*
   * First run, before anything else.
   *
   * Posed with the developer override rather than by deleting the sandbox's
   * Business Memory — the point of that override is that the welcome flow can be
   * inspected without destroying a repository, and the harness should exercise it
   * the same way a developer does.
   */
  console.log('capturing (first run)');
  await seed(win, 'dark', { devForceFirstRun: true });
  await reload(win);
  await waitFor(win, 'the Get Started button', 'document.body.textContent.includes("Get Started")');
  /*
   * Let the entrance sequence finish.
   *
   * The welcome screen staggers its elements up to 440ms with a 220ms animation,
   * and `animation-fill-mode: both` keeps later ones invisible until their turn.
   * Capturing as soon as the button exists photographed a screen with the
   * attribution line still hidden — which reads as a missing requirement rather
   * than as an animation in progress.
   */
  await sleep(1000);
  await capture(win, 'welcome');

  win.setSize(760, 720);
  await sleep(700);
  await capture(win, 'welcome-narrow');
  win.setSize(1180, 780);
  await sleep(700);

  console.log('capturing (dark)');
  await seed(win, 'dark');
  await reload(win);
  await waitFor(win, 'the chat composer', 'document.querySelector("main textarea")');
  await capture(win, 'chat-empty');

  for (const [name, label] of [
    ['executives', 'Executive Board'],
    ['dashboard', 'Dashboard'],
    ['decisions', 'Decisions'],
    ['memory', 'Memory'],
    ['settings', 'Settings'],
  ]) {
    await goto(label);
    await capture(win, name);
  }

  // Settings, scrolled to Agent Management and the About area — the toggles and
  // the attribution are below the fold at this window height.
  console.log(`  settings scroll: ${await scrollToEnd()}`);
  await capture(win, 'settings-agents');

  /*
   * Single-agent chat, opened the way a founder opens it: from the Executive
   * Board, by clicking "Chat with …". Posing it by seeding state would not
   * exercise the intent hand-off, which is the part that can break.
   */
  await goto('Executive Board');
  const openedLens = await realClick(
    win,
    '[...document.querySelectorAll("main button")].find((b) => b.textContent.trim().startsWith("Chat with"))'
  );
  if (!openedLens) throw new Error('no "Chat with" control on the Executive Board');

  /*
   * Assert the mode before capturing.
   *
   * A click into an unhydrated page succeeds and does nothing, which is exactly
   * how an earlier run produced a "single-agent chat" screenshot showing Council
   * Chat. The header is the observable difference, so it is what gets waited on.
   */
  await waitFor(
    win,
    'the single-agent chat header',
    'document.querySelector("main header")?.textContent.includes("single executive")'
  );
  await capture(win, 'chat-single-agent');

  // Chat with a scripted reply: streaming view, activity timeline, markdown,
  // tables, and the permission notice all in one frame.
  await goto('Chat');
  const sent = await win.webContents.executeJavaScript(
    [
      '(() => {',
      '  const ta = document.querySelector("main textarea");',
      '  if (!ta) return "no-textarea";',
      '  const proto = Object.getPrototypeOf(ta);',
      '  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;',
      '  setter.call(ta, "Should we raise prices now, or wait for the next two renewals?");',
      '  ta.dispatchEvent(new Event("input", { bubbles: true }));',
      '  return "typed";',
      '})()',
    ].join(String.fromCharCode(10))
  );
  await sleep(400);
  const clickedSend = await win.webContents.executeJavaScript(
    [
      '(() => {',
      '  const btns = [...document.querySelectorAll("main button")];',
      '  const send = btns.find((b) => (b.getAttribute("aria-label") || "") === "Send");',
      '  if (!send) return "no-button";',
      '  if (send.disabled) return "disabled";',
      '  send.click();',
      '  return "clicked";',
      '})()',
    ].join(String.fromCharCode(10))
  );
  console.log(`  chat inject: ${sent} / ${clickedSend}`);
  if (clickedSend !== 'clicked') throw new Error(`send control not usable: ${clickedSend}`);

  // The scripted reply streams in; wait for its last sentence rather than guessing
  // how long that takes.
  await waitFor(
    win,
    'the scripted reply to finish streaming',
    'document.body.textContent.includes("never been tested")',
    30_000
  );
  await sleep(600);
  await capture(win, 'chat-conversation');

  // The blocking dialog, as the founder meets it: mid-turn, over everything.
  await waitFor(win, 'the permission dialog', 'document.querySelector(\'[role="dialog"]\')');
  await sleep(300);
  await capture(win, 'permission-dialog');

  // Answered, so the rest of the run can navigate. The modal covers the sidebar
  // by design, so leaving it open strands every capture after this one.
  console.log(`  permission dismissed: ${await dismissPermission(win)}`);

  // Decision detail: exercises markdown, tables, and the front-matter grid.
  await goto('Decisions');
  const opened = await realClick(
    win,
    '[...document.querySelectorAll("main button")].find((b) => !b.getAttribute("aria-label"))'
  );
  if (opened) {
    await sleep(1200);
    await capture(win, 'decisions-detail');
  } else {
    console.log('  (no decision row to open)');
  }

  // Diagnostics overlay.
  await goto('Dashboard');
  await win.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', ctrlKey: true, shiftKey: true, bubbles: true }));
    true;
  `);
  await sleep(900);
  await capture(win, 'diagnostics');

  // Light mode, to check the theme is a considered equivalent rather than an
  // inversion that nobody looked at.
  console.log('capturing (light)');
  await seed(win, 'light');
  await reload(win);
  await capture(win, 'chat-light');
  await goto('Memory');
  await capture(win, 'memory-light');

  await goto('Executive Board');
  await capture(win, 'executives-light');

  await goto('Settings');
  console.log(`  settings scroll: ${await scrollToEnd()}`);
  await capture(win, 'settings-agents-light');

  // Narrow width, to check responsive resizing — including the notice banner and
  // the executive cards, which are the widest new content.
  console.log('capturing (narrow)');
  await seed(win, 'dark');
  await reload(win);
  win.setSize(760, 640);
  await sleep(700);
  await goto('Memory');
  await capture(win, 'memory-narrow');
  await goto('Executive Board');
  await capture(win, 'executives-narrow');
  await goto('Settings');
  console.log(`  settings scroll: ${await scrollToEnd()}`);
  await capture(win, 'settings-agents-narrow');

  // Dismissed notice, so the banner's absence is verified as well as its presence.
  console.log('capturing (notice dismissed)');
  win.setSize(1180, 780);
  await seed(win, 'dark', { noticeDismissed: true });
  await reload(win);
  await capture(win, 'notice-dismissed');

  console.log(`\nscreenshots -> ${SHOT_DIR}`);
  rmSync(CONVERSATION_ROOT, { recursive: true, force: true });
  app.quit();
}).catch((error) => {
  // A harness that dies quietly leaves stale screenshots looking like passes.
  console.error(`\nHARNESS FAILED: ${error.message}`);
  rmSync(CONVERSATION_ROOT, { recursive: true, force: true });
  app.exit(1);
});
