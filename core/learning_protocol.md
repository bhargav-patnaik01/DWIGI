# Learning Protocol

The Decision Record schema, the review procedure, and how calibration is derived.

**Read this file when** writing a Decision Record, conducting a review, or proposing a calibration adjustment. Not needed for ordinary decision work.

---

## 1. Anti-duplication principle

Four artifacts touch a decision. Each owns something the others do not, and **none restates another**:

| Artifact | Owns |
| :--- | :--- |
| **Executive Action Memo** | The recommendation as delivered to the founder |
| **Decision Record** (`journal/DEC-*.md`) | The memo frozen, plus what was known at the time, plus the later review |
| **Business Memory** | Current company facts |
| **Calibration Journal** | Cross-decision aggregates and active adjustments |

**The Decision Record is not a summary of the memo. It contains the memo.** Copied verbatim, unedited, frozen. Writing a second prose account of the same reasoning would guarantee the two drift, and a reviewer would have no way to know which was authoritative.

The Calibration Journal never copies a decision. It **links** to record IDs. If you find yourself restating a decision's reasoning in calibration, you are duplicating — record the pattern and cite the ID.

---

## 2. Decision Record schema

Filename: `journal/DEC-YYYYMMDD_kebab-slug.md`

### Front matter — what was known at the time

This block is the traceability layer, and it is the part a future reviewer needs most. Without it, they can read the reasoning but cannot judge it, because they cannot tell what the advisor was working from.

```yaml
---
id: DEC-YYYYMMDD_slug
date: YYYY-MM-DD
domain: <routing domain, or "unlisted: description">
mode: Direct | Counsel | Deliberation | Existential
budget: Minimal | Focused | Full | Maximum
intervention_overlay: no | yes

lenses_s4:                  # constructive lenses and tier
  - CFO (Lead)
  - Sales/GTM (Lead)
  - CEO (Support)
lenses_s5:                  # challenge lenses that ran
  - Risk Officer
  - Devil's Advocate
models: [<2-3 mental models applied>]

memory_basis:               # every memory field the reasoning relied on
  - stage: Pre-PMF (confirmed, 2026-07-01)
  - runway_months: 9 (confirmed, 2026-07-20)
  - ideal_customer: unknown
  - business_model: subscription (inferred, unconfirmed)

confidence: High | Moderate | Low
verdict: Act | Gather information | Deliberately do nothing
review_date: YYYY-MM-DD
status: open | reviewed | superseded
founder_override: no | yes
supersedes: <id or none>
superseded_by: <id or none>
---
```

**`memory_basis` must record provenance, not just values.** "runway 9 months" and "runway 9 months (inferred)" are different decisions, and only one of them was defensible.

**`founder_override: yes`** requires the founder's reasoning recorded in their own framing in Part 1, appended below the memo. Never characterize, soften, or editorialize it — that record exists to be read against the outcome later, and a paraphrase you wrote while disagreeing is not evidence.

### Part 1 — The memo, as delivered

The Executive Action Memo exactly as the founder received it. **Frozen on write.** Never edited, ever, for any reason.

**Do not read `execution_pipeline.md` to write a record.** The memo already exists — it was delivered moments ago and is present in the conversation. Copy it verbatim; there is nothing to look up. Loading the memo *specification* to transcribe a memo that has already been produced is redundant work, and it is the reason the record-writing path stays within ADR-007's six-file bound. If you find yourself consulting the spec here, you are reconstructing the memo rather than copying it — which is exactly the drift the verbatim rule exists to prevent.

If the founder overrode the recommendation, append their stated reasoning here, labelled and verbatim.

### Part 2 — Review

Left empty until the review date. Then filled in this order — the order matters, because assessing reasoning before knowing the outcome is impossible, and assessing it *after* is where hindsight contaminates everything.

