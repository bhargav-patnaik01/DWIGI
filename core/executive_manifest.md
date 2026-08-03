# Executive Routing Manifest

Participation metadata for every lens, and **the only file Layer 1 reads.**

---

## 1. How to use this file

**This is the only file Layer 1 reads.** Evaluate every entry, then load persona files for the admitted lenses only.

```
B5 Layer 1  ──►  this file            ──►  admitted set
B5 Layer 2  ──►  rules §3 domain table──►  Lead / Support tiers
S4 / S5     ──►  load ONLY admitted lenses from core/executives/
```

Rules, all operative:

- **Participation here; reasoning there.** This file holds group, *Activates when*, *Suppressed when*, *Escalates when*. A lens's own file holds *Objective*, *Owns*, *Evaluates by*, *Heuristics*, *Fails by*, *Tension with*. Nothing appears in both (ADR-012).
- **Each `###` heading is a lens `id`**, matching its filename. Group membership is the `##` section it sits under, and that is the only record of it.
- **A lens with no entry here does not participate.** The gate cannot admit what it cannot evaluate. Report the omission; never guess its criteria.
- **Evaluate *Escalates when* for every entry, including excluded ones** — see §4.
- **Board rules are not per-lens metadata.** The domain table, stage adaptation, overrides, the overlay, and arbitration stay in `reasoning_rules.md` §3–§7 and are not restated here.

---

## 2. Constructive lenses

These build the recommendation at **S4**. The gate routes **2–4 of them** (`reasoning_rules.md` §1).

### ceo

**Activates when:** The decision changes market, positioning, focus, or the sequencing of major bets — or commits the company beyond two quarters.

**Suppressed when:** The decision is tactical, reversible, and sits inside an already-approved strategy. **Most weeks contain no strategic decision**, and treating routine calls as strategic inflates them.

**Escalates when:** A decision quietly changes what business this is — a large customer pulling the roadmap, a channel becoming the product, a pivot arriving disguised as a feature request.

### cfo

**Activates when:** Money moves, a recurring cost or contingent liability is created, pricing changes, or founder time exceeding roughly two weeks is committed.

**Suppressed when:** Cost is immaterial, non-recurring, and creates no contingent liability. **Never suppressed while runway is under six months** (`reasoning_rules.md` §5).

**Escalates when:** Runway falls below six months; a single commitment exceeds roughly 15% of remaining cash; or a recurring cost is created with no stated kill condition.

### coo

**Activates when:** The decision consumes delivery capacity, changes sequencing, creates a dependency, or touches the current bottleneck.

**Suppressed when:** Pre-PMF and the decision concerns *what to learn* rather than *how to deliver* (`reasoning_rules.md` §4) — or the decision creates no execution load at all.

**Escalates when:** Commitments exceed delivery capacity; the founder has become the bottleneck; or a dependency has no owner.

### sales-gtm

**Activates when:** The decision touches price, packaging, channel, buyer definition, market-facing positioning, or revenue timing.

**Suppressed when:** The decision is internal, has no customer-facing surface, and creates no revenue path.

**Escalates when:** A deal requires a product commitment, contractual term, or pricing exception outside current strategy.

### product

**Activates when:** The decision changes what gets built, its scope, the problem definition, or retention mechanics.

**Suppressed when:** The decision is purely commercial, financial, or operational with no user-facing surface.

**Escalates when:** A build commitment is made with no evidence base, or a retention problem is being addressed with acquisition spend.

### coach

**Activates when:** The decision commits founder time or energy beyond current load, touches identity or a key relationship, **or** state signals appear — fatigue markers, urgency language disproportionate to actual stakes, or repeated reopening of a settled decision.

**Suppressed when:** The decision is technical or financial and the founder is demonstrably steady. **Topic gravity alone never activates Coach** — only founder state or committed capacity does. A pivot discussed calmly gets no Coach lens; a small decision revisited four times does. Manufactured concern is condescending and trains the founder to discount this lens when it finally matters.

**Escalates when:** Sustained depletion signals appear, or the founder is deciding from a state they would disown a week later. Both trigger the Intervention overlay (`reasoning_rules.md` §6).

---

## 3. Challenge lenses

These do not participate at S4. They attack the finished draft at **S5**, and are structural: always active at Full and Maximum budget regardless of domain. They are **not counted** against the 2–4 constructive limit.

### risk-officer

**Activates when:** Full or Maximum budget — always, regardless of domain. At Minimal or Focused budget, activates the moment irreversibility or legal exposure appears.

**Suppressed when:** Minimal and Focused budgets, absent irreversibility or legal exposure. **Never suppressed at Full or Maximum budget.**

**Escalates when:** Any irreversible commitment; any regulatory or legal exposure; any single point of failure in cash, customers, or infrastructure. Escalation here forces the budget up — a Focused question that turns out to be irreversible becomes a Full deliberation.

### devils-advocate

**Activates when:** Full or Maximum budget — always. At Focused budget, activates only if the founder appears already committed to an answer and is seeking validation.

**Suppressed when:** Minimal budget entirely; Focused budget where the founder is genuinely undecided and the question is cheap and reversible. **Never suppressed at Full or Maximum budget.**

**Escalates when:** The constructive lenses agree quickly; the founder is seeking validation rather than counsel; or a previously logged recommendation is being reversed with no new evidence.

---

## 4. Escalation is evaluated for excluded lenses too

Escalation is **forced from below** (`CLAUDE.md` §5): a lens can raise the whole decision's budget without participating in it. Risk Officer is *suppressed* at Focused budget yet escalates the moment irreversibility appears — so the trigger must be readable while that lens is absent.

**Evaluate every entry's *Escalates when* at B5, including entries the gate is about to exclude.** They are all in this file, which is already open, so this costs nothing.
