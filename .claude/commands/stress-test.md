---
description: Show the raw executive disagreement behind a recommendation, unsynthesized
argument-hint: <decision, or blank for the most recent recommendation>
---

# /stress-test

Expose the internal deliberation instead of the synthesis.

**Target:** $ARGUMENTS — if blank, the most recent recommendation in this session.

## Purpose

This is one of two sanctioned exceptions to the **single-interface contract** (`CLAUDE.md` §2, ADR-003); the other is `/lens`. Normally the founder receives one converged recommendation and never sees persona dialogue. This command exists because a founder sometimes needs to audit *how* an answer was reached — to check whether opposition was real or manufactured, and whether a lens they expected to matter was suppressed.

The two exceptions differ in kind. This one exposes a deliberation that **did** happen. `/lens` declines to convene one at all.

## Execution path

Owns no reasoning logic. It changes **presentation**, not process.

1. If targeting an existing recommendation, reuse its deliberation — routing, positions, and challenge findings. **Do not silently re-derive it**; a fresh run may reach a different answer and obscure the very thing being audited.
2. If given a new decision, run `core/execution_pipeline.md` Phase B and C at **Full budget minimum**.
3. Present the deliberation unsynthesized.

## Expected output

Not a memo. Structured disagreement:

- **Lenses activated** — with tier, and *why each was eligible*.
- **Lenses suppressed** — which, and on what criterion. This is often the most informative part: it shows what the system decided was irrelevant.
- **Positions** — each Lead lens's case in its own terms. Support lenses' single constraints.
- **The conflict** — where they genuinely diverge, and which rung of `reasoning_rules.md` §7 resolved it.
- **Challenge findings** — Risk Officer's bad case; Devil's Advocate's strongest attack, at full strength.
- **What survived, and what changed** — explicitly, including whether the recommendation survived unaltered.

## Behaviour notes

- **Persona dialogue is permitted here and nowhere else.** Attribute positions to lenses. This does not license roleplay or invented personality — these remain reasoning modules, presented as such.
- **Do not manufacture disagreement for display.** If the lenses genuinely converged, say so and say why. A fabricated split to make this command look productive is worse than a boring answer, because it misrepresents the reasoning the founder is auditing.
- **Report suppression honestly**, including any lens the founder might have expected to be active. If routing was wrong, this command is how it gets caught.

## Failure behaviour

- **No argument and no prior recommendation** — ask what to stress-test.
- **Target was answered at Minimal or Focused budget** — say that no lenses ran (Minimal) or only 1–2 did (Focused), and offer to re-deliberate at Full instead of presenting a thin deliberation as though it were a full one.
- **Original deliberation not recoverable** — say so, then re-run at Full budget and label the output as a fresh deliberation, not a reconstruction.
