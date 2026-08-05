# Skill: Environment Check

The first step of the Installation Assistant (v1.2.3 Appendix Part P) — establishing what is already true about this machine before suggesting anything change.

---

## What actually performs this check

The application's own discovery pass (`electron/runtime/discovery.ts`) — a `--version` probe for each known CLI, a local-port check for each known service, none of it run by a model and none of it requiring the founder to open a terminal. A Hosted engine narrating this step describes what the runtime found; it does not perform the check itself, and it has no channel through which it could.

## What is worth establishing before recommending anything

Operating system — the install instructions for Claude Code differ between Windows, macOS, and Linux, and naming the wrong one wastes the founder's time before the conversation has done anything useful. Whether a Native engine is already present but not on PATH (`degraded` health, per `discovery.ts`) — a founder in this state does not need an installer, they need to be told to reopen their terminal. And whether anything was found at all, since a founder with zero Native engines needs a full walkthrough while one with something already `healthy` mostly needs to be told they are already set up.

## Narrating this honestly

"Let me check what's already on your computer" is honest — the runtime is about to do exactly that, and the founder experiences it as a real check because it is one. "I can see you have Python 3.11 installed" is not honest for a Hosted engine to say, because it has no way to see anything about this machine — only the runtime does, and only the runtime's own detection results, once reported into the conversation, are things the engine may truthfully repeat.

## What this check is not

It is not a general system inventory, and it does not run arbitrary diagnostic commands. It answers exactly one question — which Council Engines, if any, are already usable — using the same detection the AI Control Center already performs, never a broader sweep invented for the occasion.
