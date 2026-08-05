/**
 * Claude Code as one provider among several.
 *
 * ---------------------------------------------------------------------------
 * THE MIGRATION THAT PROVES THE ABSTRACTION, AND WHAT IT DELIBERATELY DID NOT DO
 * ---------------------------------------------------------------------------
 * `ClaudeCliRuntime` is the most heavily verified code in this repository: the
 * permission control protocol was measured against a live CLI, session recovery
 * was found by a leaked process rather than by reading, and every guard in it
 * names the failure it prevents. Rewriting it to fit a new interface would have
 * put all of that at risk to satisfy a shape.
 *
 * So it is **not rewritten**. This file is an adapter: it constructs the existing
 * runtime, calls the methods it already has, and presents them as a
 * `RuntimeSession`. The whole of the migration is that Claude Code stops being
 * *the* runtime and becomes *a* runtime, and the diff for that is this file plus
 * a registry line.
 *
 * If the abstraction had required changes inside `claude-cli.ts`, that would have
 * been evidence the abstraction was shaped around Claude rather than around
 * runtimes in general. It did not, which is the useful result.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AdvisorEvent } from '../../../../shared/advisor';
import type {
  AuthStatus,
  AuthenticationStrategy,
  ProviderManifest,
  RuntimeHealth,
  RuntimeProvider,
  RuntimeSession,
  RuntimeSessionOptions,
} from '../../../../shared/runtime/contract';
import { manifestFor } from '../../../../shared/runtime/manifests';
import { ClaudeCliRuntime } from '../../../bridge/claude-cli';
import { discover } from '../../discovery';

const execFileAsync = promisify(execFile);
const IS_WINDOWS = process.platform === 'win32';
const RUNTIME_BIN = IS_WINDOWS ? 'claude.cmd' : 'claude';

/**
 * Claude Code owns its own login, so there is nothing for D.W.I.G.I to do.
 *
 * `begin()` does not open a browser or spawn `claude login`. Spawning an
 * interactive login into a host with no terminal attached produces a process
 * waiting on a TTY that will never arrive — the same class of mistake as v1's
 * `stdin.end()`, where the host closed the channel the runtime needed and then
 * concluded the platform could not do it.
 *
 * Instead the founder is told, in one sentence, to run it themselves. That is a
 * worse experience than a button and a truthful one, and Part I's rule about
 * never pretending support exists applies to authentication as much as to
 * capabilities.
 */
class ClaudeNativeAuth implements AuthenticationStrategy {
  readonly method = 'providerNative' as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async status(): Promise<AuthStatus> {
    return {
      state: 'delegated',
      method: 'providerNative',
      message:
        'Claude Code manages its own sign-in. If a turn fails with an authentication error, run `claude` once in a terminal and sign in there.',
    };
  }

  async begin(): Promise<AuthStatus> {
    // Nothing to do, and saying so is the point. Returning `pending` here would
    // leave a spinner running against work that was never started.
    return this.status();
  }

  async revoke(): Promise<void> {
    // Deliberately a no-op. Reaching into another application's credential store
    // to sign a founder out of it exceeds anything D.W.I.G.I was asked to do, and
    // would be indistinguishable from tampering.
  }
}

/**
 * One `ClaudeCliRuntime` presented as a `RuntimeSession`.
 *
 * Thin on purpose: every method forwards. The one thing worth noting is that
 * `sessionId` is captured at construction, because the runtime may legitimately
 * mint a new one during recovery — and the recorder reads the *live* handle from
 * diagnostics for exactly that reason, so this field is for identification, not
 * for resume.
 */
class ClaudeSession implements RuntimeSession {
  constructor(
    readonly sessionId: string,
    private readonly runtime: ClaudeCliRuntime
  ) {}

  send(text: string): Promise<{ turnId: string }> {
    // No mode is passed. Runtime-mode composition happens above the provider
    // layer, in the manager, so that every provider receives already-composed
    // bytes and no provider can compose differently from another.
    return this.runtime.send(text);
  }

  respondToPermission(requestId: string, decision: 'allow' | 'deny'): Promise<void> {
    return this.runtime.respondToPermission(requestId, decision);
  }