```markdown
## Review — YYYY-MM-DD

### What happened
<Outcome in plain terms.>

### Prediction scoring
| Predicted signal | Stated | Resolved |
| :--- | :-: | :-: |
| Lead volume within 20% of baseline | 70% | Yes |
| No existing account raises pricing | 85% | No |

### External factors
<What moved that this decision neither caused nor could have anticipated.
 Be strict: a factor that was foreseeable is not external, and calling it
 external is the most common way a flawed decision escapes assessment.>

### Assumption audit
| Assumption from "What Must Be True" | Held? |
| :--- | :-: |
| ... | Yes / No / Untested |

### Decision quality
<Sound or flawed — judged ONLY on information available on the decision
 date. Cite the memory_basis. If the reasoning was sound given what was
 known, say so even though the outcome was bad.>

### Outcome quality
<Good or bad. Independent of the above.>

### Quadrant
<Validated | Variance | Luck | Instructive failure — see §3>

### Lessons
<What would be done differently by an advisor who knew only what was
 knowable then. If nothing — say nothing changes.>

### Calibration adjustments proposed
<Reference CA IDs, or "none — outcome variance, no process change.">
```

---

## 3. Decision quality vs outcome quality

**These are independent.** Conflating them is the central failure this protocol exists to prevent: an advisor that learns from outcomes alone learns to chase variance, and will confidently adopt whatever process happened to precede good luck.

|  | **Good outcome** | **Bad outcome** |
| :--- | :--- | :--- |
| **Sound decision** | **Validated** — process worked. Reinforce, don't inflate. | **Variance** — the process was right and the dice were bad. |
| **Flawed decision** | **Luck** — the dangerous quadrant. | **Instructive failure** — the honest lesson. |

### Quadrant rules

- **Validated** — record it, and resist concluding more than one data point supports. A validated decision does not prove the heuristic; it fails to refute it.
- **Variance** — **change nothing about the process.** Overcorrecting here is how a sound heuristic gets discarded because of one bad roll. Note explicitly that no adjustment follows.
- **Luck** — **the most dangerous outcome in the system**, and the one requiring the loudest flag. A good result rewards and entrenches a bad process, and nothing in the outcome signals a problem. Calibration adjustments are mandatory here, precisely because nothing else will prompt them.
- **Instructive failure** — the real lesson. Extract the adjustment, name what a better reasoner would have caught.

**Calibration adjustments derive from decision-quality failures, never from outcome failures.** This is the rule that makes the framework operative rather than decorative.

### Calibration error — a second, orthogonal axis

The quadrant above compares **decision quality to outcome quality**. Calibration error compares **stated confidence to decision quality**. These are different measurements and must never be conflated: the quadrant asks *was the reasoning sound*, calibration error asks *did we know how sound it was*.

|  | **Reasoning sound** | **Reasoning flawed** |
| :--- | :--- | :--- |
| **Stated High** | Calibrated | **Overconfidence** |
| **Stated Low** | **Underconfidence** | Calibrated |

- **Overconfidence** — High or Moderate confidence on reasoning the review found flawed. The advisor did not know what it did not know. Consequence: the founder acted with unwarranted certainty. This is the more dangerous error, because confident advice suppresses the founder's own scepticism.
- **Underconfidence** — Low or Insufficient confidence on reasoning the review found sound. Consequence: hedged advice nobody could act on, or a decision needlessly delayed. Chronic underconfidence makes the advisor useless in a different way — it converts every recommendation into a disclaimer.
- **Calibrated** — confidence tracked reasoning quality, whatever the outcome. **This is the goal, and it is independent of being right.**

Assess this at every review, and record it in `calibration_journal.md` §2 alongside prediction scoring. Two rules:

- **Calibration error is scored against reasoning quality, never against the outcome.** A High-confidence recommendation that was soundly reasoned and turned out badly is **calibrated, not overconfident** — that is the Variance quadrant, and treating it as overconfidence would train the advisor to hedge everything.
- **Persistent error in one direction is a calibration adjustment**, not an observation. Two or more instances → a standing adjustment per §6 shifting how bands are assigned.

### Judging on information available at the time

The single hardest discipline in this protocol. Concretely:

- Read `memory_basis` **before** reading the outcome. Reconstruct what was actually known.
- A risk that was `unknown` in memory and genuinely unknowable is not a reasoning failure.
- A risk that was recorded in `open_questions` and ignored **is** a reasoning failure.
- "We should have known" requires showing where it was knowable — a source that existed, a question that should have been asked, a lens that was wrongly suppressed. Without that, it is hindsight, not a lesson.

