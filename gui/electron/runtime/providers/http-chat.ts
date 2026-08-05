/**
 * HTTP chat runtimes — OpenAI, Ollama, and LM Studio behind one implementation.
 *
 * ---------------------------------------------------------------------------
 * WHY THREE PROVIDERS SHARE ONE FILE
 * ---------------------------------------------------------------------------
 * All three are "POST a message list, read a stream of text deltas back". They
 * differ in the URL, the auth header, and the exact frame shape — three values
 * and one enum, not three architectures. Writing them separately would triple the
 * surface on which a streaming bug could hide in only one of them.
 *
 * What they share is more important than the dialect: none has a filesystem, none
 * has tools, and none can find the operating instructions in a workspace. So none
 * can host the Executive Council, and their manifests say so
 * (`shared/runtime/manifests.ts`). This file implements conversation and nothing
 * more, which is the honest ceiling for a chat-completions endpoint.
 *
 * ---------------------------------------------------------------------------
 * IN-SESSION HISTORY IS NOT EMULATED RESUME
 * ---------------------------------------------------------------------------
 * These endpoints are stateless, so a multi-turn conversation only works if the
 * prior turns are sent with each request. That is done, in memory, for the life of
 * the session — and it is *not* the `resume` capability, which the manifests
 * declare `unsupported`.
 *
 * The distinction is exact and worth holding onto. `resume` means continuing a
 * conversation after the session has ended, by handle. Replaying the cockpit's
 * stored transcript to fake that would change cost and truncation behaviour
 * silently — a founder reopening a long thread would pay to resend all of it, and
 * would hit a context limit with no explanation. So history lives and dies with
 * the session, and reopening a past conversation on one of these providers
 * genuinely starts fresh, which the interface reports rather than hides.
 *
 * ---------------------------------------------------------------------------
 * NO SECRET IS RETAINED
 * ---------------------------------------------------------------------------
 * The API key is fetched from `CredentialStore` at the moment a request is built
 * and dropped when the header is written. It is never stored on an instance, never
 * put in an error message, and never included in a thrown value — a rejection
 * carrying a request object would put the header into a stack trace, which is how
 * a credential ends up in a log.
 */

import { randomUUID } from 'node:crypto';
import type { AdvisorEvent } from '../../../shared/advisor';
import type {
  AuthStatus,
  AuthenticationStrategy,
  ProviderManifest,
  RuntimeHealth,
  RuntimeProvider,
  RuntimeSession,
  RuntimeSessionOptions,
} from '../../../shared/runtime/contract';
import { manifestFor } from '../../../shared/runtime/manifests';
import { hostedRuntimeContext, requiresHostedContext } from '../../../shared/runtime/injection';
import { stateOf } from '../../../shared/runtime/capabilities';
import { toOpenAIToolSpecs, type ReadOnlyToolName } from '../../../shared/runtime/tools';
import { executeReadOnlyTool } from '../tools/execute';
import { CredentialStore, credentialStorageAvailability } from '../auth/credentials';
import { discover } from '../discovery';

/** Which wire format the endpoint speaks. */
export type Dialect = 'openai-sse' | 'ollama-ndjson';

/** Turns spent calling tools before a runaway loop is cut off and reported. */
const MAX_TOOL_ITERATIONS = 8;

export interface HttpChatConfig {
  providerId: string;
  /** Absolute endpoint for a chat turn. */
  chatUrl: string;
  /** Endpoint that lists models; used as the health probe. */
  healthUrl: string;
  dialect: Dialect;
  /** Model sent with each request. A default the founder can override later. */
  defaultModel: string;
  /** True when the endpoint requires a credential. */
  requiresKey: boolean;
  /**
   * How the stored credential is presented, when `requiresKey` is true.
   *
   * `bearer` — `authorization: Bearer <key>`, the OpenAI-compatible convention
   * OpenAI, OpenRouter, and LM Studio's key-gated deployments all share.
   * `api-key` — Azure OpenAI's own `api-key: <key>` header. Sending a bearer
   * header to Azure would fail every request with an auth error that looks
   * identical to a wrong key, which is worse than declaring the real dialect.
   * Defaults to `bearer` when omitted, so the existing three configs need no
   * change.
   */
  authHeader?: 'bearer' | 'api-key';
}

