/**
 * PERMISSION POLICY — the one contested decision in Milestone 2.
 *
 * Isolated in its own file so it can be replaced without touching the transport,
 * the reducer, or any component.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS ASKED FOR
 * ---------------------------------------------------------------------------
 * Amendment §5: surface permission prompts in the GUI, forward the user's
 * choice, never silently approve, keep behaviour equivalent to the terminal.
 *
 * ---------------------------------------------------------------------------
 * WHY IT CANNOT BE IMPLEMENTED AS SPECIFIED
 * ---------------------------------------------------------------------------
 * Verified empirically against CLI 2.1.220 in the disposable sandbox. In print
 * mode — the only mode a GUI can drive programmatically — the runtime does not
 * pause for consent. It refuses the action, informs the advisor of the refusal,
 * and continues:
 *
 *   tool_use    → Write probe-artifact.txt
 *   tool_result → is_error: true, "requested permissions ... but you haven't
 *                 granted it yet", non_execution_kind: "user-rejected"
 *   terminal    → permission_denials: [{ tool_name: "Write", ... }]
 *
 * There is no blocking request, no request token, and no stdin channel that
 * accepts a decision. `--permission-prompt-tool` does not exist in this version.
 * So there is nothing to surface *before* the fact and nothing to forward *to*.
 *
 * The deeper reason: "the terminal" has two behaviours. Interactive `claude`
 * blocks and prompts; print mode auto-denies. A GUI can only drive print mode.
 * Screen-scraping a pseudo-terminal to recover the interactive prompt would be
 * fragile and is not on the table.
 *
 * ---------------------------------------------------------------------------
 * POLICY IMPLEMENTED: POST-HOC CONSENT
 * ---------------------------------------------------------------------------
 * 1. Nothing is ever pre-approved. The runtime is spawned with no permission
 *    flags, so its default refusal behaviour is preserved exactly.
 * 2. When a refusal is observed, the GUI shows what was attempted, on what
 *    target, and that it was refused.
 * 3. If the user approves, the specific tool is allowlisted for exactly one
 *    subsequent attempt via `--allowedTools`, then the grant is discarded.
 * 4. The user must re-ask for the action. Approval authorises a fresh attempt;
 *    it cannot resurrect the refused one.
 *
 * This satisfies the binding half of §5 — no silent approval, the user decides —
 * and honestly fails the other half: consent is after the fact, not before, and
 * a granted retry costs an extra turn.
 *
 * ---------------------------------------------------------------------------
 * ALTERNATIVES DELIBERATELY NOT CHOSEN
 * ---------------------------------------------------------------------------
 * - `--permission-mode acceptEdits`: pre-approves writes. Explicitly rejected.
 * - `--dangerously-skip-permissions`: unacceptable for an app with a text box.
 * - Pre-seeding a settings allowlist: writes to the repository, which the
 *   architecture forbids, and silently pre-approves.
 * - pty screen-scraping of interactive mode: fragile, and couples the cockpit to
 *   a TUI layout that is free to change.
 */

/** Grants are single-use by construction; nothing here persists to disk. */
export const PERMISSION_POLICY = {
  id: 'post-hoc-consent',
  /** No flags are added at spawn time unless a live grant exists. */
  preApprovesAnything: false,
  /** One approval authorises one attempt. */
  grantScope: 'single-attempt' as const,
  /**
   * True when consent necessarily arrives after the attempt was refused. Read by
   * the UI so its copy stays accurate rather than implying it can resume.
   */
  consentIsPostHoc: true,
} as const;

export type PermissionPolicy = typeof PERMISSION_POLICY;
