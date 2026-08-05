/**
 * Runtime manager — selects one provider and owns the session on it.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS SITS
 * ---------------------------------------------------------------------------
 *     IPC ──► RuntimeManager ──► RuntimeProvider ──► RuntimeSession
 *
 * `main.ts` talked to `ClaudeCliRuntime` directly. It now talks to this, and this
 * talks to whichever provider is the Active Brain. The IPC channel names, their
 * payloads, and every renderer-facing type are unchanged — which is what makes
 * this a substitution rather than a rewrite.
 *
 * ---------------------------------------------------------------------------
 * RUNTIME-MODE COMPOSITION HAPPENS HERE, ONCE, FOR EVERY PROVIDER
 * ---------------------------------------------------------------------------
 * `composeTurn` used to be called inside the Claude transport. It is called here
 * instead, so a `/lens` or `/learning` directive is composed identically no matter
 * which runtime receives it. A provider that composed its own would be a second
 * implementation of the one rule that decides what the founder's bytes become —
 * and the failure mode is a directive that works on one brain and silently does
 * nothing on another.
 *
 * A provider therefore receives already-composed text and must transmit it
 * verbatim. That is stated in `RuntimeSession.send`.
 *
 * ---------------------------------------------------------------------------
 * SWITCHING BRAINS ENDS THE OUTGOING SESSION, VISIBLY
 * ---------------------------------------------------------------------------
 * Session handles are provider-scoped and meaningless to another runtime
 * (ADR-013 §E), so there is nothing to migrate. The outgoing session is closed and
 * the founder is told the conversation will continue without the earlier context —
 * the same disclosure the Claude transport already makes when the engine has
 * forgotten a session, and for the same reason: a founder who believes the advisor
 * remembers something it does not is worse off than one who is told.
 */

import type {
  AdvisorDiagnostics,
  AdvisorEvent,
  AdvisorSessionOptions,
  PermissionDecision,
} from '../../shared/advisor';
import { TRANSPORT_VERSION } from '../../shared/advisor';
import {
  composeTurn,
  DEFAULT_COUNCIL_MODE,
  type RuntimeMode,
} from '../../shared/runtime-modes';
import {
  isCouncilCapable,
  councilBlockedReason,
} from '../../shared/runtime/capabilities';
import {
  unknownHealth,
  type ProviderSnapshot,
  type RuntimeHealth,
  type RuntimeProvider,
  type RuntimeSession,
  type RuntimeSnapshot,
} from '../../shared/runtime/contract';
import { PROVIDER_MANIFESTS } from '../../shared/runtime/manifests';
import { CredentialStore, credentialStorageAvailability } from './auth/credentials';
import { buildRegistry, instantiate } from './registry';

export type Emit = (event: AdvisorEvent) => void;

export class RuntimeManager {
  private readonly providers: Map<string, RuntimeProvider>;

  /** Last sampled health per provider. Sampling is explicit, never implicit. */
  private health = new Map<string, RuntimeHealth>();

  private activeId: string | null = null;

  private session: RuntimeSession | null = null;

  private workspacePath: string | null = null;

  private lastEventKind: string | null = null;

  constructor(
    private readonly emit: Emit,
    private readonly credentials: CredentialStore
  ) {
    this.providers = instantiate(buildRegistry(credentials));
  }

  /** Wrap the emitter so diagnostics can report the most recent event kind. */
  private emitTracked: Emit = (event) => {
    this.lastEventKind = event.kind;
    this.emit(event);
  };

  /* ------------------------------------------------------------- selection */

  private provider(id: string | null): RuntimeProvider | null {
    if (!id) return null;
    return this.providers.get(id) ?? null;
  }

  get active(): RuntimeProvider | null {
    return this.provider(this.activeId);
  }

