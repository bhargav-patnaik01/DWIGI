/**
 * Capability system — what a runtime can do, and what that permits the app to offer.
 *
 * ---------------------------------------------------------------------------
 * THE DIRECTION OF THE DECLARATION, WHICH IS THE WHOLE DESIGN
 * ---------------------------------------------------------------------------
 * A provider declares what it **supports**. A feature declares what it
 * **requires**. The gate is the intersection. Those are two different objects
 * facing two different ways, and collapsing them into one "required/optional/
 * unsupported" list per provider — the obvious first design — produces a
 * declaration that cannot be evaluated: "Claude requires filesystem" is not a
 * fact about Claude, it is a fact about the Executive Council.
 *
 * So: `ProviderCapabilities` is the provider's answer. `FeatureRequirement` is
 * the feature's question. `gate()` is the only place the two meet.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE ARE THREE STATES AND NOT TWO
 * ---------------------------------------------------------------------------
 * `unknown` is not defensive padding. The v1.2 brief itself writes "? Resume"
 * for Gemini CLI, which is the correct thing to write about a capability nobody
 * has measured — and it is a genuinely different fact from "absent".
 *
 *   supported   → offer the feature
 *   unsupported → HIDE the feature. A settled absence should not leave a dead
 *                 control on screen implying something is configurable.
 *   unknown     → SHOW the feature, DISABLED, with the reason. Hiding would
 *                 assert a fact nobody established; enabling would be the
 *                 pretending ADR-013 §B forbids.
 *
 * Collapsing `unknown` into `unsupported` is the tempting simplification and it
 * is wrong in a way that compounds: the question stops being visible, so nobody
 * ever resolves it, and a capability that was merely unmeasured becomes
 * permanently absent by administrative accident.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE MUST NEVER GROW INTO
 * ---------------------------------------------------------------------------
 * No provider names. No conditionals on a provider id. Nothing about *how* any
 * capability is implemented. If a change here would require knowing what Claude
 * Code is, it belongs in that provider's directory.
 *
 * Pure data and pure functions, so both processes and the test suite share one
 * implementation and cannot drift.
 */

/**
 * The closed capability vocabulary.
 *
 * Closed on purpose. A provider cannot invent a capability, because a capability
 * nothing gates on is decoration, and a capability the interface has never heard
 * of cannot gate anything — it would be declared, ignored, and mistaken for
 * enforcement.
 *
 * Grouped by what the capability is *about*, which is also how the AI Control
 * Center presents them.
 */
