/**
 * Runtime provider contract — the interface every AI runtime implements.
 *
 * ---------------------------------------------------------------------------
 * WHAT CHANGED IN v1.2, AND WHAT DELIBERATELY DID NOT
 * ---------------------------------------------------------------------------
 * `shared/advisor.ts` already defined a vendor-neutral contract with exactly one
 * implementation. v1.2 does not replace it and does not add a second abstraction
 * above it. It adds the provider layer **below** it:
 *
 *     renderer ──► AdvisorTransport ──► RuntimeManager ──► RuntimeProvider
 *                  (unchanged)          (selects one)      (five of them)
 *
 * The renderer's imports are untouched. That is the measure of whether
 * `advisor.ts` was right the first time, and it was — so the honest thing is to
 * build underneath it rather than to rewrite it and claim progress.
 *
 * ---------------------------------------------------------------------------
 * THE EVENT VOCABULARY IS CLOSED TO PROVIDERS
 * ---------------------------------------------------------------------------
 * A `RuntimeSession` emits `AdvisorEvent` and nothing else. A provider that needs
 * a new event kind is a change to `shared/advisor.ts`, reviewed as a contract
 * change — never a provider-local extension.
 *
 * This is the rule that keeps `src/lib/store/chat.ts` free of provider branches.
 * The moment one provider can emit something only it produces, the reducer starts
 * asking which provider it is talking to, and the abstraction is over.
 *
 * ---------------------------------------------------------------------------
 * NO CREDENTIAL TYPE APPEARS IN THIS FILE
 * ---------------------------------------------------------------------------
 * `shared/` is imported by the renderer. Authentication here is represented only
 * by `AuthStatus` — a state, a method name, an optional label. Secrets, key
 * material, and token handling live in `electron/runtime/auth/`, which the
 * renderer cannot import (ADR-013 §F rule 1). A `token?: string` field added
 * here would cross the preload the first time something spread the object.
 *
 * Pure types plus small pure helpers. No runtime behaviour, no filesystem, no
 * process access.
 */

import type { AdvisorEvent, PermissionDecision } from '../advisor';
import type { ProviderCapabilities } from './capabilities';

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Canonical provider identifier.
 *
 * Lowercase, hyphenated, declared in the manifest. This is what a workspace
 * manifest stores as `preferredRuntime` and what a deep link names, so it is
 * validated for shape wherever it crosses a boundary — the same discipline
 * `isLensId` applies for the same reason.
 */
export const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const PROVIDER_ID_MAX_LENGTH = 32;

export function isProviderId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PROVIDER_ID_MAX_LENGTH &&
    PROVIDER_ID_PATTERN.test(value)
  );
}

/* -------------------------------------------------------------------------- */
/* Authentication — status only                                               */
/* -------------------------------------------------------------------------- */

/**
 * How a provider is authenticated. Fixed vocabulary, in the priority order
 * ADR-013 §C sets.
 *
 * A provider selects from this list. It may not invent a method, because a
 * manifest declaring a flow the runtime does not have produces a button that
 * cannot work — the same class of failure as a faked capability, and harder to
 * notice because it looks like a feature until pressed.
 */
export const AUTH_METHODS = {
  /** OAuth or equivalent in the system browser. Preferred where it genuinely exists. */
  browser: 'browser',
  /** The provider's own CLI owns login; we detect the resulting state. */
  providerNative: 'providerNative',
  /** Credential held in the OS keychain via Electron `safeStorage`. */
  osCredentialStore: 'osCredentialStore',
  /** A key the founder pastes. Permitted only where nothing better exists. */
  apiKey: 'apiKey',
  /** No authentication required at all — a local service on this machine. */
  none: 'none',
} as const;

export type AuthMethod = (typeof AUTH_METHODS)[keyof typeof AUTH_METHODS];

/** Priority order from ADR-013 §C. Lower index is preferred. */
export const AUTH_METHOD_PRIORITY: readonly AuthMethod[] = [
  'none',
  'browser',
  'providerNative',
  'osCredentialStore',
  'apiKey',
];

export function isAuthMethod(value: unknown): value is AuthMethod {
  return typeof value === 'string' && value in AUTH_METHODS;
}

