/**
 * Hosted runtime injection — what a Hosted engine is told about itself.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DOES, AND THE ONE THING IT DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------
 * A Native engine (Claude Code, Gemini CLI) discovers its own operating
 * instructions from the workspace and has its own tools — it needs nothing
 * from this file, and `hostedRuntimeContext()` is never called for one.
 *
 * A Hosted engine (OpenAI, Ollama, LM Studio, OpenRouter, Azure OpenAI) is a
 * chat-completions endpoint with no filesystem of its own and no notion of a
 * working directory. Left alone, it has no way to know that about itself —
 * and an LLM asked "can you check if Claude Code is installed?" that does not
 * know it cannot will confidently claim it can, or worse, fabricate a
 * plausible-sounding answer. This file's whole purpose is to prevent that
 * specific failure: a short, fixed, auditable block of **self-description**,
 * not a capability grant beyond what is actually true.
 *
 * ---------------------------------------------------------------------------
 * WHAT CHANGED: A FIXED, READ-ONLY TOOL SET IS NOW REAL FOR SOME CONNECTIONS
 * ---------------------------------------------------------------------------
 * As of this revision, a connection whose manifest declares
 * `readOnlyTools: 'supported'` or `'unknown'` genuinely can call six read-only
 * tools — read a file, list a directory, search the workspace, and check git
 * status, diff, or log — through the provider's own structured function-calling
 * mechanism (`electron/runtime/tools/execute.ts`, `shared/runtime/tools.ts`).
 * `readOnlyToolsStatement()` below states this honestly, per connection, from
 * the declared capability state — never a blanket claim, and never claimed for
 * a connection whose manifest says `'unsupported'`.
 *
 * What remains genuinely absent, for every Hosted connection without
 * exception: write, delete, package installation, network side effects, and
 * terminal execution of any kind. Nothing in this file, in `tools.ts`, or in
 * the executor behind it constructs a request that could do any of those —
 * that is reserved for the v1.4 Runtime SDK the read-only spec this file
 * implements explicitly does not authorise building yet. `toolCalling` stays
 * `'unsupported'` on every Hosted manifest for a related but distinct reason:
 * it means *arbitrary, model-defined* tools, which this build still never
 * wires through — see `manifests.ts`'s header on why `readOnlyTools` and
 * `toolCalling` are deliberately separate keys.
 *
 * What *is* real and load-bearing: the Installation Assistant (v1.2.3
 * Appendix Part P) is performed entirely by deterministic runtime code —
 * `electron/runtime/discovery.ts`'s polling, `shell.openExternal` for
 * documentation pages — never by the model. This file gives a Hosted engine
 * accurate language to *narrate* that process in conversation, and nothing
 * that would let it *drive* it.
 *
 * ---------------------------------------------------------------------------
 * "ONLY INJECT DOCUMENTS REQUIRED FOR THE CURRENT REQUEST" (Part O)
 * ---------------------------------------------------------------------------
 * The general-purpose skills (`skills/filesystem.md`, `terminal.md`, `git.md`,
 * `workspace.md`, `reasoning.md`) describe tools this build does not wire to
 * any execution path for any provider — native or hosted. Selecting them for
 * injection here would describe capability that does not exist, which is
 * exactly the fabrication the capability system exists to prevent. Only the
 * installation-assistant skills (`skills/installation/`) are ever selected,
 * because they describe a process the runtime genuinely performs and the
 * model is genuinely being asked to narrate.
 *
 * Pure functions and data only — no Electron, no filesystem reads. The caller
 * supplies whatever file contents it already has.
 */

import type { ExecutionMode, ProviderManifest } from './contract';
import { stateOf } from './capabilities';

export type { ExecutionMode };

/** Whether this provider's sessions receive `hostedRuntimeContext()` at all. */
export function requiresHostedContext(manifest: ProviderManifest): boolean {
  return manifest.executionMode === 'hosted';
}

/**
 * The fixed Permission Model paragraph, verbatim for every Hosted engine.
 *
 * Stated once, here, so every Hosted provider describes the same model in the
 * same words — divergent phrasing across providers would let one hosted
 * engine imply a permission model none of them actually have. Framed around
 * "the Runtime" mediating everything, which stays true whether or not this
 * particular connection has been offered the read-only tool set below — the
 * Runtime decides that too, per connection, from its declared capability.
 */
export const PERMISSION_MODEL_STATEMENT =
  'You do not have direct access to this founder’s files, terminal, or ' +
  'operating system, and no message you send can bypass that. Every action on ' +
  'this machine is mediated by the application’s own Runtime: it decides what ' +
  'is possible for this connection, performs it on your behalf when it does ' +
  'allow something, and reports the result back into this conversation — ' +
  'there is no request format that lets you act directly, because none exists ' +
  'for this connection.';

/**
 * The fixed Execution Protocol paragraph: request → Runtime → OS, stated as
 * what does *not* apply to this session.
 */
export const EXECUTION_PROTOCOL_STATEMENT =
  'A Native Council Engine such as Claude Code or Gemini CLI reads its own ' +
  'operating instructions from the founder’s workspace and can act on it ' +
  'directly, mediated by the application’s own permission prompts. You are ' +
  'connected as a Hosted engine instead. You cannot host the founder’s ' +
  'Executive Council for this reason — it depends on reading their Business ' +
  'Memory and writing Decision Records, which this connection has no path to ' +
  'do, whatever else it can read.';

/**
 * What this specific connection's Runtime mediation actually allows, stated
 * from its declared `readOnlyTools` capability — never a blanket claim.
 *
 * `'supported'` and `'unknown'` both describe the same six tools in the same
 * words, because the behaviour offered to the model is identical; only the
 * caveat differs, and it differs precisely because `'unknown'` means "this
 * specific model's adherence to function-calling has not been verified",
 * which is a fact worth the model (and, since this text is disclosed, the
 * founder) knowing, not a fact worth hiding behind an optimistic `'supported'`.
 */