export const CAPABILITIES = {
  /* ------------------------------------------------------------- transport */
  /** Text arrives incrementally rather than in one block at the end. */
  streaming: 'streaming',
  /** A prior conversation can be continued by handle after the process exits. */
  resume: 'resume',
  /** An in-flight turn can be interrupted. */
  cancellation: 'cancellation',
  /** Partial/incremental message frames are exposed, not just completed ones. */
  partialMessages: 'partialMessages',

  /* --------------------------------------------------------------- agency */
  /** The runtime can read and write files in the working directory. */
  filesystem: 'filesystem',
  /** The runtime can call tools and act on their results within a turn. */
  toolCalling: 'toolCalling',
  /** The runtime pauses for consent before acting, over a channel we can answer. */
  permissionPrompts: 'permissionPrompts',
  /**
   * Given a working directory, the runtime discovers the operating instructions
   * in it and obeys them.
   *
   * This is the capability the Executive Council is gated on. It is satisfied by
   * any provider that reads a convention file from the workspace and can follow
   * a pointer to the kernel — see `ADR-013` §D, which is what keeps this from
   * being a Claude-shaped flag.
   */
  engineDiscovery: 'engineDiscovery',
  /**
   * The runtime can invoke the fixed, read-only tool set (`runtime/tools/`:
   * read_file, list_directory, search_workspace, git_status, git_diff, git_log)
   * through the provider's own structured tool/function-calling mechanism.
   *
   * This is deliberately narrower than `toolCalling`: a provider can be
   * `toolCalling: 'supported'` for its own native tool set while this stays
   * `'unknown'` or `'unsupported'`, because nothing here asserts the provider
   * can call *these specific* tools. It exists so a hosted connection can be
   * offered exactly the six read-only capabilities without ever touching the
   * Council gate — `isCouncilCapable()` does not reference this key, and never
   * should, since read-only hosted tool access is not engine discovery.
   *
   * Never implies write, delete, package-install, or network-side-effect
   * capability — those remain out of scope until a future runtime revision.
   */
  readOnlyTools: 'readOnlyTools',

  /* ------------------------------------------------------------ cognition */
  /** Extended/deliberate reasoning is available and reportable. */
  thinking: 'thinking',
  /** Image input is accepted. */
  vision: 'vision',

  /* ----------------------------------------------------------- deployment */
  /** Works with no network connection at all. */
  offline: 'offline',
  /** Inference runs on this machine rather than in someone else's datacentre. */
  localExecution: 'localExecution',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

/** Every capability, in presentation order. The Control Center renders this. */
export const CAPABILITY_ORDER: readonly Capability[] = [
  'streaming',
  'resume',
  'cancellation',
  'partialMessages',
  'filesystem',
  'toolCalling',
  'permissionPrompts',
  'engineDiscovery',
  'readOnlyTools',
  'thinking',
  'vision',
  'offline',
  'localExecution',
];

/** Human label for a capability. Display only; never parsed. */
export const CAPABILITY_LABELS: Readonly<Record<Capability, string>> = {
  streaming: 'Streaming',
  resume: 'Resume',
  cancellation: 'Cancellation',
  partialMessages: 'Partial messages',
  filesystem: 'Filesystem',
  toolCalling: 'Tool calling',
  permissionPrompts: 'Permission prompts',
  engineDiscovery: 'Instruction discovery',
  readOnlyTools: 'Read-only tools',
  thinking: 'Extended thinking',
  vision: 'Vision',
  offline: 'Offline',
  localExecution: 'Local execution',
};

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && value in CAPABILITIES;
}

/* -------------------------------------------------------------------------- */
/* Provider declaration                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One provider's answer for one capability.
 *
 * See the header for why `unknown` exists and why it must not be folded into
 * `unsupported`.
 */
export type CapabilityState = 'supported' | 'unsupported' | 'unknown';

export function isCapabilityState(value: unknown): value is CapabilityState {
  return value === 'supported' || value === 'unsupported' || value === 'unknown';
}

/**
 * Quantities a provider reports. **Not capabilities.**
 *
 * `contextWindow` is a number. Expressing it as a boolean capability would be
 * exactly the false precision ADR-009 removed from routing — a flag that implies
 * a measurement it does not carry. Absent means unreported, which is honest and
 * is not zero.
 */
export interface RuntimeProperties {
  /** Tokens, as the provider reports them. Absent when unreported. */
  contextWindow?: number;
  /** Model identifier currently selected, verbatim. Absent when not applicable. */
  model?: string;
}

/**
 * A provider's complete capability declaration.
 *
 * `states` is total over the vocabulary: every capability has an answer, because
 * a missing key and an `unknown` value would be the same thing expressed two
 * ways, and two representations of one fact is how they come to disagree.
 * `declare()` is the only sanctioned way to build one.
 */
export interface ProviderCapabilities {
  states: Readonly<Record<Capability, CapabilityState>>;
  properties: RuntimeProperties;
  /**
   * Why a capability is unsupported or unknown, keyed by capability.
   *
   * Optional per capability, and the interface degrades to a generic sentence
   * without one — but a manifest that declares `unsupported` and supplies no
   * reason has failed Part I's actual requirement, which is not "hide the
   * feature" but "explain why". `missingReasons` is where that explanation
   * lives, in the provider's own words, and `explain()` reads it.
   */
  reasons?: Partial<Record<Capability, string>>;
}

