# ARCHITECTURE.md — Executive Intelligence System (EIS) Technical Specification

---

## 1. EXECUTIVE SUMMARY

The **Executive Intelligence System (EIS)** is a private, zero-external-dependency advisory engine designed to operate natively within **Claude Code** for a sole founder. EIS provides top-tier strategic, financial, operational, and psychological decision support by simulating an elite Executive Board coordinated by a Chief of Staff (COS). 

Rather than deploying complex multi-agent frameworks, SaaS infrastructure, or external databases, EIS uses a file-native, high-cognition reasoning pipeline executed entirely within Claude Code's local context window.

---

## 2. PROJECT VISION & DESIGN PHILOSOPHY

### 2.1 Core Vision
To provide a sole founder with the decision quality, strategic rigor, and risk management of a Fortune 500 Executive Board, accessible through a single high-signal conversational interface.

### 2.2 Core Design Philosophy
1. **Single Advisor Interface**: The founder interacts exclusively with the Chief of Staff. Sub-executive perspectives are internal reasoning models, not conversational chat personas.
2. **Dynamic Domain Routing**: Advice is generated only by relevant executive lenses. Unrelated perspectives are suppressed to maximize signal-to-noise ratio.
3. **Stage-Aware Advice**: Recommendations adapt dynamically to the business stage (Idea, Pre-PMF, PMF, Growth, Scale) defined in the core context.
4. **Epistemic Rigor**: The system explicitly tags data as *Facts*, *Evidence*, *Assumptions*, or *Unknowns*, preventing hallucinated certainty.
5. **Zero Infrastructure Overhead**: Plaintext Markdown under Git version control replaces vector databases, external orchestrators, and paid APIs.
6. **Company Agnostic**: No company's specifics exist anywhere in the reasoning system. Only Business Memory holds them. Any founder can clone this repository and begin immediately.
7. **Progressive Memory over Static Configuration**: The system learns the business through conversation rather than requiring the founder to fill in files. Knowledge accumulates, carries provenance, and is never assumed complete (ADR-010).

---

## 3. SYSTEM BOUNDARIES & NON-GOALS

### 3.1 System Boundaries
- **Runtime Environment**: Claude Code CLI only.
- **Data Persistence**: Local file system (`.md` files) committed to Git.
- **Dependencies**: Native Claude Code file reading/writing and internal reasoning.

### 3.2 Non-Goals
- **Not a Multi-Agent Chat System**: Does not create independent conversational agents.
- **Not a SaaS Platform**: No multi-tenant support, web server, or cloud hosting.
- **Not an Automated Task Execution Engine**: Does not autonomously modify external systems or write operational production code without explicit prompt directives.
- **Not a Vector Database System**: No semantic embeddings, chunking pipelines, or DB daemons.

---

## 4. REPOSITORY LAYOUT & COMPONENT RESPONSIBILITIES

```
.
├── CLAUDE.md                       # Operating kernel — contract only, no mechanics
├── .claude/
│   └── commands/                   # Executable runtime interfaces (ADR-008)
│       ├── deliberate.md           # Force Full-budget deliberation
│       ├── stress-test.md          # Expose raw executive disagreement
│       └── decision-log.md         # Write / review / list Decision Records
├── docs/                           # Core Engineering Reference
│   ├── ARCHITECTURE.md             # System Architecture & Technical Specifications
│   ├── ROADMAP.md                  # Milestone Implementation Plan
│   └── DECISIONS.md                # Architectural Decision Records (ADRs)
├── core/                           # System Knowledge & Calibration State
│   ├── business_memory.md          # Living company knowledge (gitignored; created at onboarding)
│   ├── onboarding/                 # Business Memory subsystem
│   │   ├── business_memory.template.md   # Schema only — never real data
│   │   └── memory_protocol.md            # Onboarding, inference, update workflow
│   ├── executives/                 # One file per lens — the roster IS the directory
│   │   ├── ceo.md · cfo.md · coo.md · sales-gtm.md
│   │   ├── product.md · coach.md
│   │   └── risk-officer.md · devils-advocate.md
│   ├── reasoning_rules.md          # Participation gate, budgets, routing, overrides, arbitration
│   ├── execution_pipeline.md       # 7-Stage Mechanics & Executive Action Memo spec
│   ├── learning_protocol.md        # Decision Record schema & review procedure
│   └── calibration_journal.md      # Advisor track record & active adjustments
├── journal/                        # Immutable Decision Records & Predictions
│   └── DEC-YYYYMMDD_slug.md        # Single Decision Memo with 90-day predictions
└── dossier/                        # Deep Market & Competitor Knowledge Bank
    └── DOSSIER_slug.md             # On-demand research notes
```

### Component Responsibilities

