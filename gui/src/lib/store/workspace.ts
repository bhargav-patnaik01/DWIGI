'use client';

import { create } from 'zustand';
import type { WorkspaceManifest, WorkspaceValidation } from '@shared/workspace';
import { hasHost } from '@/lib/utils';
import { useUi } from '@/lib/store/ui';
import { useRepo } from '@/lib/store/repo';

interface WorkspaceState {
  /** Result of the last validation, or null before one has run. */
  validation: WorkspaceValidation | null;
  manifest: WorkspaceManifest | null;
  /** A settings-file problem worth telling the founder about. */
  notice: string | null;
  busy: boolean;
  error: string | null;

  /** Ask the host for a folder. Returns the chosen path, or null if cancelled. */
  choose(): Promise<string | null>;
  validate(target: string): Promise<WorkspaceValidation | null>;
  create(target: string, name: string): Promise<boolean>;
  open(target: string): Promise<boolean>;
  repair(target: string): Promise<boolean>;
  reset(): void;
}

/**
 * Workspace lifecycle for the interface.
 *
 * ---------------------------------------------------------------------------
 * ADOPTING A WORKSPACE IS THREE WRITES, AND THEY HAPPEN HERE SO NOBODY FORGETS ONE
 * ---------------------------------------------------------------------------
 * A workspace becomes *the* workspace when the pointer is stored, the repository
 * reader is attached, and the first snapshot is read. A screen doing two of the
 * three produces an interface that believes it has a workspace and cannot read
 * anything from it — so `adopt()` does all three, and the screens call it.
 */
export const useWorkspace = create<WorkspaceState>()((set) => ({
  validation: null,
  manifest: null,
  notice: null,
  busy: false,
  error: null,

  choose: async () => {
    if (!hasHost()) return null;
    return window.eis!.host.selectDirectory();
  },

  validate: async (target) => {
    if (!hasHost()) return null;
    set({ busy: true, error: null });
    try {
      const validation = await window.eis!.workspace.validate(target);
      set({ validation, busy: false });
      return validation;
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'That folder could not be checked.',
      });
      return null;
    }
  },

  create: async (target, name) => {
    if (!hasHost()) return false;
    set({ busy: true, error: null });
    try {
      const result = await window.eis!.workspace.create(target, name);
      if (!result.ok) {
        set({ busy: false, error: result.reason ?? 'The workspace could not be created.' });
        return false;
      }
      await adopt(target);
      set({ busy: false });
      return true;
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'The workspace could not be created.',
      });
      return false;
    }
  },

  open: async (target) => {
    if (!hasHost()) return false;
    set({ busy: true, error: null });
    try {
      const result = await window.eis!.workspace.open(target);
      set({
        validation: result.validation,
        manifest: result.manifest,
        notice: result.manifestNotice,
      });
      if (!result.validation.ok) {
        set({ busy: false });
        return false;
      }
      await adopt(target);
      set({ busy: false });
      return true;
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'That workspace could not be opened.',
      });
      return false;
    }
  },

  repair: async (target) => {
    if (!hasHost()) return false;
    set({ busy: true, error: null });
    try {
      await window.eis!.workspace.repair(target);
      const validation = await window.eis!.workspace.validate(target);
      set({ validation, busy: false });
      return validation.ok;
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'The workspace could not be repaired.',
      });
      return false;
    }
  },

  reset: () => set({ validation: null, manifest: null, notice: null, error: null }),
}));

/** Store the pointer, attach the reader, take the first snapshot. All three. */
async function adopt(target: string): Promise<void> {
  useUi.getState().setWorkspacePath(target);
  await useRepo.getState().attach(target);
}
