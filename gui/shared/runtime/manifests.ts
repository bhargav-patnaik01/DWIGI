/**
 * Provider manifests — every runtime's declared surface, as data.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MANIFESTS LIVE IN shared/ AND NOT BESIDE THEIR IMPLEMENTATIONS
 * ---------------------------------------------------------------------------
 * The AI Control Center has to render a provider it is not connected to — name,
 * capabilities, what authentication it wants, why the Council cannot run on it.
 * That means the renderer needs the manifest, and `tsconfig.json` excludes
 * `electron/`, so a manifest sitting next to its provider would be unreachable
 * from the interface.
 *
 * The alternative was to pipe manifests through IPC on startup. Rejected: the
 * renderer would then be unable to describe a provider before the host answered,
 * and the first-run screen — the one screen that must work before anything is
 * connected — is exactly where that gap would show.
 *
 * The cost is that a provider is two directories rather than one: data here,
 * behaviour in `electron/runtime/providers/<id>/`. `registry.ts` asserts the two
 * halves agree, the same way `RepositoryReader` reports a manifest entry with no
 * persona file rather than tolerating half a lens (ADR-012).
 *
 * ---------------------------------------------------------------------------
 * WHAT A CAPABILITY DECLARATION MEANS, PRECISELY
 * ---------------------------------------------------------------------------
 * It describes **the runtime as reached through this provider implementation** —
 * not the vendor's maximum theoretical surface.
 *
 * This distinction decides several declarations below and it is the only
 * definition that makes gating correct. OpenAI's API supports function calling;
 * this build passes it no tool definitions, so `toolCalling` is `unsupported` for
 * the OpenAI provider. Declaring the vendor's capability instead would light up a
 * feature that then does nothing, which is worse than hiding it — a dead control
 * is indistinguishable from a bug, and Part I's rule is about what the founder
 * can actually rely on.
 *
 * ---------------------------------------------------------------------------
 * HONEST STATE OF THESE DECLARATIONS AT v1.2
 * ---------------------------------------------------------------------------
 * Exactly one manifest is `verified-live`: Claude Code, which this project has
 * exercised end to end — streaming against a captured fixture, resume against
 * CLI 2.1.x, and consent measured at a 4,034 ms block (`permission-policy.ts`).
 *
 * The other four are `vendor-documented`. Their capabilities are taken from
 * published documentation and have **not** been exercised against a live runtime
 * by this project, because no such runtime was available on the build machine.
 * That is recorded in the manifest rather than in a comment nobody reads, and the
 * Control Center shows it, because this repository's own hardest-won lesson is
 * that an unverified claim written down as a finding survives for milestones
 * (`permission-policy.ts`, "THE CORRECTION THIS FILE EXISTS TO RECORD").
 */

import { declare } from './capabilities';
import type { ProviderManifest } from './contract';

/* -------------------------------------------------------------------------- */
/* Claude Code                                                                */
/* -------------------------------------------------------------------------- */

const CLAUDE: ProviderManifest = {
  id: 'claude-code',
  displayName: 'Claude Code',
  summary: "Anthropic's coding and agentic CLI. Runs your board directly in the workspace.",
  ordinal: 1,
  verification: 'verified-live',
  capabilities: declare(
    {
      streaming: 'supported',
      resume: 'supported',
      cancellation: 'supported',
      partialMessages: 'supported',
      filesystem: 'supported',
      toolCalling: 'supported',
      permissionPrompts: 'supported',
      engineDiscovery: 'supported',
      // This runtime is `native`: it reads and writes the workspace directly under
      // its own permission model, not through the fixed read-only tool set built
      // for hosted engines. Declaring `readOnlyTools` here would suggest the two
      // tool paths compose, and they do not — see `runtime/tools/README` for why
      // native execution and the hosted Tool Adapter are kept structurally separate.
      readOnlyTools: 'unsupported',
      thinking: 'supported',
      // The runtime reads images through its own file tools, but this build has no
      // way to hand it one from the composer. Unknown rather than supported: the
      // capability as *reached through this transport* has never been exercised.
      vision: 'unknown',
      offline: 'unsupported',
      localExecution: 'unsupported',
    },
    {},
    {
      readOnlyTools:
        'Claude Code has its own native filesystem and tool access under ADR-013 §C; the hosted read-only tool set is not offered to native runtimes.',
      vision: 'Attaching an image through D.W.I.G.I has not been implemented or tested.',
      offline: 'Claude Code reaches Anthropic over the network for every turn.',
      localExecution: 'Inference runs on Anthropic infrastructure, not on this machine.',
    }
  ),
  // Claude Code owns its own login entirely. D.W.I.G.I never sees the credential —
  // it detects the resulting state and health-checks independently (ADR-013 §C).
  authMethods: ['providerNative'],
  discovery: [
    { command: 'claude', versionArg: '--version' },
    {
      paths: [
        '~/.claude/local/claude',
        '~/AppData/Roaming/npm/claude.cmd',
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude',
      ],
    },
  ],
  instructionFile: 'CLAUDE.md',
  documentationUrl: 'https://docs.claude.com/en/docs/claude-code/overview',
  executionMode: 'native',
};

