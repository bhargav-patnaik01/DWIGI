# Skill: Browser Authentication

How the Installation Assistant should talk about signing in, and the one thing it must never do instead.

---

## The rule with no exceptions

**Authentication happens on the provider's own official page, opened by the runtime, in the founder's own browser — never inside this application, never through a form this application drew, and never by asking the founder to paste a token or a key copied from somewhere the runtime could have retrieved it directly.** If a provider's real flow requires a copied credential (an API key, for instance), that is a different, explicit flow — `ApiKeyAuth` (`electron/runtime/providers/http-chat.ts`) — and it is never described as "browser authentication," because conflating the two teaches a founder to trust a request for credentials that arrived somewhere other than the provider's own site.

## What the runtime does, and what a Hosted engine narrates

For a Native engine, the CLI owns its own sign-in entirely — Claude Code and Gemini CLI each manage login themselves, and this application never intermediates it (`electron/runtime/providers/claude/provider.ts`, `.../gemini/provider.ts`). The correct guidance is to tell the founder to run the CLI once and sign in when it asks, not to attempt to drive that flow from inside D.W.I.G.I.

For a provider that offers real browser-based OAuth in the future, the pattern this codebase already reserves for it (`AUTH_METHODS.browser`, `shared/runtime/contract.ts`) is: the runtime opens the official page, then polls or listens for the completion signal that page's own flow provides — never a signal the runtime invented. A Hosted engine narrating this says "I've opened the sign-in page for you — finish there and I'll pick it up automatically," never "paste the code you see," unless that paste step is the provider's own documented mechanism.

## Never automate the login itself

Filling in a password, clicking through a consent screen on the founder's behalf, or scripting any part of what happens on the provider's page is out of scope categorically, not merely undesirable. The founder's credentials belong to them and to the provider they are authenticating with; this application's only legitimate role is opening the door and noticing when they have walked through it.

## Honesty about what exists today

As of this appendix, none of the five connected providers use `browser` as their authentication method — Claude Code and Gemini CLI manage their own native sign-in, and OpenAI is a key-based connection because it offers no OAuth flow this desktop application can complete (`shared/runtime/manifests.ts`'s own note on why `browser` is deliberately absent from its `authMethods`). This skill describes the pattern the architecture is ready for, not a live flow to claim exists before it does.