/**
 * Build a total declaration from a partial one.
 *
 * Anything unstated becomes `unknown` — never `unsupported`. That default is the
 * conservative direction in the only sense that matters here: an unstated
 * capability is genuinely unmeasured, and defaulting it to a verified absence
 * would put words in a provider author's mouth and permanently hide a feature
 * that may work perfectly.
 */
export function declare(
  states: Partial<Record<Capability, CapabilityState>>,
  properties: RuntimeProperties = {},
  reasons: Partial<Record<Capability, string>> = {}
): ProviderCapabilities {
  const complete = {} as Record<Capability, CapabilityState>;
  for (const capability of CAPABILITY_ORDER) {
    complete[capability] = states[capability] ?? 'unknown';
  }
  return { states: complete, properties, reasons };
}

/** One capability's state for one provider. Total, so this never returns undefined. */
export function stateOf(
  capabilities: ProviderCapabilities,
  capability: Capability
): CapabilityState {
  return capabilities.states[capability] ?? 'unknown';
}

export function supports(
  capabilities: ProviderCapabilities,
  capability: Capability
): boolean {
  return stateOf(capabilities, capability) === 'supported';
}

/* -------------------------------------------------------------------------- */
/* Feature gating                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What the interface should do about one feature, given one provider.
 *
 * `hidden` and `disabled` are distinct outcomes and the distinction is the
 * point: hidden means "this will never work here", disabled means "nobody has
 * established whether this works here". A single boolean would erase the second
 * case, which is the case that needs resolving.
 */
export type GateOutcome =
  | { available: true }
  | { available: false; presentation: 'hidden'; missing: Capability[]; reason: string }
  | { available: false; presentation: 'disabled'; missing: Capability[]; reason: string };

/** A feature's own statement of what it needs. Declared beside the feature. */
export interface FeatureRequirement {
  /** Stable id, for tests and diagnostics. */
  id: string;
  /** Shown to the founder when the feature is unavailable. */
  label: string;
  /** Every capability that must be `supported`. */
  requires: readonly Capability[];
}

/**
 * Decide whether a feature may be offered.
 *
 * ---------------------------------------------------------------------------
 * UNSUPPORTED WINS OVER UNKNOWN
 * ---------------------------------------------------------------------------
 * A feature needing two capabilities, one verified absent and one unmeasured, is
 * hidden. The verified fact is the stronger one: resolving the open question
 * could not make the feature work, so leaving a disabled control on screen would
 * imply a path forward that does not exist.
 */
export function gate(
  capabilities: ProviderCapabilities,
  feature: FeatureRequirement
): GateOutcome {
  const unsupported: Capability[] = [];
  const unknown: Capability[] = [];

  for (const capability of feature.requires) {
    const state = stateOf(capabilities, capability);
    if (state === 'unsupported') unsupported.push(capability);
    else if (state === 'unknown') unknown.push(capability);
  }

  if (unsupported.length > 0) {
    return {
      available: false,
      presentation: 'hidden',
      missing: unsupported,
      reason: explain(capabilities, unsupported, 'unsupported'),
    };
  }

  if (unknown.length > 0) {
    return {
      available: false,
      presentation: 'disabled',
      missing: unknown,
      reason: explain(capabilities, unknown, 'unknown'),
    };
  }

  return { available: true };
}

/**
 * Assemble the sentence shown when a feature is unavailable.
 *
 * Prefers the provider's own recorded reason for each capability, because a
 * provider author knows why their runtime lacks something and a generic
 * fallback does not. The fallback exists so a manifest that omitted a reason
 * still produces an explanation rather than silence — but it reads as generic
 * on purpose, which is the nudge to supply a real one.
 */
export function explain(
  capabilities: ProviderCapabilities,
  missing: readonly Capability[],
  kind: 'unsupported' | 'unknown'
): string {
  const parts = missing.map((capability) => {
    const given = capabilities.reasons?.[capability];
    if (given && given.trim()) return given.trim();
    const label = CAPABILITY_LABELS[capability];
    return kind === 'unsupported'
      ? `${label} is not available on this runtime.`
      : `It is not established whether this runtime supports ${label.toLowerCase()}.`;
  });
  return [...new Set(parts)].join(' ');
}

