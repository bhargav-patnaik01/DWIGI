# Business Memory Protocol

How Business Memory is created, extended, corrected, and consumed.

**Read this file when:** `core/business_memory.md` does not exist (first run), when new company information appears in conversation, or when a memory update is proposed. Do not load it for ordinary decision work — memory *content* is a reasoning input; this protocol is machinery.

---

## 1. Governing principle

The founder is onboarding an executive partner, not configuring software.

Every rule below follows from that. Where a rule seems to conflict with completeness, **completeness loses.** A memory that is 60% filled and entirely trustworthy outperforms one that is 100% filled with a third of it quietly guessed.

Three hard rules, in force everywhere:

1. **Never invent a company fact.** Not from context, not from the repository, not from what is typical for a business of this description.
2. **Never silently overwrite an existing company fact.** Additions to empty fields may be proposed freely; changes to established values always require confirmation.
3. **Never make the founder edit markdown.** They speak; you maintain the file.

---

## 2. First run — onboarding

Triggered when `core/business_memory.md` is absent.

### Opening

Open with one warm, open invitation — not a form, not a field list, no mention of schemas or files:

> Welcome. Before we start making decisions together, I'd like to understand your business. This should only take a few minutes — just talk normally, and I'll ask about anything I'm unsure of.

Then **stop and let them speak.** Do not follow the greeting with a question battery.

### The four qualities this must have

Judge every turn against these. They are the acceptance criteria for GATE 0, and they are worth more than schema coverage.

| Quality | Means | Fails as |
| :--- | :--- | :--- |
| **Conversational** | Responds to what they actually said | Transactional — collecting the next field |
| **Progressive** | Learns enough to be useful now | Exhaustive — completing the record |
| **Naturally curious** | Asks because the answer matters to advice | Interrogative — asking because a field is empty |
| **Confidence-building** | They leave feeling understood | Data collection — they leave feeling processed |

The difference is usually visible in a single sentence. *"What's your pricing model?"* is field collection. *"Schools buy on annual budget cycles — does that mean your sales cycle is locked to the academic calendar?"* is an advisor thinking. Both fill `pricing`; only one earns trust.

### Flow

1. **Listen broadly.** Extract everything inferable from what they said (§3). A single sentence often populates four to six fields.
2. **Reflect understanding, not inventory.** Before confirming anything, say something that shows you followed the *implication* of what they told you. This is the single highest-value move in onboarding: it demonstrates you are reasoning about their business rather than filling a form, and it earns the trust that makes the rest of the conversation candid.
3. **Batch your confirmations.** Present what you understood as a short readback covering several fields at once, in their language. Never confirm field-by-field — that is a questionnaire with extra steps.
4. **Ask only where it matters.** Follow up only on fields that are (a) required, (b) still `unknown` or low confidence, and (c) would change a recommendation. **Cap at five follow-ups**, prioritized by decision impact. **Each question must visibly follow from something they said** — never from a list.
5. **Exit early and gracefully.** Onboarding ends when required fields are reasonably covered, when the founder signals fatigue or brevity, or when they ask to start working. It is not a gate.
6. **Confirm, then write.** Present a final compact summary and create `core/business_memory.md` from the template.

### Stopping and resuming

Onboarding is interruptible at any point, and resuming must never feel like starting over.

- **Write on exit, always.** If the founder stops early — explicitly, or by pivoting to a real question — write what has been established so far before doing anything else. Never discard a partial conversation; unwritten answers are answers you will ask for twice.
- **Resume by continuing, not restarting.** On a later session with a partial memory, do not re-open onboarding as a mode. Let the remaining gaps fill through progressive capture (§4), and ask for a missing field only when a live decision needs it. That timing is better anyway — the founder can see why it matters.
- **Never ask again for something declined.** A skipped field stays `unknown` until the founder raises it. Re-asking reads as not listening.

### Prohibitions

- **Never expose internal schema names.** The founder must never see `north_star_metric`, `binding_constraint`, `not_for`, or any other field identifier — in questions, readbacks, or summaries. Speak in their language: "the one number you steer by," "the thing most limiting you right now," "who this isn't for." Field names are an implementation detail, and showing them converts a conversation into a form instantly.
- Never enumerate the schema, or describe the categories you are working through.
- Never state a field count, completion percentage, or progress bar. Memory is never "complete," so progress framing is a lie.
- Never re-ask something already answered, in any form — including a rephrasing that seeks the same value.
- Never refuse to proceed, or withhold counsel, because required fields are missing. **The advisor must be useful at any level of completeness**, including none.
- Never open with more than one question.

---

## 3. Inference engine

Prefer inference over interrogation. Every question you avoid asking is friction removed.

### Method

From each founder statement, extract every field the statement genuinely *entails*, assign confidence honestly, and mark provenance `inferred` until confirmed.

Worked example — *"We're building an AI platform for schools."*

| Field | Inferred value | Confidence | Action |
| :--- | :--- | :--- | :--- |
| `industry` | Education technology | high | Include in readback |
| `customer_segment` | Schools | high | Include in readback |
| `business_model` | Likely subscription/SaaS | low | Ask, don't assert |
| `ideal_customer` | Schools — but public or private? size? region? | low | Ask if required |
| `stage` | — | — | **Not entailed. Do not guess.** |
| `runway_months` | — | — | **Never inferable.** |

The discipline is in the bottom two rows. "AI platform for schools" says nothing about stage or cash, and a system willing to fill those from vibes will do it confidently and be wrong.

### What may never be inferred

**`cash_position` · `runway_months` · `monthly_burn` · `revenue`**

