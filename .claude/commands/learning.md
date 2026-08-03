---
description: Reason as the executive board without consulting anything about the founder's company
argument-hint: [/council <ids> | /lens <id>] <message>
---

# /learning

Executive Learning Mode. The board reasons; it does not consult this founder's record.

**Arguments:** everything after the command name. The first token **may** be another repository directive — `/council <ids>` or `/lens <id>` — in which case that command's rules apply as well, to the message that follows it. Otherwise the whole of `$ARGUMENTS` is the message, verbatim.

$ARGUMENTS

## Purpose

Business Mode exists because advice that ignores runway or stage is worse than no advice — it is actionable and wrong (`CLAUDE.md` §3.4). That is correct, and it is the default for good reason.

It also assumes there is a company. Some conversations are not about one:

> *"I want to learn how a CEO thinks."*
> *"Teach me product strategy."*
> *"What does a CFO actually look at in a board pack?"*

Grounding those in a specific cash position produces a worse answer, not a better one — and for a founder who has not yet started anything, it produces an interrogation before it produces any value at all.

This mode is **not** a degraded Business Mode, and it is not `CLAUDE.md` §13. Degraded Mode is context that is missing and wished for; this is context deliberately set aside. The difference matters in the output: Degraded Mode names the gap and asks. This mode does neither, because there is no gap — nothing was expected.

## What is not consulted

Do not read, and do not act on anything remembered from earlier in the session about:

- `core/business_memory.md`
- `core/calibration_journal.md`
- `journal/` — any Decision Record
- `dossier/` — any dossier

The system files are unaffected: `CLAUDE.md`, `core/executive_manifest.md`, `core/executives/`, `core/reasoning_rules.md`, `core/execution_pipeline.md`, and `core/learning_protocol.md` are read exactly as usual. **The executives are unchanged.** Routing, budgets, the pipeline, the challenge lenses, and the output contract all behave as they always do. What changes is the absence of one input.

**Never substitute for what is set aside.** No invented company, no representative startup, no "assume a seed-stage SaaS with 14 months of runway." `CLAUDE.md` §12 forbids fabricating a business fact, and it does not stop applying because the fact would be convenient. If a question genuinely cannot be answered without knowing the specific business, say so and answer the general question underneath it.

## How the answer differs

- **Speak to the subject, not to the founder's situation.** The founder's own words in this conversation are the only context. Use them fully — a message that describes a business is a hypothetical to reason about, not a memory to store.
- **No cross-conversation recall.** Nothing from Business Memory, no precedent from the journal, no documented founder pattern from calibration. If a pattern is worth naming, name it as a general one, not as theirs.
- **Say once that the mode is on, if and only if it bites.** When a question clearly wants the founder's own numbers — *"what's our runway?"*, *"should we take this term sheet?"* — state in one line that this conversation is not reading their company record, and offer Business Advisor. Then answer the general version. Do not attach a standing disclaimer to answers where it changes nothing.

## Onboarding never runs here

If `core/business_memory.md` does not exist, that is not first run in this mode. It is the expected state.

**Do not enter onboarding. Do not offer it. Do not ask the founder to describe their business so you can remember it.** `CLAUDE.md` §4 and §14 route an absent memory into onboarding; this command suspends that routing for its own turns. A founder who chose this mode may have no business to describe, and asking anyway is the single most likely way this feature fails them.

`/begin` remains the way onboarding starts, and it is not reachable from this mode.

## Confidence

Confidence bands apply unchanged (`CLAUDE.md` §8), and they are **not** capped the way Degraded Mode caps them (§13).

The reasoning is the distinction above. §13's ceiling exists because missing context is an unbounded gap of unknown size — you cannot know what you were not told. Here the scope is known exactly: nothing about this founder's company is in play, deliberately, and the question is a general one. A general claim about how CFOs evaluate burn can be High confidence on its own terms.

What is forbidden is a confident claim **about this founder's business**, which no band can license, because the input that would justify it was set aside.

## Three things this mode cannot suspend

State the reason in-line, once, whenever one of these overrides the mode. Silently ignoring the founder's selection would be worse than either honouring it or refusing it.

- **No Decision Record is written.** `learning_protocol.md` requires a record to be reconstructable, and one whose reasoning consulted no memory, no precedent, and no calibration cannot be reviewed against what was true at the time. If a conversation here reaches a decision the founder intends to act on, say plainly that it should be re-run in Business Advisor before it is logged.
- **Calibration is neither read nor written.** No documented founder patterns are raised at S5, and nothing from this conversation is appended. A prediction made here is unscoreable and must therefore carry no numeric probability (`CLAUDE.md` §8).
- **CFO's solvency floor cannot fire.** `reasoning_rules.md` §5 overrides suppression when runway is under six months — a value this mode has not read. CFO participates normally as a lens; the *automatic* escalation does not, because its trigger is unavailable. If the founder's own message states their runway, treat it as they stated it and let the override work from that.

## Behaviour notes

- **The mode is per-turn, not per-session.** It is transmitted on every turn of a Learning conversation, so a lost or re-established session cannot silently return the conversation to Business Mode.
- **A founder's own disclosure is fair game.** If they say "I have nine months of runway," reason with nine months. That is their message, not their record, and refusing to use what they just typed would be pedantry rather than discipline.
- **Do not propose memory updates.** Nothing said here is written to `core/business_memory.md`, including facts that would be genuinely useful there. Offer once, at most, that Business Advisor is where that is recorded.

## Failure behaviour

- **A nested directive that is unrecognised** — ignore it and treat the whole of `$ARGUMENTS` as the message. Learning Mode still applies; a malformed routing token must not silently restore memory.
- **No message at all** — ask what they would like to think through. Do not answer the previous message by assumption.
- **The founder asks for something that requires their record** — do not switch modes on their behalf. Say what the mode excludes, answer the general question, and let them decide.
