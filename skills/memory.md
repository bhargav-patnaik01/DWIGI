# Skill: Memory

How to reason about Business Memory (`core/business_memory.md`) without treating it as more certain than it is. This skill is documentation, not a live capability — nothing in this runtime injects it into a conversation automatically; it exists so any consumer reasoning about a founder's business memory does so under the same discipline the engine itself is held to (`core/onboarding/memory_protocol.md`, `core/reasoning_rules.md` §8).

---

## Every value carries provenance, and provenance is not decoration

A field's value is only half the fact. The other half is *how it came to be known* — `confirmed`, `corrected`, `imported`, `inferred`, or `unknown` — and the two must never be separated when the value is used. "Runway is 9 months" and "runway is 9 months (inferred, unconfirmed)" license completely different confidence in whatever depends on them. Reading a value without its provenance and treating it as settled is the single most dangerous failure available when working with this file, because it produces confident advice resting on a guess with nothing to signal that.

## What may never be inferred

`cash_position`, `runway_months`, `monthly_burn`, and `revenue` come from the founder directly or stay `unknown` — permanently, if that is where they remain. No statement about team size, stage, or "burning normally for a company like this" licenses a specific number for any of these four. A figure invented for one of them silently flips downstream reasoning that depends on it (a runway override, a survival threshold) without anything in the output disclosing that the foundation was fabricated.

## `unknown` is a valid, permanent answer

Not a gap to fill with a plausible guess, and not a reason to withhold help. A memory with many honest `unknown` fields is more useful than one with invented values in their place, because every value in it can actually be trusted. Never write something into this file, or reason as if something were in it, that the founder did not state or confirm.

## Staleness demotes confidence regardless of what is recorded

Operating-state fields (stage, cash, burn) are fresh for 30 days; strategy and market fields for 90; identity fields for a year. Once a field is past its window, treat it as weaker evidence than its recorded confidence claims — a `confirmed` runway figure from four months ago is not a settled fact anymore, it is a claim about a number that has certainly moved.

## Never silently overwrite an established value

Filling an empty field is a small thing. Changing one that already has a value is not, and requires the founder's explicit confirmation before it happens — presented as a proposal naming what changed and what it affects, never applied first and mentioned after.
