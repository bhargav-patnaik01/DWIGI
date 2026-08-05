/**
 * Credential storage — OS-backed, main-process only, no plaintext fallback.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS UNREACHABLE FROM THE RENDERER, BY BUILD CONFIGURATION
 * ---------------------------------------------------------------------------
 * `tsconfig.json` excludes `electron/`, so nothing under `src/` can import this
 * module even by accident. That is a stronger guarantee than a naming convention
 * or a code review rule, and it is why ADR-013 §F rule 1 is stated as structural
 * rather than as a policy: there is no import path for a secret to travel.
 *
 * Nothing here is exported through `shared/host.ts`. The renderer receives
 * `AuthStatus` — a state, a method, an optional display label — and has no
 * channel that could carry a key even if a component asked for one.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO PLAINTEXT FALLBACK
 * ---------------------------------------------------------------------------
 * `safeStorage` is backed by the OS keychain: DPAPI on Windows, Keychain on
 * macOS, libsecret on Linux. On a Linux box with no keyring daemon it is simply
 * unavailable.
 *
 * The tempting fallback is an obfuscated file, and it is worse than refusing:
 * it stores the founder's API key in a form any reader can recover while
 * *looking* protected, so nobody is told to be careful. ADR-013 §F rule 6
 * therefore has a provider report unavailable with the reason. A founder who
 * cannot store a key securely can still use Claude Code, Gemini CLI, Ollama, or
 * LM Studio, none of which need one — so the honest failure costs them a
 * provider, not the product.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS WRITTEN TO DISK
 * ---------------------------------------------------------------------------
 * A single JSON file in the host's own `userData` directory, holding base64
 * ciphertext keyed by provider id and nothing else. No plaintext, no key prefix,
 * no length, no hint. Never inside the workspace — a credential in a folder a
 * founder might publish is the accident `core/business_memory.md` is gitignored
 * to avoid, with worse consequences.
 */

import { safeStorage, app } from 'electron';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Filename inside `userData`. Contents are ciphertext only. */
const STORE_FILE = 'credentials.json';

/** On-disk shape. `v` exists so a format change is detectable rather than fatal. */
interface StoredCredentials {
  v: number;
  /** provider id → base64 ciphertext from `safeStorage.encryptString`. */
  entries: Record<string, string>;
}

const SCHEMA_VERSION = 1;

export type CredentialAvailability =
  | { available: true }
  | { available: false; reason: string };

/**
 * Whether this machine can store a credential at all.
 *
 * Checked before offering an API-key flow, so a founder on a machine without a
 * keyring is told up front instead of pasting a key and watching it fail to
 * persist.
 */
export function credentialStorageAvailability(): CredentialAvailability {
  try {
    if (safeStorage.isEncryptionAvailable()) return { available: true };
  } catch {
    // `safeStorage` throws before `app.ready` on some platforms. Treated as
    // unavailable rather than crashing a launch.
  }
  return {
    available: false,
    reason:
      'This computer has no secure credential store available to D.W.I.G.I, so an API key cannot be saved safely. ' +
      'Providers that manage their own sign-in — Claude Code, Gemini CLI — and local providers are unaffected.',
  };
}

export class CredentialStore {
  private cache: StoredCredentials | null = null;

  /** Serialises writes. One desktop user, so chaining is sufficient. */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * `rootDir` is injected rather than read from Electron here, for the same
   * reason `ConversationStore` takes one: it makes the module testable without an
   * Electron process, and it makes "this can never be pointed at the workspace"
   * a property of the single call site in `main.ts` rather than a hope.
   */
  constructor(private readonly rootDir: string) {}

  static default(): CredentialStore {
    return new CredentialStore(app.getPath('userData'));
  }

  private get file(): string {
    return path.join(this.rootDir, STORE_FILE);
  }

