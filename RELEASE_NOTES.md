# Release notes

## v1.0.1

A correction release. The headline is that **permission prompts now work**, which V1 shipped as an accepted impossibility on the strength of a finding that turned out to be wrong. Everything else is the executive roster becoming a directory, a startup splash, and a second grounding mode for conversations that are not about a company.

No breaking change to the engine's contract. Triage, budgets, the routing gate, the output contract, and the logging trigger are untouched.

### Permission prompts — the concession that should never have been made

V1 could not pause a turn to ask permission, and said so. The reason it gave was that the CLI's print mode cannot block for consent and that `--permission-prompt-tool` does not exist. **Both claims were false**, and they survived three milestones because they were written down as verified findings rather than as assumptions.

Re-verified against the same CLI build:

- `--permission-prompt-tool` exists. It is absent from `--help`, but the parser accepts it and rejects genuinely unknown flags — so acceptance is meaningful.
- The value `stdio` routes decisions to the host over the stdin/stdout channel the turn already uses, as `control_request` / `control_response` pairs with subtype `can_use_tool`.
- The runtime genuinely **blocks**: a deliberate 4,000 ms stall before answering produced a 4,034 ms gap with no auto-deny.

The real bug was ours. The v1 transport called `child.stdin.end()` straight after writing the message, which is correct for the *message* stream and wrong for the *control* stream — the same pipe is bidirectional.

So the cockpit now asks, blocks on the answer, and forwards the founder's actual choice. Nothing is silently approved. `allow` runs the pending call inside the same turn; `deny` suppresses it and returns the founder's message to the advisor as the tool result. The policy lives in one file (`gui/electron/bridge/permission-policy.ts`) so it can be replaced without touching the transport, the reducer, or any component. A refusal this cockpit adjudicated no longer double-reports as an engine notice.

### The executive roster is now a directory

Two ADRs, no change to any lens's reasoning and no change to any persona's wording.

- **ADR-011** dissolves `core/executive_matrix.md`. Each lens is now a self-contained document under `core/executives/` with machine-readable front matter, and **the directory is the roster** — no file and no code holds a list of executives. The shared board prose that headed the matrix moved to `core/reasoning_rules.md` §9.
- **ADR-012** separates participation from reasoning. `core/executive_manifest.md` carries activation, suppression, and escalation criteria; the gate reads only the manifest, then loads a lens's reasoning **after** admitting it. A lens the gate excludes is never read at all.

### Executive Learning mode

Business Mode grounds advice in runway and stage, which is right, and assumes there is a company, which is not always true. `/learning` lets the board reason as a board without consulting the founder's record — for "teach me how a CFO reads a board pack" rather than "what should I do about my burn." Onboarding never runs there, and an absent Business Memory is an expected state rather than a first run.

In the cockpit this is a per-conversation property, not a global switch. Scope is written into a conversation's record when it is created and never rewritten, so the selector configures **the next** conversation and says so in plain words when that differs from what is on screen. One component owns the vocabulary for all three placements, because the failure mode of drift here is a founder reading advice believing it accounts for their runway when it does not.

### Startup splash

The app previously showed an empty frame while Next hydrated. There is now a splash window backed by `gui/start.mp4`, with `gui/icon.png`'s convention: the tracked file is the source of truth and the copy under `public/` is staged at build time and gitignored.

It is built so it cannot become the problem it solves. Every playback outcome settles the promise — ended, decode failure, autoplay refusal, or timeout — and the main window is revealed by a coordinator that is idempotent and runs regardless. **A broken splash cannot hide the application.** A missing video is an ordinary state: the build succeeds and startup simply has no splash.

### Also in this release

- **Content Security Policy hashes are generated at build** (`scripts/csp-hashes.mjs`) rather than the policy being loosened to admit Next's inline bootstrap scripts.
- **Packaged Linux builds get an icon.** `resolveWindowIcon()` looks for `icon.png` beside the app resources; Windows takes its icon from the stamped executable and macOS from the `.icns`, but Linux had neither and fell back to Electron's default. `extraResources` now puts the file where that lookup expects it.
- **Packaging was unblocked.** The change above originally shipped with a `"//extraResources"` comment key *inside* the `build` object. npm ignores unknown top-level keys — which is why `"//dependencies"` works — but electron-builder validates its `build` field against a strict schema and aborted on it, so `npm run package` failed outright. The note now lives at the top level of `package.json`, with a comment recording why it cannot go back.
- **`/deliberate-isolated`** — experimental, not a default and not a replacement. Runs a Full-budget deliberation with every lens in its own context, so the anchoring question can be measured instead of argued. `docs/validation/BENCHMARK.md` fixes the scenario set and states up front which classes of claim the harness can and cannot establish — "recommendation quality" is explicitly reserved for an independent human, because the advisor generating both arms cannot also judge them.
- **New harnesses:** `npm run audit:ui`, `npm run benchmark`, and a memory-mode validator.

### Verification at release

**188 hermetic GUI tests pass** (101 at v1.0.0), covering the permission control protocol, memory scope, splash settlement, and the isolated pipeline. Both TypeScript projects typecheck clean, and the Next build and CSP hash generation both complete.

The Windows payload was produced and its contents verified — the splash assets and the Linux `icon.png` resource are present, and the renderer is a static export as intended. **electron-builder itself still exits non-zero**, at the same step as V1: it cannot extract its `winCodeSign` toolchain without the privilege to create symlinks. The attached archive is therefore the `--dir` payload, and it is **unsigned and unbranded** — verified, not assumed: the executable reports `Electron 34.5.8` by `GitHub, Inc.` and uses Electron's default window icon. Enabling Windows Developer Mode, or running the packaging step once elevated, resolves it; nothing in this repository needs to change.

