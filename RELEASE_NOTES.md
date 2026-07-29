# Release notes

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
