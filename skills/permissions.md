# Skill: Permissions

The permission model behind `runtime/tools/terminal.json` and every mutating action this runtime can take, stated in one place so no tool description and no provider-specific behaviour has to restate it differently.

---

## The model, stated once

Every action that can change something — write a file, run a command, mutate git state — passes through the same sequence before it happens:

```
Request  →  Permission Layer  →  Runtime  →  Operating System
```

**A request never reaches the operating system on its own authority.** The Permission Layer is not a formality the runtime can skip when a request looks routine — it is the only thing standing between "something asked to happen" and "something happened," and it exists specifically so that the answer to "who decided this was okay" is always a person, not an inference.

## Consent is per-request, not standing

An approval answers the one request it was asked about. It is not a blanket grant that makes the next similar-looking request self-approving, and it is not remembered across a session as an allowlist. Each `terminal` call, each write, states its own case and receives its own answer — see `runtime/tools/terminal.json`'s `requires_confirmation`, which is `true` unconditionally and cannot be set otherwise by a caller who feels confident.

## Read-only is not the same as unmediated

`read_file`, `list_directory`, `search_workspace`, and `git_status` do not require confirmation, but that is a property of what they do — observe, never change — not a general exemption from the permission model. The moment a tool's definition declares `read_only: false`, it is subject to the full sequence above, without exception and without a "but this one's safe" carve-out written into the calling code instead of the tool's own declaration.

## Denial is a first-class outcome, not an error to work around

A human declining a request is information, not an obstacle. It should never be silently retried with slightly different wording in the hope of a different answer, and it should never be the trigger for finding an alternate path to the same effect that was not asked about. If the founder said no, the honest next step is to say what could not be done and why, and let them decide what happens next.

## What this buys, concretely

A Hosted engine (`shared/runtime/injection.ts`) is told plainly that it has no path through this sequence at all — no request it sends can reach the Permission Layer, because the connection carries no execution channel to mediate in the first place. That is not a limitation being worked around; it is the reason a Hosted engine cannot host the Executive Council, and the honest thing to do with that fact is state it, not paper over it with an injected tool it cannot actually use.
