/**
 * Redaction — what must never leave this machine in a diagnostics export.
 *
 * ---------------------------------------------------------------------------
 * DENY BY DEFAULT, OVER TWO INDEPENDENT AXES
 * ---------------------------------------------------------------------------
 * Diagnostics exist to be pasted into a bug report, which means everything here
 * is one keystroke from a public issue tracker. Two mechanisms, deliberately
 * overlapping:
 *
 *   1. **Key-based.** A field whose *name* suggests a secret is redacted
 *      whatever it holds.
 *   2. **Shape-based.** A *value* that looks like a credential is redacted
 *      whatever it is called.
 *
 * Either alone fails in a predictable direction. Key-matching alone misses a key
 * pasted into a field called `note`. Shape-matching alone misses a short or
 * unusual credential format nobody has a pattern for. Running both means a leak
 * has to defeat two unrelated filters.
 *
 * The alternative design — an allowlist of fields safe to export — was rejected,
 * and the reason is worth stating because allowlists look strictly safer: they
 * are safer against *known* fields and useless against new ones. A field added
 * next sprint is absent from an allowlist and therefore silently dropped, which
 * turns a diagnostics regression into an invisible one. Deny-by-default over
 * patterns fails the other way: a new field appears, and if it looks sensitive it
 * is masked.
 *
 * ---------------------------------------------------------------------------
 * PERSONAL INFORMATION INCLUDES THE FOUNDER'S OWN NAME
 * ---------------------------------------------------------------------------
 * A Windows user directory carries the account holder's name, and that name is in
 * every absolute path this application handles. This repository has already been
 * bitten by it — `82ae795 fix: redact capture-machine paths from tracked test
 * fixtures` — so home-directory paths are masked structurally rather than being
 * treated as harmless plumbing.
 *
 * (The example that belongs here is a literal user path, and it is deliberately
 * not written out: `tests/runtime-modes.test.mjs` fails the build if any file
 * under `shared/` or `src/` contains one. Being caught by that guard while
 * writing this comment is the best possible argument for keeping it.)
 *
 * ---------------------------------------------------------------------------
 * WHAT MASKING PRESERVES, AND WHY IT PRESERVES ANYTHING
 * ---------------------------------------------------------------------------
 * A redacted value becomes a marker that records *that a value was present* and
 * roughly how long it was. Replacing it with nothing at all would make a bug
 * report ambiguous between "no credential configured" and "credential removed
 * before sending", which are opposite diagnoses of the same symptom.
 *
 * Pure functions over plain data, so the host, the renderer, and the test suite
 * share one implementation.
 */

/** What a redacted value is replaced with. Recognisable and never valid input. */
export const REDACTION_MARKER = '[redacted]';

/**
 * Field names that are always redacted, matched case-insensitively as substrings.
 *
 * Substring matching is intentional: it catches `apiKey`, `api_key`, `API_KEY`,
 * `openaiApiKey`, and `key` with one entry. The false-positive cost is a masked
 * field that was harmless; the false-negative cost is a published credential.
 */
export const SENSITIVE_KEY_PATTERNS: readonly string[] = [
  'token',
  'secret',
  'password',
  'passwd',
  'credential',
  'authorization',
  'auth_header',
  'bearer',
  'cookie',
  'apikey',
  'api_key',
  'accesskey',
  'access_key',
  'privatekey',
  'private_key',
  'refresh',
  'signature',
  'session_key',
  // `key` last, and deliberately broad. It catches `key`, `keys`, `keyFile`.
  'key',
];

/**
 * Field names redacted despite not being secrets, because they identify a person.
 *
 * Separate list because the *reason* differs and the ADR distinguishes them
 * (§F rule 2 covers secrets; Part K also requires personal information). Keeping
 * them apart means a future change to one policy does not silently move the other.
 */
export const PERSONAL_KEY_PATTERNS: readonly string[] = [
  'email',
  'username',
  'userName',
  'account',
  'homedir',
  'home_dir',
  'userprofile',
];

/**
 * Keys that survive verbatim despite matching a pattern above.
 *
 * Narrow and justified individually — an exemption list is where redaction goes
 * to die, so each entry names a field whose *shape* is known non-sensitive:
 *
 *   - `authMethod` / `authState` are enum values from a closed vocabulary
 *     (`browser`, `authenticated`). They match `auth*` but cannot carry a secret.
 *   - `keyPresent` is a boolean by construction.
 */
export const EXEMPT_KEYS: readonly string[] = [
  'authmethod',
  'authstate',
  'authmethods',
  'keypresent',
];

/* -------------------------------------------------------------------------- */
/* Value shapes                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Value patterns redacted wherever they appear, including inside prose.
 *
 * Ordered most specific first so a JWT is not partially eaten by the generic
 * long-token rule. Each carries the format it targets, because an unexplained
 * regex here is unmaintainable and the temptation to "simplify" one is real.
 */
