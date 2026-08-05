/**
 * Gemini CLI as a provider.
 *
 * ---------------------------------------------------------------------------
 * UNVERIFIED AGAINST A LIVE RUNTIME. READ THIS BEFORE TRUSTING IT.
 * ---------------------------------------------------------------------------
 * No Gemini CLI was available on the machine this was written on. The manifest
 * records that as `verification: 'vendor-documented'` and the AI Control Center
 * shows it, but the same warning belongs here where someone will change the code:
 *
 *   - The invocation below is the documented non-interactive form. It has not
 *     been exercised.
 *   - Output is treated as **plain text on stdout**, not as a structured stream.
 *     That is the conservative choice: every CLI produces plain stdout, whereas a
 *     JSON stream format assumed and got wrong would silently render frame
 *     metadata into the founder's transcript as though the advisor had said it.
 *   - Consequently there is no tool-activity timeline and no permission prompt
 *     for this provider, which is exactly what the manifest declares
 *     (`permissionPrompts: unknown`, so the feature gate disables consent rather
 *     than promising it).
 *
 * This repository's own hardest lesson is that an unverified belief written down
 * as a finding survives for milestones (`permission-policy.ts`). So: this is a
 * best-effort implementation against published behaviour, and the first person
 * with the CLI installed should run `npm run validate:modes` against it and
 * promote the manifest to `verified-live` — or correct it.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
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
import { discover } from '../../discovery';

const execFileAsync = promisify(execFile);
const IS_WINDOWS = process.platform === 'win32';
const RUNTIME_BIN = IS_WINDOWS ? 'gemini.cmd' : 'gemini';

/** Same reasoning as the Claude transport: literal flags only, input on stdin. */
const SAFE_ARG = /^[A-Za-z0-9_.:\-=/\\ ]+$/;

class GeminiNativeAuth implements AuthenticationStrategy {
  readonly method = 'providerNative' as const;
  async isAvailable(): Promise<boolean> {
    return true;
  }
  async status(): Promise<AuthStatus> {
    return {
      state: 'delegated',
      method: 'providerNative',
      message:
        'Gemini CLI manages its own sign-in. If a turn fails with an authentication error, run `gemini` once in a terminal and sign in there.',
    };
  }
  async begin(): Promise<AuthStatus> {
    return this.status();
  }
  async revoke(): Promise<void> {}
}

class GeminiSession implements RuntimeSession {
  readonly sessionId = randomUUID();

  private child: ChildProcessWithoutNullStreams | null = null;
  private turnId: string | null = null;

  constructor(
    private readonly workspacePath: string,
    private readonly emit: (event: AdvisorEvent) => void
  ) {}

  async send(text: string): Promise<{ turnId: string }> {
    if (this.child) await this.cancel();

    const turnId = randomUUID();
    this.turnId = turnId;
    this.emit({ kind: 'turn-started', turnId, sessionId: this.sessionId });

    /*
     * `-p` with the prompt delivered on stdin.
     *
     * The prompt is NOT passed as an argument. On Windows this spawns through a
     * `.cmd` shim with `shell: true`, which concatenates rather than escapes
     * (Node DEP0190) — so a founder's message containing a quote or an ampersand
     * would become shell syntax. The Claude transport documents this hazard at
     * length; the same rule is applied here rather than rediscovered.
     */
    const args = ['-p'];
    for (const arg of args) {
      if (!SAFE_ARG.test(arg)) throw new Error('Refusing to spawn: unsafe argument.');
    }

    const child = spawn(RUNTIME_BIN, args, {
      cwd: this.workspacePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: IS_WINDOWS,
      windowsHide: true,
    });
    this.child = child;

    let assembled = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (this.child !== child) return;
      assembled += chunk;
      this.emit({ kind: 'text-delta', turnId, text: chunk });
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (this.child !== child) return;
      const message = chunk.trim();
      // stderr on a CLI carries progress chatter as well as faults, so it is a
      // notice rather than an error — the same call the Claude transport makes.
      if (message) {
        this.emit({
          kind: 'runtime-notice',
          turnId,
          severity: 'warning',
          message: message.slice(0, 500),
        });
      }
    });

    child.on('error', (error) => {
      if (this.child !== child) return;
      this.child = null;
      this.turnId = null;
      this.emit({
        kind: 'error',
        turnId,
        message: `Gemini CLI failed to start: ${error.message}`,
        fatal: true,
      });
      this.emit({ kind: 'turn-complete', turnId });
    });

    child.on('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.turnId = null;
      if (assembled.length > 0) {
        this.emit({ kind: 'message-complete', turnId, text: assembled });
      }
      if (code !== 0) {
        this.emit({
          kind: 'error',
          turnId,
          message: `Gemini CLI exited with code ${code}.`,
          fatal: false,
        });
      }
      this.emit({ kind: 'turn-complete', turnId });
    });

    child.stdin.write(text);
    // Closed immediately, unlike the Claude transport. There is no bidirectional
    // control channel here — no permission protocol to keep a pipe open for — so
    // holding stdin would leave the process waiting on input that never comes.
    child.stdin.end();

    return { turnId };
  }

  async respondToPermission(): Promise<void> {
    // No consent channel is established through this transport. The manifest
    // declares `permissionPrompts: unknown` for exactly this reason.
  }

  async cancel(): Promise<void> {
    const child = this.child;
    const turnId = this.turnId;
    if (!child) return;
    this.child = null;
    this.turnId = null;
    child.kill();
    if (turnId) this.emit({ kind: 'turn-complete', turnId });
  }

  async close(): Promise<void> {
    await this.cancel();
  }

  pendingPermissionCount(): number {
    return 0;
  }
}

export class GeminiCliProvider implements RuntimeProvider {
  readonly manifest: ProviderManifest;
  private readonly auth = new GeminiNativeAuth();

  constructor() {
    const manifest = manifestFor('gemini-cli');
    if (!manifest) throw new Error('gemini-cli manifest is missing from PROVIDER_MANIFESTS');
    this.manifest = manifest;
  }

  detect(): Promise<RuntimeHealth> {
    return discover(this.manifest.discovery);
  }

  async checkHealth(): Promise<RuntimeHealth> {
    const started = Date.now();
    try {
      const { stdout } = await execFileAsync(RUNTIME_BIN, ['--version'], {
        shell: IS_WINDOWS,
        timeout: 15_000,
        windowsHide: true,
      });
      return {
        state: 'healthy',
        version: stdout.trim().split('\n')[0]?.trim() || null,
        latencyMs: Date.now() - started,
        checkedAt: Date.now(),
      };
    } catch {
      return {
        state: 'absent',
        version: null,
        checkedAt: Date.now(),
        message: 'The Gemini CLI could not be reached.',
      };
    }
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
    return new GeminiSession(options.workspacePath, emit);
  }
}