export type AuthState =
  /** No credential and none needed. A local service is ready as soon as it is up. */
  | 'not-required'
  /**
   * The runtime manages its own sign-in and D.W.I.G.I does not observe it.
   *
   * The honest state for `providerNative`. Claude Code and Gemini CLI each hold
   * their own session; nothing short of running a turn reveals whether a founder
   * is signed in, and there is no probe that answers it cheaply.
   *
   * Reporting `authenticated` here would be a claim we cannot support — and
   * reporting `unauthenticated` would be worse, because it would tell a signed-in
   * founder they are not. So the interface says "managed by the provider", and a
   * genuine auth failure surfaces on the first turn as the runtime's own error,
   * in the runtime's own words.
   */
  | 'delegated'
  /** Never connected, or explicitly disconnected. */
  | 'unauthenticated'
  /** A flow is in progress — a browser window is open, a CLI is prompting. */
  | 'pending'
  /** Verified usable. */
  | 'authenticated'
  /** A credential exists but the provider rejected it. */
  | 'invalid'
  /** A credential exists and has expired. Distinct from invalid: it once worked. */
  | 'expired';

/**
 * Everything the renderer is permitted to know about authentication.
 *
 * Note what is absent: any secret, any token, any key prefix, any header. The
 * `account` field is a label the provider reports for display — an email, a
 * model host, an organisation name — and is the only identifying string that
 * crosses, because a founder with two accounts needs to know which one is
 * connected.
 */
export interface AuthStatus {
  state: AuthState;
  /** Method in use, or the one that would be attempted. */
  method: AuthMethod;
  /** Display label for the authenticated principal. Never a credential. */
  account?: string;
  /** ISO-8601. Present only when the provider reports an expiry. */
  expiresAt?: string;
  /** Why authentication is failing, in the founder's terms. */
  message?: string;
}

/**
 * One way of authenticating one provider.
 *
 * Implemented in the main process only. `begin` may open a browser, spawn a
 * login CLI, or read the keychain; it resolves with a status and never with a
 * secret, because its caller has no use for one and every additional hop a
 * secret takes is another place it can be logged.
 */