  /**
   * Choose the Active Brain.
   *
   * Refuses a provider that cannot host the Council, and says which capability is
   * missing. This is the single most important gate in the runtime layer: allowing
   * it would put a founder in front of a chat box that looks like their board and
   * is not — no Business Memory, no Decision Records, no executives. Part I's rule
   * against silent degradation is at its sharpest here.
   */
  async setActive(id: string): Promise<{ ok: boolean; reason?: string }> {
    const provider = this.provider(id);
    if (!provider) return { ok: false, reason: 'No such AI provider.' };

    if (!isCouncilCapable(provider.manifest.capabilities)) {
      return {
        ok: false,
        reason:
          councilBlockedReason(provider.manifest.capabilities) ??
          'This runtime cannot host the Executive Council.',
      };
    }

    if (this.activeId === id) return { ok: true };

    // Ending the outgoing session before adopting the new one, so there is never a
    // moment where two runtimes both believe they own the conversation.
    await this.closeSession();
    this.activeId = id;
    return { ok: true };
  }

  activeProviderId(): string | null {
    return this.activeId;
  }

  /* ---------------------------------------------------------------- health */

  /**
   * Detect every provider.
   *
   * Run concurrently: five sequential probes, each with a multi-second timeout,
   * would make a cold launch feel broken. Failures are per-provider and never
   * propagate — `absent` is the expected answer for most of them.
   */
  async detectAll(): Promise<void> {
    await Promise.all(
      [...this.providers.entries()].map(async ([id, provider]) => {
        try {
          this.health.set(id, await provider.detect());
        } catch {
          this.health.set(id, {
            state: 'unknown',
            version: null,
            checkedAt: Date.now(),
            message: 'Detection failed unexpectedly.',
          });
        }
      })
    );
  }

  /** Sample one provider's health on demand — the Test Connection action. */
  async checkHealth(id: string): Promise<RuntimeHealth> {
    const provider = this.provider(id);
    if (!provider) return unknownHealth();
    try {
      const health = await provider.checkHealth();
      this.health.set(id, health);
      return health;
    } catch (error) {
      const health: RuntimeHealth = {
        state: 'unhealthy',
        version: null,
        checkedAt: Date.now(),
        message: error instanceof Error ? error.message : 'Health check failed.',
      };
      this.health.set(id, health);
      return health;
    }
  }

  /* -------------------------------------------------------------- snapshot */

  /**
   * The whole runtime layer as one serialisable value.
   *
   * Built from manifests so that a provider whose *implementation* failed to
   * construct still appears — as absent, with its capabilities visible. A founder
   * looking for Ollama should find it listed and reported missing, not silently
   * omitted from a list that then looks complete.
   */
  async snapshot(): Promise<RuntimeSnapshot> {
    const providers: ProviderSnapshot[] = [];

    for (const manifest of PROVIDER_MANIFESTS) {
      const provider = this.providers.get(manifest.id);
      const auth = provider
        ? await provider.authStatus().catch(() => ({
            state: 'unauthenticated' as const,
            method: manifest.authMethods[0] ?? ('none' as const),
          }))
        : { state: 'unauthenticated' as const, method: manifest.authMethods[0] ?? ('none' as const) };

      providers.push({
        manifest,
        health: this.health.get(manifest.id) ?? unknownHealth(),
        auth,
        active: this.activeId === manifest.id,
        councilCapable: isCouncilCapable(manifest.capabilities),
        councilBlockedReason: councilBlockedReason(manifest.capabilities),
      });
    }

    return { providers, activeProviderId: this.activeId, sampledAt: Date.now() };
  }

  /* ------------------------------------------------------------------ auth */

  /**
   * Store an API key.
   *
   * The one inbound path a secret takes, and it is one-way: in through IPC, into
   * the keychain, and never back out. The key is not echoed in the result, not
   * logged, and not retained on this object.
   */
  async submitApiKey(id: string, secret: string): Promise<{ ok: boolean; reason?: string }> {
    const provider = this.provider(id);
    if (!provider) return { ok: false, reason: 'No such AI provider.' };
    if (!provider.manifest.authMethods.includes('osCredentialStore')) {
      return { ok: false, reason: 'This provider does not take an API key.' };
    }

    const availability = credentialStorageAvailability();
    if (!availability.available) return { ok: false, reason: availability.reason };

    try {
      await this.credentials.set(id, secret);
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'The key could not be stored.',
      };
    }

