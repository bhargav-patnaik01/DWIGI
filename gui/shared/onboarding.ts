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
