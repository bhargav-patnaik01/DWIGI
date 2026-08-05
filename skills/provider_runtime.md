# Skill: Provider Runtime

What `executionMode` (`shared/runtime/contract.ts`) actually means, for anything reasoning about the difference between a Native and a Hosted engine.

---

## Two modes, one declared fact each

**Native** — the runtime discovers its own operating instructions from the workspace and has tools of its own. Claude Code and Gemini CLI are native today: each reads a convention file placed at workspace creation (`CLAUDE.md`, `GEMINI.md`) and can act on what it finds there directly, mediated by its own permission prompts.

**Hosted** — a chat-completions endpoint with no filesystem, no tools, and no notion of a working directory. OpenAI, Ollama, and LM Studio are hosted today: each can hold a conversation and nothing more, because this application passes them no tool definitions and they have no path to a permission channel even if it did.

`executionMode` is a manifest field, not an inference drawn from a provider's name. Adding a sixth provider means declaring which it is, honestly, based on what that specific integration actually does — not on what the vendor's platform is theoretically capable of elsewhere.

## Why this determines Council eligibility without being the thing that decides it

`isCouncilCapable` (`shared/runtime/capabilities.ts`) gates on three declared capabilities — `engineDiscovery`, `filesystem`, `toolCalling` — not on `executionMode` directly. Every `native` provider happens to declare all three `supported`; every `hosted` provider happens to declare all three `unsupported`. The two facts agree because they describe the same underlying reality from two angles, not because one was derived from the other. Treating `executionMode` as a second, independent gate would create two sources of truth for one question, and the day they disagreed, nobody would know which to believe.

## What a Hosted engine is owed, and what it is not

It is owed an accurate description of its own situation — see `shared/runtime/injection.ts`'s fixed context block — so that when a founder asks it something only a Native engine can do, it says so plainly instead of guessing or fabricating an answer. It is not owed, and must never be given, anything that makes it *behave* as though it had tools it does not have. Describing a capability without wiring it to anything real is worse than not mentioning it: it is advertising a feature that fails the moment it is relied on.

## The Executive Council does not know or care which mode is running

Nothing in `core/` branches on `executionMode`, and nothing should. The Council's reasoning is defined once, for whichever engine happens to be running it — the mode only ever decides whether that engine *can* run it at all, upstream of any reasoning taking place.
