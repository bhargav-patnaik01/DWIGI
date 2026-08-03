/**
 * Preload — the only bridge between the sandboxed renderer and the host.
 *
 * Everything exposed here is hand-enumerated. No `ipcRenderer`, no `require`,
 * no `process`, and no generic `invoke(channel, ...)` passthrough — a generic
 * passthrough would hand the renderer the entire main process and make the
 * security posture in main.ts decorative.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { HostBridge, HostInfo } from '../shared/host';
import type {
  AdvisorDiagnostics,
  AdvisorEvent,
  AdvisorSessionOptions,
  PermissionDecision,
} from '../shared/advisor';
import type {
  NewConversationMode,
  ConversationResult,
  ConversationSummary,
  ConversationTranscript,
  PersistedMessage,
} from '../shared/conversations';
import type { RepositorySnapshot } from '../shared/repo';
import type { RuntimeMode } from '../shared/runtime-modes';

const bridge: HostBridge = {
  host: {
    getInfo: () => ipcRenderer.invoke('host:info') as Promise<HostInfo>,
    selectDirectory: () =>
      ipcRenderer.invoke('host:selectDirectory') as Promise<string | null>,
    // `send`, not `invoke`: one-way, no reply, no payload. See `HostBridge`.
    signalReady: () => ipcRenderer.send('app:renderer-ready'),
  },
  advisor: {
    isAvailable: () => ipcRenderer.invoke('advisor:isAvailable') as Promise<boolean>,
    open: (options: AdvisorSessionOptions) =>
      ipcRenderer.invoke('advisor:open', options) as Promise<{ sessionId: string }>,
    send: (text: string, mode?: RuntimeMode) =>
      ipcRenderer.invoke('advisor:send', { text, mode }) as Promise<{ turnId: string }>,
    respondToPermission: (requestId: string, decision: PermissionDecision) =>
      ipcRenderer.invoke('advisor:respondToPermission', {
        requestId,
        decision,
      }) as Promise<void>,
    cancel: () => ipcRenderer.invoke('advisor:cancel') as Promise<void>,
    close: () => ipcRenderer.invoke('advisor:close') as Promise<void>,
    getDiagnostics: () =>
      ipcRenderer.invoke('advisor:diagnostics') as Promise<AdvisorDiagnostics>,

    /**
     * Subscribe to pushed events.
     *
     * Returns an unsubscribe function. The listener is wrapped rather than
     * handed to `ipcRenderer.on` directly, so the renderer never receives the
     * `IpcRendererEvent` — which carries a `sender` capable of reaching back
     * into the host.
     */
    onEvent: (listener: (event: AdvisorEvent) => void) => {
      const wrapped = (_e: unknown, payload: AdvisorEvent) => listener(payload);
      ipcRenderer.on('advisor:event', wrapped);
      return () => {
        ipcRenderer.removeListener('advisor:event', wrapped);
      };
    },
  },
  repo: {
    setWorkspace: (workspacePath: string) =>
      ipcRenderer.invoke('repo:setWorkspace', { workspacePath }) as Promise<{
        ok: boolean;
        reason?: string;
      }>,
    snapshot: () =>
      ipcRenderer.invoke('repo:snapshot') as Promise<RepositorySnapshot | null>,
    reveal: (relative: string) =>
      ipcRenderer.invoke('repo:reveal', { relative }) as Promise<boolean>,
    onChanged: (listener: () => void) => {
      const wrapped = () => listener();
      ipcRenderer.on('repo:changed', wrapped);
      return () => {
        ipcRenderer.removeListener('repo:changed', wrapped);
      };
    },
  },
  conversations: {
    list: (workspacePath: string) =>
      ipcRenderer.invoke('conversations:list', { workspacePath }) as Promise<
        ConversationSummary[]
      >,
    create: (
      workspacePath: string,
      options?: { mode?: NewConversationMode; title?: string }
    ) =>
      ipcRenderer.invoke('conversations:create', {
        workspacePath,
        mode: options?.mode,
        title: options?.title,
      }) as Promise<ConversationResult<ConversationSummary>>,
    load: (id: string) =>
      ipcRenderer.invoke('conversations:load', { id }) as Promise<
        ConversationResult<ConversationTranscript>
      >,
    append: (id: string, messages: PersistedMessage[]) =>
      ipcRenderer.invoke('conversations:append', { id, messages }) as Promise<
        ConversationResult<ConversationSummary>
      >,
    bindSession: (id: string, sessionId: string) =>
      ipcRenderer.invoke('conversations:bindSession', { id, sessionId }) as Promise<
        ConversationResult<ConversationSummary>
      >,
    rename: (id: string, title: string) =>
      ipcRenderer.invoke('conversations:rename', { id, title }) as Promise<
        ConversationResult<ConversationSummary>
      >,
    remove: (id: string) =>
      ipcRenderer.invoke('conversations:remove', { id }) as Promise<
        ConversationResult<{ id: string }>
      >,
  },
};

contextBridge.exposeInMainWorld('eis', bridge);
