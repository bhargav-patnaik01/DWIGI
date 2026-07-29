# M6 Validation Findings

Gate results, defect report, and production readiness assessment.

**Validation date:** 2026-07-27 · **Commit under test:** `a1efb7f`

---

## 0. Revision — post-approval remediation

The original report below is preserved unedited. This section records what changed after the founder's rulings, so the audit trail stays intact.

**Rulings that resolved open questions:** Intervention-as-overlay ratified with "never reduce the reasoning budget" — this supplied the missing decision for DEF-003. Procedural activation approved — this supplied the mechanism for DEF-002 and DEF-006. Existential thresholds approved as Version 1 guidance. Matrix split into `executive_matrix.md` (personas) + `reasoning_rules.md` (rules) approved.

| Defect | Severity | Status | Where fixed |
| :--- | :--- | :--- | :--- |
| DEF-001 | Medium | **Fixed** | `business_memory.template.md` §12 — thirteen, not nine |
| DEF-002 | High | **Fixed** | `reasoning_rules.md` §5 — displacement rule with worked case |
| DEF-003 | High | **Fixed** | `reasoning_rules.md` §6 — structure suspended, substance preserved |
| DEF-004 | High | **Fixed** | `reasoning_rules.md` §8 — mapping in the reasoning layer, applied at S2 |
| DEF-005 | Medium | **Fixed** | `reasoning_rules.md` §2 — S6 scoped by budget |
| DEF-006 | Medium | **Fixed** | `reasoning_rules.md` §1 — Layer-1 admission enters as Support |
| DEF-007 | Low | **Fixed** | `reasoning_rules.md` §2 — Risk added to the Focused row |
| DEF-008 | Low | **Fixed** | `stress-test.md` — Minimal runs zero lenses |
| DEF-009 | Low | **Fixed** | `business_memory.template.md` §12 — priority order restored |
| DEF-010 | Medium | **Fixed** | `reasoning_rules.md` §8 — `imported` anchored by source quality |

**All ten defects resolved.**

**DEF-004 was fixed differently than I proposed, and better.** I recommended moving the provenance table into the kernel. The founder rejected that — provenance belongs to the reasoning layer, not the always-resident operating system — and the ruling exposed an error in my own diagnosis: **the mapping is not needed at boot at all.** It is needed at S2, which only runs at Focused budget and above, exactly where `reasoning_rules.md` is already loaded. Phase A3 was over-reaching by claiming to perform the conversion; it now carries provenance forward verbatim and S2 converts it. The kernel grew by nine words (a pointer) instead of sixty.

**Gate status after remediation:**

| Gate | Status |
| :--- | :--- |
| **GATE 0** | **CANNOT CERTIFY** — unchanged. Real-world certification exercise, founder-judged. |
| **GATE 1** | **PENDING BEHAVIORAL** — specification defects cleared; needs `SCENARIOS.md` §1–8. |
| **GATE 2** | **APPROVED** — all three blocking contradictions resolved. |
| **GATE 3** | **PASS WITH FINDINGS** — unchanged; re-verified after the split. |

**Post-split integrity re-verified:** all cross-references resolve after 19 reference rewrites, ADRs resolve, terminology clean, company-agnostic, peak read path 6 files.

---

## 1. What was actually verified

| Class | Requirements | Verified | Method |
| :--- | :-: | :-: | :--- |
| **Static** — inspectable | 7 | **7** | Mechanical checks, executed |
| **Behavioral** — requires observation | 51 | **0** | Suite designed, not run |

**Static checks executed and passed:**

| Check | Result |
| :--- | :--- |
| Cross-reference integrity — every `file.md §N` resolves | **19/19 resolve** |
| ADR reference validity — every `ADR-0NN` cited exists | **10/10 resolve** |
| Terminology consistency — no stale `business_context`, `Deliberation mode`, `Counsel mode` | **Clean** (one intentional "superseded" note) |
| Company-agnostic (R-29) — no company specifics in system files | **Clean** |
| Command discoverability (R-50) — files present, frontmatter valid | **3/3 valid** |
| Command thinness (R-51) — every rule traceable to a core document | **Pass** — no locally-originated rules |
| Routing table lens counts (R-03, table only) | **12/12 rows within 2–4** |

