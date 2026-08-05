/**
 * Provider registry — the join between a manifest and the code behind it.
 *
 * ---------------------------------------------------------------------------
 * A MANIFEST WITH NO IMPLEMENTATION IS A DEFECT, NOT A DEGRADED STATE
 * ---------------------------------------------------------------------------
 * `shared/runtime/manifests.ts` is data the renderer reads; the factories below
 * are code only the host can run. The two halves live apart because the build
 * forces it (`tsconfig.json` excludes `electron/`), and anything split across two
 * files can disagree.
 *
 * `auditRegistry()` reports both directions of disagreement, exactly as
 * `RepositoryReader` reports a manifest entry with no persona file and a persona
 * file with no manifest entry (ADR-012). The difference is the severity: a
 * missing executive is a runtime condition a founder can fix by adding a file,
 * whereas a manifest with no factory is a programming error that shipped. So this
 * one is asserted by the test suite and fails the build rather than degrading.
 */

import type { ProviderFactory, RuntimeProvider } from '../../shared/runtime/contract';
import { PROVIDER_MANIFESTS } from '../../shared/runtime/manifests';
import { CredentialStore } from './auth/credentials';
import { ClaudeCodeProvider } from './providers/claude/provider';
import { GeminiCliProvider } from './providers/gemini/provider';
import {
  HttpChatProvider,
  LMSTUDIO_CONFIG,
  OLLAMA_CONFIG,
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
} from './providers/http-chat';

/**
 * Build the id → factory table.
 *
 * Takes the credential store as an argument rather than reaching for a singleton:
 * the HTTP providers need it, and injecting it keeps the registry constructible in
 * a test without an Electron `app` object.
 *
 * **Adding a provider is one line here, one manifest, and one implementation.**
 * That is the whole extension cost, and it is the bar ADR-013 sets for "future
 * providers should be addable without architectural modification".
 */
export function buildRegistry(store: CredentialStore): Map<string, ProviderFactory> {
  return new Map<string, ProviderFactory>([
    ['claude-code', () => new ClaudeCodeProvider()],
    ['gemini-cli', () => new GeminiCliProvider()],
    ['openai', () => new HttpChatProvider(OPENAI_CONFIG, store)],
    ['ollama', () => new HttpChatProvider(OLLAMA_CONFIG, store)],
    ['lmstudio', () => new HttpChatProvider(LMSTUDIO_CONFIG, store)],
    ['openrouter', () => new HttpChatProvider(OPENROUTER_CONFIG, store)],
    // 'azure-openai' is declared in shared/runtime/manifests.ts but has no
    // factory here yet: its endpoint is per-deployment
    // (`resolveAzureConfig()` in `providers/http-chat.ts` already builds one
    // from resource/deployment/api-version), and there is no connect-time UI
    // this round to collect those three fields from the founder. `manager.ts`
    // reports a manifest with no factory as present-but-absent — the honest
    // state for "described, not yet connectable" — rather than hiding it.
  ]);
}

/** Ids declared in a manifest, ids with a factory, and where the two disagree. */
export interface RegistryAudit {
  /** Manifest ids with no factory. Each is a provider the interface would offer and the host could not start. */
  missingImplementation: string[];
  /** Factory ids with no manifest. Each is unreachable — nothing can render or select it. */
  orphanedImplementation: string[];
}

export function auditRegistry(registry: ReadonlyMap<string, ProviderFactory>): RegistryAudit {
  const manifestIds = new Set(PROVIDER_MANIFESTS.map((manifest) => manifest.id));
  const factoryIds = new Set(registry.keys());

  return {
    missingImplementation: [...manifestIds].filter((id) => !factoryIds.has(id)).sort(),
    orphanedImplementation: [...factoryIds].filter((id) => !manifestIds.has(id)).sort(),
  };
}

/**
 * Construct every provider once.
 *
 * Providers are cheap to construct — no process is spawned and no network call is
 * made until `detect()` — so they are built eagerly and held. A lazily constructed
 * provider would make the first health sweep the point at which a manifest/factory
 * mismatch surfaced, which is later than it needs to be.
 */
export function instantiate(
  registry: ReadonlyMap<string, ProviderFactory>
): Map<string, RuntimeProvider> {
  const providers = new Map<string, RuntimeProvider>();
  for (const manifest of PROVIDER_MANIFESTS) {
    const factory = registry.get(manifest.id);
    if (!factory) continue;
    try {
      providers.set(manifest.id, factory());
    } catch (error) {
      // One provider whose constructor throws must not take down the other four.
      // Reported to the console rather than swallowed: this is a build-time
      // mistake surfacing at runtime, and it should be noisy.
      console.error(
        `[eis] provider "${manifest.id}" could not be constructed:`,
        error instanceof Error ? error.message : error
      );
    }
  }
  return providers;
}
