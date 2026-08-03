# ROADMAP.md — Executive Intelligence System (EIS) Implementation Master Plan

---

## EXECUTIVE OVERVIEW

This document outlines the step-by-step implementation sequence for building the **Executive Intelligence System (EIS) V3** inside Claude Code. 

Implementation is structured across **6 discrete, incremental milestones**. After each milestone, the repository is guaranteed to remain in a fully functional, testable state.

> ### Amendments in force
>
> **1. Milestones 2 and 3 are inverted** *(ratified at M1 review)*. The Executive Perspective Matrix was built first, because the reasoning engine is independent of any specific company's data — the matrix defines *how* lenses weight by stage, not *what* the stage is. **Milestone 3 is complete and GATE 1-approved.**
>
> **2. Milestone 2 is replaced entirely** *(ADR-010)*. "Core Business Context Engine" becomes the **Business Memory Engine**. Static founder-edited configuration is removed from the architecture; the system now learns the business through conversation and maintains an evolving, provenance-tagged Business Memory. See the revised Milestone 2 below.
>
> **3. Milestone 3's dependency on Milestone 2 is removed** *(ADR-010)*. The matrix does not require completed Business Memory. Memory is simply another reasoning input once available, and the lenses degrade gracefully without it (`CLAUDE.md` §13).
>
> **4. The Executive Matrix is split** *(ratified pre-M6)*. `core/executive_matrix.md` retains the eight personas and their activation, suppression, and escalation criteria; `core/reasoning_rules.md` takes routing, reasoning-budget allocation, stage adaptation, override conditions, the Intervention overlay, and conflict arbitration. Personas keep sections §1–§8 so existing references to Coach (§6) and Risk Officer (§7) remain valid. Activation is now **procedural**: a lens failing the gate never enters deliberation, rather than entering and being filtered from output.
>
> **5. The Executive Matrix is dissolved into one file per lens** *(ADR-011, Sprint 3)*. `core/executive_matrix.md` no longer exists. Each lens is a self-contained document under `core/executives/` carrying machine-readable front matter, and the directory is the roster — there is no list of executives in any file or any code. The shared board prose that headed the matrix moved to `core/reasoning_rules.md` §9. Amendment 4's note that "personas keep sections §1–§8" is therefore superseded: per-lens section references are replaced by filenames. No persona wording changed, and no reasoning changed.
>
> Milestone numbering below reflects the original ordering regardless of build sequence. See also **ADR-008** (command files as executable interfaces), **ADR-009** (qualitative routing tiers), and **ADR-011** (per-executive canonical files).

---

## MILESTONE MAP & RISK MATRIX