/* -------------------------------------------------------------------------- */
/* Gemini CLI                                                                 */
/* -------------------------------------------------------------------------- */

const GEMINI: ProviderManifest = {
  id: 'gemini-cli',
  displayName: 'Gemini CLI',
  summary: "Google's agentic CLI. Reads workspace instructions and can run your board.",
  ordinal: 2,
  verification: 'vendor-documented',
  capabilities: declare(
    {
      streaming: 'supported',
      // The v1.2 brief writes "? Resume" for this runtime, which is the correct
      // thing to write. Session-handle resume is not documented in a form this
      // transport could use, and guessing either way would be worse than the
      // disabled-with-explanation the gate produces from `unknown`.
      resume: 'unknown',
      cancellation: 'supported',
      partialMessages: 'unknown',
      filesystem: 'supported',
      toolCalling: 'supported',
      // Gemini CLI confirms tool use interactively. Whether that confirmation is
      // reachable over a non-interactive stream — which is how this transport
      // drives it — is unestablished, so consent is gated off rather than assumed.
      permissionPrompts: 'unknown',
      engineDiscovery: 'supported',
      readOnlyTools: 'unsupported',
      thinking: 'supported',
      vision: 'unknown',
      offline: 'unsupported',
      localExecution: 'unsupported',
    },
    {},
    {
      readOnlyTools:
        'Gemini CLI has its own native filesystem and tool access; the hosted read-only tool set is not offered to native runtimes.',
      resume:
        'It is not established whether Gemini CLI can continue a prior conversation by handle.',
      partialMessages:
        'Incremental frame reporting has not been verified through this transport.',
      permissionPrompts:
        'Gemini CLI asks for tool confirmation interactively; whether that reaches a non-interactive host is unverified. Until it is, D.W.I.G.I cannot promise to ask before the runtime writes.',
      vision: 'Attaching an image through D.W.I.G.I has not been implemented or tested.',
      offline: 'Gemini CLI reaches Google over the network for every turn.',
      localExecution: 'Inference runs on Google infrastructure, not on this machine.',
    }
  ),
  authMethods: ['providerNative'],
  discovery: [
    { command: 'gemini', versionArg: '--version' },
    {
      paths: [
        '~/AppData/Roaming/npm/gemini.cmd',
        '/usr/local/bin/gemini',
        '/opt/homebrew/bin/gemini',
      ],
    },
  ],
  // The pointer file ADR-013 §D writes at workspace creation. It delegates to the
  // kernel, so the engine stays single-sourced and this runtime discovers it
  // natively — which is what makes `engineDiscovery` not a Claude-shaped flag.
  instructionFile: 'GEMINI.md',
  documentationUrl: 'https://github.com/google-gemini/gemini-cli',
  executionMode: 'native',
};

/* -------------------------------------------------------------------------- */
/* OpenAI                                                                     */
/* -------------------------------------------------------------------------- */

