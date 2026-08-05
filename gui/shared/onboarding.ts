/**
 * First-run detection.
 *
 * ---------------------------------------------------------------------------
 * THE COCKPIT OBSERVES THE CONDITION; THE ENGINE OWNS THE BEHAVIOUR
 * ---------------------------------------------------------------------------
 * `CLAUDE.md` §14 makes the absence of `core/business_memory.md` the definition
 * of first run. This function decides one thing only: whether to draw the
 * welcome screen instead of the chat screen. It does not create the file, decide
 * what onboarding asks, or track progress through it — pressing Get Started
 * hands all of that to the engine.
 *
 * It lives in `shared/` and takes plain inputs so it can be exercised directly
 * by the test suite. A first-run rule that could only be verified by launching a
 * window would not be verified.
 */

import type { MemoryScope } from './runtime-modes';

export interface FirstRunInput {
  /** Has the founder chosen a repository at all? */
  hasWorkspace: boolean;
  /**
   * Scope the *next* conversation would be created with.
   *
   * Onboarding exists to populate Business Memory. A founder who has chosen
   * Executive Learning has said they do not want that memory consulted, and
   * offering to build it anyway would be the cockpit arguing with a choice they
   * just made — on the very first screen, to someone who may have no business at
   * all. That is the case this mode exists to serve.
   *
   * This suppresses the *invitation* only. The engine enforces the same rule
   * independently: `.claude/commands/learning.md` declines to enter onboarding
   * even if `/begin` were somehow sent. Two gates, because a founder finding
   * themselves interrogated about their runway in a mode that promised not to
   * ask is a failure neither layer should be able to cause alone.
   */
  memoryScope: MemoryScope;
  /**
   * Has a repository snapshot been read yet?
   *
   * Load-bearing against a flash of the wrong screen: before the first read,
   * `memoryPresent` is merely unknown, and defaulting it to false would show the
   * welcome screen for a moment to a founder who has used the app for months.
   */
  snapshotLoaded: boolean;
  /** Does `core/business_memory.md` exist? Existence only — see `hasMemory`. */
  memoryPresent: boolean;
  /** Has Get Started already been pressed for this repository? */
  onboardingStarted: boolean;
  /** Developer override. Forces the welcome screen regardless of the above. */
  forced: boolean;
}

/**
 * Should the welcome screen be shown in place of Chat?
 *
 * Every negative case returns false for a distinct reason, and none of them is
 * "probably not":
 *
 *   - No repository — the founder needs the *select a repository* state, not an
 *     invitation to begin onboarding against nothing.
 *   - Snapshot unread — the answer is not yet known, and guessing it wrong shows
 *     an established founder a first-run screen.
 *   - Memory exists — onboarding has happened. Never offer to redo it; the file
 *     it would write is the one holding everything known about the company.
 *   - Already started — onboarding is underway in a conversation that exists.
 *     Business Memory is written at the end, so file absence alone would send a
 *     founder who restarted the app back to the beginning.
 *   - Executive Learning selected — the founder has declined the memory this
 *     screen exists to build. See `memoryScope`.
 *
 * The scope check sits *above* `forced` deliberately. `devForceFirstRun` exists
 * to work on the welcome flow against a repository that already has a memory; it
 * is not a reason to show an onboarding invitation in a mode whose defining
 * property is that onboarding never happens. A developer wanting that screen can
 * switch back to Business Advisor, which is one click and is honest about what
 * it is doing.
 */
export function shouldShowWelcome(input: FirstRunInput): boolean {
  if (input.memoryScope === 'learning') return false;
  if (input.forced) return true;
  if (!input.hasWorkspace) return false;
  if (!input.snapshotLoaded) return false;
  if (input.memoryPresent) return false;
  if (input.onboardingStarted) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Setup completeness                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What is still missing before the application can be used at all.
 *
 * ---------------------------------------------------------------------------
 * v1.0.1 HAD ONE PREREQUISITE. THERE ARE NOW THREE.
 * ---------------------------------------------------------------------------
 * A workspace to keep the work in, an AI to think with, and — the original one —
 * a Business Memory the advisor has built. A founder missing any of them cannot
 * hold a deliberation, and the old behaviour of dropping them into Chat with a
 * live composer and no explanation was the specific failure Phase 2 exists to fix.
 *
 * Returned as *which step is outstanding* rather than as a boolean, so the flow
 * can resume where it stopped instead of restarting. Someone who chose a folder,
 * quit, and came back should not be asked to choose it again.
 *
 * Pure, and here rather than inside the component, so the rule can be exercised
 * without mounting a React tree — the same reasoning that put `shouldShowWelcome`
 * in this file.
 */
export type SetupStage = 'workspace' | 'ai' | 'memory' | 'complete';

export interface SetupInput {
  hasWorkspace: boolean;
  /** True once an AI has been selected to power the council. */
  hasActiveBrain: boolean;
  snapshotLoaded: boolean;
  memoryPresent: boolean;
  onboardingStarted: boolean;
  memoryScope: MemoryScope;
  forced: boolean;
}

export function setupStage(input: SetupInput): SetupStage {
  /*
   * Executive Learning short-circuits everything below the AI.
   *
   * That mode exists for a founder who may have no business at all, so demanding
   * a Business Memory before they can ask a general question would be the
   * interface arguing with a choice they just made. An AI is still required —
   * without one there is nothing to ask.
   */
  if (input.memoryScope === 'learning') {
    if (!input.hasWorkspace) return 'workspace';
    if (!input.hasActiveBrain) return 'ai';
    return 'complete';
  }

  if (input.forced) return 'workspace';
  if (!input.hasWorkspace) return 'workspace';
  if (!input.hasActiveBrain) return 'ai';
  // Unknown until the first read. Reporting `memory` here would flash the setup
  // flow at an established founder on every launch.
  if (!input.snapshotLoaded) return 'complete';
  if (input.memoryPresent) return 'complete';
  if (input.onboardingStarted) return 'complete';
  return 'memory';
}

/** Is setup finished? Thin wrapper, for the common case. */
export function isSetupComplete(input: SetupInput): boolean {
  return setupStage(input) === 'complete';
}
