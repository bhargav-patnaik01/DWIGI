# Validation Matrix

Requirement-by-requirement validation plan for every architectural promise, plus the review criteria for qualitative metrics.

**These documents are QA artifacts, not system files.** They are never read during an interaction and do not count against the context-per-interaction bound in ADR-007's amendment.

---

## 1. The verification boundary

Every requirement below is classed by **how it can be established**. This classification is the most important thing in this document, because conflating the two classes is how a system acquires false confidence.

| Class | Meaning | Who can establish it |
| :--- | :--- | :--- |
| **S — Static** | Verifiable by inspecting files: structure, references, consistency, presence or absence of a rule | The engineer, mechanically and repeatably |
| **B — Behavioral** | Verifiable only by observing the advisor act on a real request | An **independent observer** — a fresh session, or the founder |

### Why the advisor cannot self-certify class B

The advisor under test is shaped by the same documents that define the pass criteria. If it generates a scenario, produces the response, and grades it against criteria it can see, three things go wrong at once:

1. **Knowing the pass criteria contaminates the output.** A transcript authored while looking at "must suppress the CFO lens" will suppress the CFO lens. That demonstrates the ability to follow a visible instruction, not that routing works when nobody is watching.
2. **The failure modes that matter are invisible from inside.** Suppression leakage, unresolved assumptions, and hindsight contamination are precisely the errors a system does not notice itself committing — that is what makes them failure modes rather than mistakes.
3. **Grading is not independent.** Defendant and judge are the same process.

**Consequence:** class-B requirements in this matrix are marked `UNVERIFIED` and stay that way until an independent observer runs them. A self-generated passing transcript is not evidence, and recording one as evidence would be the single most damaging thing this milestone could produce — it would convert an honestly incomplete system into a falsely certified one.

**What is genuinely deliverable now:** all class-S verification (executed — see `FINDINGS.md`), and the executable test design for class B (see `SCENARIOS.md`).

---

## 2. Chief of Staff & routing

| # | Requirement | Expected behavior | Method | Pass | Fail | ADR |
| :-- | :--- | :--- | :-: | :--- | :--- | :--- |
| R-01 | Single interface | No persona dialogue in normal output | B | Output reads as one advisor's synthesis | Any "the CFO argues…" outside `/stress-test` or `/lens` | 003 |
| R-01a | Runtime modes are founder-initiated | Persona dialogue only under an invoked mode | B | Default turns converge to one synthesis; `/lens` labels its scope | A turn shaped by a mode the founder did not select | 003, 008 |
| R-02 | Always converges | One primary recommendation | B | A named path, not a survey | 3 balanced options, no pick | 003 |
| R-03 | Routes 2–4 constructive lenses | Never all six | S+B | Lens count in 2–4 inclusive | 5+ active, or 1 where domain implies more | 004, 009 |
| R-04 | Layer 1 eligibility precedes Layer 2 | Suppression criteria checked before tier | B | Suppressed lens absent despite table tier | Table tier honored over suppression | 009 |
| R-05 | Overrides checked before routing | §11 conditions applied first | B | Runway <6mo promotes CFO | Domain table applied, override forgotten | 004 |
| R-06 | Challenge lenses attack a finished draft | Risk/DA never in S4 | B | S5 findings reference a formed recommendation | Challenge input shaping the draft | 004 |
| R-07 | Unlisted domain handled | Routed by Objective, stated as unlisted | B | Says domain is unlisted | Forced fit to a listed row silently | 004 |

## 3. Suppression — "Silent When"

| # | Requirement | Expected behavior | Method | Pass | Fail | ADR |
| :-- | :--- | :--- | :-: | :--- | :--- | :--- |
| R-08 | Suppression is absolute | Suppressed lens produces nothing | B | **Reader cannot tell the lens exists** | Any clause, caveat, or parenthetical from a suppressed lens | 004 |
| R-09 | No stretch angles | No invented relevance | B | Silent lens stays silent | "Worth noting on the financial side…" when CFO suppressed | 004 |
| R-10 | Coach not activated by topic gravity | Only state or committed capacity | B | Calm strategic question → no Coach | Welfare-check on a steady founder | 004 |
| R-11 | Activation/suppression collision resolved | Activation wins except Coach | B | Precedence applied as specified | Improvised resolution | 009 |

**R-08 is the highest-value behavioral test in this suite.** It is the promise most likely to fail quietly, because adding a hedge always feels more helpful than staying silent, and no output signals what was wrongly included.

## 4. Reasoning budget & intervention

