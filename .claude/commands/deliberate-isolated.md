---
description: EXPERIMENTAL — deliberate with each executive reasoning in an isolated context
argument-hint: <the decision to deliberate>
---

# /deliberate-isolated

**Experimental. Not the default, and not a replacement for `/deliberate`.**

Run a Full-budget deliberation in which every admitted lens reasons in its **own execution context**, seeing none of the others' reasoning, and the Chief of Staff synthesizes from finished positions only.

**Decision:** $ARGUMENTS

## Purpose

`/deliberate` convenes the board inside one reasoning context. Every lens therefore reads what the previous lens wrote, which may be genuine deliberation — or may be anchoring, with later lenses converging on the framing of earlier ones because it is present rather than because it is right.

Nobody knows which. This command exists so the two can be measured against each other rather than argued about (`docs/validation/BENCHMARK.md`).

**It changes execution only.** Triage, budgets, the routing gate, stage adaptation, overrides, the conflict ladder, the output contract, and the logging trigger are all untouched. The lenses are the same lenses, reading the same files.

## Execution path

1. **Phase A** — session init, if not already done this session. Unchanged.

2. **Phase B** — intake as normal, but **force B4 to Full** (as `/deliberate` does). Run B5 normally: Layer 1 against `core/executive_manifest.md`, then Layer 2 weighting. This yields the admitted constructive lenses with tiers, plus the challenge lenses.

3. **Build the working context.** One block of text, assembled once, identical for every lens. It contains exactly:
   - The decision as the founder stated it, verbatim.
   - **S1** — the real question in one sentence, the domain, and any unstated assumption the framing carries.
   - **S2** — the load-bearing inputs sorted into Known Fact / Strong Evidence / Weak Evidence / Assumption / Unknown, with provenance, per `reasoning_rules.md` §8.
   - The Business Memory fields the decision depends on, with provenance. *(Omitted entirely under `/learning`.)*
   - The stage, and whether stage adaptation is active.

   **S1 and S2 are run once, by you, before any lens is spawned.** They establish what is being decided and what is known — shared ground, not a position. Running them per-lens would mean eight different readings of the same question, which is a different experiment.

4. **Spawn one isolated execution per admitted lens.** Use the Task tool, one call per lens, and **issue them together so they run concurrently** — sequential spawning would make the experiment's latency a measure of your patience rather than of the architecture.

   Each subagent receives the prompt in *Isolated lens prompt* below. Nothing else.

5. **Collect the finished positions.** Each returns one position. You receive them as data.

6. **Phase C, resumed.** S3 mental models, then **S4 is now reconciliation rather than convening** — you hold the positions and resolve them by the ladder in `reasoning_rules.md` §7. **S5 runs as normal**: Risk Officer and Devil's Advocate attack the emerging recommendation. They are spawned the same isolated way, and they receive the draft — attacking a finished draft is their whole function and is not contamination.

7. **S6, S7** — verdict and Executive Action Memo, exactly as `/deliberate` produces them.

8. **Phase D** — the normal D1 logging trigger. Unchanged.

## Isolated lens prompt

Send this to each constructive lens's subagent, substituting the bracketed parts:

> You are reasoning as one executive lens of the Executive Intelligence System.
>
> Read **only** `core/executives/[ID].md`. That is your mandate. Do not read any other file in `core/executives/` — the other lenses are not yours to speak for, and this deliberation depends on you not having seen them.
>
> Your tier on this decision is **[LEAD or SUPPORT]**. A Lead states a full position. A Support contributes one bounded constraint, not a full position.
>
> [WORKING CONTEXT]
>
> Return **only your finished position**, in this shape:
>
> - **Position** — what you would do, in one or two sentences. Imperative.
> - **Because** — up to three load-bearing reasons, in your own evaluation terms.
> - **What must be true** — the assumptions your position rests on.
> - **What would change my mind** — the specific evidence that would move you.
> - **Confidence** — High, Moderate, or Low, and the weakest thing it rests on.
>
> Do not narrate your reasoning, describe your process, or explain how you arrived at this. Do not mention other executives, speculate about what they would say, or hedge toward a consensus you cannot see. Do not produce an Executive Action Memo — that is the Chief of Staff's output, not yours.
>
> If the decision falls outside what your file says you own, say so in one line and stop. A lens with nothing to contribute contributes nothing; it does not stretch.

## Instrumentation

End the response with this block, and nothing after it:

````
```eis-trace
{
  "pipeline": "isolated",
  "domain": "<routing domain, or unlisted:...>",
  "budget": "Full",
  "stage_adaptation": "<active|inactive>",
  "lenses_s4": [{"id": "cfo", "tier": "Lead"}],
  "lenses_s5": ["risk-officer", "devils-advocate"],
  "positions": {"cfo": "<that lens's returned position, verbatim>"},
  "verdict": "<Act|Gather information|Deliberately do nothing>",
  "confidence": "<High|Moderate|Low>"
}
```
````

**This is a measurement artifact, not output.** It exists so `scripts/benchmark-pipelines.mjs` can compare the two pipelines without a human transcribing transcripts. It is not chain of thought: it records *which* lenses ran and *what they concluded*, both of which the founder can already ask for with `/stress-test`. It carries no reasoning traces.

`positions` must hold what each lens actually returned, unedited. Summarising there would destroy the one measurement this experiment exists to take — how much the lenses' language converges.

## Behaviour notes

- **This is the only sanctioned way to run lenses in separate contexts.** It is not a third exception to the single-interface contract: the founder still receives one converged recommendation, and the isolation is invisible in the output.
- **Never let a lens see another lens's position.** Not in its prompt, not as background, not as "for reference". That is the independent variable; leaking it does not degrade the experiment, it voids it.
- **Do not compensate for isolation.** If two positions conflict, that is a finding — resolve it with the §7 ladder and report the disagreement honestly. Smoothing it over would make the experiment measure your diplomacy.
- **Absent lenses stay absent.** A lens the gate excluded is not spawned and produces nothing, exactly as in production.
- **Budget buys reasoning, not words.** The memo is as short as the decision allows.

## Failure behaviour

- **No argument given** — ask what the decision is. Do not deliberate on the previous message by assumption.
- **A subagent returns nothing, or fails** — report which lens produced no position, synthesize from the rest, and record the gap in the trace. Do not silently proceed with a smaller board, and do not re-run it in your own context, which would defeat the isolation.
- **A subagent returns reasoning narration instead of a position** — use its position content and note the deviation in the trace. Do not discard the lens.
- **Fewer than two constructive lenses admitted** — say so and answer with what is available, as `reasoning_rules.md` §1 requires. Do not pad the board to make the experiment look better.
- **Business Memory missing** — proceed under `CLAUDE.md` §13 and cap confidence accordingly, as `/deliberate` would.