Two static-check conditions are **known and deliberately reported**, not regressions:

- **ADR-007's six-file bound is breached at a peak of 12.** ADR-012 cut it from 13 by loading only admitted lenses, but the routing base alone is six files, so any deliberation with two or more lenses exceeds the bound. The criterion is arithmetically unreachable while executives are separate files. It is left failing on purpose — ADR-012 records the measured numbers and the recommendation, and the check warns against silencing it by raising the bound without an approved amendment.
- **The kernel is 3,323 words against a ~3,200 budget.** It was already 14 words over at v1.0.0 and grew 109 this sprint. `CLAUDE.md` is a propose-only file, so this is flagged rather than trimmed.

### Still true from v1.0.0

The Windows build remains **UNSIGNED**, and the executable-stamping caveat below still applies. See `KNOWN_LIMITATIONS.md`.

---

## v1.0.0 — Public V1

First public release. The reasoning engine has been in use for some time; what is new here is the desktop application and the three founder-invoked runtime modes it needed.

### The engine

Unchanged in architecture. Three commands were added under `.claude/commands/`, and one clause of `CLAUDE.md` §2 was amended to record that the single-interface contract now has two sanctioned exceptions rather than one.

- **`/begin`** — an explicit entry point to first-run onboarding. Owns no questions; delegates wholly to `core/onboarding/memory_protocol.md`.
- **`/lens <executive>`** — consults one canonical executive without convening the board. The second sanctioned exception to ADR-003, and the only one that declines to hold a deliberation at all. `/stress-test` exposes a deliberation that happened; this one does not have one to expose.
- **`/council <set>`** — narrows the Layer-1 candidate pool to an explicitly enabled set. States the three exclusions it cannot honour: the two structural challenge lenses, CFO's solvency floor, and the Intervention overlay.

All three are dispatchers. None owns reasoning logic, and none duplicates a rule defined elsewhere.

### The desktop application — D.W.I.G.I

- **First-run onboarding.** With no `core/business_memory.md`, a welcome screen replaces the empty chat. *Get Started* hands off to the engine and the advisor speaks first. There are no onboarding questions in the interface and no second memory schema.
- **Executive Board.** Every executive is projected from `core/executive_matrix.md`. If that file is unreadable the screen says so rather than falling back to a built-in roster.
- **Single-agent chat.** Visually distinct, with a standing scope warning and a clear route back to Council Chat.
- **Agent Management.** Toggles for the six constructive lenses, with a two-executive floor. Risk Officer, Devil's Advocate, and CFO's solvency floor are shown as non-disableable, because the matrix says they are.
- **Standing V1 notice**, dismissible, persisted in application preferences.
- `gui/icon.png` is the single source of truth for the application icon.

### Installation

Two supported paths: from source (any platform), or the Windows build. Both are complete installations — see the README.

> **The Windows V1 build is currently unsigned. Windows SmartScreen or
> organizational Application Control policies may warn about or block the
> application. If the binary is blocked, use the source installation instead.
> Do not disable your system's security protections.**

Signing status: **UNSIGNED**. A code-signing certificate is not part of this release.

One further caveat on the build produced on the release machine: its **executable resources were not stamped**, so Windows file properties report `Electron 34.5.8` by `GitHub, Inc.` and the window uses Electron's default icon rather than the application's. The payload is correct — the application itself is complete and behaves normally — but the host executable is unbranded. electron-builder performs icon stamping, version metadata, and signing as a single step, and that step cannot complete on a machine where it is unable to create symlinks while extracting its own toolchain. Enabling Windows Developer Mode, or running the packaging step once from an elevated shell, resolves it; nothing in this repository needs to change.

### Privacy

- `core/business_memory.md` is gitignored. It holds cash position, runway, and customer facts, and the likeliest accident with an open-source repository is publishing a fork that contains them.
- The development sandbox generator **never copies it**, and seeds a synthetic fixture instead.
- The screenshot harness refuses to run against any directory without a `SANDBOX.md` marker, because those captures render real Business Memory.
- Both fences are asserted by tests, since the leak they prevent is invisible: with real data present, every harness passes and every screenshot looks correct.

### Known limitations

- **The Windows build is unsigned** (above). Source installation is unaffected.
- **The published Windows executable may be unbranded.** If it reports `Electron` as its product name and shows Electron's default icon, it was packaged on a machine that could not complete the executable-editing step. Repackage where that step can run before publishing a binary — an unsigned *and* unbranded executable gives a user no way to tell it apart from a repackaged Electron app.
- **No per-executive activity is reported during a turn.** The runtime tells the interface which tools ran, and nothing about which lenses participated. The Executive Board therefore shows configured state only. Use `/stress-test` to audit real routing — that comes from the engine, which does know.
- **`journal/` and `dossier/` are tracked by design** (ADR-002), so Decision Records written into a public fork are published along with the reasoning they contain. Neither directory exists on a fresh clone. If your repository is public and your decisions are not, gitignore them.
- **No licence has been chosen yet.** Until a `LICENSE` file exists, default exclusive copyright applies and no permissions are granted beyond viewing the source.
- **Single-agent answers carry no red-team pass.** By design — the founder excluded the challenge lenses by choosing one executive — but it means the usual falsification step is absent, and the mode says so.
- The narrow-window welcome screen scrolls to reach the attribution line.
- Onboarding depth is bounded by the engine's own follow-up cap, so a first conversation will not populate the whole memory schema. That is intentional; the rest accumulates through use.

### Verification at release

101 hermetic GUI tests, EIS static checks, both TypeScript projects, and the GUI build all pass. The runtime modes were additionally validated live against a disposable repository: `/lens` returned one executive's view with no other lens present, and a restricted `/council` disclosed routing without the disabled executive.
