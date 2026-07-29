# Business Memory — Template

**This file is schema only. It must never contain real company information.**

It defines the shape of `core/business_memory.md`, the living memory instance created during onboarding. This template is tracked upstream and shared by every founder who clones this repository; the instance it produces is private to one company.

Do not read this file to answer questions about a company. Read the instance.

---

## 1. Instance lifecycle

| | |
| :--- | :--- |
| **Instance path** | `core/business_memory.md` |
| **Created by** | The onboarding conversation (`core/onboarding/memory_protocol.md`) — never by hand |
| **Maintained by** | The Chief of Staff, via the update workflow. The founder never edits it directly. |
| **Never** | Copy real values into this template. Never populate the instance by guessing. |

If the instance does not exist, the system is on first run and enters onboarding. See the protocol.

---

## 2. Field metadata contract

Every field carries four attributes. A value without provenance is unusable, because downstream reasoning cannot tell a confirmed fact from a lucky guess.

| Attribute | Meaning |
| :--- | :--- |
| **Value** | The content, or `unknown` |
| **Confidence** | `high` · `medium` · `low` · `unknown` |
| **Provenance** | How this was obtained (below) |
| **Updated** | ISO-8601 date (`YYYY-MM-DD`) |

### Provenance vocabulary

These are the only legal values. **This section defines what each means; `reasoning_rules.md` §8 defines what each is worth when reasoning.** Vocabulary here, weighting there — neither restates the other.

| Provenance | Meaning |
| :--- | :--- |
| `confirmed` | Founder stated it directly, or confirmed a proposed inference |
| `corrected` | Founder overrode a previous value |
| `imported` | Extracted from a document or external source, not yet confirmed |
| `inferred` | System deduced it and the founder has not confirmed |
| `unknown` | Not yet established |

Recording provenance is the reason this metadata exists: an `inferred` value later treated as a fact produces confident advice resting on the system's own guesswork, which is the most dangerous failure mode available to it. **Never write a value without its provenance.**

### `unknown` is a valid, permanent state

Never fabricate a value to complete the schema. Never treat `unknown` as zero, empty, or unimportant. Fields legitimately remain `unknown` for months until a conversation reveals them. A memory with twelve honest `unknown` fields is worth more than one with twelve invented values.

### Staleness

Operating-state fields expire. Once past the freshness window, a field is demoted to Weak Evidence regardless of its recorded confidence, and never underwrites a High confidence band.

| Category | Fresh for |
| :--- | :--- |
| Operating State (§7) | 30 days |
| Strategy (§8) | 90 days |
| Market, Business Model, Constraints | 90 days |
| Identity, Decision Principles | 365 days |
| Knowledge Ledger | Does not expire — append-only |

---

## 3. Notation

`●` required for grounded reasoning · `○` optional, sharpens quality

Examples below are **illustrative schema hints, not data**. They show the expected shape and granularity of an answer.

---

## 4. Identity

*Changes yearly. Revising anything here is itself a strategic decision and should be journaled.*

| | Field | Value | Confidence | Provenance | Updated |
| :-: | :--- | :--- | :--- | :--- | :--- |
| ● | `mission` | `unknown` | `unknown` | `unknown` | — |
| ○ | `vision` | `unknown` | `unknown` | `unknown` | — |
| ● | `non_negotiables` | `unknown` | `unknown` | `unknown` | — |
| ○ | `decision_principles` | `unknown` | `unknown` | `unknown` | — |

- **`mission`** — what the company exists to do, specific enough that a stranger could judge whether an opportunity is on-mission. *Shape: one or two sentences.*
- **`vision`** — the end state being built toward. *Shape: a sentence describing a changed world, not a revenue target.*
- **`non_negotiables`** — hard constraints that **eliminate** options rather than being weighed against upside (`reasoning_rules.md` §5, §7). *Validation: anything that would bend under sufficient pressure is not a non-negotiable — record it as a preference under `decision_principles` instead. A non-negotiable traded away once stops functioning for every decision afterward.*
- **`decision_principles`** — how this founder wants tradeoffs resolved. *Shape: a list of stated preferences with their reasons.*

---

## 5. Market & Customer