const VALUE_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  // OpenAI and compatible: sk-…, sk-proj-…, and organisation keys.
  { name: 'openai-key', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  // Anthropic.
  { name: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  // GitHub personal access tokens and friends.
  { name: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  // Google API keys.
  { name: 'google-key', pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/g },
  // JSON Web Tokens — three base64url segments. Matched before generic tokens.
  {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  // `Authorization: Bearer …` in a captured header or log line.
  { name: 'bearer', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}/gi },
  // A `key=value` or `key: value` pair in prose where the key looks sensitive.
  {
    name: 'inline-assignment',
    pattern:
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)\b\s*[:=]\s*"?[^\s"',;]{6,}"?/gi,
  },
  // Email addresses — personal information, not a credential.
  { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
];

/**
 * Home-directory prefixes, replaced with a stable placeholder.
 *
 * Substitution rather than removal: the *rest* of the path is diagnostically
 * essential — knowing a workspace sits at `<home>/Documents/Acme` versus
 * `<home>/OneDrive/Acme` explains a whole class of file-watching failure. Only
 * the segment carrying the person's name is masked.
 */
const HOME_PATTERNS: readonly RegExp[] = [
  // Windows: a drive letter, the users directory, then the account name.
  /\b[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/gi,
  // macOS: the users directory, then the account name.
  /\/Users\/[^/\s"']+/g,
  // Linux: the home directory, then the account name.
  /\/home\/[^/\s"']+/g,
];

export const HOME_PLACEHOLDER = '<home>';

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

function matchesAny(key: string, patterns: readonly string[]): boolean {
  const lower = key.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}

/** Is this field name one that must be masked whatever it holds? */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (EXEMPT_KEYS.includes(lower)) return false;
  return (
    matchesAny(key, SENSITIVE_KEY_PATTERNS) || matchesAny(key, PERSONAL_KEY_PATTERNS)
  );
}

/**
 * Mask a value while recording that it existed.
 *
 * Length is bucketed rather than exact. An exact length is a small oracle — it
 * distinguishes credential formats and narrows a brute-force space — and it buys
 * a bug report nothing that the bucket does not.
 */
export function mask(value: unknown): string {
  if (value === null || value === undefined) return REDACTION_MARKER;
  const text = String(value);
  if (text.length === 0) return REDACTION_MARKER;
  const bucket = text.length < 16 ? 'short' : text.length < 64 ? 'medium' : 'long';
  return `${REDACTION_MARKER} (${bucket})`;
}

/**
 * Redact secret-shaped substrings and home paths from free text.
 *
 * Used on log lines, error messages, and version strings — anywhere a value
 * arrived as prose and there is no field name to judge it by.
 */
export function redactText(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  let out = input;
  for (const { pattern } of VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTION_MARKER);
  }
  for (const pattern of HOME_PATTERNS) {
    out = out.replace(pattern, HOME_PLACEHOLDER);
  }
  return out;
}

/**
 * Recursively redact a structure for export.
 *
 * ---------------------------------------------------------------------------
 * THE DEPTH LIMIT IS A SAFETY PROPERTY, NOT AN OPTIMISATION
 * ---------------------------------------------------------------------------
 * Diagnostics are assembled from provider-reported values, and a cyclic or
 * pathologically deep structure would hang the export — turning "help me file a
 * bug" into a frozen window. Beyond the limit the value is replaced with a marker
 * that says so, which is honest and terminates.
 */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[truncated: structure too deep]';

  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    // Bounded: a runaway array in a diagnostics blob is noise, and the count is
    // the diagnostically useful part.
    const items = value.slice(0, 200).map((entry) => redactDeep(entry, depth + 1));
    if (value.length > 200) items.push(`[${value.length - 200} more omitted]`);
    return items;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        // Presence is preserved, content is not. A missing key and a masked key
        // are different diagnoses, and the report must be able to tell them apart.
        out[key] = entry === null || entry === undefined ? null : mask(entry);
        continue;
      }
      out[key] = redactDeep(entry, depth + 1);
    }
    return out;
  }

  // Functions, symbols, bigints: nothing exportable, and stringifying one would
  // emit source text.
  return `[unserialisable: ${typeof value}]`;
}

/**
 * Mask an opaque handle, preserving a short prefix.
 *
 * Session ids are not credentials, but they are capability-bearing — a handle
 * plus the same machine resumes a conversation — and they identify a workspace
 * across a bug report. A prefix is enough to correlate two log lines with each
 * other, which is what a maintainer actually needs, and not enough to be used.
 */
export function maskHandle(value: string | null): string | null {
  if (!value) return value;
  if (value.length <= 8) return REDACTION_MARKER;
  return `${value.slice(0, 8)}…${REDACTION_MARKER}`;
}

/**
 * Assert an export is clean. Used by the test suite, and cheap enough to keep.
 *
 * Returns the offending patterns rather than a boolean, because a failing
 * assertion that cannot say *what* leaked sends whoever is debugging it back to
 * grep. Deliberately re-derived from the same pattern list rather than trusting
 * that `redactDeep` ran: a self-check that shares the caller's assumption checks
 * nothing.
 */
export function findLeaks(serialised: string): string[] {
  const leaks: string[] = [];
  for (const { name, pattern } of VALUE_PATTERNS) {
    // `matchAll` needs a fresh lastIndex; the module-level regexes are global.
    const probe = new RegExp(pattern.source, pattern.flags);
    if (probe.test(serialised)) leaks.push(name);
  }
  for (const pattern of HOME_PATTERNS) {
    const probe = new RegExp(pattern.source, pattern.flags);
    if (probe.test(serialised)) leaks.push('home-path');
  }
  return [...new Set(leaks)];
}
