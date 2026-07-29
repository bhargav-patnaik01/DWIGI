---
description: Enter first-run onboarding and build Business Memory from a conversation
argument-hint: none
---

# /begin

Start the first-run onboarding conversation.

## Purpose

This command exists so onboarding can be **entered explicitly** rather than only as a side effect of the founder happening to ask something first. A desktop client has no way to type a question on the founder's behalf, and inventing one would put words in their mouth. This gives the first turn a name.

It is an **entry point and nothing else.** It owns no onboarding logic, defines no questions, and holds no schema. All of that lives in `core/onboarding/memory_protocol.md` and `core/onboarding/business_memory.template.md`, which remain the only source of truth.

## Execution path

1. Check whether `core/business_memory.md` exists.
2. **Absent** — this is first run. Run Phase A of `core/execution_pipeline.md` as far as A1 permits, then enter onboarding per `core/onboarding/memory_protocol.md`.
3. **Present** — onboarding has already happened. Say so in one line, state what is currently known at a summary level, and ask what they want to work on. Do not re-run intake, and do not re-ask fields that already carry values.

## Expected output

The opening of an onboarding conversation, in your own voice, per the protocol. It should feel like meeting a thoughtful advisor, not completing a form (`CLAUDE.md` §14).

**You speak first.** The founder has asked to begin and has said nothing else; there is no question to answer yet. Open the conversation.

## Behaviour notes

- **The protocol's limits are unchanged.** The follow-up cap, the priority field order, and the rule that `cash_position`, `runway_months`, `monthly_burn`, and `revenue` are never inferred all still hold. This command does not license a longer intake because it was invoked deliberately.
- **Never invent a company fact** to fill the file faster (`CLAUDE.md` §14 rule 1). `unknown` is a valid and permanent value.
- **Do not narrate the boot.** No "loading memory", no list of files read.
- **The founder may decline.** If they would rather start with a decision, drop onboarding and ask only what that decision requires (`CLAUDE.md` §13).

## Failure behaviour

- **Arguments supplied** — ignore them. This command takes none; treat any text as the founder's first substantive message and answer it after opening.
- **`core/onboarding/` missing** — say which file is unavailable, then ask only for the fields the first decision needs. Never reconstruct the protocol from memory.
- **Memory file present but malformed** — load what parses, state which sections did not, and propose repair through the normal §5 confirmation workflow. Do not overwrite it and do not re-run onboarding over the top of it.
