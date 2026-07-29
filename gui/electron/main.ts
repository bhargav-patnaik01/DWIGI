/**
 * Electron main process — the host shell.
 *
 * Responsibilities, and nothing beyond them:
 *   - create one window
 *   - serve the statically exported renderer over a privileged `app://` scheme
 *   - expose a minimal, explicitly enumerated IPC surface
 *
 * Milestone 1 exposes no filesystem access and no process spawning. Those
 * arrive with the bridge (M2) and the repository projections (M3), each behind
 * a narrow, validated channel. Nothing here knows what an executive is.
 */

import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron';
import { createReadStream, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { ClaudeCliRuntime } from './bridge/claude-cli';
import { ConversationStore } from './conversations';
import { RepositoryReader } from './repo';
import { readConversationMode, type PersistedMessage } from '../shared/conversations';
import { parseRuntimeMode } from '../shared/runtime-modes';
import { resolveIconPath } from '../shared/icon';
import { Readable } from 'node:stream';

const IS_DEV = process.env.EIS_DEV === '1';
const DEV_URL = 'http://localhost:3000';

/**
 * Static export output.
 *
 * Compiled layout is `dist-electron/electron/main.js` (tsc preserves the source
 * tree because `shared/` is also compiled), so the app root is two levels up.
 */
const OUT_DIR = path.join(__dirname, '..', '..', 'out');

/** Application root — one level above `dist-electron/`. */
const APP_DIR = path.join(__dirname, '..', '..');

/**
 * Resolve the window icon, preferring the founder's own asset.
 *
 * `gui/icon.png` is the source of truth; `build/icon.png` is what
 * `scripts/prepare-icon.mjs` derives from it, and is also where the placeholder
 * lands when no real icon has been provided. Returning undefined is a supported
 * outcome — Electron falls back to its default and nothing crashes, which is
 * what lets a fresh clone run before an icon exists.
 *
 * On Windows the packaged executable carries its own icon from electron-builder,
 * so this mainly matters in development and on Linux.
 */
function resolveWindowIcon(): string | undefined {
  return resolveIconPath(
    [
      path.join(APP_DIR, 'icon.png'),
      path.join(APP_DIR, 'build', 'icon.png'),
      path.join(process.resourcesPath ?? APP_DIR, 'icon.png'),
    ],
    (candidate) => statSync(candidate).isFile()
  );
}

/**
 * Content Security Policy for the packaged renderer.
 *
 * `'unsafe-inline'` for styles is required by Next's injected critical CSS.
 * Scripts get no such allowance. No remote origins are permitted at all —
 * this application is entirely local, so any outbound request is a defect.
 */
const CSP = [
  "default-src 'self' app:",
  "script-src 'self' app:",
  "style-src 'self' app: 'unsafe-inline'",
  "img-src 'self' app: data:",
  "font-src 'self' app: data:",
  "connect-src 'self' app:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/*
 * Must run before `app.ready`. Marking the scheme `standard` gives it normal
 * URL semantics; `secure` places it in a secure context so the renderer is not
 * treated as untrusted content.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/**
 * Resolve a request path to a file inside OUT_DIR.
 *
 * Returns null for anything that escapes OUT_DIR. Directory requests resolve
 * to `index.html`, which is how Next's `trailingSlash` export layout works.
 */
async function resolveAsset(urlPath: string): Promise<string | null> {
  // Strip query and fragment. Indexing is guarded because `noUncheckedIndexedAccess`
  // is on and `split` can, in principle, yield an empty array.
  const stripped = urlPath.split('?')[0] ?? '';
  const decoded = decodeURIComponent(stripped.split('#')[0] ?? '');
  const candidate = path.join(OUT_DIR, decoded);

  // Path-traversal guard: the resolved target must stay within OUT_DIR.
  const resolved = path.resolve(candidate);
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
    // Unknown path: fall back to the shell so client-side routing can recover.
    try {
      const fallback = path.join(root, 'index.html');
      await stat(fallback);
      return fallback;
    } catch {
      return null;
    }
  }
}

function registerAppProtocol(): void {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const file = await resolveAsset(pathname === '/' ? '/index.html' : pathname);

    if (!file) {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      });
    }

    const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-security-policy': CSP,
      },
    });
  });
}