/* -------------------------------------------------------------------------- */
/* The Council requirement                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What a runtime must support to host the Executive Intelligence System.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A FEATURE REQUIREMENT AND NOT A PROVIDER FLAG
 * ---------------------------------------------------------------------------
 * The Council is the application's central feature, so it declares its needs the
 * same way every other feature does. A boolean `councilCapable` on each manifest
 * would let a provider author assert the conclusion directly — and the whole
 * value of the capability system is that the conclusion is *derived* from facts
 * that can be checked one at a time.
 *
 * Streaming is deliberately absent. The Council reasons identically without it;
 * requiring it would confuse polish with function and would exclude a runtime
 * that works.
 *
 * `permissionPrompts` is also absent, and that one is a real judgment call: a
 * runtime that cannot ask for consent will either write without asking or refuse
 * to write. Both are usable — the first is a security posture the founder should
 * be told about, the second degrades the journal — so it is surfaced as a
 * warning at connection rather than as a hard exclusion.
 */
export const COUNCIL_FEATURE: FeatureRequirement = {
  id: 'executive-council',
  label: 'Executive Council',
  requires: ['engineDiscovery', 'filesystem', 'toolCalling'],
};

/** Can this runtime host the Executive Council? */
export function isCouncilCapable(capabilities: ProviderCapabilities): boolean {
  return gate(capabilities, COUNCIL_FEATURE).available;
}

/**
 * Why this runtime cannot host the Council, in the founder's terms.
 *
 * Names the missing capability and what the Council needed it for. "Ollama
 * cannot be your Active Brain" is a conclusion, not an explanation, and a
 * founder given only the conclusion has no way to tell a fixable configuration
 * problem from a permanent property of the runtime they chose.
 */
export function councilBlockedReason(capabilities: ProviderCapabilities): string | null {
  const outcome = gate(capabilities, COUNCIL_FEATURE);
  if (outcome.available) return null;

  const consequences: Partial<Record<Capability, string>> = {
    engineDiscovery:
      'it cannot read the operating instructions in your workspace, so it would answer as a general assistant rather than as your board',
    filesystem:
      'it cannot read your Business Memory or write Decision Records',
    toolCalling:
      'it cannot act on what it reads, which the deliberation pipeline depends on',
  };

  const missing = outcome.missing
    .map((capability) => consequences[capability])
    .filter((text): text is string => Boolean(text));

  if (missing.length === 0) return outcome.reason;
  return `This runtime cannot host the Executive Council because ${missing.join(', and ')}.`;
}

/* -------------------------------------------------------------------------- */
/* Feature catalogue                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every capability-gated feature in the application.
 *
 * Centralised so that "what does the interface hide, and why" is answerable by
 * reading one list rather than by grepping for capability checks. A feature that
 * gates itself inline is a feature nobody can audit.
 */
export const FEATURES: Readonly<Record<string, FeatureRequirement>> = {
  council: COUNCIL_FEATURE,
  conversationResume: {
    id: 'conversation-resume',
    label: 'Continue a past conversation',
    requires: ['resume'],
  },
  streamingOutput: {
    id: 'streaming-output',
    label: 'Live streaming output',
    requires: ['streaming'],
  },
  stopTurn: {
    id: 'stop-turn',
    label: 'Stop a turn in progress',
    requires: ['cancellation'],
  },
  permissionConsent: {
    id: 'permission-consent',
    label: 'Ask before writing to the workspace',
    requires: ['permissionPrompts'],
  },
  imageInput: {
    id: 'image-input',
    label: 'Attach an image',
    requires: ['vision'],
  },
  offlineUse: {
    id: 'offline-use',
    label: 'Work with no internet connection',
    requires: ['offline'],
  },
};
