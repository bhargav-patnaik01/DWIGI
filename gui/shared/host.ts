/**
 * Host bridge contract — shared by the Electron preload and the renderer.
 *
 * These types live in `shared/` rather than in `electron/` so the renderer never
 * imports across the process boundary. Both tsconfigs include this directory;
 * neither includes the other's source. That separation is what allows the host
 * to be replaced (Tauri, or a plain browser during `dev:web`) without touching
 * a single component.
 *
 * Pure types only. No runtime code, no imports other than type-only ones.
 */

import type {
  AdvisorDiagnostics,
  AdvisorEvent,
  AdvisorSessionOptions,
  PermissionDecision,
} from './advisor';
import type { RuntimeMode } from './runtime-modes';
import type {
  NewConversationMode,
  ConversationResult,
  ConversationSummary,
  ConversationTranscript,
  PersistedMessage,
} from './conversations';
import type { RepositorySnapshot } from './repo';

export interface HostInfo {
  appVersion: string;
  electronVersion: string;
  platform: string;
  isDev: boolean;
  /**
   * Repository URL from the application's own package metadata, or null.
   *
   * Read from `package.json`, never constructed. If the field is absent the
   * interface shows no link rather than guessing where the project lives.
   */
  repositoryUrl: string | null;
  /**
   * `EIS_FORCE_FIRST_RUN=1` was set on the environment.
   *
   * Lets the first-run experience be exercised — including against a packaged
   * build — without deleting anyone's Business Memory. It changes only what the
   * cockpit draws; `/begin` still checks the file itself.
   */
  forceFirstRun: boolean;
}

/**
 * Shape of `window.eis`, the entire renderer-visible host surface.
 *
 * `advisor` mirrors `AdvisorTransport` minus `version` and `subscribe`, which the
 * renderer-side adapter supplies — IPC cannot carry a subscription, so the
 * adapter converts the push channel into one.
 */
export interface HostBridge {
  host: {
    getInfo(): Promise<HostInfo>;
    /** Opens a native picker. Resolves null if cancelled. */
    selectDirectory(): Promise<string | null>;
    /**
     * Announce that the interface has mounted and is safe to show.
     *
     * The host keeps the window hidden behind the startup animation until this
     * arrives, so that the founder never sees a half-built screen. Carries no
     * payload and returns nothing: the only fact it reports is that the shell is
     * up, and there is no answer to wait for.
     *
     * Idempotent at the host. Not calling it is survivable — the host reveals
     * the window on a timeout regardless, because a renderer that failed to
     * report should be visible and diagnosable rather than hidden.
     */
    signalReady(): void;
  };
  advisor: {
    isAvailable(): Promise<boolean>;
    open(options: AdvisorSessionOptions): Promise<{ sessionId: string }>;
    /** `mode` omitted means an ordinary Council turn: `text` travels verbatim. */
    send(text: string, mode?: RuntimeMode): Promise<{ turnId: string }>;
    /** Answer a blocking permission request. Idempotent; never throws. */
    respondToPermission(requestId: string, decision: PermissionDecision): Promise<void>;
    cancel(): Promise<void>;
    close(): Promise<void>;
    getDiagnostics(): Promise<AdvisorDiagnostics>;
    onEvent(listener: (event: AdvisorEvent) => void): () => void;
  };
  /**
   * Repository access. Read methods only — there is deliberately no write
   * channel, because only the advisor may mutate the repository.
   */
  repo: {
    setWorkspace(workspacePath: string): Promise<{ ok: boolean; reason?: string }>;
    snapshot(): Promise<RepositorySnapshot | null>;
    /** Reveal a workspace-relative folder in the OS file manager. */
    reveal(relative: string): Promise<boolean>;
    onChanged(listener: () => void): () => void;
  };
  /**
   * The cockpit's own conversation transcripts.
   *
   * ---------------------------------------------------------------------------
   * THIS IS A WRITE CHANNEL, AND IT IS NOT A REPOSITORY WRITE CHANNEL
   * ---------------------------------------------------------------------------
   * `repo` above exposes no write method on purpose. This namespace does, so the
   * distinction has to be stated rather than inferred: it writes only to the
   * host's own application-data directory, and no method here accepts a path.
   * The renderer cannot name a destination, so it cannot reach `core/`,
   * `journal/`, or `dossier/` through this surface.
   */
  conversations: {
    /** Newest activity first, scoped to one workspace. */
    list(workspacePath: string): Promise<ConversationSummary[]>;
    /**
     * Begin a conversation.
     *
     * `mode` defaults to Council. `title` is supplied only for a single-agent
     * chat, which is named for its executive instead of the founder's first words.
     */
    create(
      workspacePath: string,
      options?: { mode?: NewConversationMode; title?: string }
    ): Promise<ConversationResult<ConversationSummary>>;
    load(id: string): Promise<ConversationResult<ConversationTranscript>>;
    /** Append settled messages. Streaming messages are never sent here. */
    append(
      id: string,
      messages: PersistedMessage[]
    ): Promise<ConversationResult<ConversationSummary>>;
    /** Record the opaque engine session handle that continues this conversation. */
    bindSession(
      id: string,
      sessionId: string
    ): Promise<ConversationResult<ConversationSummary>>;
    rename(id: string, title: string): Promise<ConversationResult<ConversationSummary>>;
    remove(id: string): Promise<ConversationResult<{ id: string }>>;
  };
}
