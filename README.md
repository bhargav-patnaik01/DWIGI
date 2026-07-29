# D.W.I.G.I — Don't Worry I Got It

An AI executive council for founders who decide alone.

You speak to one Chief of Staff. Behind it, a decision is examined through several executive perspectives — strategy, capital, execution, revenue, product, risk, founder capacity — and you receive **one converged recommendation** with its confidence and its weakest assumption named, not a survey of opinions.

The system's purpose is **decision quality**, not answer production. It records how you decided so you can reconstruct why months later, it learns your business over time, and it disagrees with you when the evidence does.

> **This is V1 and still in development.** AI advisors can make mistakes. Review important decisions carefully.

---

## What this repository contains

Two things, deliberately separate:

| | What it is |
| :--- | :--- |
| **The Executive Intelligence System** — `CLAUDE.md`, `core/`, `docs/`, `.claude/` | The reasoning engine. Plain markdown: operating kernel, the eight executive lenses, routing rules, the reasoning pipeline, the learning protocol. This is the product. |
| **D.W.I.G.I** — `gui/` | A local-first desktop application that reads the engine and presents it. It performs no reasoning of its own. Deleting `gui/` leaves the engine byte-identical. |

The engine works on its own in a terminal. The desktop application is optional.

Everything is file-native and local. There is no database, no server, and no telemetry.

---

## Requirements