    // Verified immediately, so a mistyped key fails here rather than on the first
    // real question the founder asks.
    const health = await this.checkHealth(id);
    if (health.state !== 'healthy') {
      return { ok: false, reason: health.message ?? 'The provider rejected this key.' };
    }
    return { ok: true };
  }

  /** Forget a provider's credential and stand it down. */
  async disconnect(id: string): Promise<void> {
    const provider = this.provider(id);
    if (provider) {
      for (const strategy of provider.strategies()) {
        await strategy.revoke().catch(() => undefined);
      }
    }
    if (this.activeId === id) {
      await this.closeSession();
      this.activeId = null;
    }
    this.health.delete(id);
  }

  /* -------------------------------------------------------------- sessions */

  async isAvailable(): Promise<boolean> {
    const provider = this.active;
    if (!provider) return false;
    const health = await this.checkHealth(provider.manifest.id);
    return health.state === 'healthy' || health.state === 'degraded';
  }

  async open(options: AdvisorSessionOptions): Promise<{ sessionId: string }> {
    const provider = this.active;
    if (!provider) {
      throw new Error('No AI provider is selected. Choose one in the AI Control Center.');
    }

    await this.closeSession();
    this.workspacePath = options.workspacePath;

    this.session = await provider.openSession(
      {
        workspacePath: options.workspacePath,
        ...(options.resumeSessionId !== undefined
          ? { resumeSessionId: options.resumeSessionId }
          : {}),
      },
      this.emitTracked
    );

    return { sessionId: this.session.sessionId };
  }

  /**
   * Send one turn.
   *
   * `composeTurn` is applied here and nowhere else. Under the default mode it
   * returns the founder's string unchanged, so the verbatim guarantee holds for
   * every provider identically rather than provider by provider.
   */
  async send(text: string, mode: RuntimeMode = DEFAULT_COUNCIL_MODE): Promise<{ turnId: string }> {
    if (!this.session) throw new Error('open() must be called before send()');
    return this.session.send(composeTurn(text, mode));
  }

  async respondToPermission(requestId: string, decision: PermissionDecision): Promise<void> {
    if (!this.session) return;
    return this.session.respondToPermission(requestId, decision);
  }

  async cancel(): Promise<void> {
    if (!this.session) return;
    return this.session.cancel();
  }

  private async closeSession(): Promise<void> {
    if (!this.session) return;
    const session = this.session;
    this.session = null;
    await session.close().catch(() => undefined);
  }

  async close(): Promise<void> {
    await this.closeSession();
  }

  /* ----------------------------------------------------------- diagnostics */

  /**
   * The shape the renderer already consumes.
   *
   * Unchanged from v1.0.1 so the diagnostics panel and the transcript recorder
   * keep working without modification — the recorder in particular reads
   * `sessionId` from here on every turn, and changing this shape would have broken
   * session binding silently.
   */
  async getDiagnostics(): Promise<AdvisorDiagnostics> {
    const provider = this.active;
    const health = provider ? this.health.get(provider.manifest.id) : undefined;

    return {
      transportVersion: TRANSPORT_VERSION,
      connected: this.session !== null,
      sessionId: this.session?.sessionId ?? null,
      workspacePath: this.workspacePath,
      workingDirectory: this.workspacePath,
      runtimeVersion: health?.version ?? null,
      processState: this.session ? 'ready' : 'stopped',
      lastEventKind: this.lastEventKind,
      pendingPermissionCount: this.session?.pendingPermissionCount() ?? 0,
    };
  }
}
