# Skill: Install Gemini CLI

Guidance for narrating a Gemini CLI installation. Read `skills/installation/install_claude_code.md` first — the mechanism is identical; this document only states what is different.

---

## What is different from Claude Code

Gemini CLI's manifest carries `verification: 'vendor-documented'`, not `verified-live` — its capabilities are taken from Google's own documentation and have not been exercised against a running copy by this project (`shared/runtime/manifests.ts`). Several of its capabilities are honestly declared `unknown` rather than guessed at: whether it can resume a prior conversation by handle, and whether its interactive tool-confirmation prompt reaches a non-interactive host the way this application would need it to. Narrating a Gemini installation should carry that honestly — "this one hasn't been tested here yet, so a few things may behave differently than expected" is the accurate framing, not silence about the distinction.

## What the runtime actually does

The same pattern as any other Native engine: opens `documentationUrl`
(`https://github.com/google-gemini/gemini-cli`) in the founder's browser, then polls detection until the `gemini` command resolves on `PATH`. Nothing here is specific to Gemini beyond the URL and the command name the detector looks for.

## When to recommend this over Claude Code

When the founder has stated a preference for it, or already has a Google-ecosystem workflow it fits into better. Not as a default suggestion ahead of the one provider this project has actually verified — see `install_claude_code.md`'s note on why that ordering exists.

## What not to promise

Everything `install_claude_code.md` already says not to promise, plus one more: do not describe Gemini CLI's permission-consent behaviour as working identically to Claude Code's measured 4-second block (`electron/bridge/permission-policy.ts`). That specific claim has not been checked for Gemini CLI, which is exactly why `permissionPrompts` is declared `unknown` rather than `supported` in its manifest.
