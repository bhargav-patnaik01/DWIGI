# Calibration Journal

The advisor's own track record, and the standing adjustments derived from it. Read at session boot (`CLAUDE.md` §4).

This file measures **the advisor**, not the founder. Mechanics for producing entries live in `core/learning_protocol.md`.

---

## How to use this file

**§1 is operative.** Active adjustments are standing modifications to reasoning — apply them, don't just read them. An adjustment that sits in this file unapplied is worse than no adjustment, because it creates a record of learning that never happened.

**§2–§6 are evidence.** They exist so §1 can be justified and audited.

**Never populate any table here from impression, personality read, or what founders are generally like.** Every entry requires observed, dated evidence citing decision record IDs (`learning_protocol.md` §6). An invented pattern applied as a standing adjustment is worse than a blind spot, because it will confidently distort every future decision in its category.

**Append-only.** Retired entries stay visible with a date and reason. This file is the record of the *system's* learning, and deleting its mistakes destroys exactly the evidence that makes it trustworthy.

---

## 1. Active calibration adjustments

Standing modifications to reasoning. Applied at the stage named in each entry.

> *No adjustments yet.* Adjustments require two or more cited instances of the same decision-quality failure (`learning_protocol.md` §6). The first will appear after the first reviews complete.

### Retired adjustments

> *None.*

---

## 2. Confidence calibration

Do stated confidence bands and prediction probabilities match reality?

**Predictions by stated probability.** A well-calibrated advisor's 70% predictions resolve true roughly 70% of the time. Systematic deviation in either direction is a defect: overconfidence produces unwarranted action, underconfidence produces paralysis and hedged advice nobody can use.

| Stated | Predictions | Resolved true | Implied accuracy | Verdict |
| :--- | :-: | :-: | :-: | :--- |
| 90–100% | 0 | — | — | — |
| 70–89% | 0 | — | — | — |
| 50–69% | 0 | — | — | — |
| 30–49% | 0 | — | — | — |
| Under 30% | 0 | — | — | — |

**Recommendation bands.** Did decisions at each band fail for the reason the band predicted?

| Band | Decisions | Sound in review | Notes |
| :--- | :-: | :-: | :--- |
| High | 0 | — | Should fail only when a Known Fact was wrong |
| Moderate | 0 | — | Should fail only via the named assumption |
| Low | 0 | — | Failure expected; check the hedge was real |

**Calibration error.** Stated confidence against reasoning quality — *not* against outcome (`learning_protocol.md` §3).

| Direction | Count | Records |
| :--- | :-: | :--- |
| Calibrated | 0 | — |
| **Overconfidence** — High/Moderate band, reasoning flawed | 0 | — |
| **Underconfidence** — Low/Insufficient band, reasoning sound | 0 | — |

A sound decision with a bad outcome is **calibrated**, not overconfident. Recording it as overconfidence would train the advisor to hedge everything, which is the failure mode that makes an advisor useless without ever making it visibly wrong.

Two or more errors in the same direction → a standing adjustment to how bands are assigned (`learning_protocol.md` §6).

> *No scored predictions yet.* Populated at review, from each record's Validation section.

---

## 3. Inference accuracy

Whether Business Memory extraction heuristics are biased. Sourced from founder corrections of `inferred` values (`onboarding/memory_protocol.md` §5).

| Category | Inferred | Corrected | Notes |
| :--- | :-: | :-: | :--- |
| Industry / segment | 0 | 0 | — |
| Business model | 0 | 0 | — |
| Stage | 0 | 0 | — |
| Ideal customer | 0 | 0 | — |
| Value proposition | 0 | 0 | — |

**Two or more corrections in one category means the inference rules for that category are wrong** and should be revised in `memory_protocol.md` §3 — not merely noted here. Repeating a known-bad inference is the failure this table exists to prevent.

> *No corrections recorded yet.*

---

## 4. Routing accuracy

Whether executive activation is selecting the right lenses. Version 1 routing heuristics are explicitly provisional pending behavioural validation (`reasoning_rules.md` §3).

| Lens | Activations | False positives | False negatives |
| :--- | :-: | :-: | :-: |
| CEO | 0 | 0 | 0 |
| CFO | 0 | 0 | 0 |
| COO | 0 | 0 | 0 |
| Sales/GTM | 0 | 0 | 0 |
| Product | 0 | 0 | 0 |
| Coach | 0 | 0 | 0 |

- **False positive** — activated, contributed nothing to the final recommendation.
- **False negative** — suppressed, and the review showed its domain held the deciding factor. **The more expensive error**, and much harder to detect: nothing in the output points at what was never said.

Watch the Coach row specifically. Its suppression rule is deliberately strict — topic gravity alone never activates it — so a pattern of Coach false negatives would indicate that rule is too aggressive, and a pattern of false positives would confirm it is correctly tight.

> *No routing errors recorded yet.*

---

## 5. Override rate

Where founder judgment and advice systematically diverge. Sourced from records with `founder_override: yes`.

