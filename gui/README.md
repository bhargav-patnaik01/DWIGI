# D.W.I.G.I — Don't Worry I Got It

Local-first desktop interface for the Executive Intelligence System.

The application is **D.W.I.G.I**; the repository it reads is the **Executive Intelligence System**. Two names for two things, on purpose — the engine's identity is fixed by its own `CLAUDE.md`, and this application is a window onto it rather than a rename of it.

**This is a presentation layer.** It performs no reasoning, stores no business memory, and holds no business rules. Deleting this directory leaves the Executive Intelligence System completely unaffected — that property is the design's primary constraint, not a side effect.

---

## Running it

```bash
cd gui
npm install

npm run dev        # Electron + Next dev server, hot reload
npm run dev:web    # browser-only UI preview (no host bridge)

npm run build      # static export + compiled main process
npm start          # run the production build
npm run typecheck  # both TS projects
npm test           # permanent suite: projections, transport, transcripts, continuity, write fence
```

`npm test` is hermetic — it spawns no runtime and spends no tokens. The live end-to-end harnesses are separate because they do both:

```bash
npm run validate:bridge                  # streaming, resume, cancellation, failure
npm run validate:modes                   # /begin, /lens and /council, honoured or not
node scripts/validate-bridge.mjs --safety-only   # just the production write fence, free
```

Both drive the real CLI against a disposable sandbox, never production:

```bash
npm run sandbox:reset    # refresh it, with a SYNTHETIC business memory
npm run sandbox:empty    # refresh it with no memory, for first-run work
```

**The generator never copies your real `core/business_memory.md`**, and the screenshot harness refuses to run against any directory without a `SANDBOX.md` marker. Both fences are asserted by `tests/sandbox-privacy.test.mjs`, because the leak they prevent is invisible — real data makes every harness pass and every screenshot look correct.

`npm run dev:web` exists because the renderer must tolerate the absence of a host. Every host-dependent surface is guarded with `hasHost()`, so the UI can be iterated on in a plain browser.

---

## What lives where

| Path | Responsibility |
| :--- | :--- |
| `electron/main.ts` | Window, `app://` protocol, IPC surface. Security posture lives here. |
| `electron/preload.ts` | The only renderer-visible host surface. Hand-enumerated, no passthrough. |
| `shared/advisor.ts` | `AdvisorTransport` — the sole contract with the reasoning engine. Vendor-neutral. |
| `shared/host.ts` | Host bridge types, shared by both processes so neither imports the other's source. |
| `shared/conversations.ts` | Transcript contract and `deriveTitle`. Pure types; no runtime code. |
| `electron/conversations/` | *(M5)* Transcript store. The **only** write path in the app — app data, never the repository. |
| `shared/runtime-modes.ts` | The only place a turn may be shaped, and the rule that the default shapes nothing. |
| `src/app/` | Six routes. Chat is the index. |
| `src/components/` | `layout/` frame · `shared/` cross-screen · `ui/` primitives |
| `src/lib/repo/` | *(M3)* Read-only markdown projections. Tolerant, never throws. |
| `src/lib/conversations/` | *(M5)* Recorder. Decides when a message is durable; nothing else does. |

---

## The three boundaries that keep this a cockpit

**1. Invocation is verbatim, unless the founder selected a runtime mode.** The transport passes user text byte-for-byte and supplies only a working directory. No prompt injection, no prefixing, no system-prompt override, no hidden mode flags. The engine discovers its own instructions from the repository, which is why the cockpit needs no knowledge of them.

*The test:* the same sentence typed here and typed in a terminal must behave identically.

There is exactly one sanctioned departure, and it is described in full under **Runtime modes** below. Four properties keep it from reopening what this boundary closes: the default composes nothing, the prefix is a repository-defined command rather than text this application wrote, no persona or reasoning instruction is composed anywhere in the app, and whatever was prefixed is displayable so the founder can see the mode they are in.

**2. Data flows one way *into the repository*.** The cockpit reads files and spawns a process. It never writes to `core/`, `journal/`, or `dossier/` — those are written by the engine. `repo` exposes no write method at all, and the read layer imports no mutating filesystem call.

The cockpit does write exactly one thing: its own conversation transcripts, in the host's application-data directory. That channel is fenced by construction rather than by convention — **no `conversations` IPC method accepts a path.** A conversation is named by a validated UUID, the store's root is fixed once in `main.ts`, and every filename is `root + uuid`. The renderer cannot name a destination, so it cannot reach the repository through the only write path that exists.

*The test:* deleting `gui/` and the app's data folder leaves the Executive Intelligence System byte-identical.

**3. Parsing is presentation, not reasoning.** The repo layer reads `stage: Pre-PMF (confirmed)` and renders it with a provenance chip. It does not decide what a stage means, compute staleness, derive confidence, or infer anything. Where the architecture says "do not compute," the cockpit displays a stored value or "Unavailable".

---

## Runtime modes

The cockpit has two chat types, and the difference between them is a founder's explicit choice — never an inference.

| | Council Chat | Single-agent chat |
| :--- | :--- | :--- |
| Routing | The engine's own gate | Exactly one canonical lens |
| Other executives | Engaged as the decision needs | None, including the challenge lenses |
| Opened from | Chat, the default | Executive Board → *Chat with …* |
| Transmits | Nothing, unless lenses are disabled | `/lens <id>` ahead of the message |