export function readOnlyToolsStatement(manifest: ProviderManifest): string {
  const state = stateOf(manifest.capabilities, 'readOnlyTools');
  const sixTools =
    'reading a file, listing a directory, searching the workspace by pattern, ' +
    'and checking git status, diff, or log';

  if (state === 'supported') {
    return (
      `The Runtime does offer you six read-only tools through this connection’s ` +
      `own function-calling mechanism: ${sixTools}. Every one of those calls is ` +
      'read-only and needs no approval, because none of them can write, delete, ' +
      'install a package, or reach the network. You have no access beyond those ' +
      'six calls: no terminal, no write, no delete, no install.'
    );
  }
  if (state === 'unknown') {
    return (
      `The Runtime may offer you six read-only tools — ${sixTools} — through ` +
      'this connection’s own function-calling mechanism, if the specific model ' +
      'behind it actually honours that mechanism; that has not been verified ' +
      'for this model and the tools may simply be ignored. When they do work, ' +
      'every one of those calls is read-only and needs no approval, because ' +
      'none of them can write, delete, install a package, or reach the network. ' +
      'You have no access beyond those six calls: no terminal, no write, no ' +
      'delete, no install.'
    );
  }
  return (
    'The Runtime offers you no tools of any kind through this connection: no ' +
    'file read, no directory listing, no search, no git access, and — as ' +
    'always — no terminal, no write, no delete, no install.'
  );
}

/** Runtime Instructions: what a Hosted engine should actually do with the above. */
export function runtimeInstructionsStatement(manifest: ProviderManifest): string {
  const hasReadOnlyTools = stateOf(manifest.capabilities, 'readOnlyTools') !== 'unsupported';
  const readAccessLine = hasReadOnlyTools
    ? 'Never claim access beyond the six read-only calls above — you cannot ' +
      'run a command, write, delete, install a package, or verify an ' +
      'installation by yourself. A tool call answers with what it actually ' +
      'read; report that, not what you expect it says.'
    : 'Never claim you can read a file, run a command, or verify an ' +
      'installation yourself.';
  return (
    'If the founder wants their Executive Council, the honest answer is that ' +
    'it needs a Native engine — Claude Code or Gemini CLI — installed and ' +
    'connected. You may help them get there: explain what a Native engine is, ' +
    'and if asked, walk through installing one in plain language. ' +
    `${readAccessLine} The application reports installation detection results ` +
    'into this conversation when they change; you narrate them, you do not ' +
    'produce them.'
  );
}

/**
 * Assemble the fixed context block for one Hosted session.
 *
 * ---------------------------------------------------------------------------
 * SMALL, FIXED, AND SHOWN TO THE FOUNDER
 * ---------------------------------------------------------------------------
 * Four short paragraphs, always in this order, never provider-specific
 * content spliced in beyond the one thing that legitimately varies per
 * connection: which capability state `readOnlyToolsStatement()` reads.
 * `AdvisorTransport`'s verbatim-input invariant exists so the cockpit cannot
 * silently make an engine behave differently from what the founder typed; a
 * Hosted engine has no equivalent of "the same words typed in a terminal" to
 * stay verbatim *with* — there is no terminal it discovers itself from — so
 * some framing is unavoidable if it is to know anything true about its own
 * situation. What the invariant's spirit still demands is disclosure: this
 * exact text is exported so the interface can show it, mirroring
 * `directiveFor` in `shared/runtime-modes.ts`.
 */
export function hostedRuntimeContext(manifest: ProviderManifest): string {
  return [
    `You are running as ${manifest.displayName}, connected to D.W.I.G.I as a Hosted engine.`,
    PERMISSION_MODEL_STATEMENT,
    EXECUTION_PROTOCOL_STATEMENT,
    readOnlyToolsStatement(manifest),
    runtimeInstructionsStatement(manifest),
  ].join('\n\n');
}

/* -------------------------------------------------------------------------- */
/* Installation-assistant skill selection (Part O + Part P)                   */
/* -------------------------------------------------------------------------- */

/** The five installation-assistant skills this appendix defines, by name. */
export const INSTALLATION_SKILLS = [
  'install_claude_code',
  'install_gemini',
  'browser_auth',
  'provider_detection',
  'environment_check',
] as const;

export type InstallationSkill = (typeof INSTALLATION_SKILLS)[number];

/** What the founder's message or the detection state makes relevant right now. */
export interface InstallationContext {
  /** The provider id the founder named or is closest to connecting, if any. */
  targetProviderId: string | null;
  /** True once at least one attempt to detect a runtime has run this session. */
  hasDetectionRun: boolean;
  /** True if a browser-based auth flow is in progress for the target provider. */
  authInProgress: boolean;
}

/**
 * Which installation skills are relevant right now — never the full set by
 * default.
 *
 * `environment_check` and `provider_detection` are the baseline: knowing what
 * is already on the machine comes before explaining how to add to it. The
 * provider-specific install guide is added only once a target is known, and
 * `browser_auth` only once there is an authentication step to narrate — a
 * Hosted engine mid-conversation about Claude Code has no use for Gemini's
 * install steps, and including them anyway is exactly the un-scoped injection
 * Part O asks this file to avoid.
 */
export function selectInstallationSkills(context: InstallationContext): InstallationSkill[] {
  const selected: InstallationSkill[] = ['environment_check', 'provider_detection'];

  if (context.targetProviderId === 'claude-code') selected.push('install_claude_code');
  if (context.targetProviderId === 'gemini-cli') selected.push('install_gemini');
  if (context.authInProgress) selected.push('browser_auth');

  return selected;
}
