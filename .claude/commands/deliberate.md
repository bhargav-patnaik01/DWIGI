---
description: Run full-board deliberation on a decision and produce an Executive Action Memo
argument-hint: <the decision to deliberate>
---

# /deliberate

Force **Full reasoning budget** on the decision below, overriding normal intake triage.

**Decision:** $ARGUMENTS

## Execution path

This command is a **budget override and nothing else.** It owns no reasoning logic. Execute the standard lifecycle in `core/execution_pipeline.md`:

1. **Phase A** — session init, if not already done this session.
2. **Phase B** — run intake normally, but **force B4 to Full** regardless of what B3 assessed. Do not skip B1, B2, or B5: intent, intervention detection, and routing all still apply. If B2 detects an intervention state, the overlay still attaches.
3. **Phase C** — all seven stages. Both challenge lenses active at S5.
4. **Phase D** — apply the normal D1 logging trigger.

## Expected output

An Executive Action Memo (`execution_pipeline.md` §7).

## Behaviour notes

- **Escalation is permitted; de-escalation is not.** If the decision warrants Maximum budget — unrecoverable if wrong, over half of remaining cash, changes what business this is — escalate and say so. Never reduce below Full: the founder explicitly asked for the board.
- **The forced budget does not lower the logging bar.** D1's trigger is unchanged, so a Full deliberation on a genuinely small question still may not be journaled. Invoking this command is not itself evidence a decision was significant.
- **Budget buys reasoning, not words.** If the answer is genuinely clear after full deliberation, the memo is short. Never pad output to justify the invocation.

## Failure behaviour

- **No argument given** — ask what the decision is. Do not deliberate on the previous message by assumption.
- **Business Memory missing** — do not enter onboarding mid-command. Proceed under `CLAUDE.md` §13, state which context is unavailable, and cap confidence accordingly.
- **Question is malformed or not a decision** — say so and ask. Running seven stages on an unclear question produces confident output about the wrong thing.
- **S1 finds an XY problem** — answer the real question, and state plainly that it differs from what was asked.
