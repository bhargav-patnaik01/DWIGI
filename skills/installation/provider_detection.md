# Skill: Provider Detection

How the Installation Assistant knows an installation succeeded, without the founder ever clicking a refresh button.

---

## Continuous, not manual

The runtime re-runs detection (`electron/runtime/discovery.ts`'s `discover()`) on an interval while an installation is in progress, rather than waiting for the founder to ask it to check again. A Native engine going from `absent` to `healthy` between two polls is the signal that the install finished, without the founder having to do anything but wait — the experience v1.2.3 Appendix Part S asks for, delivered by polling that already existed for the AI Control Center, on a shorter interval during an active install.

## What "found" actually means

Presence on `PATH` under the process's current environment, confirmed by a real `--version` invocation succeeding — not the mere existence of an installer having been run, and not a file appearing in a known install directory (that state reads as `degraded`, meaning present but not yet reachable, most often because the founder needs to reopen their terminal or restart the application for an updated `PATH` to take effect). A Hosted engine should say exactly this when a founder reports "I just installed it and nothing happened": the file may be there, but this process has not picked up the new `PATH` yet.

## Narrating a transition

The moment detection reports a provider moving from absent to healthy, that is real news the runtime observed, and repeating it plainly — "Claude Code is now detected on your machine" — is honest. Predicting that it is about to be found, or reassuring a founder that "it should show up any second," is not; a Hosted engine has no way to know that and should not imply otherwise while a genuine wait is in progress.

## The limit of what detection alone establishes

Presence is not the same as being usable. Claude Code detected but not yet signed in, or Gemini CLI found but never authenticated, both still report `healthy` for the binary while the AI Control Center's `authStatus` — a separate, later check — is what actually confirms the founder can use it. Detection ends the installation step; it does not end the connection step.
