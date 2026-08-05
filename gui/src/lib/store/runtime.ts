'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import type { ProviderSnapshot, RuntimeSnapshot } from '@shared/runtime/contract';
import { PROVIDER_MANIFESTS } from '@shared/runtime/manifests';
import { isCouncilCapable, councilBlockedReason } from '@shared/runtime/capabilities';
import { unknownHealth } from '@shared/runtime/contract';
import { hasHost } from '@/lib/utils';
import { useUi } from '@/lib/store/ui';

interface RuntimeState {
  providers: ProviderSnapshot[];
  activeProviderId: string | null;
  /** True while a detection sweep is running, so the scan can be shown. */
  scanning: boolean;
  /** Provider id currently being connected or tested, for per-card spinners. */
  busyProviderId: string | null;
  error: string | null;
  /** True once a snapshot has been read, so screens do not flash an empty state. */
  loaded: boolean;

  refresh(): Promise<void>;
  detect(): Promise<void>;
  checkHealth(providerId: string): Promise<void>;
  setActive(providerId: string): Promise<boolean>;
  submitApiKey(providerId: string, secret: string): Promise<{ ok: boolean; reason?: string }>;
  disconnect(providerId: string): Promise<void>;
  clearError(): void;
  /**
   * Poll detection on an interval until the caller stops it.
   *
   * ---------------------------------------------------------------------------
   * WHY POLLING, AND NOT A FILESYSTEM WATCH (v1.2.3 Appendix Part S)
   * ---------------------------------------------------------------------------
   * "No manual Refresh button" asks for continuous detection, not a specific
   * mechanism — and a filesystem watch is the wrong one here. What actually
   * changes when a Native engine finishes installing is `PATH` becoming able to
   * resolve its command, which is an environment fact this already-running
   * process cannot observe as an event at all (a new terminal picks up the
   * updated `PATH`; this process does not, until it is restarted). Watching
   * install *directories* would miss installers that land the binary somewhere
   * this build's hints do not check, and would still tell us nothing about
   * `PATH` resolution, which is what `discover()` actually tests.
   *
   * A periodic `--version` probe is what genuinely answers "is the command
   * usable now," so it is the honest mechanism — not a shortcut standing in for
   * a better one. The interval is short enough to feel immediate without
   * spawning a probe process constantly.
   *
   * Returns a stop function. Callers are expected to invoke it on unmount —
   * see `useDiscoveryWatch` — so polling never outlives the screen that asked
   * for it and never runs by default in the background of ordinary use.
   */
  startWatching(intervalMs?: number): () => void;
}

/**
 * Offline projection of the provider list.
 *
 * Built from the manifests the renderer already imports, so every screen can
 * describe a provider before the host has answered — the first-run screen in
 * particular must render its cards immediately, and a list that appeared only
 * after an IPC round-trip would flash empty on every launch.
 *
 * Health and auth are `unknown` here rather than optimistic. Nothing is claimed
 * that has not been sampled.
 */
function manifestOnlySnapshot(): ProviderSnapshot[] {
  return PROVIDER_MANIFESTS.map((manifest) => ({
    manifest,
    health: unknownHealth(),
    auth: { state: 'unauthenticated' as const, method: manifest.authMethods[0] ?? 'none' },
    active: false,
    councilCapable: isCouncilCapable(manifest.capabilities),
    councilBlockedReason: councilBlockedReason(manifest.capabilities),
  }));
}

function adopt(snapshot: RuntimeSnapshot) {
  return {
    providers: snapshot.providers,
    activeProviderId: snapshot.activeProviderId,
    loaded: true,
  };
}

/**
 * The AI runtime layer, as the interface sees it.
 *
 * Holds sampled state only. It applies no capability rules of its own — whether a
 * provider can host the Council is computed by `shared/runtime/capabilities.ts`
 * and arrives on the snapshot already decided, for the same reason the repo store
 * does not decide what a provenance value is worth. Two authorities would drift.
 */