```
┌───────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 1: BOOTSTRAP & SYSTEM PROMPT (`CLAUDE.md`)                       │
│ Complexity: Low | Risk: Low | Review Gate: None                           │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 2: BUSINESS MEMORY ENGINE (`core/onboarding/`)                  │
│ Complexity: High | Risk: Medium | Review Gate: GATE 0 (Onboarding UX)     │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 3: EXECUTIVE PERSPECTIVE MATRIX (`core/executive_matrix.md`)    │
│ Complexity: High | Risk: Medium | Review Gate: GATE 1 (Persona Review)     │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 4: CALIBRATION & LEARNING LOG (`core/calibration_journal.md`)   │
│ Complexity: Medium | Risk: Low | Review Gate: None                        │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 5: COGNITIVE PIPELINE & SLASH COMMANDS INTEGRATION              │
│ Complexity: High | Risk: High | Review Gate: GATE 2 (Cognitive Pass Audit)│
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 6: END-TO-END SYSTEM INTEGRATION & VERIFICATION                 │
│ Complexity: Medium | Risk: Low | Review Gate: GATE 3 (Production Ready)   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## MILESTONE DETAILS

### MILESTONE 1: Repository Bootstrap & Governance Structure
- **Objective**: Establish clean directory structure, Git configuration, and primary `CLAUDE.md` operating rules.
- **Rationale**: Claude Code requires strict system prompt instructions to activate the Chief of Staff persona on session boot.
- **Dependencies**: None.
- **Complexity**: Low (1/5) | **Risk**: Low
- **Files Created**:
  - `CLAUDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/ROADMAP.md`
  - `docs/DECISIONS.md`
  - `.gitignore`
- **Expected Outcome**: Claude Code recognizes system boundaries and responds as Chief of Staff during session initialization.
- **Exit Criteria**: Running `claude` in the workspace automatically loads system guidelines without syntax errors.

---

### MILESTONE 2: Business Memory Engine *(revised — ADR-010)*
- **Objective**: Replace static business configuration with a living, agent-maintained Business Memory acquired through conversation.
- **Rationale**: The system is intended to be open source. Any founder must be able to clone the repository and begin immediately, without editing markdown or filling in configuration. Company knowledge is also the most volatile input in the system and should be modelled as evolving, not static.
- **Dependencies**: Milestone 1.
- **Complexity**: High (4/5) | **Risk**: Medium — inference quality is prose-specified and cannot be verified by inspection.
- **Files Created**:
  - `core/onboarding/business_memory.template.md` — schema only, never real data
  - `core/onboarding/memory_protocol.md` — onboarding, inference, confidence, update and confirmation workflows
- **Files Modified**:
  - `CLAUDE.md` — §14 Business Memory; first-run detection at boot; provenance-aware degraded mode
  - `core/executive_matrix.md` — memory-sourced stage and override references
  - `.gitignore` — exclude the memory instance by default
  - `docs/ARCHITECTURE.md` — layout, component table, runtime flow
- **Files Removed**:
  - `core/business_context.md` — superseded
- **Deliverables**: Business Memory template · onboarding conversation · inference engine · confidence and provenance model · memory update workflow · confirmation workflow · documentation
- **Review Gate (GATE 0)**: **Cannot be approved by reading documentation.** GATE 0 validates the founder's actual onboarding experience, not the protocol's completeness. The protocol can satisfy every written rule and still feel like an interview — only running it reveals which.

  **Required before marking complete: one full onboarding simulation** from a clone with no memory file, played through as a founder would experience it.

  Acceptance criteria — all eight must hold:

  | # | Criterion | Fails if |
  | :-: | :--- | :--- |
  | 1 | Onboarding begins with zero prior memory | Errors, or asks the founder to create a file |
  | 2 | Asks only the minimum information required | Walks the schema; asks for optional fields |
  | 3 | Follow-ups emerge naturally from conversation | Questions visibly come from a list, not from what was said |
  | 4 | Founder never sees internal schema names | Any field identifier appears in a question, readback, or summary |
  | 5 | Founder never feels required to complete everything | Progress framing, field counts, or pressure to continue |
  | 6 | Onboarding can stop and resume naturally | Partial progress lost, or resumption restarts the flow |
  | 7 | Advisor remains useful with incomplete memory | Withholds counsel pending more data |
  | 8 | Progressive capture works in normal conversation | New facts pass unnoticed, or interrupt a live decision |

  Judged against the four qualities in `memory_protocol.md` §2: conversational not transactional, progressive not exhaustive, naturally curious not interrogative, confidence-building not data-collecting.
- **Expected Outcome**: A fresh clone with no memory file enters onboarding, extracts structure from natural description, confirms its reading, and writes `core/business_memory.md`.
- **Exit Criteria**: (1) Repository contains no company-specific information outside the memory instance. (2) A stated business description populates multiple fields with correct provenance. (3) `cash_position`, `runway_months`, `monthly_burn`, and `revenue` are never inferred. (4) No established value is overwritten without confirmation. (5) Asking "what is our current stage?" returns the memory value with its provenance, or `unknown` — never a guess.

---

### MILESTONE 3: Executive Perspective Matrix & Stage Rules
- **Objective**: Author `core/executive_matrix.md` containing all 8 executive persona mental models, domain weighting matrices, and stage-adaptation rules.
- **Rationale**: Replaces separate persona files with a single, high-density matrix to eliminate multi-file reading latency.
- **Dependencies**: Milestone 2.
- **Complexity**: High (4/5) | **Risk**: Medium
- **Files Created**:
  - `core/executive_matrix.md`
- **Review Gate (GATE 1)**: Architectural review of persona evaluation questions and stage multipliers.
- **Exit Criteria**: Test query correctly triggers high weights for relevant domain executives and 0% weights for irrelevant executives.

---

### MILESTONE 4: Calibration & Decision Learning
- **Objective**: Turn every significant decision into a learning opportunity, by separating decision quality from outcome quality and deriving standing adjustments from reasoning failures.
- **Rationale**: An advisor that learns from outcomes alone learns to chase variance — it will adopt whatever process happened to precede good luck. Learning must be driven by reasoning quality assessed against the information available at the time.
- **Dependencies**: Milestone 1. *(Not Milestone 3 — the learning system is independent of routing.)*
- **Complexity**: High (4/5) | **Risk**: Medium — the hindsight-contamination discipline is behavioural, not structural.
- **Files Created**:
  - `core/learning_protocol.md` — Decision Record schema, review procedure, decision-vs-outcome quality framework, calibration adjustment rules
  - `core/calibration_journal.md` — living ledger: active adjustments, confidence calibration, inference accuracy, routing accuracy, override rate, founder patterns, reasoning failures, review queue
- **Files Modified**:
  - `CLAUDE.md` — §10 rewritten as learning policy; mechanics extracted
- **Design note — no `journal/.gitkeep`**: the original plan called for one. Skipped deliberately: a `.gitkeep` is a placeholder with no content, which the repository rules forbid, and the directory is created naturally when the first Decision Record is written.
- **Anti-duplication**: the Decision Record **contains** the Executive Action Memo verbatim rather than summarizing it, and the Calibration Journal **links** to record IDs rather than restating their reasoning. Two prose accounts of one decision would drift, leaving no authoritative version.
- **Expected Outcome**: A significant decision produces a record capturing what was known, with what provenance, by which lenses — reviewable months later without the reviewer having to trust hindsight.
- **Exit Criteria**: (1) A record can be written and parsed without formatting errors. (2) Front matter captures activated lenses and the memory basis *with provenance*. (3) A review can assign a quadrant and justify it from the decision-date information state alone. (4) Calibration adjustments require two cited instances. (5) No adjustment can be deleted — only retired with a date and reason.

---

### MILESTONE 5: Execution Engine & Claude Code Runtime *(revised)*
- **Objective**: Turn the documented architecture into a working runtime — the canonical interaction lifecycle, the executable command layer, and instrumentation for M6.
- **Rationale**: The architecture was feature-complete but had no specified lifecycle. Stages existed; session initialization, intake, persistence, and shutdown did not.
- **Dependencies**: Milestones 1, 2, 3, 4.
- **Complexity**: High (5/5) | **Risk**: Medium — execution only; no new concepts.
- **Files Created**:
  - `.claude/commands/deliberate.md` · `stress-test.md` · `decision-log.md` (ADR-008)
- **Files Modified**:
  - `core/execution_pipeline.md` — five-phase runtime lifecycle wrapping S1–S7, each step with purpose, inputs, outputs, failure handling, downstream dependencies
  - `core/learning_protocol.md` — calibration error as a second orthogonal axis; five learning dimensions named
  - `core/calibration_journal.md` — calibration-error ledger; §9 runtime instrumentation
  - `core/executive_matrix.md` — Intervention override clarified as leadership and tone only
  - `docs/DECISIONS.md` — ADR-007 amendment (context-per-interaction bound); ADR-008 marked implemented
- **Key design decision**: the runtime lifecycle is **five phases wrapping the existing seven stages**, not a second numbering scheme. The original request listed sixteen lifecycle items, several of which duplicated S1–S7 — "intent classification" in particular overlaps S1 directly. Resolved by making intake triage explicitly *provisional* and shallow, with S1 as the authoritative diagnosis that can force re-routing and budget escalation.
- **Review Gate (GATE 2)**: Verify epistemic tagging and bias defenses in live deliberation. Additionally verify the seven behavioural-integrity properties: suppression is absolute; the Intervention overlay changes leadership and tone only; budget controls depth; provenance governs epistemic weight; decision and outcome quality stay independent; memory is never fabricated; no lens bypasses routing.
- **Exit Criteria**: (1) `/deliberate "<decision>"` produces a complete stage-aware EAM. (2) `/stress-test` exposes routing and suppression without manufacturing disagreement. (3) `/decision-log review` assigns a quadrant from the decision-date information state. (4) Instrumentation counters populate from Phase D2. (5) No approved ADR is weakened without a recorded amendment.

---

### MILESTONE 6: End-to-End System Integration & Production Verification
- **Objective**: Run full synthetic test suite across 5 core executive decision domains (Pricing, Hiring, Tech Pivot, Marketing, Burnout Triage).
- **Rationale**: Ensures zero regression, verifies file creation workflows, and confirms production readiness.
- **Dependencies**: Milestones 1–5.
- **Complexity**: Medium (3/5) | **Risk**: Low
- **Files Created**:
  - `dossier/.gitkeep`
- **Files Modified**:
  - `core/calibration_journal.md` (Initial baseline parameters)
- **Review Gate (GATE 3)**: Final sign-off on decision quality, response speed, and formatting signal.
- **Exit Criteria**: 5 sample decisions successfully logged to `journal/` with zero missing context errors. System declared Production Ready.

---

# FUTURE ENHANCEMENTS

**Not scheduled. Not approved for implementation.** Recorded so the architecture anticipates them and current design does not foreclose them.

---

## FE-01: Advisor Self-Health Subsystem

### Concept

A reporting layer that measures **the advisor rather than the founder**. Every existing mechanism in this system evaluates decisions, the business, or founder patterns. None asks whether the advisor itself is functioning well, and no single view aggregates that.

### Relationship to Milestone 4 — read this before building

`core/calibration_journal.md` already collects most of the underlying data. **This subsystem is a reporting and trend-analysis layer over it, not a second collection system.** Building it as a parallel data store would duplicate M4 and immediately drift from it.

| Layer | Owner | Responsibility |
| :--- | :--- | :--- |
| **Data** | `calibration_journal.md` (M4, built) | Per-decision measurements, active adjustments |
| **Analysis** | FE-01 (future) | Trends over time, thresholds, health verdicts |

### Candidate metrics

Most already have a home in the M4 ledger; FE-01 adds trend and threshold analysis:

| Metric | M4 source | What FE-01 would add |
| :--- | :--- | :--- |
| Inference accuracy by category | §3 | Trend direction; whether revisions to extraction rules actually helped |
| Executive activation frequency | §4 | Distribution across lenses; detection of a lens never or always firing |
| Confidence calibration accuracy | §2 | Drift over time; over- vs under-confidence as a standing bias |
| Recommendation override rate | §5 | Per-domain trend; whether divergence is narrowing |
| False-positive activations | §4 | Whether routing heuristics are improving after Version 1 revision |
| Recurring reasoning failures | §7 | Whether identified failures actually stop recurring |

### Why it is worth building eventually

The M4 ledger answers "was this decision sound?" It cannot answer "is this advisor getting better?" Those require different time horizons, and the second is the only real evidence that the learning system works at all rather than merely accumulating records.

### Design constraints if built

- **Read-only over the ledger.** No new collection, no duplicate storage.
- **Never self-congratulatory.** A health report that reads as reassurance is worthless. Report regressions at least as prominently as improvements.
- **Honest about sample size.** Most metrics are meaningless below roughly twenty scored decisions. Report insufficient data as insufficient rather than computing a percentage from four data points.
- **Never auto-adjust reasoning.** Findings surface as proposed calibration adjustments through the normal `learning_protocol.md` §6 path, with founder visibility. A system that silently retunes itself based on its own self-assessment has no audit trail.
