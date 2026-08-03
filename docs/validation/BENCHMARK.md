# Pipeline Benchmark — shared context vs isolated execution

The fixed scenario set and comparison protocol for the Sprint 6 experiment.

**A QA artifact, not a system file.** Never read during an interaction; does not count against ADR-007's context bound.

---

## 1. The question, stated so it can be answered

`/deliberate` convenes every routed lens inside one reasoning context, so each reads what the previous one wrote. `/deliberate-isolated` gives each lens its own context and lets the Chief of Staff synthesize from finished positions.

> **Hypothesis:** shared context causes later lenses to anchor on earlier ones, producing narrower deliberation than the routing gate intends.
>
> **Counter-hypothesis:** shared context *is* deliberation, and isolating the lenses produces a set of unrelated monologues that the synthesis has to invent agreement between.

Both are plausible. Neither is established. The point of this suite is to make the difference measurable rather than arguable.

---

## 2. What can be measured, and what cannot

This is the most important section here, and it constrains what the report may claim.

| Class | Examples | Who can establish it |
| :--- | :--- | :--- |
| **M — Mechanical** | Latency, token counts, cost, lens counts, routing domains, structural completeness of the memo | The harness, repeatably |
| **C — Computable** | Lexical overlap between lens positions, position length distribution, verdict agreement across pipelines | The harness, from captured text |
| **J — Judgment** | "Recommendation quality", "originality", "diversity of reasoning", "synthesis quality" | **An independent human. Not the advisor.** |

**Class J cannot be self-scored, and the report must not pretend otherwise.**

The advisor generates both arms' output. Asking it to then rank them for quality makes defendant and judge the same process — the failure `VALIDATION_MATRIX.md` §1 was written to prevent, in a sprint whose whole purpose is deciding an architectural question. A self-graded quality verdict here would be worse than no verdict, because it would look like evidence.

So: the harness measures M and C exhaustively, captures every transcript, and the class-J comparison is left staged for a human with the transcripts in front of them.

### The anchoring proxy

Anchoring has an objective signature. If lenses in shared context are influenced by what they have already read, their positions will **share more language** than positions written independently.

For each scenario and each pipeline, the harness computes pairwise **Jaccard overlap on content words** between the lens positions, and reports the mean. Lower overlap under isolation is evidence *for* the hypothesis; equal or higher overlap is evidence against it.

**Its limits, stated up front.** Shared vocabulary is not the same as shared thinking — two lenses can reach genuinely independent conclusions in similar words because they are reading the same decision and the same Business Memory. And both arms' positions pass through one writer, which may homogenise phrasing regardless. It is a proxy, it is directional, and it is reported as one.

---

## 3. The scenarios

Eight decisions, one per domain the routing table covers most distinctly. Fixed wording — a benchmark whose inputs drift measures nothing.

Each is written the way a founder actually types: some context, some emotion, an unstated assumption or two. None names the executives it should route to.

| # | ID | Domain | Decision |
| :-: | :--- | :--- | :--- |
| 1 | `hiring` | Hiring | *"I've got one strong senior engineer candidate and I can just about afford them. My other option is two juniors for the same money. We're behind on the roadmap and I'm the bottleneck on every code review. Which way?"* |
| 2 | `fundraising` | Fundraising & dilution | *"An angel I respect has offered 400k at a valuation I think is 30% too low, and they want it closed in three weeks. Taking it means I stop worrying about payroll for a year. Should I take it?"* |
| 3 | `pricing` | Pricing & packaging | *"Two customers have told me we're cheap. I want to raise prices 40% next month across the board, existing customers included. Talk me out of it or tell me to go."* |
| 4 | `product-strategy` | Product scope & roadmap | *"Our biggest customer wants a reporting module nobody else has asked for. It's about six weeks of work. They're 30% of revenue. Do we build it?"* |
| 5 | `founder-conflict` | Founder capacity & burnout | *"My co-founder and I have argued about the same roadmap decision four times in three weeks. I'm starting to think one of us has to go and it probably isn't me. I haven't slept properly since the last one."* |
| 6 | `churn` | Churn & retention | *"We lost three of eleven customers this quarter. Two said 'not the right time', one didn't reply. I want to hire a salesperson to replace the revenue. Sanity check me."* |
| 7 | `technical-debt` | Technical architecture & pivot | *"The codebase is slowing us down badly — every feature takes three times what it should. A rewrite is maybe two months during which we ship nothing. We have nine months of runway."* |
| 8 | `go-to-market` | Go-to-market & channel | *"Inbound has stalled at about four demos a month. I'm considering going all-in on cold outbound, which I've never done and don't enjoy. The alternative is content, which is slower. Pick one."* |

**Why these.** Each is chosen to route a *different* lens set, so the comparison is not eight variations on the same board. Two carry deliberate traps: `founder-conflict` should trigger the Intervention overlay and Coach, and `churn` proposes acquisition spend against a retention problem — which `product.md` names as an escalation condition. If a pipeline misses those, that is a finding worth more than any latency number.

---

## 4. Protocol

Per scenario, against the **sandbox** — never production:

1. **Arm A — production.** `/deliberate <decision>`, then `/stress-test` in the same session to surface per-lens positions.
2. **Arm B — experimental.** `/deliberate-isolated <decision>`, whose trace block carries per-lens positions directly.

Each arm runs in a **fresh session**, so no arm inherits the other's context. Order is fixed A then B; both see identical Business Memory.

### Recorded per run

Mechanical: wall-clock latency · input/output/cache tokens · cost · turns · lenses routed · tiers · domain · verdict · confidence · memo section count.

Computable: mean pairwise lexical overlap between lens positions · position count · position lengths · cross-pipeline verdict agreement.

Captured: the full transcript of both arms, so a human can do the class-J comparison later without re-running anything.

### Known confounds

- **Non-determinism.** Two runs of the same arm differ. With n=1 per scenario, only large effects are meaningful; small differences are noise. This suite is sized to detect a big effect, not to measure a small one.
- **`/stress-test` is a reconstruction.** Arm A's per-lens positions are reported *after* synthesis, by the same context that synthesized them. Arm B's are captured before synthesis. This biases arm A's overlap **upward** for a reason unrelated to anchoring, so an overlap reduction in arm B is partly an artifact of where the text was captured. Any conclusion has to survive that.
- **One judge, one machine, one day.** Model version, load, and time of day are uncontrolled.
