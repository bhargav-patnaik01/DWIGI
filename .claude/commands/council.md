---
description: Deliberate normally, with the constructive lens pool restricted to an explicit set
argument-hint: <enabled-lens-ids> <message>
---

# /council

Normal Council deliberation, restricted to the constructive lenses the founder has enabled.

**Enabled set:** the first whitespace-delimited token of $ARGUMENTS — comma-separated lens identifiers.
**Message:** everything after that token, verbatim, including line breaks.

$ARGUMENTS

## Purpose

The routing gate (`reasoning_rules.md` §1) decides participation from each lens's own criteria. That is correct and stays correct. What it has no notion of is a founder who has decided a given discipline is not useful to them right now — a solo technical founder with no sales motion, say, who does not want a Sales/GTM constraint attached to every decision.

This command carries that configuration as an **explicit narrowing of the Layer-1 candidate pool.** It is not a new routing algorithm and it is not a preference the system should infer. It applies only when the founder has actually changed the default; a full pool sends no directive at all.

**This changes eligibility only.** Triage, budget, stages, mental models, output form, conflict resolution, and the logging trigger are all untouched.

## Execution path

1. **Read the enabled set.** Identifiers are the six constructive lenses' own headings in `core/executive_matrix.md`, lowercased with punctuation reduced to hyphens: `ceo`, `cfo`, `coo`, `sales-gtm`, `product`, `coach`.
2. **Phase A and B run normally**, including B4 budget assignment.
3. **At B5, the candidate pool is the enabled set.** Evaluate each enabled lens against its *Activates when* / *Suppressed when* criteria exactly as usual. A lens outside the set is treated as absent: it is not evaluated, does not enter S4, and produces nothing.
4. **Layer 2 weighting proceeds among whatever passed**, using the domain table normally.
5. **Phase C and D run normally.**

## What this command cannot suppress

Three exclusions are structural, and a founder's configuration does not reach them. State the reason once, in-line, whenever one of them overrides the set — silently ignoring the configuration would be worse than either honouring or refusing it.

- **Risk Officer and Devil's Advocate.** They operate at S5, not S4, and `executive_matrix.md` §7 and §8 make them non-suppressible at Full and Maximum budget. This command governs the constructive pool only and never touches them.
- **CFO's solvency floor.** `reasoning_rules.md` §4 — *never suppress CFO entirely at any stage* — and `executive_matrix.md` §2 — *never suppressed while runway is under six months*. If CFO is outside the enabled set and the §5 runway override fires, CFO enters anyway and you say why. Cash out means game over outranks a display preference.
- **The Intervention overlay.** If B2 detects an intervention state, Coach leads per `reasoning_rules.md` §6 whether or not Coach is enabled. A founder cannot configure away a check on their own state, and the overlay exists precisely for moments when they would want to.

## Expected output

Whatever the assigned budget calls for — unchanged. A restricted pool produces a narrower deliberation, not a different kind of output.

## Behaviour notes

- **Do not compensate for an absent lens.** If Sales is disabled, no part of the answer smuggles in a Sales constraint under another lens's name. Absence is structural (`reasoning_rules.md` §1); a lens outside the pool contributes nothing.
- **Say when the restriction bit.** If the domain table wanted a lens the founder has disabled, name it once — *"routed without the Sales lens, which this domain would normally lead"* — and proceed. The founder chose the configuration and is entitled to know what it cost on this decision.
- **Fewer than two enabled lenses** — `reasoning_rules.md` §1 requires 2–4 constructive lenses for a deliberation. Say the configuration is too narrow to deliberate and answer with the single lens available, labelled as such. Do not pad the pool back up by choosing a lens the founder disabled.
- **A narrow pool is not a smaller decision.** Budget is set by what the decision is worth, never by how many lenses are available.

## Failure behaviour

- **No enabled set, or an unparseable one** — ignore the restriction entirely and route normally. A malformed configuration must never silently narrow a deliberation; the safe failure is the full board.
- **An unrecognised identifier in the set** — ignore that identifier, keep the rest, and say which one was not recognised.
- **The set names a challenge lens** — ignore it. Those are not constructive lenses and are governed by budget, not configuration.
- **No message after the set** — ask what they want to decide. Do not deliberate on the previous message by assumption.