/** One message in the history sent upstream. */
interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Null only for an assistant turn that is pure tool calls, no text. */
  content: string | null;
  /** Present on an assistant message that requested read-only tool calls. */
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  /** Present on a `tool` message: which call this answers. */
  tool_call_id?: string;
}

/** One tool call accumulated across streamed deltas, keyed by its position. */
interface PendingToolCall {
  id: string;
  name: string;
  argsText: string;
}

function describeToolCall(name: string, argsText: string): string {
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(argsText || '{}');
    if (typeof parsed === 'object' && parsed !== null) args = parsed as Record<string, unknown>;
  } catch {
    // Malformed arguments are reported by the tool executor itself; the
    // activity label just falls back to the bare tool name.
  }
  switch (name) {
    case 'read_file':
      return `Read ${typeof args.path === 'string' ? args.path : 'a file'}`;
    case 'list_directory':
      return `List ${typeof args.path === 'string' && args.path !== '.' ? args.path : 'the workspace'}`;
    case 'search_workspace':
      return `Search for "${typeof args.pattern === 'string' ? args.pattern : ''}"`;
    case 'git_status':
      return 'Check git status';
    case 'git_diff':
      return 'Read git diff';
    case 'git_log':
      return 'Read git log';
    case 'read_business_memory':
      return 'Read Business Memory';
    case 'read_imported_context':
      return typeof args.name === 'string' ? `Read imported document "${args.name}"` : 'List imported Business Context';
    default:
      return name;
  }
}

function activityCategory(name: string): 'read' | 'search' {
  return name === 'search_workspace' ? 'search' : 'read';
}

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

/** A local service needing nothing. Its readiness is a health question, not auth. */
class NoAuth implements AuthenticationStrategy {
  readonly method = 'none' as const;
  async isAvailable(): Promise<boolean> {
    return true;
  }
  async status(): Promise<AuthStatus> {
    return { state: 'not-required', method: 'none' };
  }
  async begin(): Promise<AuthStatus> {
    return this.status();
  }
  async revoke(): Promise<void> {}
}

/**
 * Key held in the OS credential store.
 *
 * `begin()` cannot itself collect the key — a strategy has no UI. The renderer
 * collects it and calls the manager's `submitApiKey`, which writes it here. This
 * split keeps the secret's journey as short as possible: one IPC hop inward, into
 * the main process, into the keychain, and never back out.
 */
class ApiKeyAuth implements AuthenticationStrategy {
  readonly method = 'osCredentialStore' as const;

  constructor(
    private readonly providerId: string,
    private readonly store: CredentialStore,
    private readonly verify: () => Promise<RuntimeHealth>
  ) {}

  async isAvailable(): Promise<boolean> {
    return credentialStorageAvailability().available;
  }

  async status(): Promise<AuthStatus> {
    const availability = credentialStorageAvailability();
    if (!availability.available) {
      return {
        state: 'unauthenticated',
        method: 'osCredentialStore',
        message: availability.reason,
      };
    }

    if (!(await this.store.has(this.providerId))) {
      return { state: 'unauthenticated', method: 'osCredentialStore' };
    }

    // A stored credential that will not decrypt is `invalid`, not absent. The
    // founder needs to be told to connect again, and "no key stored" would send
    // them looking for a key they already provided.
    const secret = await this.store.get(this.providerId);
    if (secret === null) {
      return {
        state: 'invalid',
        method: 'osCredentialStore',
        message:
          'The stored key could not be read back — this usually means the computer’s credential store changed. Connect again.',
      };
    }

    return { state: 'authenticated', method: 'osCredentialStore' };
  }