**Static checks also surfaced 10 defects** (§3). Nine were found by adversarial reading of the specification rather than by the mechanical checks — which is worth noting, because it means the mechanical checks are necessary but far from sufficient.

---

## 2. Gate reviews

### GATE 0 — Onboarding experience: **CANNOT CERTIFY**

**Not a pass, not a fail. Uncertifiable by me.**

The gate's own definition, written at M5, says it "cannot be approved by reading documentation" and requires "one full onboarding simulation." I can produce a transcript. I cannot produce *evidence*, because I would be authoring both the founder's turns and the advisor's while looking at the eight acceptance criteria. Such a transcript would pass by construction and prove nothing.

Two criteria are especially resistant to self-assessment:

- **R-33 (follow-ups emerge naturally)** — I cannot judge whether my own question felt like curiosity or like field collection. That is a perception in the founder, not a property of the text.
- **R-35 (no completion pressure)** — the pressure a founder feels is not visible in the transcript that produced it.

**To close this gate:** start a fresh session in this repository with no `core/business_memory.md`, say one honest sentence about your business, and let it run. Then score the four qualities in `VALIDATION_MATRIX.md` §10. All four must reach 2. **You are the only valid judge here.**

### GATE 1 — Executive routing: **BLOCKED**

Static portion passes: all 12 domain rows activate 2–4 constructive lenses, tiers are consistent, per-lens criteria are present and non-contradictory in isolation.

**Blocked by DEF-002 and DEF-006.** The 2–4 lens invariant holds for the table in isolation but is **violable once overrides or Layer-1 activation apply** — and the runway-under-six-months override reaches 5 lenses on at least two rows. GATE 1 cannot pass while a documented override breaks a documented invariant. Behavioral re-validation via `SCENARIOS.md` §1–8 remains outstanding regardless.

### GATE 2 — Runtime behavior: **FAIL**

Does the implementation follow the architecture? **In three places, the architecture does not follow itself** — and these were found by inspection, before any behavioral test ran.

- **DEF-003** — Intervention overlay and the EAM output contract issue contradictory instructions for the same interaction.
- **DEF-004** — Phase A3 requires a provenance mapping that is not in context when A3 runs.
- **DEF-005** — the S6 verdict contract is ambiguous at Focused budget.

A runtime cannot be validated against a specification that contradicts itself at these points, because both behaviors are compliant. **Fix, then re-run.**

### GATE 3 — Long-term maintainability: **PASS WITH FINDINGS**

The one gate I can genuinely certify, because maintainability is a property of the artifacts rather than the behavior.

| Dimension | Verdict | Evidence |
| :--- | :--- | :--- |
| Section reference integrity | **Pass** | 19/19 resolve |
| Documentation drift | **Pass** | Terminology clean across 13 files |
| ADR traceability | **Pass** | 10/10 cited ADRs exist; 3 amendments recorded, none silent |
| Command consistency | **Pass** | All three thin; no duplicated logic |
| Ownership clarity | **Pass** | Every file has one owner and one trigger (`CLAUDE.md` §11) |
| Architectural drift | **Findings** | ADR-007's file bound was breached and amended at M5; the amended bound (≤6 files per interaction) is now at its limit, and DEF-004's fix would push it to 7 |
| Extensibility | **Pass** | Ingestion contract (`memory_protocol.md` §7) and FE-01's data/analysis split both isolate future work |

**Findings:**

