'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

interface UiState {
  theme: Theme;
  /**
   * Absolute path to the Executive Intelligence System repository.
   *
   * Null until the user chooses one in Settings. The cockpit stores a *pointer*
   * to the repository, never its contents — the repository remains the single
   * source of truth for every business fact.
   */
  workspacePath: string | null;
  sidebarCollapsed: boolean;

  /** True once the founder has closed the development notice. */
  noticeDismissed: boolean;

  /**
   * Constructive lenses the founder has left enabled for Council deliberation.
   *
   * ---------------------------------------------------------------------------
   * NULL IS NOT AN EMPTY SET
   * ---------------------------------------------------------------------------
   * Null means *unconfigured* — the founder has never touched Agent Management,
   * so the engine's own routing decides participation and the cockpit sends no
   * directive at all. An array means they have made a choice, and that choice is
   * transmitted.
   *
   * Ids only. No persona text, no role description, no reasoning hint. The
   * definitions live in `core/executive_matrix.md`, and storing anything beyond
   * an identifier here would start a second copy of them.
   */
  enabledLenses: string[] | null;

  /**
   * Developer override that forces the first-run experience.
   *
   * Exists so the welcome flow can be worked on against a repository that
   * already has a Business Memory. It changes only what the *cockpit* shows;
   * `/begin` still checks the file itself and declines to re-run onboarding over
   * a memory that exists, so this cannot damage a real founder's data.
   *
   * Reachable only from the diagnostics panel (Ctrl/Cmd+Shift+D). Never
   * presented in Settings, because it is not a preference.
   */
  devForceFirstRun: boolean;

  /**
   * True once Get Started has been pressed for the current repository.
   *
   * Without this, closing the app part-way through onboarding would show the
   * welcome screen again on the next launch and offer to start over, discarding
   * a conversation already in progress. Business Memory does not exist until the
   * advisor writes it, so file presence alone cannot answer "have we begun".
   */
  onboardingStarted: boolean;

  setTheme(theme: Theme): void;
  toggleTheme(): void;
  setWorkspacePath(path: string | null): void;
  toggleSidebar(): void;
  dismissNotice(): void;
  setEnabledLenses(ids: string[] | null): void;
  setDevForceFirstRun(value: boolean): void;
  markOnboardingStarted(): void;
}

/**
 * Persisted in the host's own storage (Electron `userData`), deliberately never
 * inside the repository. Deleting `gui/` leaves no trace in the reasoning
 * engine, and the repository stays byte-identical to a terminal-only install.
 *
 * Everything here is interface state: what to show, what has been dismissed,
 * which lenses the founder wants engaged. No business fact is stored, and
 * nothing here is read by the advisor — the enabled-lens set reaches it only as
 * an explicit command argument on a turn the founder sent.
 */
export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      workspacePath: null,
      sidebarCollapsed: false,
      noticeDismissed: false,
      enabledLenses: null,
      devForceFirstRun: false,
      onboardingStarted: false,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
      // Changing repository resets the first-run answer: a different directory is
      // a different installation, and it may legitimately need onboarding.
      setWorkspacePath: (workspacePath) => set({ workspacePath, onboardingStarted: false }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      dismissNotice: () => set({ noticeDismissed: true }),
      setEnabledLenses: (enabledLenses) => set({ enabledLenses }),
      setDevForceFirstRun: (devForceFirstRun) => set({ devForceFirstRun }),
      markOnboardingStarted: () => set({ onboardingStarted: true }),
    }),
    {
      name: 'eis-cockpit-ui',
      version: 2,
      // Only these keys survive a restart. Anything derived is recomputed.
      partialize: (state) => ({
        theme: state.theme,
        workspacePath: state.workspacePath,
        sidebarCollapsed: state.sidebarCollapsed,
        noticeDismissed: state.noticeDismissed,
        enabledLenses: state.enabledLenses,
        devForceFirstRun: state.devForceFirstRun,
        onboardingStarted: state.onboardingStarted,
      }),
      /**
       * A v1 store predates every field added here.
       *
       * Defaults are supplied rather than the record being discarded, because v1
       * held the repository pointer — dropping it would silently detach a working
       * installation from its repository on upgrade.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<UiState>;
        if (version >= 2) return state as UiState;
        return {
          ...state,
          noticeDismissed: false,
          enabledLenses: null,
          devForceFirstRun: false,
          onboardingStarted: false,
        } as UiState;
      },
    }
  )
);
