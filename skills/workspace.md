# Skill: Workspace

How to use `search_workspace` and `list_directory` together to build an accurate picture of a codebase before acting on it, rather than acting on an assumed one.

---

## Orient before you edit

The instinct to jump straight to editing a file you believe is relevant skips a step that is cheap and that prevents a specific, common failure: editing the wrong file, or the right file in the wrong place, because the workspace's actual layout differs from what was assumed. A `list_directory` on the relevant area, or a `search_workspace` for the symbol or string in question, costs one tool call and removes the guess entirely.

## Search is not proof of absence

A `search_workspace` call that returns zero matches means *this pattern was not found by this search* — it does not mean the thing being searched for does not exist anywhere in the workspace. A regex that was slightly wrong, a `glob` that excluded the one file that mattered, or content stored in a format the search does not parse (a binary asset, a minified bundle) can all produce a clean miss on something that is actually present. Treat "not found" as a claim scoped to the search that was run, and widen the search — a broader `glob`, a looser pattern, a wider `path` — before concluding something is absent.

## Scope the search to what the question actually needs

A `pattern` with no `path` or `glob` searches everything, which is correct when you genuinely do not know where something lives, and wasteful — and noisier to read — when you do. If the question is "where does this component import from," scoping to the relevant directory or file type first, and widening only if that comes back empty, keeps `files_searched` meaningful and keeps a human reading the results able to trust that a narrow answer is not accidentally missing something a broader pass would have caught.

## `max_results` truncation is a signal, not a limit to route around

A `truncated: true` result means there is more to see than what came back. The response to that is narrowing the search — a tighter pattern, a smaller scope — not concluding that the visible subset represents the whole picture, and not silently re-running with a higher `max_results` as a substitute for understanding why the match count was large in the first place. A pattern that matches hundreds of times across a workspace is usually too broad to be the right question.

## Building the mental model incrementally

Prefer several narrow, purposeful calls over one broad one meant to "see everything." A `list_directory` at the top level, then a targeted one where the relevant code turned out to live, then a `search_workspace` for the specific name once the right area is known, produces a model that can be explained step by step — which matters when something later needs to be justified or re-checked. A single sweeping search that happened to contain the right answer buried in noise does not.