const OPENAI: ProviderManifest = {
  id: 'openai',
  displayName: 'OpenAI',
  summary: 'GPT models over the OpenAI API. Conversation only — cannot host your board.',
  ordinal: 3,
  verification: 'vendor-documented',
  capabilities: declare(
    {
      streaming: 'supported',
      // Stateless completions. This build does not replay stored transcripts to
      // simulate continuity: replay has different cost and truncation behaviour
      // from real resume, and presenting it as resume would be the emulation
      // Part I forbids.
      resume: 'unsupported',
      cancellation: 'supported',
      partialMessages: 'supported',
      filesystem: 'unsupported',
      toolCalling: 'unsupported',
      // `readOnlyTools` is separate from `toolCalling` above: this build now does
      // pass the fixed six-tool read-only set to the OpenAI API using its
      // documented `tools`/`tool_calls` function-calling mechanism, scoped to the
      // workspace root. `toolCalling` stays `unsupported` because that key means
      // the model's *own, arbitrary* tool definitions are wired through this
      // transport, which they are not — only the fixed read-only set is.
      readOnlyTools: 'supported',
      permissionPrompts: 'unsupported',
      engineDiscovery: 'unsupported',
      thinking: 'unknown',
      vision: 'unsupported',
      offline: 'unsupported',
      localExecution: 'unsupported',
    },
    {},
    {
      resume:
        'The OpenAI API holds no conversation state, so a past conversation cannot be continued by handle.',
      filesystem: 'The API has no access to files on this machine.',
      toolCalling:
        'This build passes only the fixed read-only tool set (see `readOnlyTools`), never arbitrary model-defined tools.',
      permissionPrompts:
        'Read-only tool calls do not prompt for consent because none of them can write, delete, install, or reach the network — see `runtime/tools/*.json` `requires_confirmation: false`. Nothing beyond that read-only set can act.',
      engineDiscovery:
        'The API has no working directory, so it cannot find the operating instructions in your workspace.',
      thinking: 'Reasoning-model summaries have not been verified through this transport.',
      vision: 'Image input is not wired through this build.',
      offline: 'Every turn is a network request to OpenAI.',
      localExecution: 'Inference runs on OpenAI infrastructure, not on this machine.',
    }
  ),
  // Browser login is deliberately absent. The OpenAI platform issues API keys for
  // programmatic use and offers no OAuth flow a desktop application can complete
  // for this purpose; declaring `browser` would produce a button that cannot work
  // (ADR-013 §C, "never invent an unsupported authentication method").
  authMethods: ['osCredentialStore', 'apiKey'],
  discovery: [
    // Nothing to detect on disk — reachability is the probe. Base URL only; no
    // request is made until the founder has explicitly connected.
    { httpProbe: { url: 'https://api.openai.com/v1/models', expectStatus: 200 } },
  ],
  instructionFile: null,
  documentationUrl: 'https://platform.openai.com/docs',
  executionMode: 'hosted',
  billsPerToken: true,
};

/* -------------------------------------------------------------------------- */
/* Ollama                                                                     */
/* -------------------------------------------------------------------------- */

const OLLAMA: ProviderManifest = {
  id: 'ollama',
  displayName: 'Ollama',
  summary: 'Local models on your own machine. Private and offline — conversation only.',
  ordinal: 4,
  verification: 'vendor-documented',
  capabilities: declare(
    {
      streaming: 'supported',
      resume: 'unsupported',
      cancellation: 'supported',
      partialMessages: 'supported',
      filesystem: 'unsupported',
      toolCalling: 'unsupported',
      // Ollama's chat endpoint accepts an OpenAI-compatible `tools` field, but
      // whether a given loaded model actually honours it — rather than ignoring
      // it or hallucinating a call — is a property of the model, not the
      // transport, and cannot be established generically. `unknown` here is the
      // intended use of that state: genuinely unmeasured, model-dependent, and
      // not a verified absence.
      readOnlyTools: 'unknown',
      permissionPrompts: 'unsupported',
      engineDiscovery: 'unsupported',
      thinking: 'unknown',
      vision: 'unsupported',
      offline: 'supported',
      localExecution: 'supported',
    },
    {},
    {
      resume: "Ollama's chat endpoint holds no conversation state between requests.",
      filesystem: 'The model runs as a local service with no access to your workspace files.',
      toolCalling: 'This build passes no arbitrary tool definitions, so the model has nothing it can call beyond the fixed read-only set — see `readOnlyTools`.',
      readOnlyTools:
        'Whether the loaded model honours structured tool-calling depends on which model is loaded and has not been verified generically. The Tool Adapter offers the read-only set only when the connection reports it can use them; it degrades silently otherwise.',
      permissionPrompts: 'Nothing can be permitted beyond the fixed read-only set, because nothing else can act.',
      engineDiscovery:
        'The service has no working directory, so it cannot find the operating instructions in your workspace.',
      thinking: 'Whether a given local model exposes its reasoning has not been verified.',
      vision: 'Image input is not wired through this build.',
    }
  ),
  authMethods: ['none'],
  discovery: [
    { httpProbe: { url: 'http://127.0.0.1:11434/api/version', expectStatus: 200 } },
    { command: 'ollama', versionArg: '--version' },
  ],
  instructionFile: null,
  documentationUrl: 'https://ollama.com',
  executionMode: 'hosted',
};