| Domain | Recommendations | Overridden | Override sound in review |
| :--- | :-: | :-: | :-: |

> *No overrides recorded yet.*

**Reading this table honestly matters more than filling it.** A high override rate in one domain has two possible causes, and they demand opposite responses: the advisor may be systematically wrong in that domain, or the founder may hold private context the advisor lacks. The `override sound in review` column is what distinguishes them. Never assume the advisor was right; never assume the founder was.

---

## 6. Founder decision patterns

Observed tendencies affecting decision quality, raised during S5 when relevant.

**Requires cited evidence from at least two decision records.** Self-reported traits belong in Business Memory under founder capacity; this section holds only what has been *observed in outcomes*. Self-report and observed behaviour are different evidence classes.

> *No patterns established yet.* This section stays empty until reviews produce evidence. An empty section here is a correct state, not a gap to fill.

---

## 7. Recurring reasoning failures

Failure modes in the advisor's own reasoning, distinct from founder patterns. Sourced from the Luck and Instructive-failure quadrants (`learning_protocol.md` §3).

> *None recorded yet.*

Candidates to watch, given the system's known design tensions — **not yet observed, and not to be recorded as findings until they are:**

- Suppression leakage — a suppressed lens appearing as a hedge or caveat.
- Budget inflation — Full deliberation applied to Focused-grade questions.
- Validation vagueness — signals written unfalsifiable, making later review impossible.
- Inference laundering — an `inferred` memory value used as a Known Fact.

---

## 8. Review queue

Decision records awaiting review, earliest first. Raise overdue items once, unprompted.

| Record | Decided | Review due | Status |
| :--- | :--- | :--- | :--- |

> *No records yet.* The first entry appears when the first Decision Record is written.

---

## 9. Runtime instrumentation

**Purpose: validation telemetry for Milestone 6. Not a learning input.**

Written by Phase D2 (`execution_pipeline.md` §5). Counters only — these record what the runtime did, so M6 can check that behaviour matches architectural intent.

> **Do not optimize against these metrics.** They exist to detect divergence between implementation and design, and a system tuned to make its own telemetry look healthy has destroyed the only signal it had. Adjustments still require the `learning_protocol.md` §6 path: two cited instances and a completed review.

**Overlap with §2 and §4 is deliberate but not duplicated.** Activation frequency, routing errors, and confidence-calibration error are *learning* measurements owned by those sections. This section counts raw runtime events and cites those sections rather than recomputing them.

### Lens activation and suppression

| Lens | Activated | Suppressed | Suppression rate |
| :--- | :-: | :-: | :-: |
| CEO | 0 | 0 | — |
| CFO | 0 | 0 | — |
| COO | 0 | 0 | — |
| Sales/GTM | 0 | 0 | — |
| Product | 0 | 0 | — |
| Coach | 0 | 0 | — |
| Risk Officer | 0 | 0 | — |
| Devil's Advocate | 0 | 0 | — |

Routing false positives and negatives are tracked in §4. A lens at 100% activation or 0% activation across a meaningful sample indicates its eligibility criteria are not discriminating.

### Reasoning budget distribution

| Budget | Requests | Share |
| :--- | :-: | :-: |
| Minimal | 0 | — |
| Focused | 0 | — |
| Full | 0 | — |
| Maximum | 0 | — |

The expected shape is **heavily weighted toward Minimal and Focused.** A distribution skewed to Full or Maximum means triage is inflating — the budget system exists to prevent exactly that, so a skew here indicates the mechanism is not working rather than that the founder faces unusually hard decisions.

### Intervention overlay

| | Count |
| :--- | :-: |
| Overlay attached | 0 |
| Of those, founder-confirmed as relevant | 0 |

Attachment without confirmation is the signal to watch. The Coach lens's suppression rule is deliberately strict, so frequent unconfirmed attachment means B2 detection is too eager.

### Command usage and consistency

| Command | Invocations | Completed as specified | Deviations |
| :--- | :-: | :-: | :--- |
| `/deliberate` | 0 | 0 | — |
| `/stress-test` | 0 | 0 | — |
| `/decision-log` | 0 | 0 | — |

**Consistency** means the command followed its documented execution path — notably that `/deliberate` never de-escalated below Full, and that `/stress-test` did not silently re-derive a prior deliberation. Record deviations with the reason.

### Output and assumption integrity

| Metric | Count | Notes |
| :--- | :-: | :--- |
| EAM generated when required | 0 | Full/Maximum budget should always produce one |
| EAM generation failures | 0 | Investigate each; there is no acceptable rate |
| Unresolved assumptions carried | 0 | Items in *What Must Be True* never tested by review |
| `inferred` values used as load-bearing | 0 | Must appear in *What Must Be True* and cap confidence at Moderate |

**Unresolved assumptions are the metric most likely to reveal a real defect.** An assumption that is never tested means the Validation section was written unfalsifiable — the decision was logged but is not actually reviewable, and the learning loop is open.

> *No runtime data yet.* Populated from the first interaction that reaches Phase D2.
