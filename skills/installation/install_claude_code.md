# Skill: Install Claude Code

Guidance for narrating a Claude Code installation, keyed to `shared/runtime/manifests.ts`'s own declared facts about it rather than restating them from memory.

---

## What the runtime actually does

Opens `documentationUrl` (`https://docs.claude.com/en/docs/claude-code/overview`) in the founder's default browser via the operating system — never a page composed or hosted by this application — then begins polling detection (`skills/installation/provider_detection.md`) until the CLI is found on `PATH`. Nothing about the install itself is automated: the founder follows Anthropic's own instructions, on Anthropic's own page.

## What to tell a founder before they start

That Claude Code is a command-line tool, installed once, and that afterward this application drives it as a background process — the founder does not need to keep a terminal window open to use their board day to day. That signing in happens separately, the first time it runs, through Claude Code's own flow (`skills/installation/browser_auth.md`) — not through anything typed into D.W.I.G.I. That once it is installed and signed in, it can become the Active Brain from the AI Control Center, and this application will have already noticed it is there.

## What makes this the right recommendation over an alternative

Per its own manifest, Claude Code is `verification: 'verified-live'` and is the only provider this project has exercised end to end — streaming, resume, and permission consent all measured against a real running copy. Recommending it first, when a founder has no strong preference, is not favoritism; it is passing along the one claim in this whole system that has actually been checked against reality rather than taken from documentation.

## What not to promise

Not a specific install duration, which depends on the founder's connection and machine. Not that the CLI will appear on PATH the instant the installer finishes — some installers require a fresh terminal or a restart of this application to be picked up, which `provider_detection.md`'s `degraded` state exists to explain rather than leaving as an unexplained delay.
