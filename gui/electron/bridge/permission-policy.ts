/**
 * PERMISSION POLICY — in-turn consent over the runtime's native control protocol.
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
 * All four are now met, including the half that was previously conceded as
 * impossible.
 *
 * ---------------------------------------------------------------------------
 * THE CORRECTION THIS FILE EXISTS TO RECORD
 * ---------------------------------------------------------------------------
 * The previous version of this file asserted, as empirically verified fact,
 * that print mode cannot pause for consent and that `--permission-prompt-tool`
 * does not exist in CLI 2.1.220. Both claims were false, and they were false in
 * a way that survived three milestones because they were written down as
 * findings rather than as assumptions.
 *
 * Re-verified against the same CLI 2.1.220:
 *
 *   - `--permission-prompt-tool` EXISTS. It is absent from `--help`, but the
 *     parser accepts it, and rejects genuinely unknown flags with
 *     `error: unknown option`. Acceptance is therefore meaningful.
 *   - The value `stdio` routes permission decisions to the host over the same
 *     stdin/stdout channel the turn already uses, as `control_request` /
 *     `control_response` pairs with subtype `can_use_tool`.
 *   - The runtime BLOCKS on that request. Measured: a deliberate 4,000 ms stall
 *     before answering produced a 4,034 ms gap between the request and the tool
 *     result, with no auto-deny and no denial recorded.
 *   - `allow` executes the pending call inside the same turn. `deny` suppresses
 *     it and returns the supplied message to the advisor as the tool result.
 *
 * ---------------------------------------------------------------------------
 * WHY IT LOOKED IMPOSSIBLE
 * ---------------------------------------------------------------------------
 * The v1 transport called `child.stdin.end()` immediately after writing the
 * user's message, on the reasoning that print mode consumes one turn and
 * closing stdin signals end of input. That is true of the *message* stream and
 * false of the *control* stream, which is bidirectional over the same pipe.
 *
 * With stdin closed, the runtime has nowhere to send the question. It reports
 * `Tool permission request failed: AbortError: Stream closed` and falls back to
 * refusal. Every observation behind the old policy — the refusal, the
 * `non_execution_kind: "user-rejected"`, the populated `permission_denials` —
 * was the cockpit's own channel closure being read back as a platform limit.
 *
 * The general lesson, worth more than the fix: an impossibility proof that is
 * only ever run against your own harness proves a property of the harness.
 *
 * ---------------------------------------------------------------------------
 * POLICY IMPLEMENTED: IN-TURN CONSENT
 * ---------------------------------------------------------------------------
 * 1. Nothing is ever pre-approved. No `--allowedTools`, no `--permission-mode`,
 *    no settings pre-seeding. The runtime's own rules decide what needs asking.
 * 2. When the runtime asks, the question is surfaced before anything happens.
 *    Nothing has been written or run at that point.
 * 3. The user's answer is returned on the same correlation token. `allow`
 *    completes the call in the same turn; `deny` suppresses it in the same turn.
 * 4. There is no retry, no allowlist, and no second turn. Consent is not
 *    remembered between requests: each ask is answered on its own.
 *
 * ---------------------------------------------------------------------------
 * DELIBERATELY NOT DONE
 * ---------------------------------------------------------------------------
 * - **No auto-deny timeout.** Contract invariant 4 forbids answering on the
 *   user's behalf, and a timeout is an answer. An unanswered request blocks the
 *   advisor indefinitely, exactly as an unanswered terminal prompt does.
 *   `cancel()` is the escape, and it is always available.
 * - `--permission-mode acceptEdits` / `dontAsk`: pre-approves writes.
 * - `--dangerously-skip-permissions`: unacceptable for an app with a text box.
 * - Pre-seeding a settings allowlist: writes to the repository, which the
 *   architecture forbids, and silently pre-approves.
 *
 * ---------------------------------------------------------------------------
 * KNOWN FRAGILITY
 * ---------------------------------------------------------------------------
 * `--permission-prompt-tool` is undocumented in `--help`. It works, but it is
 * not part of the published CLI surface and may change without notice. The
 * transport must therefore treat the flag as best-effort: if a future runtime
 * rejects it, the spawn fails loudly at `isAvailable()`/first turn rather than
 * silently reverting to a mode that writes without asking. Failing closed is
 * the requirement; failing quietly is not acceptable for this particular flag.
 */

/** The sentinel that routes permission decisions to this host over stdio. */
export const PERMISSION_PROMPT_TRANSPORT = 'stdio' as const;

/** Control-protocol discriminators this bridge understands. */
export const CONTROL = {
  request: 'control_request',
  response: 'control_response',
  canUseTool: 'can_use_tool',
} as const;

export const PERMISSION_POLICY = {
  id: 'in-turn-consent',
  /** No flags are added at spawn time that would pre-approve anything. */
  preApprovesAnything: false,
  /** One answer resolves one request. Nothing is remembered across requests. */
  grantScope: 'single-request' as const,
  /**
   * False: the engine is blocked when the question is asked, and the answer
   * completes or suppresses the original call. Read by the UI so its copy stays
   * accurate rather than implying a retry it no longer needs.
   */
  consentIsPostHoc: false,
  /**
   * Never. A request with no answer stays open until the user answers it or
   * cancels the turn (contract invariant 4).
   */
  autoDenyAfterMs: null,
} as const;

export type PermissionPolicy = typeof PERMISSION_POLICY;