1. **Nothing validates the 19 cross-references automatically.** The M5 regression — the EAM moving from §2 to §7 while two files still pointed at §2 — proves they break silently. `docs/validation/` now contains the checker used here; it should run at every milestone.
2. **Instrumentation is manually incremented** by the model at Phase D2. Nothing enforces it, and undercounting will be biased toward exactly the events the model fails to notice — suppression leakage and unresolved assumptions, the two metrics with no acceptable failure rate.
3. **Peak context is at the amended bound.** Six files at ~20k tokens. The next core file requires re-measuring, not just adding.

---

## 3. Defect report

Severity: **High** = breaks an approved architectural promise · **Medium** = produces inconsistent behavior · **Low** = factual or cosmetic error.

### Architecture defects

---

**DEF-002 · High · Lens-count invariant is violable by override**

- **Repro:** Set `runway_months: 4 (confirmed)`. Ask a "Product scope & roadmap" or "Churn & retention" question. Both rows activate 4 constructive lenses with CFO silent.
- **Expected:** 2–4 constructive lenses (`CLAUDE.md` §7; `reasoning_rules.md` §3).
- **Observed:** The runway override promotes "CFO to Lead **on every domain**" (§11), producing **5 active lenses**.
- **Affected:** ADR-004, ADR-009.
- **Fix:** State a displacement rule in §11 — when an override promotes a lens into a row already at 4, the lowest-weighted Support lens is displaced to Silent. Survival outranking optimization should *reallocate* attention, not expand it.
- **Why it matters:** this fires precisely when runway is short, i.e. when signal discipline matters most.

---

**DEF-003 · High · Intervention overlay contradicts the EAM output contract**

- **Repro:** Scenario FO-1 or AD-8 — an existential decision from a visibly depleted founder.
- **Expected:** One unambiguous output form.
- **Observed:** `CLAUDE.md` §5 — "Intervention is the one path with **no output template, deliberately**." `CLAUDE.md` §9 — "Full and Maximum produce an **Executive Action Memo**." The overlay attaches to any budget, so both apply. Compounded by `calibration_journal.md` §9, which measures "EAM generated when required" at a **100% target with no acceptable failure rate** — making the overlay path count as a defect either way.
- **Affected:** No ADR directly; contradicts M5's ratified "leadership and tone only" clarification.
- **Fix:** Rule that the overlay **suspends the memo template while preserving every section's content obligation** — the reasoning still establishes recommendation, assumptions, downside, confidence, and next action; it is delivered as prose rather than headings. Then exempt overlay interactions from the EAM structural metric while still requiring the content.
- **Why it matters:** undefined behavior at the emotionally hardest moment, which is the worst possible place for it.

---

**DEF-004 · High · Provenance mapping is not in context when it is required**

- **Repro:** Any Full-budget decision using memory.
- **Expected:** Phase A3 maps each field to an epistemic weight "per `business_memory.template.md` §2 — the canonical provenance mapping."
- **Observed:** `CLAUDE.md` §4 boot loads only `business_memory.md` and `calibration_journal.md`. §11's read-when table lists the template for **onboarding only**. The canonical five-value mapping is therefore absent at boot. `CLAUDE.md` §14 rule 3 carries a partial version — `confirmed` → Known Fact, `inferred` → Assumption — but omits `corrected`, `imported`, and `unknown`.
- **Affected:** ADR-010 directly. Provenance-driven epistemic weighting is the central mechanism ADR-010 was written to deliver.
- **Fix:** Move the five-value mapping into `CLAUDE.md` §14 as a compact table — it is contract, not mechanics, so it belongs in the kernel. The template then cites the kernel rather than owning the mapping. **This resolves the hidden coupling without adding a seventh file to the read path.** Costs roughly 60 kernel words; DEF-001's fix and existing trims can fund it.
- **Why it matters:** the highest-value mechanism in the system depends on a table that is not loaded when it is used.

---

**DEF-005 · Medium · S6 verdict contract ambiguous at Focused budget**

