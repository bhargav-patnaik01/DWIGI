---
description: Write, review, or list Decision Records in the journal
argument-hint: [review <id> | list | <decision to log>]
---

# /decision-log

Manage the decision journal.

**Argument:** $ARGUMENTS

## Modes

Dispatch on the argument. Owns no schema and no scoring logic — all of that lives in `core/learning_protocol.md`.

| Argument | Action |
| :--- | :--- |
| *(blank)* | Log the most recent significant decision from this session |
| `review <id>` | Conduct the review of that record |
| `review` | Review the oldest overdue record; if none are due, say so |
| `list` | List records with status and review dates |
| *anything else* | Treat as a decision to log |

## Execution path — logging

Phase D1 of `core/execution_pipeline.md`, invoked explicitly.

1. Write `journal/DEC-YYYYMMDD_kebab-slug.md` per `learning_protocol.md` §2.
2. Front matter must capture routed lenses and the **memory basis with provenance** — values without provenance make the record unreviewable, because a future reader cannot tell what was known from what was guessed.
3. Part 1 is the Executive Action Memo **verbatim, as delivered.** Never a summary or a rewrite. Frozen on write. Copy it from the conversation — do not load the memo specification to transcribe a memo that already exists (`learning_protocol.md` §2).
4. If the founder overrode the recommendation, append their reasoning in their own framing.
5. Add a review-queue entry in `core/calibration_journal.md` §8.

## Execution path — review

`learning_protocol.md` §4. Order is mandatory:

1. **Read front matter and Part 1 before investigating the outcome.** Reconstruct what was known on the decision date.
2. Score predictions; audit assumptions.
3. Assess **decision quality and outcome quality separately**, then assign the quadrant (§3).
4. Extract calibration adjustments **only where decision quality was flawed.**
5. Write Part 2. Set `status: reviewed`. **Part 1 stays frozen.**
6. Update `calibration_journal.md` aggregates.

## Expected output

- **Logging:** path written, plus a one-line confirmation. Not a restatement of the decision.
- **Review:** the completed Part 2, with the quadrant named explicitly.
- **List:** ID, date, domain, confidence, status, review date.

## Behaviour notes

- **Immutability is absolute.** Never edit Part 1, a past confidence band, or a prediction to match what happened. If a record was wrong at the time, write a new record that supersedes it and link both directions.
- **Corrections stay visible.** Never silently revise a review.
- **Logging on request bypasses the D1 trigger but not the schema.** The founder may log anything they consider significant; note if it falls below the normal bar rather than refusing.

## Failure behaviour

- **`review <id>` not found** — say so and list nearby records. Never review a record you cannot read.
- **Blank argument, no significant decision this session** — say so. Do not manufacture a record from a conversational exchange.
- **Review requested before the outcome is knowable** — say the outcome is unresolved, record that as the result, and set a new review date. An unresolved prediction is data; a guessed one is corruption.
- **Insufficient information to assess decision quality** — say so rather than defaulting to the outcome's verdict. Inferring reasoning quality from the result is the exact failure `learning_protocol.md` §3 exists to prevent.
