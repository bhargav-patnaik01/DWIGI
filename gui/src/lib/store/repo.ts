'use client';

import { create } from 'zustand';
import type { RepositorySnapshot } from '@shared/repo';
import { hasHost } from '@/lib/utils';

interface RepoState {
  snapshot: RepositorySnapshot | null;
  loading: boolean;
  /** Set when the workspace itself could not be opened. */
  workspaceError: string | null;

  /** Point the reader at a directory and take a first snapshot. */
  attach(workspacePath: string): Promise<void>;
  /** Re-read everything. Called on mount and on any change notification. */
  refresh(): Promise<void>;
  /** Begin watching. Returns an unsubscribe function. */
  watch(): () => void;
}

/**
 * Repository projections, cached only for the current session.
 *
 * ---------------------------------------------------------------------------
 * THE REPOSITORY IS THE SOURCE OF TRUTH; THIS IS A VIEW
 * ---------------------------------------------------------------------------
 * Nothing here is persisted. On every mount and every change notification the
 * whole snapshot is re-read, so a stale cache cannot outlive a file edit — the
 * advisor and the founder both edit files outside this app's knowledge, and a
 * cockpit showing yesterday's runway would be worse than one showing nothing.
 *
 * The store applies no rules to what it holds. It does not decide whether a field
 * is stale, whether a review is due, or what a provenance value is worth. Those
 * belong to the repository's architecture, and duplicating them here would create
 * a second authority.
 */
export const useRepo = create<RepoState>()((set, get) => ({
  snapshot: null,
  loading: false,
  workspaceError: null,

  attach: async (workspacePath) => {
    if (!hasHost()) {
      set({ workspaceError: 'No host process — repository access is unavailable.' });
      return;
    }
    set({ loading: true, workspaceError: null });
    const result = await window.eis!.repo.setWorkspace(workspacePath);
    if (!result.ok) {
      set({ loading: false, workspaceError: result.reason ?? 'Could not open the directory.' });
      return;
    }
    await get().refresh();
  },

  refresh: async () => {
    if (!hasHost()) return;
    set({ loading: true });
    try {
      const snapshot = await window.eis!.repo.snapshot();
      set({ snapshot, loading: false });
    } catch (error) {
      set({
        loading: false,
        workspaceError: error instanceof Error ? error.message : 'Read failed.',
      });
    }
  },

  watch: () => {
    if (!hasHost()) return () => {};
    // The host reports only that something changed; we re-read rather than being
    // handed a diff, because computing what changed would be interpretation.
    return window.eis!.repo.onChanged(() => {
      void get().refresh();
    });
  },
}));