Both directives are **repository commands** in `.claude/commands/`, not prompts this application composes. `shared/runtime-modes.ts` knows their names and argument order and nothing else — no persona text, no routing logic, no budget hints. That is the whole of what makes single-agent mode genuine isolation rather than a costume: the semantics live next to `core/executive_matrix.md`, which stays the only definition of who each executive is.

Three consequences worth stating plainly, because each one is a place this could have been faked:

- **The Executive Board invents nobody.** Every card is projected from `core/executive_matrix.md`. If that file is unreadable the screen says Unavailable rather than falling back to a built-in roster.
- **No live agent activity is shown, ever.** The runtime reports tool use and says nothing about which lens is participating. Configured state is displayed because it is known; "Active", "Consulted", and "CEO is thinking" are not, so they do not exist here. `/stress-test` is how real routing gets audited, and it comes from the engine.
- **Three executives cannot be disabled**, and the interface says so instead of offering a switch the engine would ignore. Risk Officer and Devil's Advocate are structural at S5; CFO carries a solvency floor. Agent Management reads all three facts out of the matrix rather than hardcoding them.

Agent Management stores an id list in this application's preferences. It edits no persona file, deletes nothing, and reaches the engine only as a `/council` argument on a turn the founder sent. Below two enabled executives the configuration is refused — `core/reasoning_rules.md` §1 needs 2–4 constructive lenses to have a deliberation at all.

## First run

Absence of `core/business_memory.md` *is* first run (`CLAUDE.md` §14). The cockpit detects that condition read-only — a `stat`, not a projection, because a file that exists but parses to nothing is emphatically not a first run — and shows a welcome screen instead of an empty chat.

**Get Started sends `/begin` and nothing else.** There are no onboarding questions in this application, no second memory schema, and no progress tracking through an interview it does not own. The advisor speaks first because the command tells it to, and every word the founder reads comes from `core/onboarding/memory_protocol.md`.

The command is shown in the transcript rather than hidden. A button was pressed and a command was sent on the founder's behalf; concealing it would be the cockpit hiding something it did.

`Ctrl/Cmd+Shift+D` → *Force first-run screen* exercises the flow without deleting anyone's Business Memory. `/begin` independently refuses to re-run onboarding over a memory that exists, which is what makes that switch safe to ship rather than gate behind a build flag.

## Icon

`gui/icon.png` is the only tracked image asset and the only authority on what this application looks like. Everything else is derived by `npm run prepare:icon` and gitignored:

```
gui/icon.png ──┬──► build/icon.png    packaging input (electron-builder
               │                      rasterises .ico / .icns from it)
               └──► public/icon.png   copied into the static export
```

A non-square source is normalised onto a square canvas for packaging, because `.ico` generation requires square and the source is not the app's to modify. Absence is an ordinary state: a fresh clone falls back to a placeholder for packaging and to a typographic mark on screen, and nothing crashes.

## State

Zustand, four slices. `ui` (theme, workspace pointer, sidebar) is persisted in the host's own storage; `chat` is a rendering buffer; `repo` is re-read rather than cached across sessions; `conversations` holds the history list, which conversation is on screen, and the resume pointer.

Nothing is persisted inside the repository. The cockpit stores a *pointer* to it, never its contents.

---

## Conversation history

There are deliberately **two records joined by one pointer**:

- the engine's own conversation history — what the advisor remembers, used to continue reasoning
- the cockpit's transcript — what the founder was shown, used to redraw the screen
- `sessionId` — the opaque handle that links them

The cockpit keeps its own record because reading the engine's would make the app vendor-aware everywhere instead of in one file. Transcripts are JSONL (messages are appended, never rewritten, so a torn write costs one line) with a small JSON index written temp-file-and-rename.

Three properties are contractual:

- **Only settled messages are stored.** A partially streamed message is never written, because a file recording half a recommendation as the whole one is the failure that hides best.
- **Titles are truncation, not summarisation.** A conversation is titled with the founder's own first words, cut to length. Generating "Pricing strategy decision" would be the cockpit forming a view on the content of a deliberation.
- **Divergence is disclosed, never papered over.** The two records can drift — engine history can be pruned, a repository can move machines. When the engine has no record of a session it is asked to resume, the turn proceeds and the loss of continuity is stated plainly, because a founder who believes the advisor recalls a decision it has forgotten is worse off than one told that continuity broke.

Continuity across launches is the session *id*, not a process: print mode exits after each turn, so closing the app is the same situation as the gap between two turns, provided the id survives. Whether a turn passes `--resume` or `--session-id` tracks whether the session exists, never whether this process has spawned before — and a mismatch between the cockpit's belief and the engine's is recovered from once per turn rather than surfaced as an exit code.

Nothing is pruned, capped, or expired. A founder's record of how they decided is not cache; deletion happens only when they ask for it.

---

## Milestones

| | Scope | State |
| :-: | :--- | :--- |
| 1 | Scaffold, shell, navigation, theme, transport interface | **Complete** |
| 2 | Advisor bridge: streaming, activity timeline, permission prompts | **Complete** |
| 3 | Repository projections: Memory and Decisions screens | **Complete** |
| 4 | Dashboard, Settings actions, shortcuts, polish | **Complete** |
| 5 | Conversation history: transcripts, resume across launches, session recovery | **Complete** |
| 6 | Public V1: first-run onboarding, Executive Board, single-agent chat, agent management, V1 notice, icon | **Complete** |

The transport is deliberately a persistent bidirectional session rather than one-shot request/response, because the engine can pause mid-turn to ask permission before writing, and a one-shot transport has no channel to carry the answer back. Auto-approving instead would break terminal-equivalent behaviour.
