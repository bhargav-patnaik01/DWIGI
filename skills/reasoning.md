# Skill: Reasoning

How to choose among `read_file`, `list_directory`, `search_workspace`, `git_status`, and `terminal` (`runtime/tools/`) — not what each does individually, which the other four skills cover, but which one a given moment actually calls for.

---

## Order of preference, and why it runs this way

1. **The read-only tools before `terminal`.** `read_file`, `list_directory`, `search_workspace`, and `git_status` cannot break anything — the worst outcome of calling one of them by mistake is a wasted call. `terminal` can. When a question can be answered either way, answering it with a read-only tool costs nothing and removes an opportunity for the more powerful tool to be misused.
2. **The narrowest tool that answers the question.** `list_directory` for "what is here," `search_workspace` for "where does this occur," `read_file` for "what does this specific file say," `git_status` for "what is the state of the tree." Reaching for `terminal` to run `ls` or `grep` when a dedicated tool exists throws away every safety property that dedicated tool has — the workspace-root guard, the bounded result count, the structured output — in exchange for nothing.
3. **`terminal` last, and named honestly.** Once a read-only tool genuinely cannot answer the question — running a build, executing a test, an actual git mutation — use `terminal`, and see `skills/terminal.md` for how to do that responsibly.

## Verify before asserting

Every claim about the state of the workspace — a file's contents, a directory's structure, whether something is defined somewhere, whether the tree is clean — should trace back to a tool call made in this session, not to an inference from context, a prior turn's summary, or what would typically be true of a project like this one. "This function is unused" is a search_workspace claim. "The tree is clean" is a git_status claim. If the call was not made, the claim is a guess wearing the words of a fact, and it should be phrased as a guess or not stated at all.

## Gather before you act, and re-check before you act destructively

For anything with real consequences — a `terminal` command that mutates state, a git operation, a change that could discard work — the sequence is: read what is actually there, form a plan based on that, then act. Not the reverse. And for the specific case of an operation that could destroy uncommitted work, the check has to be the *last* thing before the act, not merely an earlier step in the plan — see `skills/git.md` on why a stale check is not a safe one.

## When a tool's answer is incomplete, say so

`truncated`, `timed_out`, and a zero-match search are not failures to hide — they are honest boundaries on what was actually established. A summary that quietly drops the caveat a tool attached to its own output ("truncated: true", "files_searched: 40 of an unknown total") produces false confidence in exactly the place the tool tried to prevent it. Carry the caveat forward into whatever conclusion depends on that result.

## Escalation is a decision, not a default

Moving from a read-only tool to `terminal`, or from a narrow search to a broad one, should be a deliberate response to the narrower approach having genuinely failed — not the first thing reached for because it feels more likely to work. The cost of the narrower approach failing once is small; the cost of skipping straight to the most powerful tool available, every time, is that its power stops being treated as something to reserve.
