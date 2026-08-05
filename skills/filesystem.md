# Skill: Filesystem

How to use `read_file` and `list_directory` (`runtime/tools/`) responsibly. Both are read-only, and that is exactly what makes misusing them easy to get away with — nothing breaks visibly when a file is guessed at instead of read.

---

## The one rule everything else follows from

**Never state what a file contains without having read it in this session.** Not from its name, not from what a file with that extension usually holds, not from a memory of having read something similar before. A guess that happens to be right teaches nothing about the discipline; a guess that is wrong produces confident, specific, false information — which is worse than saying "I don't know," because it does not invite a check.

This applies even to files you wrote yourself earlier in the same task. Tools you called after writing it — a formatter, a linter fix, another edit — can have changed it since. Read before claiming, every time state matters.

## Before reading, know that the file exists

`list_directory` first, when you are not already certain a path is right. Guessing a path and treating a `not_found` error as information ("ah, it must not exist") is backwards — it means you assumed a structure you had not verified, and you got lucky that the tool caught it instead of silently resolving to the wrong file. When you are genuinely unsure of a directory's layout, list before you read.

## Reading large files

Use `offset` and `limit` to page through anything too large for one call, rather than requesting the whole thing and hoping it fits. A `truncated: true` result is not the whole file — do not summarize a truncated read as though it were complete, and do not draw a conclusion that depends on content you have not actually seen ("this file has no error handling" is only true if you read the whole file, not the first 200 lines of it).

## Binary and non-text content

`read_file` reports `binary_content` rather than returning mangled bytes as if they were text. Treat that as a real answer — the file is not something this tool can show you — not as a failure to work around by decoding it a different way and presenting whatever comes out.

## What this skill does not cover

Writing or editing files is deliberately outside this tool set's current scope — `runtime/tools/` as defined today is read-only across every file operation. A runtime that adds write capability should give it its own tool definition and its own skill, with its own confirmation requirements, rather than folding it into this one under the assumption that "filesystem" already implies write access. It does not.