| Component | Responsibility | Access Pattern |
| :--- | :--- | :--- |
| `CLAUDE.md` | **Operating kernel.** Identity, single-interface contract, operating principles, triage and reasoning budget, routing philosophy, safety rules, repository conventions, and references to supporting documents. Deliberately holds no execution mechanics — those live in `core/` and load on demand, keeping the always-resident file small and stable. | System Prompt / Boot |
| `core/business_memory.md` | Living knowledge of company stage, financials, vision, non-negotiables, and moats. Every field carries confidence, provenance, and an update date. Agent-maintained; the founder never edits it. | Read on every deliberation |
| `core/onboarding/` | Business Memory subsystem: schema template plus the onboarding, inference, confidence, and update-workflow protocol. | Read on first run or memory update |
| `core/executives/` | The persona reasoning modules, **one file per lens** (ADR-011): objective, evaluation criteria, heuristics, failure modes, and the activation / suppression / escalation criteria that gate participation. Each file declares machine-readable front matter — `id`, `display_name`, `role`, `structural`, `ordinal`, `version`. The directory is the roster; no list of executives exists anywhere else. | Read at Focused budget or higher |
| `core/reasoning_rules.md` | The participation gate, reasoning-budget allocation, domain routing table, stage adaptation, override conditions, Intervention overlay, and conflict arbitration. | Read at Focused budget or higher |
| `core/execution_pipeline.md` | Stage-by-stage mechanics of the 7-stage pipeline and the Executive Action Memo specification. | Read at Focused budget or higher |
| `core/learning_protocol.md` | Decision Record schema, review procedure, decision-vs-outcome quality framework, calibration adjustment rules. | Read when writing a record or reviewing |
| `core/calibration_journal.md` | The advisor's own track record: active calibration adjustments, confidence calibration, inference and routing accuracy, override rate, founder patterns. Measures the advisor, not the founder. | Read on session boot |
| `journal/` | Audit log of past decisions, explicit predictions, and post-mortem outcome reviews. | Write on decision; Read on review |
| `dossier/` | Targeted background research on markets, competitors, or specialized technical frameworks. | Read on-demand |

---

## 5. CHIEF OF STAFF ARCHITECTURE

The **Chief of Staff (COS)** is the central cognitive gateway and execution orchestrator.

```
       FOUNDER QUERY
             │
             ▼
┌─────────────────────────┐
│   COS INTENT DIAGNOSIS  │ ──► Checks for XY Problems & Cognitive Biases
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   MEMORY & STAGE LOAD   │ ──► Reads `core/business_memory.md`
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  ROUTING & WEIGHTING    │ ──► Reads `core/executives/` & selects 2-4 lenses
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  INTERNAL SYNTHESIS     │ ──► Resolves friction & applies Epistemic Tagging
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ EXECUTIVE ACTION MEMO   │ ──► Prints single recommendation to terminal
└─────────────────────────┘
```

---

## 6. THE 7-STAGE COGNITIVE PIPELINE

The seven stages below are **Phase C** of the runtime lifecycle. The full lifecycle — session initialization, request intake, reasoning, persistence, shutdown — is specified in `core/execution_pipeline.md`, which is canonical for execution. The phases wrap these stages; they do not renumber them.

Every deliberation undergoes an internal 7-stage evaluation pass:

1. **Stage 1: Intent & Diagnosis**: Audits query for XY traps, emotional triggers, and unstated assumptions.
2. **Stage 2: Epistemic Classification**: Tags data into *Known Facts*, *Strong Evidence*, *Weak Evidence*, *Assumptions*, and *Unknowns*.
3. **Stage 3: Mental Model Selection**: Dynamically selects 2–3 mental models (e.g., Bezos Type 1/Type 2 Reversibility, EV, Theory of Constraints).
4. **Stage 4: Advisory Deliberation**: High-weight executive perspectives argue opposing positions based on their definitions in `core/executives/`.
5. **Stage 5: Red Team & Bias Defense**: Devil's Advocate and Risk Officer challenge the emerging consensus.
6. **Stage 6: Decision Timing & Gating**: Evaluates Reversibility vs Cost of Delay. Decides whether to Act, Gather Info, or Do Nothing.
7. **Stage 7: Recommendation Output**: Generates a standardized Executive Action Memo (EAM).

---

## 7. RUNTIME EXECUTION FLOW

```
                       ┌── memory absent? ──► ONBOARDING ──► write business_memory.md
                       │                      (conversational, inferred, confirmed)
[Founder Input] ──► CLAUDE.md Triage ──► Read core/business_memory.md
                       │                                    │
[Output Memo] ◄── Write journal/DEC-*.md ◄── Execute 7-Stage Pipeline
                       │
                       └── new company fact surfaced? ──► propose memory update ──► confirm ──► commit
```

---

## 8. DESIGN PRINCIPLES & NON-NEGOTIABLES

1. **Brevity over Verbosity**: High signal, dense prose, zero filler.
2. **Opinionated Recommendations**: Never present balanced options without declaring a clear primary path.
3. **No Hallucinated Certainty**: Never present assumptions as facts.
4. **Grounded Reality**: Respect business stage and financial constraints at all times.
