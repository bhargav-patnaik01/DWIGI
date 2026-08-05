# Skill: Terminal

How to use `terminal` (`runtime/tools/terminal.json`) — the one tool in this set that can change something. Every other tool here is read-only; this skill exists because that guarantee stops the moment this tool is called.

---

## Prefer not to need it

Before reaching for `terminal`, ask whether `read_file`, `list_directory`, `search_workspace`, or `git_status` already answers the question. `cat file.txt` is `read_file` with extra steps and a wider blast radius — it can be redirected, piped, aliased, or mistyped into something that isn't a read at all. Reserve `terminal` for what the read-only tools genuinely cannot do: running a build, executing a test, installing a dependency, or performing a git operation beyond a status check.

## Every command needs a real description

`description` is a required field, not decoration. "Run npm install" is a description; "run this" is not. The person approving the command is trusting the description to tell them what is about to happen, on a channel they may not have time to independently verify — so it should name what changes, not just what program runs. `rm -rf node_modules` described as "clean up" hides the part that matters.

## Never build a command from untrusted text

The single most common way this tool becomes dangerous is string concatenation: `` `git commit -m "${founderText}"` ``. If `founderText` contains a shell metacharacter — a backtick, a semicolon, an unescaped quote — the command that runs is not the command that was written. Literal, hardcoded command segments are safe. Interpolating anything a human typed, a file contained, or another tool returned is not, unless it has gone through a real escaping or argument-array mechanism built for that purpose. When there is any doubt, pass the volatile content on stdin or as a properly quoted argument array, never spliced into a command string.

## Timeouts are not optional

Set `timeout_ms` deliberately for anything that is not a quick, well-understood command. A process that hangs — waiting on input it will never receive, stuck on a network call, an infinite loop — should fail loudly at the timeout rather than holding the whole session hostage indefinitely. The default exists so a forgotten timeout does not mean no timeout, but a command with unusual characteristics (a long build, a slow test suite) should set its own rather than relying on a generic default being long enough or short enough.

## Confirmation cannot be routed around

`requires_confirmation` is always true for this tool, and that is a property of the tool, not a suggestion a caller can override by feeling confident. If a command is genuinely safe and routine, that confidence should be visible in the `description`, which lets the approval be fast — not skipped.

## Reading the result honestly

A non-zero `exit_code` is a real failure and should be treated as one, not retried silently in a loop hoping a different invocation succeeds. A `timed_out: true` result means the process did not finish — it does not mean the process failed in the way its own error output would describe, and the two should not be conflated when explaining what happened.
