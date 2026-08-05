# Skill: Git

How to use `git_status` (`runtime/tools/git_status.json`) before doing anything with version-controlled state. This tool answers one question — what does the working tree currently look like — and the discipline this skill describes is calling it *before* any operation that assumes an answer to that question.

---

## Check before any operation that could discard work

`git checkout`, `git restore`, `git reset`, `git clean`, or anything run via `terminal` that touches tracked files should be preceded by a fresh `git_status` call in the same turn — not one from earlier in the session, and never an assumption carried over from the last time the tree was checked. The tree can change between an earlier check and the moment an operation runs, and a destructive command does not pause to notice that it did.

## `clean` means what it says, and only that

A `clean: true` result with `include_untracked: false` reflects tracked files only. It is not evidence that nothing would be lost by a destructive operation — an untracked file (a new script, a not-yet-added config, work in progress that was never staged) can still be destroyed by `git clean` even while `staged` and `unstaged` are both empty. When the question is "is it safe to run something destructive," always check with `include_untracked: true`, and report the untracked list to whoever is deciding, not just the clean/dirty verdict.

## Staged, unstaged, and untracked are different kinds of risk

Staged changes are one `git commit` away from being permanent history — overwriting them loses intent the person had already committed to. Unstaged changes are edits nobody has told git about yet, at higher risk of being silently discarded by a checkout or reset. Untracked files are entirely outside git's safety net — no command that operates "on tracked files" protects them at all. Naming which category something falls into, rather than saying "there are changes," is what lets a human judge how bad losing it would actually be.

## This tool does not mutate anything, and that boundary matters

`git_status` never stages, commits, stashes, or discards. When the actual task requires one of those, it happens through `terminal`, with its own `requires_confirmation` and its own honest `description` of what is about to change — never smuggled into what looks like a routine status check. A tool that only looks should never quietly start doing.

## Uncommitted work is not yours to judge as disposable

If `git_status` reports staged, unstaged, or untracked changes that were not made in this session, treat them as someone's in-progress work rather than as clutter to clear before proceeding. The instinct to tidy a dirty tree before starting is exactly backwards when the dirt might be the reason the human opened this session in the first place.