function createWindow(): BrowserWindow {
  const icon = resolveWindowIcon();

  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    // 720 rather than 900: the cockpit is expected to hold a narrow layout, and a
    // minimum that forbids one means the narrow layout is never actually tested.
    minWidth: 720,
    minHeight: 600,
    show: false,
    ...(icon ? { icon } : {}),
    backgroundColor: '#0b0b0c',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // --- security posture: all three are load-bearing ---
      contextIsolation: true, // renderer cannot touch main's globals
      nodeIntegration: false, // no `require` in the renderer
      sandbox: true, // OS-level sandbox; preload uses contextBridge only
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: IS_DEV,
    },
  });

  // Paint only once ready, so the window never flashes white over a dark UI.
  win.once('ready-to-show', () => {
    win.show();
    if (process.env.EIS_SMOKE === '1') {
      console.error('[smoke] ready-to-show fired; window shown');
      setTimeout(() => app.quit(), 1500);
    }
  });

  // Fail loudly rather than sitting behind an invisible window.
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[eis] renderer failed to load (${code} ${description}) ${url}`);
  });

  // No in-app navigation away from our own origin.
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = IS_DEV ? url.startsWith(DEV_URL) : url.startsWith('app://');
    if (!allowed) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // No popups. External links go to the real browser, never a Chromium window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Deny every permission request. A local cockpit needs no camera, mic,
  // geolocation, or notifications; anything asking is a bug or worse.
  win.webContents.session.setPermissionRequestHandler((_wc, _perm, callback) =>
    callback(false)
  );

  if (IS_DEV) {
    void win.loadURL(DEV_URL);
  } else {
    void win.loadURL('app://./index.html');
  }

  return win;
}

/**
 * IPC surface.
 *
 * Deliberately tiny: every channel is attack surface, so channels are enumerated
 * one at a time as features need them rather than exposing a general-purpose
 * escape hatch. Every argument crossing this boundary is validated here, because
 * the renderer is the untrusted side even when we wrote it.
 */
function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('host:info', () => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    isDev: IS_DEV,
    repositoryUrl: readRepositoryUrl(),
    forceFirstRun: process.env.EIS_FORCE_FIRST_RUN === '1',
  }));

  // One runtime per host process. Events are pushed to the focused window.
  const runtime = new ClaudeCliRuntime((event) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('advisor:event', event);
  });

  // Directory picker. Returns a path only; the host never reads the directory
  // here, and the renderer cannot name a path the user did not choose.
  ipcMain.handle('host:selectDirectory', async () => {
    const win = getWindow();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Select the D.W.I.G.I repository',
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle('advisor:isAvailable', () => runtime.isAvailable());

  ipcMain.handle('advisor:open', (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.workspacePath !== 'string') {
      throw new Error('advisor:open requires a workspacePath string');
    }
    const resume =
      typeof payload.resumeSessionId === 'string' ? payload.resumeSessionId : undefined;
    return runtime.open({ workspacePath: payload.workspacePath, resumeSessionId: resume });
  });

  ipcMain.handle('advisor:send', (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.text !== 'string') {
      throw new Error('advisor:send requires a text string');
    }
    /*
     * `text` is passed through unchanged. Trimming or normalising it here would
     * violate the verbatim-input invariant.
     *
     * `mode` is validated rather than trusted, and `parseRuntimeMode` degrades an
     * unrecognised value to the full Council rather than rejecting it. A
     * malformed mode must never be able to narrow a deliberation, because the
     * founder reading the answer would have no way to tell that it had.
     */
    return runtime.send(payload.text, parseRuntimeMode(payload.mode));
  });

  ipcMain.handle('advisor:respondToPermission', (_e, payload: unknown) => {
    if (
      !isRecord(payload) ||
      typeof payload.requestId !== 'string' ||
      (payload.decision !== 'allow' && payload.decision !== 'deny')
    ) {
      throw new Error('advisor:respondToPermission requires requestId and decision');
    }
    return runtime.respondToPermission(payload.requestId, payload.decision);
  });

  ipcMain.handle('advisor:cancel', () => runtime.cancel());
  ipcMain.handle('advisor:close', () => runtime.close());
  ipcMain.handle('advisor:diagnostics', () => runtime.getDiagnostics());

  /*
   * Repository reader. READ-ONLY: there is no write channel here, and adding one
   * would break the architecture's guarantee that only the advisor mutates the
   * repository.
   */
  const repo = new RepositoryReader(() => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('repo:changed');
  });

  ipcMain.handle('repo:setWorkspace', (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.workspacePath !== 'string') {
      throw new Error('repo:setWorkspace requires a workspacePath string');
    }
    return repo.setWorkspace(payload.workspacePath);
  });

  ipcMain.handle('repo:snapshot', () => repo.snapshot());

  ipcMain.handle('repo:reveal', async (_e, payload: unknown) => {
    // Opens a folder in the OS file manager. Confined to the workspace, and
    // cannot open an arbitrary path the renderer names.
    const root = repo.getWorkspace();
    if (!root) return false;
    const sub = isRecord(payload) && typeof payload.relative === 'string' ? payload.relative : '';
    const target = path.resolve(root, sub);
    if (target !== root && !target.startsWith(root + path.sep)) return false;
    await shell.openPath(target);
    return true;
  });

  /*
   * Conversation transcripts.
   *
   * The root is fixed here, once, to the host's own application-data directory.
   * No IPC method below accepts a path — the renderer names conversations by id
   * and nothing else — so this channel cannot be steered at the repository. That
   * is the whole of the fence between the cockpit's one write path and the
   * advisor's files.
   */
  const conversations = new ConversationStore(
    path.join(app.getPath('userData'), 'conversations')
  );

  ipcMain.handle('conversations:list', (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.workspacePath !== 'string') {
      throw new Error('conversations:list requires a workspacePath string');
    }
    return conversations.list(payload.workspacePath);
  });

  ipcMain.handle('conversations:create', (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.workspacePath !== 'string') {
      throw new Error('conversations:create requires a workspacePath string');
    }
    // `mode` is normalised by the store, which defaults anything unrecognised to
    // Council. `title` is length-clamped there as well.
    return conversations.create(payload.workspacePath, {
      mode: readConversationMode(payload.mode),
      title: typeof payload.title === 'string' ? payload.title : undefined,
    });
  });

  ipcMain.handle('conversations:load', (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.id !== 'string') {
      throw new Error('conversations:load requires an id string');
    }
    return conversations.load(payload.id);
  });

  ipcMain.handle('conversations:append', (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.id !== 'string') {
      throw new Error('conversations:append requires an id string');
    }
    if (!Array.isArray(payload.messages)) {
      throw new Error('conversations:append requires a messages array');
    }
    // Shape is checked here rather than trusted, because a malformed record
    // would be written to disk and read back later as if it were a real message.
    const messages: PersistedMessage[] = payload.messages.map((entry, index) => {
      if (
        !isRecord(entry) ||
        typeof entry.id !== 'string' ||
        (entry.role !== 'user' && entry.role !== 'advisor') ||
        typeof entry.text !== 'string' ||
        typeof entry.createdAt !== 'number'
      ) {
        throw new Error(`conversations:append message ${index} is malformed`);
      }
      return {
        id: entry.id,
        role: entry.role,
        text: entry.text,
        createdAt: entry.createdAt,
      };
    });
    return conversations.append(payload.id, messages);
  });

  ipcMain.handle('conversations:bindSession', (_e, payload: unknown) => {
    if (
      !isRecord(payload) ||
      typeof payload.id !== 'string' ||
      typeof payload.sessionId !== 'string'
    ) {
      throw new Error('conversations:bindSession requires id and sessionId strings');
    }
    return conversations.bindSession(payload.id, payload.sessionId);
  });

  ipcMain.handle('conversations:rename', (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.id !== 'string' || typeof payload.title !== 'string') {
      throw new Error('conversations:rename requires id and title strings');
    }
    return conversations.rename(payload.id, payload.title);
  });

  ipcMain.handle('conversations:remove', (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.id !== 'string') {
      throw new Error('conversations:remove requires an id string');
    }
    return conversations.remove(payload.id);
  });

  app.on('before-quit', () => repo.stopWatching());

  // Release the child process on shutdown rather than orphaning it.
  app.on('before-quit', () => {
    void runtime.close();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The project's repository URL, from its own `package.json`.
 *
 * Read rather than hardcoded, and null rather than guessed: an interface that
 * invents a plausible GitHub URL sends founders to someone else's project. Only
 * `http(s)` is accepted, because the value ends up in `shell.openExternal`, and
 * a `git+ssh` or `file:` URL there would be handed to the operating system.
 */
function readRepositoryUrl(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manifest = require(path.join(APP_DIR, 'package.json')) as {
      repository?: string | { url?: string };
    };
    const raw =
      typeof manifest.repository === 'string'
        ? manifest.repository
        : manifest.repository?.url;
    if (typeof raw !== 'string') return null;

    const cleaned = raw.replace(/^git\+/, '').replace(/\.git$/, '');
    return /^https?:\/\//.test(cleaned) ? cleaned : null;
  } catch {
    return null;
  }
}

// Single-instance: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    if (!IS_DEV) registerAppProtocol();
    registerIpc(() => mainWindow);
    mainWindow = createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Belt-and-braces: this app creates no <webview>, so any attempt to attach one
  // is either a bug or injected content. Refuse unconditionally, and strip any
  // preload it tried to bring with it.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event, webPreferences) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      event.preventDefault();
    });
  });
}