export const useRuntime = create<RuntimeState>()((set, get) => ({
  providers: manifestOnlySnapshot(),
  activeProviderId: null,
  scanning: false,
  busyProviderId: null,
  error: null,
  loaded: false,

  refresh: async () => {
    if (!hasHost()) return;
    try {
      set(adopt(await window.eis!.runtime.snapshot()));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not read AI status.' });
    }
  },

  detect: async () => {
    if (!hasHost()) {
      // In the browser preview there is nothing to scan. Marking it loaded stops
      // the discovery step waiting forever on a host that will never answer.
      set({ loaded: true });
      return;
    }
    set({ scanning: true, error: null });
    try {
      set({ ...adopt(await window.eis!.runtime.detect()), scanning: false });
    } catch (error) {
      set({
        scanning: false,
        error: error instanceof Error ? error.message : 'The scan could not be completed.',
      });
    }
  },

  checkHealth: async (providerId) => {
    if (!hasHost()) return;
    set({ busyProviderId: providerId, error: null });
    try {
      await window.eis!.runtime.checkHealth(providerId);
      await get().refresh();
    } finally {
      set({ busyProviderId: null });
    }
  },

  setActive: async (providerId) => {
    if (!hasHost()) return false;
    set({ busyProviderId: providerId, error: null });
    try {
      const result = await window.eis!.runtime.setActive(providerId);
      if (!result.ok) {
        // The refusal reason is the founder's only route to understanding why a
        // runtime they installed cannot run their board. Surfaced, never swallowed.
        set({ error: result.reason ?? 'That AI cannot be made active.' });
        return false;
      }
      // Remembered only after the host accepted it, so a refused choice is never
      // restored on the next launch as though it had worked.
      useUi.getState().setActiveProviderId(providerId);
      await get().refresh();
      return true;
    } finally {
      set({ busyProviderId: null });
    }
  },

  submitApiKey: async (providerId, secret) => {
    if (!hasHost()) return { ok: false, reason: 'No host process.' };
    set({ busyProviderId: providerId, error: null });
    try {
      const result = await window.eis!.runtime.submitApiKey(providerId, secret);
      if (!result.ok) set({ error: result.reason ?? 'That key was not accepted.' });
      await get().refresh();
      return result;
    } finally {
      set({ busyProviderId: null });
    }
  },

  disconnect: async (providerId) => {
    if (!hasHost()) return;
    set({ busyProviderId: providerId, error: null });
    try {
      await window.eis!.runtime.disconnect(providerId);
      // Forget the remembered choice too, or the next launch would try to restore
      // an AI the founder just disconnected.
      if (useUi.getState().activeProviderId === providerId) {
        useUi.getState().setActiveProviderId(null);
      }
      await get().refresh();
    } finally {
      set({ busyProviderId: null });
    }
  },

  clearError: () => set({ error: null }),

  startWatching: (intervalMs = 4000) => {
    if (!hasHost()) return () => {};
    const timer = setInterval(() => {
      // A background tick never shows the scanning indicator — that is
      // reserved for a founder-initiated sweep. A polling loop that flickered
      // the UI every four seconds would read as instability, not diligence.
      void window.eis!.runtime.detect().then((snapshot) => set(adopt(snapshot)));
    }, intervalMs);
    return () => clearInterval(timer);
  },
}));

/**
 * Mount-scoped wrapper around `startWatching`, for a screen that wants
 * continuous discovery for exactly as long as it is on screen — and not one
 * tick longer.
 */
export function useDiscoveryWatch(intervalMs?: number): void {
  const startWatching = useRuntime((s) => s.startWatching);
  useEffect(() => startWatching(intervalMs), [startWatching, intervalMs]);
}

/** The Active Brain, or null. Used by the header, the composer, and first run. */
export function useActiveBrain(): ProviderSnapshot | null {
  const providers = useRuntime((s) => s.providers);
  const activeId = useRuntime((s) => s.activeProviderId);
  return providers.find((provider) => provider.manifest.id === activeId) ?? null;
}