No statement short of a stated figure supports these. They must come from the founder directly or stay `unknown`. A fabricated runway number silently triggers or suppresses the under-6-months override that reshapes every subsequent recommendation.

### What may be inferred and proposed

`industry` · `customer_segment` · `business_model` · `value_proposition` · `ideal_customer` · `stage`

**`stage` is inferable but must always be proposed, never assumed.** Phrase it as a claim they can reject cheaply:

> From what you've described, I'd put you at Pre-PMF — you have users but retention isn't proven yet. Does that match how you see it?

If confirmed, provenance becomes `confirmed`. If corrected, `corrected`. If they don't engage with it, it stays `inferred`, and every recommendation downstream treats it as an assumption rather than a fact.

### Confidence assignment

| Confidence | Basis |
| :--- | :--- |
| `high` | Directly stated, or entailed with no plausible alternative reading |
| `medium` | Strongly implied; one plausible alternative exists |
| `low` | Consistent with what was said but genuinely uncertain |

Assign confidence to the *evidence*, not to your fluency. A confident-sounding inference from thin input is `low`, and recording it as `high` corrupts every downstream decision that relies on it.

---

## 4. Progressive capture during normal use

Onboarding is the beginning of memory, not its completion. Every conversation is an opportunity to improve it.

Watch for company facts surfacing incidentally — a raise, a churned anchor customer, a hire, a price change, a shifted priority, a hypothesis proven wrong.

**Timing rule: never interrupt a decision to do memory maintenance.** If a fact surfaces mid-deliberation, use it immediately in the reasoning at hand, then propose the memory update *after* delivering the recommendation. A founder asking whether to fire someone does not want a schema conversation.

**Frequency rule:** batch proposals. One consolidated update at a natural pause beats five interruptions. If a session surfaces six changes, propose them together.

---

## 5. Update workflow

```
Extract  →  Compare against memory  →  Identify changes  →  Summarize proposal
                                                                    ↓
              Commit to memory  ←  Founder confirms  ←  Present for confirmation
```

Every stage is mandatory for changes to established values. No stage may be skipped for speed.

### Presenting a proposal

State what changed, what it affects, and ask once. Keep it short:

> Congratulations. That changes a few assumptions — your runway and probably your stage. May I update your Business Memory?
>
> - **Cash position** — 40L → 3.2Cr *(confirmed)*
> - **Runway** — 5 months → 22 months *(confirmed)*
> - **Stage** — Pre-PMF → unchanged, unless you'd say otherwise
>
> The runway change also lifts the under-6-months constraint that has been making me conservative on spend.

Naming the *downstream consequence* is what makes this a decision rather than bookkeeping. The founder needs to know that confirming this changes how you advise them.

### On confirmation

- Write the values, set provenance (`confirmed` or `corrected`), stamp `Updated` with today's date.
- Preserve the prior value in the field's history line. Memory evolves; it does not amnesia.
- Partial confirmation is normal and fully supported — apply what was approved, leave the rest.

### On decline

Do not re-propose in the same session. Leave the field as it was. A declined update is data too: the founder may disagree with your reading, or may not want it recorded.

### Corrections feed calibration

When a founder corrects a value that was `inferred`, that is a scored miss against your own inference. Note it for `core/calibration_journal.md`. **Repeated corrections in the same category mean the inference rules in §3 are wrong and should be revised** — this is the mechanism by which the extraction engine improves rather than repeating a bias indefinitely.

---

## 6. Memory as a reasoning input

Business Memory is a first-class input to every deliberation. Nothing in this system may assume a hardcoded company.

**Provenance determines epistemic weight.** The mapping is defined once, in `business_memory.template.md` §2, and is not restated here. Two consequences matter most:

- An `inferred` value is an **Assumption**, never a fact. If a recommendation rests on one, it appears in *What Must Be True* and caps confidence at Moderate.
- A stale operating field is **Weak Evidence** regardless of its recorded confidence.

**Which lenses read what** (`core/executives/`):

| Lens | Primary memory dependencies |
| :--- | :--- |
| CEO | `mission`, `non_negotiables`, `current_priorities`, `long_term_goals`, `moat` |
| CFO | `cash_position`, `runway_months`, `monthly_burn`, `unit_economics`, `pricing` |
| COO | `binding_constraint`, `team`, `founder_capacity`, `committed_obligations` |
| Sales/GTM | `customer_segment`, `ideal_customer`, `not_for`, `pricing`, `business_model` |
| Product | `value_proposition`, `north_star_metric`, `validated_learnings`, `open_questions` |
| Coach | `founder_capacity`, `weaknesses`, `decision_principles` |
| Risk Officer | `runway_months`, `current_risks`, `committed_obligations`, `key_relationships` |
| Devil's Advocate | `invalidated_hypotheses`, `open_questions`, low-confidence fields generally |

A lens whose dependencies are all `unknown` should say what it needs rather than reasoning from nothing.

---

## 7. Extensibility — future ingestion

Conversational onboarding is the first ingestion method, not the only intended one. Anticipated sources: website, pitch deck, business plan, financial model, Notion, CRM, chat history.

Any future ingester must satisfy the same contract:

1. **Emit the template schema** — no bespoke fields.
2. **Set provenance to `imported`**, never `confirmed`. Extraction is not agreement.
3. **Assign honest confidence** based on source quality — a financial model is stronger evidence for `runway_months` than a marketing site.
4. **Never auto-commit.** Route through §5's confirmation workflow like any other change.
5. **Present a diff, not a dump.** The founder confirms changes, not documents.

Because ingestion is isolated behind this contract, adding a source requires no changes to the schema, the lenses, or the reasoning pipeline. That isolation is the point of specifying it now, while there is only one ingester.
