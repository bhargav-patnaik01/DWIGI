# DECISIONS.md — Architecture Decision Records (ADRs)

---

## OVERVIEW

This document records the foundational architectural decisions made during the design of the **Executive Intelligence System (EIS)**. 

Each Architecture Decision Record (ADR) captures the context, options considered, chosen solution, trade-offs accepted, and conditions for future reconsideration.

---

## ADR INDEX

- [ADR-001: Claude Code Native Execution vs External API Orchestration](#adr-001-claude-code-native-execution-vs-external-api-orchestration)
- [ADR-002: Plaintext Markdown Files vs Vector Database Storage](#adr-002-plaintext-markdown-files-vs-vector-database-storage)
- [ADR-003: Chief of Staff Single Interface vs Multi-Persona Conversational Chat](#adr-003-chief-of-staff-single-interface-vs-multi-persona-conversational-chat)
- [ADR-004: Dynamic Domain Routing & Weighted Consensus vs Equal Multi-Lens Deliberation](#adr-004-dynamic-domain-routing--weighted-consensus-vs-equal-multi-lens-deliberation)
- [ADR-005: Markdown Calibration Journal vs External Database Analytics](#adr-005-markdown-calibration-journal-vs-external-database-analytics)
- [ADR-006: Rejection of Third-Party Agent Frameworks (CrewAI, LangGraph, AutoGen)](#adr-006-rejection-of-third-party-agent-frameworks-crewai-langgraph-autogen)
- [ADR-007: Intentionally Lean Repository Footprint (<6 Core Files)](#adr-007-intentionally-lean-repository-footprint-6-core-files)
- [ADR-008: Slash Commands as Executable Files vs Prose Conventions in CLAUDE.md](#adr-008-slash-commands-as-executable-files-vs-prose-conventions-in-claudemd)
- [ADR-009: Qualitative Routing Tiers vs Numeric Persona Weights](#adr-009-qualitative-routing-tiers-vs-numeric-persona-weights)
- [ADR-010: Progressive Business Memory vs Static Business Context](#adr-010-progressive-business-memory-vs-static-business-context)

---

## ADR-001: Claude Code Native Execution vs External API Orchestration

- **Status**: APPROVED
- **Context**: The founder requires a private, highly responsive executive advisory system without maintaining external cloud infrastructure, API keys, or web servers.
- **Problem**: Should the system be built as an external script calling LLM APIs (Anthropic/OpenAI API) or run natively within Claude Code CLI?
- **Options Considered**:
  1. *Option A*: Custom Python application using Anthropic API & LangChain.
  2. *Option B*: Native Claude Code execution utilizing local markdown files and `CLAUDE.md`.
- **Chosen Option**: **Option B (Native Claude Code Execution)**
- **Why It Won**: Zero infrastructure overhead, zero additional API cost, native access to local workspace files, git-tracked context, and privacy by design.
- **Trade-offs Accepted**: Execution is tied to Claude Code CLI session boundaries; cannot run as a background web daemon.
- **Alternatives Rejected**: Option A was rejected due to unnecessary API management, billing complexity, and maintenance overhead.
- **Reconsideration Conditions**: If non-technical stakeholders require mobile web UI access to the advisor.

---

## ADR-002: Plaintext Markdown Files vs Vector Database Storage

- **Status**: APPROVED
- **Context**: Long-term context and past decisions must be stored and referenced by the advisor.
- **Problem**: How should knowledge and historical memory be stored for effective context retrieval?
- **Options Considered**:
  1. *Option A*: Local vector database (ChromaDB / Qdrant) with embeddings pipeline.
  2. *Option B*: Plaintext Markdown files in a structured, hierarchical directory under Git.
- **Chosen Option**: **Option B (Plaintext Markdown Files)**
- **Why It Won**: Zero database daemons, human-readable in any text editor, native Git versioning, zero embedding latency, and zero dependency risk. Claude Code can read targeted markdown files directly.
- **Trade-offs Accepted**: Requires disciplined file consolidation to prevent exceeding context windows.
- **Alternatives Rejected**: Option A was rejected because vector databases introduce unnecessary setup complexity, background processes, and chunking failures for structured strategic documents.
- **Reconsideration Conditions**: If decision journal count exceeds 1,000 files and context retrieval becomes demonstrably inaccurate.

---

## ADR-003: Chief of Staff Single Interface vs Multi-Persona Conversational Chat

- **Status**: APPROVED
- **Context**: The system simulates 8 executive perspectives (CEO, CFO, COO, Sales, Product, Risk, Devil's Advocate, Coach).
- **Problem**: How should the founder interact with these 8 executive perspectives?
- **Options Considered**:
  1. *Option A*: Multi-agent chat interface where 8 distinct chatbot personalities output sequential responses.
  2. *Option B*: Single Chief of Staff interface that orchestrates internal multi-lens evaluation and outputs one unified recommendation.
- **Chosen Option**: **Option B (Chief of Staff Single Interface)**
- **Why It Won**: Eliminates roleplay clutter, reduces output verbosity, prevents conflicting chat noise, and provides one actionable recommendation optimized for founder decision-making.
- **Trade-offs Accepted**: The founder does not see raw individual persona chatter unless they explicitly invoke a runtime mode that exposes it — `/stress-test`, which shows the disagreement behind a recommendation, or `/lens`, which consults one executive without convening the board. Both are founder-initiated and neither changes default behaviour.
- **Alternatives Rejected**: Option A was rejected because multi-agent chat models produce excessive fluff, slow down decision velocity, and force the founder to synthesize competing opinions manually.
- **Reconsideration Conditions**: None. Single point of contact is a core non-negotiable principle of EIS.

---

## ADR-004: Dynamic Domain Routing & Weighted Consensus vs Equal Multi-Lens Deliberation

- **Status**: APPROVED
- **Context**: In V1, every question triggered full analysis from all 8 executives, leading to irrelevant feedback (e.g., CFO evaluating code formatting).
- **Problem**: How should executive perspectives be engaged during a query?
- **Options Considered**:
  1. *Option A*: Consult all 8 executives equally on every query.
  2. *Option B*: Dynamic routing based on decision domain, assigning active weights (>80%) to relevant executives and suppressing (0%) irrelevant ones.
- **Chosen Option**: **Option B (Dynamic Routing & Weighted Consensus)**
- **Why It Won**: Increases response signal, cuts token usage by 60%, eliminates nonsensical feedback, and matches how real executive boards delegate domain authority.
- **Trade-offs Accepted**: Requires robust domain classification logic in the Chief of Staff prompt.
- **Alternatives Rejected**: Option A was rejected due to noise, inefficiency, and low decision quality.
- **Reconsideration Conditions**: If domain classification frequently misidentifies the primary executive domain.

---

## ADR-005: Markdown Calibration Journal vs External Database Analytics

- **Status**: APPROVED
- **Context**: The advisor must learn over time by evaluating decision predictions against actual business outcomes.
- **Problem**: How should prediction data, post-mortems, and founder behavioral blind spots be tracked?
- **Options Considered**:
  1. *Option A*: SQLite database with custom python analysis scripts.
  2. *Option B*: Single markdown log (`core/calibration_journal.md`) updated periodically during post-mortem reviews.
- **Chosen Option**: **Option B (Markdown Calibration Journal)**
- **Why It Won**: Transparent, easily editable by the founder, directly readable by Claude Code during session boot, and zero script dependencies.
- **Trade-offs Accepted**: Manual post-mortem entry required for outcome reviews.
- **Alternatives Rejected**: Option A was rejected to maintain a pure markdown repository architecture.
- **Reconsideration Conditions**: If automated analytics or quantitative charts are explicitly requested by the founder.

---

## ADR-006: Rejection of Third-Party Agent Frameworks (CrewAI, LangGraph, AutoGen)

- **Status**: APPROVED
- **Context**: Many AI architectures use framework abstractions (CrewAI, LangGraph, AutoGen) for multi-step reasoning.
- **Problem**: Should EIS use an agentic orchestration framework?
- **Options Considered**:
  1. *Option A*: Build using CrewAI or LangGraph.
  2. *Option B*: Zero-framework native Claude Code prompt engineering.
- **Chosen Option**: **Option B (Zero-Framework Native Claude Code)**
- **Why It Won**: Frameworks add heavy dependency graphs, break frequently with LLM API updates, introduce latency, and wrap simple prompt logic in complex Python abstractions. Claude Code native prompt execution handles multi-stage reasoning far more reliably.
- **Trade-offs Accepted**: Reasoning workflows must be maintained in prompt markdown files rather than Python code.
- **Alternatives Rejected**: Option A was rejected due to fragility, maintenance overhead, and dependency lock-in.
- **Reconsideration Conditions**: None.

---

## ADR-007: Intentionally Lean Repository Footprint (<6 Core Files)

- **Status**: APPROVED
- **Context**: V1 architecture accumulated 25+ micro-files (templates, persona files, workflow docs), causing context fragmentation.
- **Problem**: How many structural files should exist in the repository?
- **Options Considered**:
  1. *Option A*: Highly modular file structure with separate files for every persona, template, and workflow.
  2. *Option B*: Ultra-lean footprint consolidating context into a single company-knowledge file (now `business_memory.md`, per ADR-010) and personas into `executive_matrix.md`.
- **Chosen Option**: **Option B (Ultra-Lean Footprint)**
- **Why It Won**: Reduces directory traversal overhead, eliminates token waste, improves readability for both Claude Code and the founder, and makes maintenance trivial.
- **Trade-offs Accepted**: Consolidated files are slightly longer (~1,500 words each).
- **Alternatives Rejected**: Option A was rejected for creating "documentation bloat" that harmed real-world usability.
- **Reconsideration Conditions**: If a consolidated file exceeds 5,000 words and degrades context window efficiency.

### Amendment (ratified during Milestone 5 consistency audit): the bound is context per interaction, not file count

**The letter of this ADR is now violated.** As of M5 the system has 6 files under `core/` plus `CLAUDE.md` — 7 system files against a stated bound of "fewer than 6." Reported rather than silently absorbed, per the M5 behavioural-integrity requirement.

**The spirit is intact, and the numeric bound was the wrong measure.** ADR-007's stated context was V1's "25+ micro-files causing context fragmentation" — the cost being that understanding the system required reading all of them. That cost does not scale with files in the repository; it scales with **files that must be read to serve one interaction.**

Measured at M5:

| Interaction | Files read | Approx. tokens |
| :--- | :-: | :-: |
| Minimal budget (recall) | 3 | ~7,000 |
| Focused / Full budget | 5 | ~17,500 |
| Writing or reviewing a record | 6 | ~20,000 |
| First run (onboarding) | 3 | ~9,000 |

Each file has exactly one owner and one trigger condition (`CLAUDE.md` §11). Nothing is read speculatively. The fragmentation ADR-007 guarded against — many files, all mandatory, no clear ownership — has not occurred.

**Revised bound, replacing the file count:**

1. **No single interaction may require reading more than 6 files.**
2. **Peak context load stays under ~25,000 tokens** of system files.
3. **Every file has one documented owner and one trigger condition**, listed in `CLAUDE.md` §11. A file that cannot state when it is read does not belong in the repository.
4. The per-file 5,000-word ceiling is unchanged, and `CLAUDE.md` keeps its stricter ~3,200-word kernel budget.

**Trade-off accepted:** the constraint is now a judgment rather than a count, so it cannot be checked by `ls`. Mitigated by the table above, which should be re-measured at each milestone.

**If the founder prefers the literal bound**, the available consolidation is merging `execution_pipeline.md` and `learning_protocol.md` into one runtime document (~5,400 words, which breaches the per-file ceiling instead) or folding `learning_protocol.md` into `calibration_journal.md` (which mixes protocol with accumulating instance data — the separation this design deliberately maintains). Neither is an improvement; both are available on request.

### Second amendment (ratified pre-M6): bound held by dependency reduction, not exception

Splitting the Executive Matrix added a seventh `core/` file and pushed the record-writing path to 7 files — breaching the bound set above. **The founder declined to relax the bound a second time**, on the grounds that a limit revised twice under pressure is not a limit.

Resolved by **removing a dependency instead of raising the ceiling**: `execution_pipeline.md` is no longer read when writing a Decision Record. The justification is substantive rather than convenient — the Executive Action Memo already exists in the conversation when the record is written, so loading the memo *specification* to transcribe it is redundant. Consulting the spec at that point means reconstructing the memo rather than copying it, which the verbatim-freeze rule already prohibits. The rule is stated in `learning_protocol.md` §2 and enforced in `.claude/commands/decision-log.md`.

**Measured read path after the split and this fix:**

| Interaction | Files | Count |
| :--- | :--- | :-: |
| Minimal (recall) | kernel, memory, calibration | 3 |
| Focused / Full | + executive_matrix, reasoning_rules, execution_pipeline | 6 |
| Writing a Decision Record | kernel, memory, calibration, learning_protocol | **4** |
| Reviewing a record | + journal record | 5 |
| First run (onboarding) | kernel, memory_protocol, template | 3 |

The bound holds at 6, and the record-writing path is now *cheaper* than before the split rather than more expensive. **The precedent this sets matters more than the number:** when a bound is threatened, remove a dependency before widening the exception.

---

## ADR-008: Slash Commands as Executable Files vs Prose Conventions in CLAUDE.md

- **Status**: APPROVED (amendment, ratified during Milestone 1 review)
- **Context**: ROADMAP Milestone 5 specifies programming `/deliberate`, `/stress-test`, and `/decision-log` "directly into `CLAUDE.md`". Implementation review established that this is not how Claude Code resolves slash commands: they must exist as individual files under `.claude/commands/*.md`, where the filename becomes the command name.
- **Problem**: Described in prose inside `CLAUDE.md`, these would be naming conventions the founder must invoke by writing a sentence — not commands. The originally specified approach cannot deliver the stated capability.
- **Options Considered**:
  1. *Option A*: Keep commands as prose conventions in `CLAUDE.md`, preserving the strict ADR-007 file minimum.
  2. *Option B*: Create three executable command files under `.claude/commands/`, accepting three additional files.
- **Chosen Option**: **Option B (Executable Command Files)**
- **Why It Won**: Platform constraints take precedence over repository minimalism. ADR-007 exists to prevent *context fragmentation* — many small files that must all be read to understand the system. Command files are not context: they are runtime interfaces, loaded only when invoked, and they consume no session context otherwise. They therefore do not incur the cost ADR-007 was written to avoid.
- **Trade-offs Accepted**: Three additional files, and a `.claude/` directory that must remain tracked in Git (see `.gitignore`, which excludes only `settings.local.json`).
- **Alternatives Rejected**: Option A was rejected because it produces documentation describing commands that do not exist — the exact failure mode of writing a specification without validating it against the platform.
- **Reconsideration Conditions**: If Claude Code changes how commands are resolved, or if command bodies grow large enough to warrant consolidation.
- **Scope Note**: This ADR ratifies the *mechanism*. Implementation remains scheduled for Milestone 5, since `/decision-log` depends on the journal schema (M4) and `/deliberate` depends on pipeline mechanics (M5).
- **Implemented (Milestone 5)**: `.claude/commands/deliberate.md`, `stress-test.md`, `decision-log.md`. Each is a **dispatcher, not an engine** — commands own no reasoning logic and invoke `execution_pipeline.md` and `learning_protocol.md` for all of it. `/deliberate` is a budget override; `/stress-test` changes presentation only; `/decision-log` dispatches to the M4 schema. The prediction that command bodies would stay small held: all three total under 1,600 words, and none duplicates a rule defined elsewhere.
- **Extended (Milestone 6)**: three further commands, added so the desktop client could offer founder-selected runtime modes without the interface acquiring reasoning of its own. `begin.md` is an explicit entry point to first-run onboarding, delegating wholly to `onboarding/memory_protocol.md`. `lens.md` restricts B5 to one named lens and is the **second** sanctioned exception to ADR-003's single-interface contract — `/stress-test` exposes a deliberation that happened, `/lens` declines to convene one. `council.md` narrows the Layer-1 candidate pool to an explicitly enabled set, and states the three exclusions it cannot honour (the two structural challenge lenses, CFO's solvency floor, the Intervention overlay). The dispatcher property holds: all six total under 3,500 words, and none duplicates a rule defined elsewhere. `CLAUDE.md` §2 was amended by one clause to record that the exception set is now two.

---

## ADR-009: Qualitative Routing Tiers vs Numeric Persona Weights

- **Status**: APPROVED (amendment, ratified during Executive Matrix implementation)
- **Context**: ADR-004 established dynamic domain routing and specified it numerically: active executives receive weights ">80%", irrelevant ones "0%".
- **Problem**: Authoring `core/executive_matrix.md` revealed that numeric weights cannot be computed, applied, or verified. "CFO at 80%" carries no more information than "CFO supports," while implying arithmetic that does not exist. This is precisely the false precision that `CLAUDE.md` §8 prohibits — the system cannot forbid unearned numbers in its output while using them in its own routing logic.
- **Options Considered**:
  1. *Option A*: Retain numeric percentage weights per ADR-004 as literally written.
  2. *Option B*: Three qualitative tiers — Lead, Support, Silent.
- **Chosen Option**: **Option B (Qualitative Tiers)**
- **Why It Won**: Preserves ADR-004's full intent — dynamic routing with hard suppression of irrelevant lenses — while removing numerals that could not be justified. Tiers are also directly actionable: "Lead" states who owns the recommendation's spine, which a percentage never did.
- **Trade-offs Accepted**: Loses the appearance of quantitative rigor. Routing correctness must be verified by behavioural testing (Milestone 6) rather than by arithmetic audit.
- **Alternatives Rejected**: Option A was rejected as internally inconsistent with the system's own epistemic standards.
- **Reconsideration Conditions**: If tier granularity proves too coarse to discriminate between lenses in practice, a fourth tier may be added — but numeric weights should not return.
- **Relationship to ADR-004 (ratified clarification)**: ADR-009 **refines** ADR-004 and does **not** supersede it. The two govern different layers of a single mechanism:
  - **Layer 1 — Eligibility (ADR-009).** Each lens's activation and suppression criteria determine whether it participates at all. Binary: active or silent. Suppression is absolute.
  - **Layer 2 — Weighting (ADR-004).** Among the lenses that passed Layer 1, relative influence during S4 deliberation is governed by tier: **Lead** owns the recommendation's spine, **Support** contributes one bounded constraint or angle.

  ADR-004's routing principle, weighted-consensus requirement, and hard suppression of irrelevant lenses all remain in force. ADR-009 supplies the notation for both layers, replacing percentages that could not be computed or verified. Where this document refers to "weight," read it as tier.

---

## ADR-010: Progressive Business Memory vs Static Business Context

- **Status**: APPROVED (supersedes the Business Context design in ADR-007 and ROADMAP Milestone 2)
- **Numbering note**: This decision was requested as "ADR-009." That number was already assigned to *Qualitative Routing Tiers*, which is approved and referenced across `CLAUDE.md` and `core/executive_matrix.md`. Duplicate numbering would break the ledger, so it is filed as ADR-010 with its requested title preserved.

### Context

The original architecture assumed internal deployment for a single company, so `core/business_context.md` was a founder-owned file edited by hand. That assumption is no longer valid: the project is intended to be open source. Any founder should be able to clone the repository and start immediately.

Hand-edited configuration fails that goal in three ways. It makes first use a data-entry task before any value is delivered. It cannot distinguish a fact the founder stated from a value someone typed once and never revisited. And it treats company knowledge as static when it is the most volatile input in the system.

### Problem

How should the system acquire, hold, and maintain knowledge of the company?

### Options Considered

1. *Option A*: Static founder-edited context file with `TODO` placeholders (the original design).
2. *Option B*: Conversational onboarding producing an agent-maintained Business Memory with per-field provenance and confidence.
3. *Option C*: Interactive setup wizard writing a config file, then static thereafter.

### Chosen Option

**Option B — Progressive Business Memory.**

### Why It Won

- **Open-source usability.** Nothing company-specific exists in the reasoning system, so the repository is reusable as cloned. The only company-specific artifact is generated locally.
- **Onboarding is conversation, not configuration.** The founder describes their business in their own words; the system infers structure and confirms its reading. This matches the product's premise — meeting an executive partner, not filling in a form. A questionnaire would contradict the thing being built on the very first interaction.
- **Inference over interrogation.** One sentence typically populates several fields. Follow-ups are asked only where confidence is low and the field would change a recommendation.
- **Confidence and provenance exist to protect the reasoning pipeline.** Every field records whether it was `confirmed`, `corrected`, `imported`, `inferred`, or `unknown`. This maps directly onto S2 epistemic classification: an `inferred` value is an Assumption and can never be presented as a fact. Without provenance the system cannot tell founder-stated ground truth from its own guesswork, which is the most dangerous failure available to an advisor — confident advice resting on invented premises.
- **Confirmation before commit** keeps the founder in control of their own record. Silent overwriting would make memory untrustworthy, and an untrustworthy memory is worse than none because it is still consulted.
- **`unknown` is a permanent valid state.** Forcing completeness is what produces fabrication. Memory is never "complete," so no progress framing is offered.
- **Extensibility.** Ingestion is isolated behind a contract (emit schema, set provenance `imported`, never auto-commit, present a diff), so website, pitch-deck, financial-model, Notion, and CRM importers can be added later without touching the schema, the lenses, or the pipeline.

### Trade-offs Accepted

- Onboarding quality now depends on inference behaviour, which is prose-specified and must be validated behaviourally (Milestone 6) rather than by inspection.
- The system carries a subsystem — template plus protocol — where previously there was one file. Justified because `memory_protocol.md` is read only on first run and on updates, so it costs nothing in ordinary sessions.
- Inference can be wrong. Mitigated by never inferring `cash_position`, `runway_months`, `monthly_burn`, or `revenue`; by proposing rather than asserting `stage`; and by logging corrections of inferred values to `calibration_journal.md` so systematic inference bias becomes visible.

### Consequence: Business Memory is gitignored by default

`core/business_memory.md` is excluded from version control in the shipped `.gitignore`.

This creates real tension with **ADR-002**, which makes Git history the learning mechanism. It is resolved deliberately: in an open-source repository, the likeliest accident is a founder pushing a fork and publishing their cash position and runway. That is irreversible; forks get cached and scraped. Losing version history for one file is recoverable and, for the learning objective, largely compensated — the update workflow preserves prior values as in-file history lines, so the evolution of understanding is captured in the document rather than only in commits.

`journal/` remains tracked. It is the primary learning mechanism under ADR-002, and its exposure is a deliberate choice the founder makes when they choose a remote.

A founder who wants memory versioned removes one line from `.gitignore`. That opt-in is documented in the file itself.

### Alternatives Rejected

Option A was rejected because manual configuration blocks open-source adoption, provides no provenance, and models volatile knowledge as static. Option C was rejected because a wizard is a questionnaire with better styling — it solves the editing problem while preserving the configuration experience, and still yields a file that goes stale the moment it is written.

### Reconsideration Conditions

If inference proves unreliable enough that founders spend more time correcting memory than conversational onboarding saves, add an explicit `/memory edit` path for direct editing — but keep the confirmation workflow for agent-initiated changes.