---

## 4. Review procedure

1. **Trigger.** The record's `review_date` passes, or the outcome resolves earlier. Raise overdue reviews once, unprompted (`CLAUDE.md` §10).
2. **Reconstruct first.** Read front matter and Part 1 *before* investigating the outcome. Establish the information state on the decision date.
3. **Resolve predictions.** Score each Validation signal against what happened. Unresolved is a valid result — mark it and set a new date.
4. **Audit assumptions.** Each item in *What Must Be True*: held, failed, or never tested. "Never tested" is itself a finding about the decision's design.
5. **Separate the two qualities.** Assign the quadrant. Do this explicitly rather than implicitly — the explicit label is what prevents the Luck quadrant from passing as success.
6. **Extract adjustments** only where decision quality was flawed.
7. **Write Part 2. Set `status: reviewed`.** Part 1 stays frozen.
8. **Update the Calibration Journal** with aggregates and any new adjustments.

---

## 5. Calibration inputs

The advisor learns along **five dimensions**. Each has its own source and its own ledger section, and none is inferred from another.

| Dimension | Source | Measures | Ledger |
| :--- | :--- | :--- | :-: |
| **Reasoning quality** | Quadrant assignment at review | Whether decisions were soundly reasoned given what was known | §7 |
| **Confidence calibration** | Prediction scoring + calibration error (§3) | Whether stated certainty matched actual reasoning quality | §2 |
| **Extraction quality** | Memory corrections (`memory_protocol.md` §5) | Whether inference heuristics are biased by category | §3 |
| **Routing quality** | Which lenses were selected | False-positive and false-negative activations | §4 |
| **Activation quality** | Whether activated lenses contributed | Whether an active lens actually shaped the recommendation | §4 |

**Routing quality and activation quality are recorded together in §4 but are distinct questions.** Routing asks *did we pick the right lenses*; activation asks *did the lenses we picked do any work*. A lens can be correctly routed and still contribute nothing, which is a false positive; the two share a table because the second is only observable by assessing the first.

Additionally tracked, though not a learning dimension:

| Stream | Source | Measures |
| :--- | :--- | :--- |
| **Override rate** | `founder_override: yes` records | Where advice and founder judgment systematically diverge |

**Routing errors, defined:**
- **False positive** — a lens was activated and contributed nothing to the final recommendation. Its Support angle was noise.
- **False negative** — a lens was suppressed, and the review shows its domain contained the deciding factor. This is the more expensive error and the harder one to notice, because nothing in the output points at the absence.

---

## 6. Writing calibration adjustments

An adjustment is a **standing modification to future reasoning**, not an observation. If it does not change what you will do, it belongs in a record's Lessons, not in calibration.

```markdown
### CA-00N — <short pattern name>
- **Established:** YYYY-MM-DD
- **Evidence:** DEC-..., DEC-...   (two or more; one instance is an anecdote)
- **Pattern:** <what recurs>
- **Adjustment:** <what to do differently, specifically enough to execute>
- **Applies at:** <pipeline stage, or routing, or extraction>
- **Status:** active | retired (YYYY-MM-DD — why)
```

Rules:

- **Two instances minimum.** A single occurrence is an anecdote; encoding it as a standing rule overfits to noise.
- **Append-only. Never delete.** A superseded adjustment is retired with a date and a reason, and stays visible. Deleting it destroys the evidence that the system's own heuristics evolved — which is the record of *its* learning, not the founder's.
- **Attributable.** Every adjustment cites the records that produced it. An adjustment with no evidence trail cannot be audited or reversed.
- **Specific enough to execute.** "Be more careful about timelines" is not an adjustment. "When the founder states a delivery date, apply a 2× multiplier during S5 and say that you are doing so" is.
- **Never invent a pattern.** Do not infer founder tendencies from personality impressions, from the tone of a conversation, or from what founders are generally like. Only observed, dated, cited evidence from decision records.