- **Repro:** Any Counsel-mode question.
- **Expected:** Unambiguous verdict requirement.
- **Observed:** `CLAUDE.md` §6 — "S6 always returns a verdict… Deliberation that ends without one of these three has not finished." §5's budget table runs Focused as S1, S2, S4, S7 — **S6 omitted**. Whether a Counsel answer owes a verdict is undefined.
- **Affected:** None directly.
- **Fix:** Scope the §6 property explicitly to Full and Maximum, and state that Focused carries an implicit *Act* unless it says otherwise.

---

**DEF-006 · Medium · Layer-1 activation against a Silent table cell is undefined**

- **Repro:** Strategic pivot where the founder shows state signals — Coach's activation criteria fire while §9 marks Coach Silent.
- **Expected:** A general precedence rule and a resulting tier.
- **Observed:** §9 covers only one direction: "Layer 1 can suppress a lens this table marks active." The reverse is addressed narratively for Coach on one row, with **no tier specified** for a lens that enters this way. Compounds DEF-002.
- **Affected:** ADR-009.
- **Fix:** State that a lens entering via Layer-1 activation against a Silent cell enters as **Support**, and is subject to the same displacement rule as DEF-002.

---

**DEF-010 · Medium · `imported` provenance weight underspecified**

- **Observed:** `imported` maps to "Strong or Weak Evidence, **by source quality**" with no rule for which. Two sessions will weight the same value differently.
- **Affected:** ADR-010.
- **Fix:** Anchor it — financial model or signed contract → Strong; website, deck, or CRM note → Weak. Default to Weak when the source is unrecorded.

### Implementation defects

---

**DEF-001 · Medium · Required-field count is wrong**

- **Observed:** `business_memory.template.md` §12 states "The **nine** `●` fields," then lists 13. Counting `●` markers in the tables also yields **13**.
- **Fix:** Correct to thirteen. Also restore the prioritization lost in the ADR-010 migration (see DEF-009) — thirteen required fields against a five-follow-up cap needs a stated priority order.

---

**DEF-007 · Low · Risk Officer at Focused budget missing from the kernel table**

- **Observed:** `executive_matrix.md` §7 — Risk "activates the moment irreversibility or legal exposure appears" at Focused. `CLAUDE.md` §5's Focused row lists only "DA only if founder appears committed."
- **Fix:** Add Risk's conditional activation to the Focused cell.

---

**DEF-008 · Low · `/stress-test` misstates Minimal-budget lens count**

- **Observed:** "Target was answered at Minimal or Focused budget — say that only 1–2 lenses ran." Minimal runs **zero** lenses.
- **Fix:** "…no lenses ran (Minimal) or only 1–2 did (Focused)."

---

**DEF-009 · Low · "Minimum viable fill" guidance lost in migration**

- **Observed:** The deleted `business_context.md` carried a six-field prioritized table naming what unlocked most of the system. `business_memory.template.md` §12 lists required fields without prioritization.
- **Fix:** Restore a priority order in §12 — stage, runway, binding constraint, non-negotiables, ideal customer, north star.

### Defect summary

| Severity | Architecture | Implementation | Total |
| :--- | :-: | :-: | :-: |
| High | 3 | 0 | **3** |
| Medium | 3 | 1 | **4** |
| Low | 0 | 3 | **3** |
| | **6** | **4** | **10** |

**All ten are specification defects found by inspection.** Zero behavioral defects are reported — not because none exist, but because **no behavioral test has been run.** Treat the empty behavioral column as the largest unknown in this report, not as a clean result.

---

## 4. Production readiness assessment

### Strengths — evidenced

