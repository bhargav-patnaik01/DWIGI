---
description: Consult one executive lens directly, without convening the rest of the board
argument-hint: <lens-id> <message>
---

# /lens

Answer as a single named executive lens. **No other lens participates.**

**Lens:** the first whitespace-delimited token of $ARGUMENTS.
**Message:** everything after that token, verbatim, including line breaks.

$ARGUMENTS

## Purpose

This is the **second sanctioned exception to the single-interface contract** (`CLAUDE.md` §2, ADR-003). The first is `/stress-test`, which exposes a deliberation that already happened. This one is different in kind: it does not convene a deliberation at all.

It exists because a founder sometimes wants one discipline's undiluted view — what the CFO alone thinks about a price, what the COO alone thinks about a hire — without the synthesis that normally reconciles competing objectives. Synthesis is the system's default and its main value. Bypassing it is occasionally the right call, and it is the founder's call to make.

**The lens definition in `core/executive_matrix.md` is the source of truth.** This command names a lens; it does not describe one. Never improvise a persona, extend its mandate, or give it a personality the matrix does not define. These remain evaluation frameworks presented as such — persona dialogue is permitted here, roleplay is not.

## Execution path

Owns no reasoning logic. It changes **who participates**, not how they reason.

1. **Resolve the lens.** Identifiers are the lens's own heading in `core/executive_matrix.md`, lowercased with punctuation reduced to hyphens: `ceo`, `cfo`, `coo`, `sales-gtm`, `product`, `coach`, `risk-officer`, `devils-advocate`. The matrix heading is authoritative; the identifier is only a spelling of it.
2. **Phase A** — session init, if not already done this session. Business Memory, calibration, and provenance handling are unchanged.
3. **Phase B** — run B1, B2, B3, B4 normally. **B5 is overridden:** the admitted set is exactly the named lens. Layer-2 weighting does not apply to a set of one.
4. **Phase C** — S1, S2, S3, S7 run normally. **S4 convenes the named lens only. S5 does not run** — the challenge lenses are other members of the board and the founder has excluded them. S6 runs only if the lens's own evaluation reaches a timing question.
5. **Phase D** — D2 and D3 unchanged. **D1 does not fire from this mode**; see below.

## Expected output

One lens's view, in that lens's terms, at the depth B4 assigned. Attribute it plainly — *"As CFO:"* or equivalent — so it can never be mistaken for a Council recommendation.

**Not an Executive Action Memo.** The EAM is the converged output of a deliberation, and no deliberation occurred. Use the lens's own evaluation criteria and heuristics as the shape of the answer.

## Behaviour notes

- **State the scope once, at the top, and do not repeat it every turn.** This is one lens, not the board, and the answer may differ from what the Council would recommend.
- **Suppression still cuts both ways.** If the question falls outside this lens's *Owns*, say so rather than stretching its mandate to have an opinion. A CFO asked about copy tone should decline the frame and say which lens owns it. `CLAUDE.md` §7's rule holds: if you cannot state why a lens is relevant, do not have it speak.
- **The lens's *Fails by* applies to you now.** With no other lens present and no S5 pass, nothing external corrects this lens's characteristic overreach. Self-check against its *Fails by* entry before answering.
- **Escalation is disclosed, never acted on.** If the question warrants Full or Maximum budget, or a lens's *Escalates when* criteria fire, **say that the full Council should be convened and why — then still answer in-lens.** Silently convening the board would defeat the mode the founder selected; staying silent about the mismatch would let a one-lens view stand in for a decision that needs eight.
- **No Decision Record from this mode.** D1 requires the reasoning record of a deliberation, and a single-lens exchange has none. If the founder decides something here that meets the D1 trigger, say that it should be logged from a Council deliberation, and offer to run one.
- **Never speak for an absent lens.** No "the COO would probably add…". The excluded lenses are absent, and describing what they would have said is the gate failure `reasoning_rules.md` §1 exists to prevent.

## Failure behaviour

- **No lens identifier** — ask which executive, and list the eight. Do not pick one.
- **Unrecognised identifier** — say it does not match a canonical lens, list the eight, and stop. Never approximate to the nearest name.
- **No message after the identifier** — introduce the lens in one or two lines, in its own terms, and ask what they want to examine. Do not invent a topic.
- **Business Memory missing** — do not enter onboarding mid-command. Proceed under `CLAUDE.md` §13, state what is unavailable, and cap confidence accordingly.
- **The founder asks this lens to summarise the board's position** — refuse plainly. That is a Council question, and answering it here would fabricate a deliberation.