/* -------------------------------------------------------------------------- */
/* LM Studio                                                                  */
/* -------------------------------------------------------------------------- */

const LMSTUDIO: ProviderManifest = {
  id: 'lmstudio',
  displayName: 'LM Studio',
  summary: 'Local models through LM Studio’s server. Private and offline — conversation only.',
  ordinal: 5,
  verification: 'vendor-documented',
  capabilities: declare(
    {
      streaming: 'supported',
      resume: 'unsupported',
      cancellation: 'supported',
      partialMessages: 'supported',
      filesystem: 'unsupported',
      toolCalling: 'unsupported',
      // Same reasoning as Ollama: LM Studio's server exposes an OpenAI-compatible
      // `tools` field, but honouring it is a property of whichever model is
      // loaded, not of the server — genuinely unmeasured, hence `unknown`.
      readOnlyTools: 'unknown',
      permissionPrompts: 'unsupported',
      engineDiscovery: 'unsupported',
      thinking: 'unknown',
      vision: 'unsupported',
      offline: 'supported',
      localExecution: 'supported',
    },
    {},
    {
      resume: "LM Studio's OpenAI-compatible endpoint holds no conversation state.",
      filesystem: 'The server has no access to your workspace files.',
      toolCalling: 'This build passes no arbitrary tool definitions, so the model has nothing it can call beyond the fixed read-only set — see `readOnlyTools`.',
      readOnlyTools:
        'Whether the loaded model honours structured tool-calling depends on which model is loaded and has not been verified generically. The Tool Adapter offers the read-only set only when the connection reports it can use them; it degrades silently otherwise.',
      permissionPrompts: 'Nothing can be permitted beyond the fixed read-only set, because nothing else can act.',
      engineDiscovery:
        'The server has no working directory, so it cannot find the operating instructions in your workspace.',
      thinking: 'Whether a given local model exposes its reasoning has not been verified.',
      vision: 'Image input is not wired through this build.',
    }
  ),
  authMethods: ['none'],
  discovery: [
    { httpProbe: { url: 'http://127.0.0.1:1234/v1/models', expectStatus: 200 } },
  ],
  instructionFile: null,
  documentationUrl: 'https://lmstudio.ai/docs',
  executionMode: 'hosted',
};

/* -------------------------------------------------------------------------- */
/* OpenRouter                                                                 */
/* -------------------------------------------------------------------------- */

const OPENROUTER: ProviderManifest = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  summary: 'One API key, many hosted models. Conversation only — cannot host your board.',
  ordinal: 6,
  verification: 'vendor-documented',
  capabilities: declare(
    {
      streaming: 'supported',
      resume: 'unsupported',
      cancellation: 'supported',
      partialMessages: 'supported',
      filesystem: 'unsupported',
      toolCalling: 'unsupported',
      // OpenRouter proxies the OpenAI-compatible `tools` field through to whatever
      // upstream model is selected. Unlike OpenAI itself, the upstream model is a
      // founder choice made after connecting, and not every model OpenRouter
      // serves honours function-calling — so this is `unknown`, the same as the
      // two local providers, for the same reason: model-dependent, not
      // transport-dependent.
      readOnlyTools: 'unknown',
      permissionPrompts: 'unsupported',
      engineDiscovery: 'unsupported',
      thinking: 'unknown',
      vision: 'unknown',
      offline: 'unsupported',
      localExecution: 'unsupported',
    },
    {},
    {
      resume: 'OpenRouter holds no conversation state, so a past conversation cannot be continued by handle.',
      filesystem: 'The API has no access to files on this machine.',
      toolCalling: 'This build passes only the fixed read-only tool set (see `readOnlyTools`), never arbitrary model-defined tools.',
      readOnlyTools:
        'Whether the selected upstream model honours structured tool-calling depends on which model the founder has chosen and has not been verified generically.',
      permissionPrompts: 'Nothing can be permitted beyond the fixed read-only set, because nothing else can act.',
      engineDiscovery: 'The API has no working directory, so it cannot find the operating instructions in your workspace.',
      thinking: 'Whether the selected upstream model exposes its reasoning has not been verified.',
      vision: 'Image input is not wired through this build.',
      offline: 'Every turn is a network request to OpenRouter.',
      localExecution: 'Inference runs on whichever upstream host OpenRouter routes to, not on this machine.',
    }
  ),
  authMethods: ['osCredentialStore', 'apiKey'],
  discovery: [
    { httpProbe: { url: 'https://openrouter.ai/api/v1/models', expectStatus: 200 } },
  ],
  instructionFile: null,
  documentationUrl: 'https://openrouter.ai/docs',
  executionMode: 'hosted',
  billsPerToken: true,
};