  /**
   * Validate a stored key by making the cheapest authenticated request there is.
   *
   * This is the one place a remote host is contacted outside a turn, and it
   * happens only after the founder has explicitly connected — which is what
   * ADR-013 §F rule 4 requires and why discovery does not do it.
   */
  async begin(): Promise<AuthStatus> {
    const current = await this.status();
    if (current.state !== 'authenticated') return current;

    const health = await this.verify();
    if (health.state === 'healthy') return current;

    return {
      state: 'invalid',
      method: 'osCredentialStore',
      message: health.message ?? 'The provider rejected this key.',
    };
  }

  async revoke(): Promise<void> {
    await this.store.remove(this.providerId);
  }
}

/* -------------------------------------------------------------------------- */
/* Session                                                                    */
/* -------------------------------------------------------------------------- */

class HttpChatSession implements RuntimeSession {
  readonly sessionId = randomUUID();

  /**
   * In-memory conversation. See the file header on why this is not resume.
   *
   * Seeded with `hostedRuntimeContext()` as a leading `system` message when
   * `manifest.executionMode === 'hosted'` — v1.2.3 Appendix Part N. Gated on
   * the declared field rather than assumed, even though every provider this
   * class currently backs is hosted by construction: the check is what makes
   * "Native engines must never receive these prompts" a property of the code
   * path, not a fact that happens to hold today because of which classes exist.
   */
  private history: WireMessage[] = [];

  private inFlight: AbortController | null = null;

  private turnId: string | null = null;

  /**
   * Whether this connection is offered the fixed read-only tool set.
   *
   * `'unsupported'` never sends `tools` at all — the graceful-degradation rule
   * the user's spec requires: nothing is invented for a connection that has
   * declared it cannot use them. `'supported'` and `'unknown'` both send the
   * tools array; the difference between them is honesty about *why* it might
   * not work (`shared/runtime/manifests.ts`), not a difference in behaviour
   * here — an `'unknown'` model that ignores the field simply never emits a
   * `tool_calls` delta, and the turn proceeds as plain conversation.
   */
  private readonly toolsEnabled: boolean;

  constructor(
    private readonly config: HttpChatConfig,
    private readonly manifest: ProviderManifest,
    private readonly store: CredentialStore,
    private readonly workspacePath: string,
    private readonly emit: (event: AdvisorEvent) => void
  ) {
    if (requiresHostedContext(manifest)) {
      this.history.push({ role: 'system', content: hostedRuntimeContext(manifest) });
    }
    this.toolsEnabled = stateOf(manifest.capabilities, 'readOnlyTools') !== 'unsupported';
  }

  async send(text: string): Promise<{ turnId: string }> {
    // A turn already running is abandoned, matching the Claude transport's rule
    // and for the same reason: two streams writing into one transcript would
    // interleave two answers into one message.
    if (this.inFlight) await this.cancel();

    const turnId = randomUUID();
    this.turnId = turnId;
    this.history.push({ role: 'user', content: text });

    this.emit({ kind: 'turn-started', turnId, sessionId: this.sessionId });

    // Deliberately not awaited: `send` resolves as soon as the turn is accepted,
    // exactly as the CLI transport does, and the stream drives events from here.
    void this.stream(turnId);

    return { turnId };
  }