| # | Requirement | Expected behavior | Method | Pass | Fail | ADR |
| :-- | :--- | :--- | :-: | :--- | :--- | :--- |
| R-12 | Budget scales with stakes | Trivial → Minimal; existential → Maximum | B | Distribution skewed to Minimal/Focused | Memo for a runway lookup | — |
| R-13 | Overspend is a failure | No memo on small questions | B | 1–5 lines for recall | Nine sections for a one-line answer | — |
| R-14 | Escalation from below | Lens *Escalates when* overrides triage | B | Focused→Full on discovered irreversibility | Stays Focused despite Type 1 | — |
| R-15 | Escalate one level, never two | Bounded escalation | B | Single-step escalation | Focused→Maximum | — |
| R-16 | Intervention changes leadership and tone only | Rigor unchanged | B | Coach leads, budget preserved | Rigor reduced, or verdict auto-deferred | — |
| R-17 | Intervention detection defaults off | False positive is worse | B | Steady founder → no overlay | Unprompted welfare-checking | — |

## 5. Epistemic discipline & provenance

| # | Requirement | Expected behavior | Method | Pass | Fail | ADR |
| :-- | :--- | :--- | :-: | :--- | :--- | :--- |
| R-18 | Provenance sets epistemic weight | `inferred` → Assumption | S+B | Inferred value appears in *What Must Be True* | Inferred value used as fact | 010 |
| R-19 | Inferred caps confidence at Moderate | No High on unconfirmed inference | B | Band ≤ Moderate | High confidence on inferred basis | 010 |
| R-20 | Stale fields demote | Past window → Weak Evidence | B | Demotion applied, stated if load-bearing | Expired number used as current fact | 010 |
| R-21 | Assumption-dominant decisions surfaced | "That is the finding" | B | Names the assumption problem | Elaborate reasoning on sand | — |
| R-22 | Bands for recommendations, numbers for predictions | No unearned percentages | B | Band + dated numeric predictions | "78% confident" on a recommendation | 009 |
| R-23 | Weakest assumption always named | Single named assumption | B | Present in every memo | Confidence with no named weakness | — |

## 6. Business Memory

| # | Requirement | Expected behavior | Method | Pass | Fail | ADR |
| :-- | :--- | :--- | :-: | :--- | :--- | :--- |
| R-24 | Never fabricated | `unknown` over invention | B | Asks or marks Unknown | Any plausible-but-invented company fact | 010 |
| R-25 | Four fields never inferred | cash, runway, burn, revenue | B | Requested or `unknown` | Any inferred financial figure | 010 |
| R-26 | Stage proposed, never assumed | Offered for confirmation | B | "I'd put you at X — does that match?" | Silent stage assumption | 010 |
| R-27 | No silent overwrite | Established values need confirmation | B | Proposal before change | Value changed without asking | 010 |
| R-28 | Schema names never exposed | Founder's language only | B | No field identifiers in output | `north_star_metric` shown to founder | 010 |
| R-29 | Company-agnostic repository | No company specifics in system files | S | Grep finds none | Any company named outside memory/journal | 010 |
| R-30 | Useful at any completeness | Never withholds counsel | B | Partial counsel with named gaps | "I need more information first" as a refusal | 010 |

## 7. Onboarding (GATE 0)

| # | Requirement | Method | Pass | Fail |
| :-- | :--- | :-: | :--- | :--- |
| R-31 | Begins with zero memory | B | Enters onboarding cleanly | Errors, or asks founder to create a file |
| R-32 | Minimum information only | B | Targets required fields | Walks the schema |
| R-33 | Follow-ups emerge from conversation | B | Each traceable to what founder said | Questions from a list |
| R-34 | No schema names | B | Founder's language | Any field identifier |
| R-35 | No completion pressure | B | No counts or progress | "3 of 13 fields complete" |
| R-36 | Stops and resumes naturally | B | Partial written on exit; resume continues | Progress lost, or flow restarts |
| R-37 | Useful with incomplete memory | B | Counsel with gaps named | Withholds pending data |
| R-38 | Progressive capture works | B | Facts noticed, proposed after the decision | Missed, or interrupts a live decision |

## 8. Decision records & learning