  cancel(): Promise<void> {
    return this.runtime.cancel();
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  pendingPermissionCount(): number {
    // `getDiagnostics` is async and this is not, so the count is read from the
    // runtime's own synchronous view. Kept as a method rather than a field so it
    // cannot go stale.
    return this.runtime.pendingPermissionCountSync();
  }
}

export class ClaudeCodeProvider implements RuntimeProvider {
  readonly manifest: ProviderManifest;

  /** One runtime per provider instance. Sessions are opened and closed on it. */
  private runtime: ClaudeCliRuntime | null = null;

  private lastHealth: RuntimeHealth | null = null;

  private readonly auth = new ClaudeNativeAuth();

  constructor() {
    const manifest = manifestFor('claude-code');
    // A provider whose manifest is missing is a build error, not a runtime state.
    // Failing loudly here beats shipping a provider with an invented manifest.
    if (!manifest) throw new Error('claude-code manifest is missing from PROVIDER_MANIFESTS');
    this.manifest = manifest;
  }

  async detect(): Promise<RuntimeHealth> {
    this.lastHealth = await discover(this.manifest.discovery);
    return this.lastHealth;
  }

  /**
   * Sample health.
   *
   * For a CLI runtime this is the same probe as detection — `--version` both
   * proves presence and reports the version, and there is no cheaper liveness
   * check that means anything. Kept as a separate method because the *contract*
   * distinguishes them and an HTTP provider genuinely needs two.
   */
  async checkHealth(): Promise<RuntimeHealth> {
    const started = Date.now();
    try {
      const { stdout } = await execFileAsync(RUNTIME_BIN, ['--version'], {
        shell: IS_WINDOWS,
        timeout: 15_000,
        windowsHide: true,
      });
      const version = stdout.trim().split('\n')[0]?.trim() || null;
      this.lastHealth = {
        state: 'healthy',
        version,
        latencyMs: Date.now() - started,
        checkedAt: Date.now(),
      };
    } catch {
      this.lastHealth = {
        state: 'absent',
        version: null,
        checkedAt: Date.now(),
        message:
          'The Claude Code CLI could not be reached. D.W.I.G.I drives it as a child process and cannot substitute for it.',
      };
    }
    return this.lastHealth;
  }

  strategies(): readonly AuthenticationStrategy[] {
    return [this.auth];
  }

  authStatus(): Promise<AuthStatus> {
    return this.auth.status();
  }

  async openSession(
    options: RuntimeSessionOptions,
    emit: (event: AdvisorEvent) => void
  ): Promise<RuntimeSession> {
    // A previous session is released first. The runtime holds one child process
    // and one session handle at a time, and `open()` already closes an existing
    // child — but doing it here as well makes the ownership explicit at the layer
    // that decides when a session ends (ADR-013 §E).
    if (this.runtime) await this.runtime.close();

    const runtime = new ClaudeCliRuntime(emit);
    this.runtime = runtime;

    const { sessionId } = await runtime.open({
      workspacePath: options.workspacePath,
      ...(options.resumeSessionId !== undefined
        ? { resumeSessionId: options.resumeSessionId }
        : {}),
    });

    return new ClaudeSession(sessionId, runtime);
  }

  /**
   * Diagnostics passthrough.
   *
   * Not part of `RuntimeProvider`: the contract deliberately has no
   * `getDiagnostics`, because a diagnostics shape that every provider had to
   * satisfy would either be Claude-shaped or uselessly generic. The manager
   * assembles diagnostics from contract-level facts — manifest, health, auth,
   * pending count — and this method exists so the Claude provider can contribute
   * the extra detail it happens to have.
   */
  async runtimeDetail(): Promise<Record<string, unknown>> {
    if (!this.runtime) return { processState: 'stopped' };
    const diagnostics = await this.runtime.getDiagnostics();
    return {
      processState: diagnostics.processState,
      lastEventKind: diagnostics.lastEventKind,
      pendingPermissionCount: diagnostics.pendingPermissionCount,
      runtimeVersion: diagnostics.runtimeVersion,
    };
  }
}