  private serialise<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async load(): Promise<StoredCredentials> {
    if (this.cache) return this.cache;
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as unknown;
      if (
        typeof raw === 'object' &&
        raw !== null &&
        (raw as StoredCredentials).v === SCHEMA_VERSION &&
        typeof (raw as StoredCredentials).entries === 'object'
      ) {
        const entries = (raw as StoredCredentials).entries;
        const clean: Record<string, string> = {};
        for (const [key, value] of Object.entries(entries)) {
          if (typeof value === 'string' && value.length > 0) clean[key] = value;
        }
        this.cache = { v: SCHEMA_VERSION, entries: clean };
        return this.cache;
      }
    } catch {
      // Absent or unreadable. An empty store is the correct first-run state, and
      // a corrupt one is treated as empty rather than repaired: guessing at
      // half-decoded ciphertext has no upside.
    }
    this.cache = { v: SCHEMA_VERSION, entries: {} };
    return this.cache;
  }

  /**
   * Atomic write: temp file, then rename.
   *
   * A torn credentials file would lock a founder out of every key-based provider
   * at once, so the same temp-and-rename discipline the conversation index uses
   * applies here.
   */
  private async persist(state: StoredCredentials): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    // `mode` restricts the file to the owner. It is advisory on Windows, which is
    // why the contents are ciphertext rather than relying on permissions at all.
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    try {
      await rename(temp, this.file);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    this.cache = state;
  }

  /**
   * Is a credential stored for this provider?
   *
   * Presence only. This is the single fact about a stored credential that is safe
   * to surface upward, and it is what `AuthStatus` needs to distinguish
   * `unauthenticated` from `invalid`.
   */
  async has(providerId: string): Promise<boolean> {
    const state = await this.load();
    return typeof state.entries[providerId] === 'string';
  }

  /**
   * Store a secret.
   *
   * Throws when secure storage is unavailable rather than degrading. The caller is
   * expected to have checked `credentialStorageAvailability()` and to have not
   * offered the flow at all — this is the backstop, and a backstop that silently
   * wrote plaintext would defeat the check it backs up.
   */
  async set(providerId: string, secret: string): Promise<void> {
    const availability = credentialStorageAvailability();
    if (!availability.available) throw new Error(availability.reason);
    if (!secret) throw new Error('Refusing to store an empty credential.');

    return this.serialise(async () => {
      const state = await this.load();
      const ciphertext = safeStorage.encryptString(secret).toString('base64');
      await this.persist({
        v: SCHEMA_VERSION,
        entries: { ...state.entries, [providerId]: ciphertext },
      });
    });
  }

  /**
   * Retrieve a secret for immediate use.
   *
   * ---------------------------------------------------------------------------
   * THE RETURN VALUE MUST NOT BE RETAINED, LOGGED, OR RETURNED UPWARD
   * ---------------------------------------------------------------------------
   * The only sanctioned consumer is the code that attaches an `Authorization`
   * header inside a provider, immediately, in the main process. It is not stored
   * on an instance field, not put in an error message, and not included in
   * diagnostics — `shared/redact.ts` would mask it, and relying on redaction as
   * the primary control would be relying on the last line of defence as the first.
   */
  async get(providerId: string): Promise<string | null> {
    const state = await this.load();
    const ciphertext = state.entries[providerId];
    if (!ciphertext) return null;
    try {
      return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'));
    } catch {
      /*
       * Decryption failed. Almost always the OS keychain having changed under us
       * — a new user profile, a restored machine, a reset keyring.
       *
       * Reported as absent rather than thrown: the credential is genuinely
       * unusable, and the state a founder needs to reach is "connect again",
       * which `has()` returning true and `get()` returning null produces as
       * `invalid`.
       */
      return null;
    }
  }

  /** Forget a credential. Idempotent — revoking twice is not an error. */
  async remove(providerId: string): Promise<void> {
    return this.serialise(async () => {
      const state = await this.load();
      if (!(providerId in state.entries)) return;
      const entries = { ...state.entries };
      delete entries[providerId];
      await this.persist({ v: SCHEMA_VERSION, entries });
    });
  }

  /**
   * Provider ids holding a credential.
   *
   * Ids only — used by diagnostics to report *which* providers have a key stored,
   * never what. Safe to export because a provider id is public information.
   */
  async storedProviders(): Promise<string[]> {
    const state = await this.load();
    return Object.keys(state.entries).sort();
  }
}