| | Field | Value | Confidence | Provenance | Updated |
| :-: | :--- | :--- | :--- | :--- | :--- |
| ● | `industry` | `unknown` | `unknown` | `unknown` | — |
| ● | `customer_segment` | `unknown` | `unknown` | `unknown` | — |
| ● | `ideal_customer` | `unknown` | `unknown` | `unknown` | — |
| ● | `not_for` | `unknown` | `unknown` | `unknown` | — |
| ○ | `value_proposition` | `unknown` | `unknown` | `unknown` | — |
| ○ | `competitors` | `unknown` | `unknown` | `unknown` | — |
| ○ | `moat` | `unknown` | `unknown` | `unknown` | — |

- **`customer_segment`** — who pays. *Shape: a buyer, not a market size.*
- **`ideal_customer`** — specific enough to disqualify a prospect.
- **`not_for`** — who this is explicitly **not** for. *This boundary does more routing work than the positive definition, and it is the field founders most often skip.*
- **`moat`** — record as a claim **plus its expiry condition**. *Validation: a moat with no stated failure condition is a hope. Store as `claim` / `stops_being_true_if`.*

---

## 6. Business Model & Economics

| | Field | Value | Confidence | Provenance | Updated |
| :-: | :--- | :--- | :--- | :--- | :--- |
| ● | `business_model` | `unknown` | `unknown` | `unknown` | — |
| ○ | `pricing` | `unknown` | `unknown` | `unknown` | — |
| ○ | `revenue` | `unknown` | `unknown` | `unknown` | — |
| ● | `north_star_metric` | `unknown` | `unknown` | `unknown` | — |
| ○ | `success_metrics` | `unknown` | `unknown` | `unknown` | — |
| ○ | `unit_economics` | `unknown` | `unknown` | `unknown` | — |

- **`business_model`** — how value converts to money. *Shape: subscription, usage-based, licence, marketplace take-rate, services.*
- **`north_star_metric`** — **exactly one.** *Validation: reject a list. If two candidates survive, neither is the north star; ask which one, if it moved alone, would mean the business is working.*
- **`success_metrics`** — the 2–4 numbers actually steered by. *Validation: if the founder cannot say how a metric would change a decision, it belongs on a dashboard, not here.*

---

## 7. Operating State

*Volatile. 30-day freshness window.*

| | Field | Value | Confidence | Provenance | Updated |
| :-: | :--- | :--- | :--- | :--- | :--- |
| ● | `stage` | `unknown` | `unknown` | `unknown` | — |
| ● | `cash_position` | `unknown` | `unknown` | `unknown` | — |
| ● | `runway_months` | `unknown` | `unknown` | `unknown` | — |
| ○ | `monthly_burn` | `unknown` | `unknown` | `unknown` | — |
| ○ | `team` | `unknown` | `unknown` | `unknown` | — |
| ● | `binding_constraint` | `unknown` | `unknown` | `unknown` | — |
| ○ | `committed_obligations` | `unknown` | `unknown` | `unknown` | — |

- **`stage`** — *Validation: one of `Idea` · `Pre-PMF` · `PMF` · `Growth` · `Scale`.* Drives stage adaptation (`reasoning_rules.md` §4). PMF means retention is demonstrated, not that customers exist. **An overstated stage is the highest-leverage error in this file** — it calibrates every recommendation for a company that does not exist yet. Store the evidence alongside the value.
- **`runway_months`** — *Validation: a number.* Under 6 triggers a hard override making CFO the Lead lens on every domain (`reasoning_rules.md` §5).
- **`binding_constraint`** — the single thing most limiting progress. *Validation: normally exactly one. Three listed means the real one hasn't been found yet.*
- **`committed_obligations`** — promises that constrain future choices: customer commitments, contract terms, investor expectations, recurring costs, deadlines. Sequencing advice is wrong without these.

---

## 8. Strategy

*90-day freshness window.*

| | Field | Value | Confidence | Provenance | Updated |
| :-: | :--- | :--- | :--- | :--- | :--- |
| ● | `current_priorities` | `unknown` | `unknown` | `unknown` | — |
| ○ | `active_primary_bet` | `unknown` | `unknown` | `unknown` | — |
| ○ | `long_term_goals` | `unknown` | `unknown` | `unknown` | — |

- **`current_priorities`** — *Validation: at most three. More than three is an absence of priorities.*
- **`active_primary_bet`** — the one bet this quarter is spent on, stored with `proves_right` and `proves_wrong` conditions. *A second primary bet means neither is primary.*