- **A working, authenticated Claude Code installation**, resolvable on your `PATH` as `claude`. That is the verified requirement: the engine runs inside Claude Code, and the desktop application drives it as a child process and cannot substitute for it. How you install and sign in is covered by [Anthropic's own documentation](https://docs.claude.com/en/docs/claude-code/overview). This project makes no claim about which plans, subscriptions, or API arrangements apply, what any of it costs, or who is eligible — it does not check, and you should not treat anything here as an answer to those questions.
- **Node.js and npm**, for the desktop application only. Built and tested on Node 24. Older versions are untested here; if you need a supported floor, take it from the Next.js 15 and Electron 34 release notes rather than from this file.
- Nothing else. No API keys are stored, read, or required by any file in this repository.

---

## Using the engine on its own

```bash
git clone https://github.com/bhargav-patnaik01/DWIGI
cd DWIGI
claude
```

On the first substantive request the advisor reads `core/business_memory.md`. **On a fresh clone that file does not exist**, which is the definition of first run — the advisor will begin onboarding and interview you about your business instead of answering. That conversation writes the file.

`core/business_memory.md` is **gitignored on purpose**. It holds your cash position, runway, and customer facts, and the likeliest accident with an open-source repository is pushing a fork that publishes them.

Three commands are available once you are running:

| Command | What it does |
| :--- | :--- |
| `/deliberate <decision>` | Forces full-board deliberation and an Executive Action Memo |
| `/stress-test [target]` | Shows the raw executive disagreement behind a recommendation |
| `/decision-log` | Writes a Decision Record to `journal/` |

Two more exist for the desktop application's runtime modes — `/lens <executive>` for a single-executive consultation and `/council <set>` for a restricted board — and both work in a terminal too.

---

## Installing the desktop application

Two paths. Either is a complete installation.

### From source (works everywhere)

```bash
cd gui
npm install
npm run build
npm start
```

### From the Windows build

`npm run package` produces an unpacked application in `gui/release/win-unpacked/`.

> **The Windows V1 build is currently unsigned. Windows SmartScreen or
> organizational Application Control policies may warn about or block the
> application. If the binary is blocked, use the source installation instead.
> Do not disable your system's security protections.**

Signing status: **UNSIGNED** — a deliberate decision for V1, not a defect. `RELEASE_NOTES.md` records the details, including one caveat about executable branding worth reading before you publish a binary of your own.

Then open **Settings → Repository location** and choose the directory you cloned. The advisor reads its operating instructions from there; the application never writes to it.

With no `core/business_memory.md` present you get a welcome screen; **Get Started** hands you to the engine's own onboarding, and the advisor speaks first.

Other useful scripts:

```bash
npm run dev        # Electron + Next dev server, hot reload
npm run dev:web    # browser-only UI preview, no host bridge
npm test           # hermetic suite — spawns no runtime, spends no tokens
npm run typecheck  # both TypeScript projects
npm run package    # unpacked desktop build into gui/release/
```

`gui/README.md` documents the application's internals and the boundaries that keep it a presentation layer.

---

## How it works

### Council Chat — the default

You ask about a decision. Before answering, the advisor triages it: how reversible is this, what does it cost, how big is the blast radius, is there time pressure. That decides how much reasoning the question earns — a runway lookup gets a sentence; an irreversible commitment gets the full board.

It then routes the decision to **two to four** of the six constructive executives, never all of them. Irrelevant perspectives are suppressed structurally, not filtered out of the output, because a lens that contributes nothing still costs you attention. Two further executives — Risk Officer and Devil's Advocate — attack the finished recommendation rather than helping build it.

What you receive is one converged recommendation, its confidence band, and the single weakest assumption it rests on. Not three balanced options.

### The eight executive perspectives

| | Optimises for |
| :--- | :--- |
| **CEO** | Strategy, focus, what the company refuses to do |
| **CFO** | Solvency, runway, unit economics, pricing floor |
| **COO** | Throughput, sequencing, the binding constraint |
| **Sales/GTM** | Repeatable path from stranger to paying customer |
| **Product** | Demonstrated user value per unit of build |
| **Coach** | Founder judgment and endurance |
| **Risk Officer** | Survivable downside, named failure modes |
| **Devil's Advocate** | Destroying the recommendation if it can be destroyed |

These are reasoning frameworks, not characters. They are defined in `core/executive_matrix.md`, which the application reads — it holds no roster of its own.

### Single-agent chat — when you want one discipline undiluted

From **Executive Board**, *Chat with CFO* opens a conversation with that executive alone. The rest of the council is genuinely not engaged: no other perspective contributes, and the challenge lenses do not run.

That is a real trade, and the interface says so on screen for the whole conversation. You get one mandate's undiluted view, and you lose the synthesis and the red-team pass that make a Council answer worth acting on. There is always a one-click route back to Council Chat.

### Agent Management — configuring the council

In **Settings**, each of the six constructive executives can be switched off for Council Chat. A solo technical founder with no sales motion may not want a Sales/GTM constraint attached to every decision.

Three things cannot be switched off, and the screen explains why rather than offering a switch the engine would ignore: Risk Officer and Devil's Advocate are structural, and CFO carries a solvency floor that re-engages it when runway is short. Below two enabled executives there is no deliberation to have, so the configuration is refused.

Single-agent chats ignore this setting — you chose that executive deliberately.

### Business Memory

`core/business_memory.md` is everything currently known about your company: stage, runway, constraint, non-negotiables, customer definition. It is not configuration — it evolves, and it is an input to every deliberation.

You never edit it; the advisor maintains it and asks before changing an established value. Every field carries **provenance**, and provenance sets epistemic weight: a `confirmed` figure can support a high-confidence recommendation, an `inferred` one is treated as an assumption and caps confidence. Four fields — cash position, runway, burn, revenue — can never be inferred. They come from you or stay unknown.

### Decisions and calibration

Decisions that are hard to reverse, that move cash or headcount, that set direction — **or where you overrode the recommendation** — get written to `journal/` as a Decision Record: what was decided, what it rested on, the confidence, and dated falsifiable signals that will later show whether it was right.

Records are frozen once written. Nothing is edited to match what happened; a superseding record is added instead, linked both ways. `core/calibration_journal.md` accumulates prediction accuracy and your documented patterns, and the advisor is expected to actually apply them rather than rediscover them each quarter.

### The desktop cockpit

`gui/` is a local Electron application over the same files: Council and single-agent chat, the Executive Board, and read-only views of Business Memory, the decision journal, and calibration. It performs no reasoning — it renders what the engine says and what the files contain. Where the architecture says "do not compute", it shows the stored value or *Unavailable*.

---

## Privacy and local data

Everything is local and file-native. No database, no server, no telemetry, no analytics.

- **`core/business_memory.md` is gitignored by default.** It holds your cash position and runway, and the likeliest accident with an open-source project is publishing a fork that contains them.
- **The cockpit never writes to the repository.** Its read layer imports no mutating filesystem call; the repository is written only by the advisor.
- **Conversation transcripts** live in the application's own data directory (Electron `userData`), never inside the repository. Interface preferences — theme, dismissed notices, enabled executives — live there too.
- **The one write path is fenced by construction**: no transcript operation accepts a path, so the renderer cannot name a destination inside your repository.
- **`journal/` and `dossier/` are tracked by design**, so a public fork publishes your Decision Records. See `KNOWN_LIMITATIONS.md`.

---

## What it will not do

These are design commitments, not current limitations:

- **It never invents a business fact.** If Business Memory does not contain something, it asks or marks it unknown.
- **It never shows fabricated reasoning.** The Executive Board displays how the council is *configured*; it does not claim which executives ran on a given decision, because the interface is not told.
- **It never edits history.** Decision Records are frozen once written. Corrections are appended and dated.
- **It never flatters you.** Sycophancy is the specific failure mode this system exists to prevent.

---

## Development status

**V1, under active development.** The reasoning architecture has been in use and is stable; the desktop application is newer and has had less mileage. AI advisors can make mistakes — review important decisions carefully.

Some parts are explicitly provisional and documented as such: the domain routing table and the Existential budget thresholds are Version 1 heuristics derived analytically rather than from observed founder decisions, and are scheduled for behavioural validation.

**Read `KNOWN_LIMITATIONS.md` before relying on this for anything consequential.** It is honest rather than short.

`RELEASE_NOTES.md` records what V1 contains. `docs/ROADMAP.md` covers what is planned, and `docs/DECISIONS.md` explains why the system is built the way it is — every significant choice is an ADR with its rejected alternatives.

## Licence

[MIT](LICENSE). Use it, modify it, ship it commercially — keep the copyright notice.

## Credits

Created by Bhargav Patnaik for all the founders out there.