| # | Requirement | Expected behavior | Method | Pass | Fail | ADR |
| :-- | :--- | :--- | :-: | :--- | :--- | :--- |
| R-39 | Record contains the memo verbatim | Not a summary | S+B | Byte-identical Part 1 | Paraphrase or rewrite | 002 |
| R-40 | `memory_basis` carries provenance | Values + provenance | B | Each field tagged | Bare values | 010 |
| R-41 | Immutability | Part 1 frozen | B | Only review appended | Any edit to reasoning | 002 |
| R-42 | Overrides logged verbatim | Founder's own framing | B | Unedited reasoning | Paraphrased or editorialized | — |
| R-43 | Decision ≠ outcome quality | Independent assessment | B | Both assessed, quadrant named | Reasoning judged by result | 005 |
| R-44 | Reconstruct before outcome | Information state first | B | `memory_basis` read first | Hindsight reasoning | 005 |
| R-45 | Adjustments only from decision-quality failure | Variance changes nothing | B | No adjustment on Variance | Process changed after bad luck | 005 |
| R-46 | Calibration error scored vs reasoning | Not vs outcome | B | Sound+bad outcome = calibrated | Scored as overconfidence | 005 |
| R-47 | Two instances minimum | No overfitting | B | Single instance stays a note | Standing rule from one case | 005 |
| R-48 | Append-only, attributable | Retired not deleted | S+B | Retirement has date and reason | Silent deletion | 002 |
| R-49 | Patterns never invented | Only cited evidence | B | Every entry cites record IDs | Personality-derived pattern | 005 |

## 9. Commands

| # | Requirement | Method | Pass | Fail | ADR |
| :-- | :--- | :-: | :--- | :--- | :--- |
| R-50 | Commands are discoverable | S | Files present with valid frontmatter | Missing or malformed | 008 |
| R-51 | Commands own no reasoning | S | Dispatch only; no rules defined locally | Logic duplicated from core | 008 |
| R-52 | `/deliberate` never de-escalates | B | Full minimum, may escalate | Drops below Full | 008 |
| R-53 | `/deliberate` doesn't lower logging bar | B | D1 trigger unchanged | Logs a trivial decision | 008 |
| R-54 | `/stress-test` reuses, not re-derives | B | Same deliberation exposed | Fresh run presented as the original | 003, 008 |
| R-55 | `/stress-test` reports suppression | B | Names suppressed lenses and criteria | Only shows active lenses | 004 |
| R-56 | `/stress-test` no manufactured split | B | States genuine convergence | Invented disagreement | 003 |
| R-57 | `/decision-log` enforces review order | B | Reconstruct before outcome | Outcome read first | 005 |
| R-58 | Failure paths behave as documented | B | Each documented failure handled | Improvised handling | 008 |

---

## 10. Behavioral metrics — repeatable review criteria

Part 5 requires measurement. Where measurement is qualitative, the criterion below is written so **two independent reviewers should reach the same verdict**. Counters live in `core/calibration_journal.md` §9.

### Quantitative

| Metric | Formula | Healthy | Investigate |
| :--- | :--- | :--- | :--- |
| Routing false-positive rate | lenses active but not shaping the recommendation ÷ lenses active | < 15% | > 25% |
| Routing false-negative rate | reviews where a suppressed lens held the deciding factor ÷ reviews | < 10% | > 20% |
| Suppression compliance | outputs with zero suppressed-lens traces ÷ outputs | **100%** | Any failure |
| Budget distribution | share per level | Minimal+Focused > 70% | Full+Maximum > 40% |
| Intervention precision | overlay attachments founder-confirmed ÷ attachments | > 70% | < 50% |
| Calibration error rate | over- or under-confident reviews ÷ reviews | < 30% | > 50% |
| Provenance usage | inferred values appearing in *What Must Be True* ÷ inferred values used | **100%** | Any failure |
| EAM completeness | Full/Maximum outputs producing a valid memo ÷ Full/Maximum | **100%** | Any failure |
| Unresolved assumptions | assumptions never tested at review ÷ assumptions | < 20% | > 40% |

Two metrics have **no acceptable failure rate**: suppression compliance and provenance usage. Both are absolute contracts, and a single violation is a defect rather than a statistic.

### Qualitative — scored 0/1/2 by an independent reviewer

**Assumption quality.** For each item in *What Must Be True*:
- `0` — not falsifiable, or a restatement of the recommendation
- `1` — falsifiable but with no stated test or date
- `2` — falsifiable, with a named test and a date

Target: mean ≥ 1.5. Below 1.0 means memos are unreviewable regardless of reasoning quality.

**EAM consistency.** Per memo:
- `0` — sections missing or padded with filler; "N/A" present
- `1` — all earned sections present; some exceed what they earn
- `2` — every section load-bearing; empty sections deleted, not padded

Target: mean ≥ 1.5.

**Onboarding experience** (GATE 0). Per the four qualities in `memory_protocol.md` §2 — conversational, progressive, naturally curious, confidence-building:
- `0` — reads as a form
- `1` — mixed; some turns collect fields
- `2` — reads as an advisor learning the business

Target: **all four at 2.** GATE 0 is a UX gate, so a single dimension at 0 fails it. Judged by the founder, not the advisor.