---

## 9. Constraints & Capacity

| | Field | Value | Confidence | Provenance | Updated |
| :-: | :--- | :--- | :--- | :--- | :--- |
| ○ | `founder_capacity` | `unknown` | `unknown` | `unknown` | — |
| ○ | `strengths` | `unknown` | `unknown` | `unknown` | — |
| ○ | `weaknesses` | `unknown` | `unknown` | `unknown` | — |
| ○ | `hiring_plan` | `unknown` | `unknown` | `unknown` | — |

- **`founder_capacity`** — structural facts: hours genuinely available, non-transferable obligations, hard personal limits.
- **Boundary with calibration:** this section holds *structural* and *self-reported* traits. Learned behavioural patterns — recurring estimation errors, decision tendencies observed from logged outcomes — belong in `core/calibration_journal.md`. Self-report and observed behaviour are different evidence classes and must not be merged.

---

## 10. Risk & Unknowns

| | Field | Value | Confidence | Provenance | Updated |
| :-: | :--- | :--- | :--- | :--- | :--- |
| ○ | `current_risks` | `unknown` | `unknown` | `unknown` | — |
| ○ | `open_questions` | `unknown` | `unknown` | `unknown` | — |

- **`open_questions`** — known unknowns that matter. These feed S2 directly: an unresolved question here must surface as an *Unknown* when a decision depends on it, rather than being quietly assumed away.

---

## 11. Knowledge Ledger

*Append-only. Does not expire. This is what makes year-two advice better than month-two advice.*

| | Field | Value | Confidence | Provenance | Updated |
| :-: | :--- | :--- | :--- | :--- | :--- |
| ○ | `validated_learnings` | `unknown` | `unknown` | `unknown` | — |
| ○ | `invalidated_hypotheses` | `unknown` | `unknown` | `unknown` | — |
| ○ | `key_relationships` | `unknown` | `unknown` | `unknown` | — |

- **`validated_learnings`** — established from evidence, not belief. *Validation: behaviour observed, not opinion collected. Store claim, evidence, date.*
- **`invalidated_hypotheses`** — things tried that turned out false, with the evidence that killed them. **The highest-value field in this template and the most neglected.** Without it, dead ideas return every few months in new language and the board re-litigates settled questions at full cost.
- **`key_relationships`** — customers, partners, advisors, investors whose position affects decisions. Record the nature of the dependency, not just the name.

---

## 12. Required-field summary

Thirteen `●` fields are what the system needs for grounded reasoning:

`mission` · `non_negotiables` · `industry` · `customer_segment` · `ideal_customer` · `not_for` · `business_model` · `north_star_metric` · `stage` · `cash_position` · `runway_months` · `binding_constraint` · `current_priorities`

Onboarding targets these. It does not attempt the whole schema — the rest accumulates through normal use, which is the point of progressive memory.

### Priority order

Thirteen fields against a five-follow-up cap means onboarding cannot reach them all, and it should not try. **Six carry most of the system's grounding.** Pursue these first, in this order:

| Field | Unlocks |
| :--- | :--- |
| `stage` | Stage adaptation — changes which lens leads on nearly every domain |
| `runway_months` | The under-six-months override; without it CFO reasoning is ungrounded |
| `binding_constraint` | The COO lens, and most sequencing judgment |
| `non_negotiables` | Lets options be *eliminated* rather than endlessly weighed |
| `ideal_customer` | Qualification, positioning, and most Sales/GTM reasoning |
| `north_star_metric` | What "working" means for this business |

**`stage` is first for a reason, and accuracy matters more than optimism.** An overstated stage calibrates every recommendation for a company that does not exist yet, and it is the single highest-leverage error available in this file. PMF means retention is demonstrated — not that customers exist, not that revenue exists, not that the founder believes the product has found its market. When proposing a stage for confirmation, propose the one the evidence supports, not the flattering one.

The Knowledge Ledger (§11) should start empty. Inventing accumulated learnings defeats its purpose.

**Required does not mean mandatory.** If the founder does not know a required field or declines to share it, record `unknown` and proceed. Refusing to operate until the schema is complete would recreate the configuration-form experience this design exists to eliminate.