  private async stream(turnId: string): Promise<void> {
    const controller = new AbortController();
    this.inFlight = controller;

    let iteration = 0;

    try {
      for (;;) {
        iteration += 1;

        const headers: Record<string, string> = { 'content-type': 'application/json' };

        if (this.config.requiresKey) {
          const secret = await this.store.get(this.config.providerId);
          if (!secret) {
            this.fail(turnId, 'No API key is stored for this provider. Connect it again.', true);
            return;
          }
          // The only place the secret exists is this expression. It is not assigned
          // to a field, not logged, and not included in any error below.
          if (this.config.authHeader === 'api-key') {
            headers['api-key'] = secret;
          } else {
            headers.authorization = `Bearer ${secret}`;
          }
        }

        const body: Record<string, unknown> = {
          model: this.config.defaultModel,
          messages: this.history,
          stream: true,
        };
        // Never sent when the connection has declared it cannot use them — the
        // graceful-degradation rule. Sent for `'unknown'` too: offering the
        // tools and having the model ignore them is the honest middle ground
        // between refusing to try and inventing verified support.
        if (this.toolsEnabled) body.tools = toOpenAIToolSpecs();

        const response = await fetch(this.config.chatUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          // Status text only. The response body of a failed auth request can echo
          // request headers, so it is deliberately not read into the message.
          this.fail(
            turnId,
            `The provider refused the request (${response.status} ${response.statusText}).`,
            response.status === 401 || response.status === 403
          );
          return;
        }

        if (!response.body) {
          this.fail(turnId, 'The provider returned no response stream.', false);
          return;
        }

        const { assembled, toolCalls } = await this.consume(response.body, turnId);

        if (toolCalls.length === 0) {
          this.history.push({ role: 'assistant', content: assembled });

          // Authoritative final text, replacing accumulated deltas — the same
          // rule `message-complete` carries for the CLI transport, and for the
          // same reason: concatenated deltas can drop a chunk and a truncated
          // recommendation is the failure that hides best.
          if (assembled.length > 0) {
            this.emit({ kind: 'message-complete', turnId, text: assembled });
          }
          this.emit({ kind: 'turn-complete', turnId });
          return;
        }

        if (iteration >= MAX_TOOL_ITERATIONS) {
          this.history.push({ role: 'assistant', content: assembled || null });
          this.emit({
            kind: 'runtime-notice',
            turnId,
            severity: 'warning',
            message: `Stopped after ${MAX_TOOL_ITERATIONS} tool calls in one turn to avoid a runaway loop.`,
          });
          if (assembled.length > 0) this.emit({ kind: 'message-complete', turnId, text: assembled });
          this.emit({ kind: 'turn-complete', turnId });
          return;
        }

        this.history.push({
          role: 'assistant',
          content: assembled.length > 0 ? assembled : null,
          tool_calls: toolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: call.argsText },
          })),
        });

        for (const call of toolCalls) {
          const activityId = randomUUID();
          const label = describeToolCall(call.name, call.argsText);
          const category = activityCategory(call.name);
          this.emit({ kind: 'activity', turnId, activityId, label, category, state: 'started' });

          let args: unknown = {};
          try {
            args = JSON.parse(call.argsText || '{}');
          } catch {
            // Malformed arguments reach the executor as an empty object; it
            // reports its own `invalid_arguments` failure rather than this
            // code guessing at intent.
          }

          const result = await executeReadOnlyTool(call.name, args, {
            workspacePath: this.workspacePath,
          });

          this.emit({
            kind: 'activity',
            turnId,
            activityId,
            label,
            category,
            state: result.ok ? 'completed' : 'failed',
          });

          this.history.push({ role: 'tool', content: result.content, tool_call_id: call.id });
        }

        // Loop: send the tool results back for the model's next turn of this
        // same conversational turn. Not a new `send()` — one founder message
        // can legitimately take several tool round-trips to answer.
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // Cancellation already emitted `turn-complete`. Emitting an error here
        // would report the founder's own interruption as a fault.
        return;
      }
      this.fail(
        turnId,
        error instanceof Error ? error.message : 'The request to the provider failed.',
        false
      );
    } finally {
      if (this.inFlight === controller) {
        this.inFlight = null;
        this.turnId = null;
      }
    }
  }

  /**
   * Read the stream, emit text deltas, and accumulate any tool calls.
   *
   * Both dialects are line-oriented, so buffering is shared and only the per-line
   * decode differs. A malformed line is skipped rather than thrown on: a partial
   * write must not kill a turn, which is the rule `handleLine` already established
   * for the CLI transport.
   */
  private async consume(
    body: ReadableStream<Uint8Array>,
    turnId: string
  ): Promise<{ assembled: string; toolCalls: PendingToolCall[] }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assembled = '';
    const pending = new Map<number, PendingToolCall>();

    const finish = (): { assembled: string; toolCalls: PendingToolCall[] } => ({
      assembled,
      toolCalls: [...pending.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call),
    });

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        let payload = line;
        if (this.config.dialect === 'openai-sse') {
          if (!line.startsWith('data:')) continue;
          payload = line.slice(5).trim();
          if (payload === '[DONE]') return finish();
        }

        let frame: unknown;
        try {
          frame = JSON.parse(payload);
        } catch {
          continue;
        }

        const text = this.extractDelta(frame);
        if (text) {
          assembled += text;
          this.emit({ kind: 'text-delta', turnId, text });
        }
        if (this.toolsEnabled) this.accumulateToolCalls(frame, pending);
        if (this.isTerminal(frame)) return finish();
      }
    }

    return finish();
  }

  /**
   * Fold one frame's tool-call fragment into `pending`, keyed by position.
   *
   * `openai-sse` streams `arguments` as a string split across many deltas —
   * concatenation is correct and required. `ollama-ndjson` reports a call
   * complete in one frame, with `arguments` sometimes already an object; both
   * shapes normalise to the same accumulated string here so `stream()` parses
   * exactly one way regardless of dialect.
   */
  private accumulateToolCalls(frame: unknown, pending: Map<number, PendingToolCall>): void {
    if (typeof frame !== 'object' || frame === null) return;
    const record = frame as Record<string, unknown>;

    const rawCalls =
      this.config.dialect === 'ollama-ndjson'
        ? (record.message as Record<string, unknown> | undefined)?.tool_calls
        : (
            (record.choices as Array<Record<string, unknown>> | undefined)?.[0]?.delta as
              | Record<string, unknown>
              | undefined
          )?.tool_calls;

    if (!Array.isArray(rawCalls)) return;

    rawCalls.forEach((raw, position) => {
      if (typeof raw !== 'object' || raw === null) return;
      const call = raw as Record<string, unknown>;
      const index = typeof call.index === 'number' ? call.index : position;
      const entry = pending.get(index) ?? { id: '', name: '', argsText: '' };

      if (typeof call.id === 'string' && call.id) entry.id = call.id;
      const fn = call.function as Record<string, unknown> | undefined;
      if (typeof fn?.name === 'string' && fn.name) entry.name = fn.name;
      if (typeof fn?.arguments === 'string') {
        entry.argsText += fn.arguments;
      } else if (fn?.arguments && typeof fn.arguments === 'object') {
        entry.argsText = JSON.stringify(fn.arguments);
      }
      if (!entry.id) entry.id = `${this.config.dialect}-${index}`;

      pending.set(index, entry);
    });
  }

  private extractDelta(frame: unknown): string {
    if (typeof frame !== 'object' || frame === null) return '';
    const record = frame as Record<string, unknown>;

    if (this.config.dialect === 'ollama-ndjson') {
      const message = record.message;
      if (typeof message === 'object' && message !== null) {
        const content = (message as Record<string, unknown>).content;
        return typeof content === 'string' ? content : '';
      }
      return '';
    }

    const choices = record.choices;
    if (!Array.isArray(choices) || choices.length === 0) return '';
    const first = choices[0];
    if (typeof first !== 'object' || first === null) return '';
    const delta = (first as Record<string, unknown>).delta;
    if (typeof delta !== 'object' || delta === null) return '';
    const content = (delta as Record<string, unknown>).content;
    return typeof content === 'string' ? content : '';
  }

  private isTerminal(frame: unknown): boolean {
    if (typeof frame !== 'object' || frame === null) return false;
    const record = frame as Record<string, unknown>;
    if (this.config.dialect === 'ollama-ndjson') return record.done === true;
    const choices = record.choices;
    if (!Array.isArray(choices) || choices.length === 0) return false;
    const first = choices[0] as Record<string, unknown> | undefined;
    return typeof first?.finish_reason === 'string' && first.finish_reason !== null;
  }

  /** Report a failure and finish the turn. Never throws across the boundary. */
  private fail(turnId: string, message: string, fatal: boolean): void {
    this.emit({ kind: 'error', turnId, message, fatal });
    this.emit({ kind: 'turn-complete', turnId });
  }

  async respondToPermission(): Promise<void> {
    // Unreachable by construction: every tool this class can call declares
    // `requires_confirmation: false` (`runtime/tools/*.json`) because none of
    // them can write, delete, install, or reach the network — so nothing here
    // ever raises a `permission-request` to answer. A no-op rather than a
    // throw, because the contract requires every method to be total.
  }

  async cancel(): Promise<void> {
    const controller = this.inFlight;
    const turnId = this.turnId;
    if (!controller) return;
    this.inFlight = null;
    this.turnId = null;
    controller.abort();
    if (turnId) this.emit({ kind: 'turn-complete', turnId });
  }

  async close(): Promise<void> {
    await this.cancel();
    // History is dropped here, which is what makes "reopening starts fresh" true
    // rather than approximately true.
    this.history = [];
  }

  pendingPermissionCount(): number {
    return 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

export class HttpChatProvider implements RuntimeProvider {
  readonly manifest: ProviderManifest;

  private readonly auth: AuthenticationStrategy;

  private lastHealth: RuntimeHealth | null = null;

  constructor(
    private readonly config: HttpChatConfig,
    private readonly store: CredentialStore
  ) {
    const manifest = manifestFor(config.providerId);
    if (!manifest) {
      throw new Error(`${config.providerId} manifest is missing from PROVIDER_MANIFESTS`);
    }
    this.manifest = manifest;
    this.auth = config.requiresKey
      ? new ApiKeyAuth(config.providerId, store, () => this.checkHealth())
      : new NoAuth();
  }

  detect(): Promise<RuntimeHealth> {
    return discover(this.manifest.discovery).then((health) => {
      this.lastHealth = health;
      return health;
    });
  }

  /**
   * Contact the endpoint.
   *
   * For a local service this is a plain GET. For a remote one it carries the
   * stored key, because an unauthenticated probe of `/v1/models` cannot
   * distinguish "reachable" from "key works" — and the founder pressing Test
   * Connection wants the second answer.
   */
  async checkHealth(): Promise<RuntimeHealth> {
    const started = Date.now();
    const headers: Record<string, string> = {};

    if (this.config.requiresKey) {
      const secret = await this.store.get(this.config.providerId);
      if (!secret) {
        this.lastHealth = {
          state: 'unhealthy',
          version: null,
          checkedAt: Date.now(),
          message: 'No API key is stored for this provider yet.',
        };
        return this.lastHealth;
      }
      if (this.config.authHeader === 'api-key') {
        headers['api-key'] = secret;
      } else {
        headers.authorization = `Bearer ${secret}`;
      }
    }

    try {
      const response = await fetch(this.config.healthUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      this.lastHealth = response.ok
        ? {
            state: 'healthy',
            version: null,
            latencyMs: Date.now() - started,
            checkedAt: Date.now(),
          }
        : {
            state: 'unhealthy',
            version: null,
            latencyMs: Date.now() - started,
            checkedAt: Date.now(),
            message:
              response.status === 401 || response.status === 403
                ? 'The provider rejected the stored key.'
                : `The provider answered ${response.status} ${response.statusText}.`,
          };
    } catch {
      this.lastHealth = {
        state: 'absent',
        version: null,
        checkedAt: Date.now(),
        message: this.config.requiresKey
          ? 'Could not reach the provider. Check your network connection.'
          : 'Not running on this machine. Start it, then check again.',
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
    /*
     * `workspacePath` is now used — but only as the root the read-only tool
     * executor confines itself to (`electron/runtime/tools/execute.ts`), never
     * as a filesystem the model reaches directly.
     *
     * These runtimes still have no filesystem *of their own*: nothing here
     * gives the connection an open-ended read, only the fixed six-call
     * read-only set, each one mediated and scoped to this exact path. A model
     * declaring `readOnlyTools: 'unsupported'` (Ollama/LM Studio's honest
     * default is `'unknown'`, not `'unsupported'`, so this applies to no
     * shipped Hosted manifest today, but is enforced structurally rather than
     * assumed) never receives this path at all in effect, because
     * `HttpChatSession` never sends `tools` and therefore never calls the
     * executor for it.
     */
    return new HttpChatSession(this.config, this.manifest, this.store, options.workspacePath, emit);
  }
}

/* -------------------------------------------------------------------------- */
/* The three configurations                                                   */
/* -------------------------------------------------------------------------- */

export const OPENAI_CONFIG: HttpChatConfig = {
  providerId: 'openai',
  chatUrl: 'https://api.openai.com/v1/chat/completions',
  healthUrl: 'https://api.openai.com/v1/models',
  dialect: 'openai-sse',
  defaultModel: 'gpt-4o',
  requiresKey: true,
};

export const OLLAMA_CONFIG: HttpChatConfig = {
  providerId: 'ollama',
  chatUrl: 'http://127.0.0.1:11434/api/chat',
  healthUrl: 'http://127.0.0.1:11434/api/tags',
  dialect: 'ollama-ndjson',
  defaultModel: 'llama3.1',
  requiresKey: false,
};

export const LMSTUDIO_CONFIG: HttpChatConfig = {
  providerId: 'lmstudio',
  chatUrl: 'http://127.0.0.1:1234/v1/chat/completions',
  healthUrl: 'http://127.0.0.1:1234/v1/models',
  dialect: 'openai-sse',
  // LM Studio routes to whatever model is loaded in its server, so a placeholder
  // is correct here — sending a specific name would fail on a machine that has a
  // different one loaded, which is every machine.
  defaultModel: 'local-model',
  requiresKey: false,
};

export const OPENROUTER_CONFIG: HttpChatConfig = {
  providerId: 'openrouter',
  chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
  healthUrl: 'https://openrouter.ai/api/v1/models',
  dialect: 'openai-sse',
  // OpenRouter names models `vendor/model`; this is a widely available default,
  // not a claim about which model best suits the founder's board.
  defaultModel: 'openai/gpt-4o',
  requiresKey: true,
};

/**
 * Azure OpenAI's endpoint is per-deployment, so there is no fixed URL the way
 * there is for OpenAI or OpenRouter. This config is a template; the deployment
 * host, deployment name, and API version are filled in from what the founder
 * enters at connect time before the config is used — see
 * `resolveAzureConfig()`.
 */
export const AZURE_OPENAI_CONFIG_TEMPLATE: Omit<HttpChatConfig, 'chatUrl' | 'healthUrl'> = {
  providerId: 'azure-openai',
  dialect: 'openai-sse',
  defaultModel: '',
  requiresKey: true,
  authHeader: 'api-key',
};

/**
 * Build a concrete Azure OpenAI config from the founder's own deployment
 * details, never guessed or defaulted to a placeholder host — an invented Azure
 * endpoint would fail every request in a way indistinguishable from a real
 * outage, which is worse than asking once at connect time.
 */
export function resolveAzureConfig(deployment: {
  resourceName: string;
  deploymentName: string;
  apiVersion: string;
}): HttpChatConfig {
  const base = `https://${deployment.resourceName}.openai.azure.com/openai/deployments/${deployment.deploymentName}`;
  return {
    ...AZURE_OPENAI_CONFIG_TEMPLATE,
    defaultModel: deployment.deploymentName,
    chatUrl: `${base}/chat/completions?api-version=${deployment.apiVersion}`,
    healthUrl: `${base}?api-version=${deployment.apiVersion}`,
  };
}