/* -------------------------------------------------------------------------- */
/* Azure OpenAI                                                               */
/* -------------------------------------------------------------------------- */

const AZURE_OPENAI: ProviderManifest = {
  id: 'azure-openai',
  displayName: 'Azure OpenAI',
  summary: 'GPT models through your Azure deployment. Conversation only — cannot host your board.',
  ordinal: 7,
  verification: 'vendor-documented',
  capabilities: declare(
    {
      streaming: 'supported',
      resume: 'unsupported',
      cancellation: 'supported',
      partialMessages: 'supported',
      filesystem: 'unsupported',
      toolCalling: 'unsupported',
      // Azure OpenAI serves the same OpenAI models behind a customer's own
      // deployment, using the same function-calling contract. Declared
      // `supported` for the same reason as OpenAI itself: the deployed model
      // family is fixed and documented, not a founder-loaded local model.
      readOnlyTools: 'supported',
      permissionPrompts: 'unsupported',
      engineDiscovery: 'unsupported',
      thinking: 'unknown',
      vision: 'unsupported',
      offline: 'unsupported',
      localExecution: 'unsupported',
    },
    {},
    {
      resume: 'The Azure OpenAI endpoint holds no conversation state, so a past conversation cannot be continued by handle.',
      filesystem: 'The API has no access to files on this machine.',
      toolCalling: 'This build passes only the fixed read-only tool set (see `readOnlyTools`), never arbitrary model-defined tools.',
      permissionPrompts: 'Read-only tool calls do not prompt for consent because none of them can write, delete, install, or reach the network.',
      engineDiscovery: 'The API has no working directory, so it cannot find the operating instructions in your workspace.',
      thinking: 'Reasoning-model summaries have not been verified through this transport.',
      vision: 'Image input is not wired through this build.',
      offline: 'Every turn is a network request to the founder’s Azure deployment.',
      localExecution: 'Inference runs on Azure infrastructure, not on this machine.',
    }
  ),
  // Azure OpenAI issues a resource key per deployment; there is no OAuth flow a
  // desktop application can complete for this purpose, same reasoning as OpenAI.
  authMethods: ['osCredentialStore', 'apiKey'],
  discovery: [],
  instructionFile: null,
  documentationUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/overview',
  executionMode: 'hosted',
  billsPerToken: true,
};

/* -------------------------------------------------------------------------- */
/* The set                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every manifest this build ships, in presentation order.
 *
 * This list is the closest thing to a roster of providers, and unlike the
 * executive roster it is deliberately *not* discovered from a directory: a
 * provider needs compiled code, so there is no meaningful sense in which one
 * could be dropped in at runtime. Adding one is a manifest here plus an
 * implementation and a registry line — three edits, no architectural change,
 * which is the bar ADR-013 sets.
 */
export const PROVIDER_MANIFESTS: readonly ProviderManifest[] = [
  CLAUDE,
  GEMINI,
  OPENAI,
  OLLAMA,
  LMSTUDIO,
  OPENROUTER,
  AZURE_OPENAI,
].sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));

export function manifestFor(id: string): ProviderManifest | null {
  return PROVIDER_MANIFESTS.find((manifest) => manifest.id === id) ?? null;
}

/**
 * Every provider-native instruction filename, for workspace creation.
 *
 * Derived from the manifests rather than listed separately, so adding a
 * CLI provider automatically causes its pointer file to be written and cannot be
 * forgotten — the failure otherwise is a provider that declares
 * `engineDiscovery: supported` and then finds nothing to discover.
 *
 * The kernel's own filename is excluded: `CLAUDE.md` *is* the kernel and is
 * copied as itself, not generated as a pointer to itself.
 */
export function pointerFilenames(kernelFilename: string): string[] {
  return [
    ...new Set(
      PROVIDER_MANIFESTS.map((manifest) => manifest.instructionFile).filter(
        (name): name is string => typeof name === 'string' && name !== kernelFilename
      )
    ),
  ];
}