export interface AuthenticationStrategy {
  readonly method: AuthMethod;
  /** Is this strategy usable on this machine right now? */
  isAvailable(): Promise<boolean>;
  /** Current state without attempting a login. Must have no side effects. */
  status(): Promise<AuthStatus>;
  /** Attempt authentication. Resolves with the resulting state. */
  begin(): Promise<AuthStatus>;
  /** Forget the credential. Idempotent. */
  revoke(): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

export type HealthState =
  /** Reachable and usable. */
  | 'healthy'
  /** Reachable but impaired — rate limited, degraded, a stale version. */
  | 'degraded'
  /** Present but not reachable. */
  | 'unhealthy'
  /** Not installed or not found on this machine. */
  | 'absent'
  /** Never sampled. Distinct from unhealthy: nobody has looked. */
  | 'unknown';

/**
 * A health sample.
 *
 * `checkedAt` is mandatory because a health verdict with no timestamp invites
 * the interface to present a stale sample as current — the same failure the
 * repository's own staleness rules exist to prevent for memory fields.
 */
export interface RuntimeHealth {
  state: HealthState;
  /** Version string exactly as the runtime reported it. Null if undeterminable. */
  version: string | null;
  /** Round-trip milliseconds for the probe. Absent when not measured. */
  latencyMs?: number;
  /** Why the state is not `healthy`, in the founder's terms. */
  message?: string;
  /** Epoch millis. Never inferred — the sampler stamps it. */
  checkedAt: number;
}

export function unknownHealth(): RuntimeHealth {
  return { state: 'unknown', version: null, checkedAt: 0 };
}

/* -------------------------------------------------------------------------- */
/* Manifest                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How a runtime is found on this machine.
 *
 * Data, not code — the discovery engine reads these and knows nothing about any
 * particular provider. A provider that needed bespoke detection logic would be a
 * provider leaking into the platform, so the hint vocabulary is closed and the
 * detector implements it once.
 */
export interface DiscoveryHint {
  /** Executable to resolve on PATH, e.g. `claude`. Windows shims are handled by the detector. */
  command?: string;
  /** Argument that makes the executable print its version. Defaults to `--version`. */
  versionArg?: string;
  /** Absolute paths to probe when PATH resolution fails. `~` is expanded. */
  paths?: readonly string[];
  /** HTTP endpoint that answers when the service is running. */
  httpProbe?: { url: string; expectStatus?: number };
}

/**
 * How a capability declaration came to be believed.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE FOR CAPABILITIES, FOR THE SAME REASON MEMORY HAS IT
 * ---------------------------------------------------------------------------
 * A manifest saying `resume: supported` is a *claim*. This field records what
 * kind of claim, and the vocabulary is deliberately parallel to Business Memory's
 * (`business_memory.template.md` §2), because the failure mode is identical: an
 * asserted capability treated as a verified one produces confident behaviour
 * resting on the author's guesswork, and nothing in the interface would signal
 * that the foundation was assumed.
 *
 *   verified-live      exercised against a running runtime by this project's
 *                      own harness — the analogue of `confirmed`
 *   vendor-documented  taken from the provider's published documentation and
 *                      not yet exercised here — the analogue of `imported`,
 *                      and carrying the same warning that extraction is not
 *                      agreement
 *   unverified         believed on weaker grounds than either — the analogue
 *                      of `inferred`
 *
 * The AI Control Center shows this. A founder choosing a brain is entitled to
 * know the difference between "we tested this" and "their docs say so".
 */
export type CapabilityVerification = 'verified-live' | 'vendor-documented' | 'unverified';

/**
 * Everything static about a provider.
 *
 * The GUI reads **only** this and the sampled `AuthStatus`/`RuntimeHealth`. It
 * never imports a provider implementation, which is what makes "no
 * provider-specific code leaks into the GUI" checkable rather than aspirational:
 * the renderer's tsconfig excludes `electron/`, so there is no import to write.
 */
export interface ProviderManifest {
  id: string;
  /** Product name as its vendor writes it. */
  displayName: string;
  /** One line, shown on the connection card. */
  summary: string;
  /** Presentation order in the Control Center. Ties break on id. */
  ordinal: number;
  /** Declared capability surface. */
  capabilities: ProviderCapabilities;
  /**
   * Epistemic standing of `capabilities`. See `CapabilityVerification`.
   *
   * Mandatory, and there is no default. A manifest that could omit this would
   * omit it, and every declaration would then read as equally trustworthy —
   * which is precisely the laundering this field exists to prevent.
   */
  verification: CapabilityVerification;
  /**
   * Authentication methods this provider genuinely offers, most preferred first.
   *
   * Must be non-empty. `['none']` is the correct declaration for a local service
   * that needs no credential, and is not the same as an empty list — an empty
   * list would mean "cannot be authenticated at all", which is a different and
   * much rarer claim.
   */
  authMethods: readonly AuthMethod[];
  /** How to detect it. Empty means it cannot be auto-detected and must be configured. */
  discovery: readonly DiscoveryHint[];
  /**
   * Convention filename this runtime reads from a working directory, if any.
   *
   * The mechanism behind `engineDiscovery` (ADR-013 §D). Workspace creation
   * writes one pointer file per declared name, each delegating to the kernel, so
   * a CLI provider discovers the engine natively without the kernel being
   * duplicated. Null for runtimes with no such convention.
   */
  instructionFile: string | null;
  /** Where a founder goes to install or learn about it. Shown, never fetched. */
  documentationUrl?: string;
  /**
   * True when using this provider bills the founder directly per token.
   *
   * Surfaced at connection. ADR-001 promised zero additional API cost and that
   * promise does not survive for key-based providers; disclosing it at connect
   * time is the difference between a trade-off and a surprise.
   */
  billsPerToken?: boolean;
  /**
   * Whether this runtime already understands how to act on a working directory,
   * or has to be told.
   *
   * ---------------------------------------------------------------------------
   * A DECLARED FACT, NOT A NEW GATE
   * ---------------------------------------------------------------------------
   * `native` — the runtime discovers its own operating instructions and has
   * tools of its own (Claude Code, Gemini CLI). `hosted` — a chat-completions
   * endpoint with no filesystem, no tools, and no notion of a working
   * directory (OpenAI, Ollama, LM Studio).
   *
   * This field decides exactly one thing: whether `hostedRuntimeContext()`
   * (`shared/runtime/injection.ts`) is prepended to that provider's session.
   * It does **not** change Council eligibility — `isCouncilCapable` already
   * gates on `engineDiscovery` + `filesystem` + `toolCalling`, and every
   * `hosted` provider already declares all three `unsupported`. The two facts
   * necessarily agree (asserted by a test), but `executionMode` is not a
   * second, competing way to decide the same question — it exists so the one
   * piece of *hosted-specific runtime behaviour* this appendix adds has
   * something principled to switch on besides a provider id.
   */
  executionMode: ExecutionMode;
}

/**
 * Whether a runtime already understands how to act on a working directory
 * (`native`) or has to be told about its own situation in plain language
 * (`hosted`). See `ProviderManifest.executionMode`.
 */
export type ExecutionMode = 'native' | 'hosted';

/* -------------------------------------------------------------------------- */
/* Session and provider                                                       */
/* -------------------------------------------------------------------------- */

/** Options for opening a session. Mirrors `AdvisorSessionOptions` by intent. */
export interface RuntimeSessionOptions {
  /**
   * Absolute path to the workspace.
   *
   * The only context a provider is given. A provider must not read the workspace
   * itself beyond what the runtime needs to operate — workspace reads belong to
   * `electron/repo/` and `electron/workspace/` (ADR-013 §E).
   */
  workspacePath: string;
  /** Resume a prior session. Omit to start fresh. Provider-scoped and opaque. */
  resumeSessionId?: string;
}

/**
 * One conversation with one runtime.
 *
 * Every method is total: failures arrive as an `error` event rather than as a
 * thrown exception, because this boundary is crossed by IPC and a throw becomes
 * an unhandled rejection in the host (`advisor.ts` invariant 5).
 */
export interface RuntimeSession {
  readonly sessionId: string;
  /** Send one turn. `text` is transmitted verbatim — composition happened above. */
  send(text: string): Promise<{ turnId: string }>;
  /** Answer a blocking permission request. No-op for unknown ids. */
  respondToPermission(requestId: string, decision: PermissionDecision): Promise<void>;
  /** Interrupt the current turn. Safe when idle. Resolves outstanding requests. */
  cancel(): Promise<void>;
  /** Release the runtime. */
  close(): Promise<void>;
  /** Requests currently blocking the runtime, for diagnostics. */
  pendingPermissionCount(): number;
}

/**
 * A runtime provider.
 *
 * Constructed once per process and long-lived. Detection and health are cheap
 * and repeatable; session construction is the only expensive operation.
 */
export interface RuntimeProvider {
  readonly manifest: ProviderManifest;
  /** Is this runtime present on this machine? Never authenticates. */
  detect(): Promise<RuntimeHealth>;
  /** Sample health. May be called repeatedly; must not mutate session state. */
  checkHealth(): Promise<RuntimeHealth>;
  /** Authentication strategies this provider offers, most preferred first. */
  strategies(): readonly AuthenticationStrategy[];
  /** Current auth status without attempting a login. */
  authStatus(): Promise<AuthStatus>;
  /**
   * Open a session.
   *
   * `emit` is the only channel out. A provider that returns data instead of
   * emitting events would force its caller to interpret provider-shaped
   * results, which is the coupling this contract exists to prevent.
   */
  openSession(
    options: RuntimeSessionOptions,
    emit: (event: AdvisorEvent) => void
  ): Promise<RuntimeSession>;
}

/** Factory signature the registry stores. Providers are constructed lazily. */
export type ProviderFactory = () => RuntimeProvider;

/* -------------------------------------------------------------------------- */
/* Renderer-facing snapshot                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One provider as the renderer sees it.
 *
 * Deliberately a flat, serialisable projection rather than a live object: it
 * crosses IPC, and a structure carrying methods would either fail to serialise
 * or tempt someone into shipping a proxy that lets the renderer call into a
 * provider directly.
 */
export interface ProviderSnapshot {
  manifest: ProviderManifest;
  health: RuntimeHealth;
  auth: AuthStatus;
  /** True when this is the Active Brain. Exactly one may be true. */
  active: boolean;
  /** Derived from capabilities, not declared. See `isCouncilCapable`. */
  councilCapable: boolean;
  /** Why the Council cannot run here, or null when it can. */
  councilBlockedReason: string | null;
}

/** The whole runtime layer as one serialisable value. */
export interface RuntimeSnapshot {
  providers: ProviderSnapshot[];
  /** Active Brain id, or null when none is selected. */
  activeProviderId: string | null;
  /** Sampled at assembly. Lets the renderer show how fresh this is. */
  sampledAt: number;
}