- **Documentation integrity is genuinely high.** 19/19 references resolve, 10/10 ADRs resolve, terminology clean across 13 files, every file has one owner and one trigger. This is better than most production repositories.
- **Every architectural change is traceable.** Ten ADRs, three amendments, zero silent revisions. The ADR-007 breach was reported rather than absorbed.
- **The learning design is unusually rigorous.** Separating decision quality from outcome quality, deriving adjustments only from reasoning failures, requiring two instances, and forbidding deletion are the right mechanisms — and the Luck quadrant being named as the dangerous one is a genuine insight most decision journals lack.
- **Kernel discipline holds.** 3,196 words with mechanics permanently redirected. The refactor's own failure (net-increasing on the first pass) was caught by measurement.

### Weaknesses — evidenced

- **Three High-severity self-contradictions** in the specification, all in load-bearing paths: provenance weighting, intervention output, and the lens-count invariant under override.
- **Nothing in the system is behaviorally verified.** 51 of 58 requirements unverified.
- **Almost every guarantee is behavioral rather than structural.** Suppression absoluteness, hindsight avoidance, and honest Luck classification cannot be enforced by any artifact — only observed.
- **Instrumentation is self-reported by the entity being measured**, with bias pointing away from the two metrics that have no acceptable failure rate.

### Debt

| Type | Item |
| :--- | :--- |
| **Architectural** | DEF-002, 003, 004, 005, 006, 010. ADR-007's amended bound at its limit. |
| **Implementation** | DEF-001, 007, 008, 009. No automated reference validation in CI. |
| **Behavioral** | 51 unverified requirements. GATE 0 uncertified. GATE 1 blocked. GATE 2 failed. The entire adversarial suite unrun — including AD-7, which targets the failure mode I consider most likely. |

### Remaining risks

| Risk | Severity | Mitigation |
| :--- | :--- | :--- |
| Luck-quadrant under-reporting | **High** | Flagged since M4. Run AD-7. Twenty reviews with zero Luck classifications is evidence of dishonest application. |
| Suppression leakage | **High** | Run AD-4. Adding a hedge always feels helpful; nothing in the output signals wrongful inclusion. |
| Financial inference | **High** | Run AD-3. A single invented runway figure silently flips the override that reshapes everything downstream. |
| Confidence bands uncalibrated | Medium | Unavoidable — needs ~20 scored decisions. Until then bands are asserted, not earned. |
| Onboarding feels like a form | Medium | Run GATE 0. |
| References break on restructure | Low | Run the checker each milestone. |

---

## 5. The direct question

> **"If this repository were frozen today, would I confidently use it every day as my own Executive Chief of Staff?"**

**I would use it daily. I would not yet trust its confidence claims.** Those are different answers and the distinction is the whole finding.

**Why I'd use it.** The reasoning scaffolding delivers value on the first interaction and does not depend on any unverified mechanism. Forcing a real question out of a stated one, tagging what a decision actually rests on, naming the weakest assumption, requiring a verdict rather than a survey, and refusing to present three options without a pick — these improve decisions immediately, and the ten defects do not touch them. Even the High-severity defects degrade rather than break: DEF-002 produces one extra lens's noise, DEF-005 produces an occasionally missing verdict.

**Why I would not trust its confidence claims.** Two specific things:

1. **DEF-004 means provenance weighting may not work at all.** The five-value mapping is not in context when the step that needs it runs. The partial kernel version covers `confirmed` and `inferred` but not `imported`, `corrected`, or `unknown`. Since provenance→epistemic weighting is the mechanism that keeps the advisor from treating its own guesses as facts, this is the difference between a disciplined advisor and a fluent one. **Fix this before anything else.**
2. **Calibration is asserted, not earned.** With zero scored decisions, every confidence band is a claim about a track record that does not exist. The bands are honest in form and unvalidated in substance, and it will take roughly twenty reviewed decisions before they mean anything.

**What would change my answer to unqualified yes:**

1. Fix DEF-004, DEF-003, DEF-002 — all specification edits, likely under an hour.
2. Run GATE 0. It is one conversation and you are the only valid judge.
3. Run the adversarial suite, specifically AD-3, AD-4, AD-7.
4. Accumulate ~20 reviewed decisions before treating calibration output as meaningful.

