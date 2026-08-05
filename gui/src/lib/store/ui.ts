'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MEMORY_SCOPE, readMemoryScope, type MemoryScope } from '@shared/runtime-modes';

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
   * definitions live in `core/executives/`, and storing anything beyond an
   * identifier here would start a second copy of them.
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

  /**
   * Scope the **next** conversation will be created with.
   *
   * ---------------------------------------------------------------------------
   * A SETTING FOR THE NEXT ONE, NEVER A PROPERTY OF THE CURRENT ONE
   * ---------------------------------------------------------------------------
   * Nothing reads this to decide how an existing conversation behaves. The scope
   * a conversation runs under is read back from its own stored record
   * (`ConversationSummary.mode.memory`), which was written once at creation.
   *
   * Keeping the two apart is the whole of the immutability guarantee. If any
   * screen resolved the active conversation's scope from this value, flipping
   * the toggle would retroactively change every conversation in the history —
   * silently, and in the direction most likely to matter, since a Business
   * thread re-answering without the founder's company reads as amnesia.
   */
  defaultMemoryScope: MemoryScope;

  /**
   * The AI chosen to power the council, remembered across launches.
   *
   * The host's runtime manager holds the active provider in memory only, because
   * a session cannot outlive the process. Without this, every launch would find
   * no Active Brain and send an established founder back through first-run setup
   * — the most annoying possible bug and an entirely invisible one in a dev
   * session that never restarts.
   *
   * Re-applied on launch by `AppShell`, which calls `setActive` with it. It is a
   * *pointer*, exactly like `workspacePath`: if that AI is no longer installed,
   * the call fails and the AI screen says so rather than silently choosing another.
   */
  activeProviderId: string | null;

  setTheme(theme: Theme): void;
  toggleTheme(): void;
  setWorkspacePath(path: string | null): void;
  toggleSidebar(): void;
  dismissNotice(): void;
  setEnabledLenses(ids: string[] | null): void;
  setDevForceFirstRun(value: boolean): void;
  markOnboardingStarted(): void;
  setDefaultMemoryScope(scope: MemoryScope): void;
  setActiveProviderId(id: string | null): void;
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
      defaultMemoryScope: DEFAULT_MEMORY_SCOPE,
      activeProviderId: null,

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
      // Normalised on the way in: this value ends up composing a directive, and a
      // malformed one must never be able to strip a founder's company from advice
      // they are reading as though it were about them.
      setDefaultMemoryScope: (scope) =>
        set({ defaultMemoryScope: readMemoryScope(scope) }),
      setActiveProviderId: (activeProviderId) => set({ activeProviderId }),
    }),
    {
      name: 'eis-cockpit-ui',
      version: 4,
      // Only these keys survive a restart. Anything derived is recomputed.
      partialize: (state) => ({
        theme: state.theme,
        workspacePath: state.workspacePath,
        sidebarCollapsed: state.sidebarCollapsed,
        noticeDismissed: state.noticeDismissed,
        enabledLenses: state.enabledLenses,
        devForceFirstRun: state.devForceFirstRun,
        onboardingStarted: state.onboardingStarted,
        defaultMemoryScope: state.defaultMemoryScope,
        activeProviderId: state.activeProviderId,
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
        // v3 added the memory scope. Every stored conversation predating it was
        // created before Executive Learning existed, so Business is not a fallback
        // here — it is what those installations actually were.
        const scoped = {
          ...state,
          defaultMemoryScope: readMemoryScope(state.defaultMemoryScope),
        };
        // v4 added the remembered AI. Absent on every earlier store, and null is
        // the correct value: those installations had no concept of choosing one.
        if (version >= 2) return { activeProviderId: null, ...scoped } as UiState;
        return {
          ...scoped,
          noticeDismissed: false,
          enabledLenses: null,
          devForceFirstRun: false,
          onboardingStarted: false,
        } as UiState;
      },
    }
  )
);