**The honest bottom line:** this is a well-engineered, internally traceable, unusually disciplined *specification* with three real self-contradictions and no behavioral evidence. As a thinking instrument it is ready now. As a *calibrated* advisor — one whose stated confidence means something — it is unproven, and it cannot become proven without decisions accumulating over months. Anyone claiming otherwise from a self-generated transcript would be selling certainty the system has not earned, which is precisely the failure it was designed to prevent.

---

## 6. Recommended sequence

1. **Fix DEF-004** — highest value, smallest change. Move the provenance table into the kernel.
2. **Fix DEF-003 and DEF-002** — both resolve contradictions in load-bearing paths.
3. **Fix the four implementation defects** — mechanical.
4. **Re-run static checks.** Confirm reference integrity survives the edits; the M5 regression came from exactly this kind of change.
5. **Run GATE 0** in a fresh session with no memory file.
6. **Run the adversarial suite.** AD-3, AD-4, AD-7 first.
7. **Then** re-attempt GATE 1 and GATE 2 with behavioral evidence.

Steps 1–4 are mine to do on your approval. **Steps 5–7 require you, or an independent session** — that is not a limitation of effort but of what validation means.

---

## 7. Post-split context bound (added at remediation)

Splitting the matrix improved cohesion and created a real cost. Both should be on the record.

**Measured read path after the split:**

| Interaction | Files | Count |
| :--- | :--- | :-: |
| Minimal (recall) | kernel, memory, calibration | 3 |
| Focused / Full | + executive_matrix, reasoning_rules, execution_pipeline | **6** |
| Writing a Decision Record | + learning_protocol | **7** |
| First run (onboarding) | kernel, memory_protocol, template | 3 |

**ADR-007's amended bound is ≤6 files per interaction. Writing a Decision Record now needs 7.**

This is a genuine breach, not a rounding issue, and it is the second time this bound has been crossed — which suggests the bound itself may be the wrong instrument, exactly as the numeric file count was before it.

**Assessment:** the breach is narrow and low-harm. It occurs only in the record-writing path, after the recommendation has already been delivered, so it adds no latency to the founder's actual decision. Peak token load is ~22,000 — still well inside a modern context window.

**Three options, for the founder to choose:**

1. **Accept and re-amend the bound to 7.** Honest, and admits the bound tracks a cost that has not yet materialized. Weakest in that a bound revised twice under pressure is not much of a bound.
2. **Drop `execution_pipeline.md` from the record-writing path.** Defensible: by the time a record is written, the memo already exists, so the EAM specification is no longer needed. Requires stating that explicitly in `learning_protocol.md` §2 so it is a rule rather than an accident. **Recommended** — it holds the bound without merging anything.
3. **Merge `learning_protocol.md` into `execution_pipeline.md`.** Restores 6 but produces a ~4,900-word file at the per-file ceiling, and mixes decision-time mechanics with review-time mechanics. Not recommended.

**Recommendation: option 2.** It is the only one that keeps the bound meaningful without degrading cohesion — and it is true on the merits rather than convenient.

### Resolution — Option 2 approved and implemented

The founder declined to relax the bound a second time. Option 2 is implemented: `execution_pipeline.md` is no longer read when writing a Decision Record, stated as a rule in `learning_protocol.md` §2 and enforced in `.claude/commands/decision-log.md`. Recorded as ADR-007 amendment 2.

**Measured after the fix:**

| Interaction | Files |
| :--- | :-: |
| Minimal (recall) | 3 |
| Focused / Full | 6 |
| **Writing a Decision Record** | **4** |
| Reviewing a record | 5 |
| First run (onboarding) | 3 |

The record-writing path is now *cheaper than before the split* — 4 files against 6 previously. **The precedent matters more than the number: when a bound is threatened, remove a dependency before widening the exception.** `check-references.sh` reports the path and passes.
