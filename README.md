# D.W.I.G.I — Don't Worry I Got It

An AI executive council for founders who decide alone.

You speak to one Chief of Staff. Behind it, a decision is examined through several executive perspectives — strategy, capital, execution, revenue, product, risk, founder capacity — and you receive **one converged recommendation** with its confidence and its weakest assumption named, not a survey of opinions.

The system's purpose is **decision quality**, not answer production. It records how you decided so you can reconstruct why months later, it learns your business over time, and it disagrees with you when the evidence does.

> **This is V1 and still in development.** AI advisors can make mistakes. Review important decisions carefully.

---

# Steps to use

This is the full walkthrough, written so that you do not need to know anything about programming. Follow it in order. Nothing here can break your computer.

You will type some commands. A **command** is just a line of text you type into a black-and-white window called a **terminal**, then press Enter. The computer reads the line and does what it says.

**How to open a terminal:**

| Your computer | What to do |
| :--- | :--- |
| **Windows** | Press the Windows key, type `powershell`, press Enter |
| **Mac** | Press `Cmd` + `Space`, type `terminal`, press Enter |
| **Linux** | Press `Ctrl` + `Alt` + `T` |

Leave that window open. You will use it for most of the steps.

---

## Step 1 — Install Node.js

Node.js lets your computer run the app. You only ever do this once.

1. Go to **https://nodejs.org**
2. Click the big green button that says **LTS** (it means "the stable one")
3. Open the file it downloads and click Next / Continue until it finishes
4. **Close your terminal window completely and open a new one.** This matters — the terminal only notices new programs when it starts up.

Now check it worked. Type this and press Enter:

```bash
node --version
```

You should see a number, something like `v24.4.1`. Any number is fine.

> **If you instead see "not recognized" or "command not found":** Node did not install, or you did not open a fresh terminal. Close every terminal window, open a new one, and try again. If it still fails, run the installer again.

---

## Step 2 — Install Claude Code and sign in

D.W.I.G.I does not contain the AI itself. It is the *council* — the instructions, the executive perspectives, the memory. The thinking is done by **Claude Code**, a program made by Anthropic, which D.W.I.G.I runs for you behind the scenes.

So Claude Code has to be installed and signed in first, or the app will open but the advisor will not answer.

1. Follow Anthropic's official instructions: **https://docs.claude.com/en/docs/claude-code/overview**
2. Sign in when it asks you to

Then check it worked:

```bash
claude --version
```

You should see a version number. That is the only thing this project checks for.

> **About accounts and cost:** which Anthropic plan or account you need, and what it costs, is entirely between you and Anthropic. This project does not know, does not check, and cannot tell you. Please do not treat anything in this repository as an answer to that — read their documentation.

---

## Step 3 — Get the D.W.I.G.I files onto your computer

Pick **one** of these two options.

### Option A — if you have Git installed (recommended)

Type these two lines, one at a time, pressing Enter after each:

```bash
git clone https://github.com/bhargav-patnaik01/DWIGI
cd DWIGI
```

The first line copies all the files onto your computer into a new folder called `DWIGI`. The second line means "go into that folder" — from now on, the terminal is standing inside it.

### Option B — if you do not have Git

1. Go to **https://github.com/bhargav-patnaik01/DWIGI**
2. Click the green **Code** button, then **Download ZIP**
3. Unzip the file somewhere you will remember, like your Documents folder
4. In your terminal, type `cd ` (with a space after it), then drag the unzipped folder onto the terminal window and press Enter

Either way, check you are in the right place:

```bash
ls
```

*(On Windows PowerShell, `ls` works too.)*

You should see names including `CLAUDE.md`, `core`, `gui`, and `README.md`. If you do not see those, you are in the wrong folder — go back and try Option A or B again.

---

## Step 4 — Go into the app folder

The desktop app lives in a sub-folder called `gui`. Move into it:

```bash
cd gui
```

---

## Step 5 — Download the app's helper code

```bash
npm install
```

This downloads the building blocks the app is made from. **It takes a few minutes and prints a lot of text.** That is normal — let it finish.

You will know it is done when you get your normal prompt back and can type again. A few lines mentioning `warn` are fine and can be ignored. You only need to do this step once.

---

## Step 6 — Build the app

```bash
npm run build
```

This turns the source code into the actual application. It takes under a minute. You should see `✓ Compiled successfully` and `✓ Exporting` near the end.

You only need to do this once, and again later if you download an updated version.

---

## Step 7 — Start it

You must still be inside the `gui` folder for this. If you closed your terminal since Step 4, or you are not sure, run this first:

```bash
cd gui
```

*(If that says "no such file or directory", you are already inside `gui`. Carry on.)*

Now start the app:

```bash
npm start
```

A window should open with a dark screen, the D.W.I.G.I logo, and a **Get Started** button.

**This is the command you will use every time from now on.** To open the app in future: open a terminal, `cd` into the `DWIGI/gui` folder, and type `npm start`.

> **If no window appears**, the terminal will usually say why. Two common causes:
>
> - **A message about Electron failing to install.** The app's window framework downloads separately from everything else, and it can fail on a slow connection or be removed by antivirus — while every other step still succeeds. Fix it by deleting the downloaded code and fetching it again:
>   ```bash
>   npm install
>   ```
>   If that alone does not fix it, delete the `gui/node_modules` folder entirely and run `npm install` once more.
> - **Your security software blocked it.** Windows SmartScreen or a company Application Control policy can block the window framework. Do not turn your protections off. Use the engine directly in a terminal instead — see *Using the engine without the desktop app* below; it gives you the same council without a desktop window.
>
> If the terminal prints something else, copy that text into a GitHub issue.

---

## Step 8 — Tell it where its files are

The app needs to know where you put the D.W.I.G.I folder, because that folder *is* the council — the executive definitions and your business memory live there as ordinary files.

1. Click **Settings** in the left-hand menu
2. Next to **Repository location**, click **Choose…**
3. Select the `DWIGI` folder — the outer one you created in Step 3, **not** the `gui` folder inside it
4. Click **Chat** in the left-hand menu to go back

---

## Step 9 — Let it get to know your business

Click **Get Started**.

The advisor will speak first and ask you about your company — what it does, what stage it is at, what is currently getting in your way. Answer in plain sentences, as you would to a person. There is no form to fill in.

This is worth doing properly. Every recommendation it gives you later is grounded in these answers, and it will tell you honestly when it is guessing because it does not know something.

Some questions it will never guess at — your cash position, runway, monthly spend, and revenue. It either asks you or records them as unknown. It will not invent a number about your money.

When you are done, your answers are saved to `core/business_memory.md` inside the folder. That file stays on your computer and is never uploaded anywhere.

---

## Step 10 — Start using it

You are set up. Here is what the menu on the left does:

| Menu item | What it is for |
| :--- | :--- |
| **Chat** | Ask about a decision. This is the main thing you do. |
| **Executive Board** | See the eight executives, and talk to one of them alone |
| **Dashboard** | A quick read on your business at a glance |
| **Decisions** | Every decision it has recorded for you, and why |
| **Memory** | Everything it currently knows about your business |
| **Settings** | Change the folder, the theme, and which executives take part |

**Just ask it things**, the way you would ask an experienced advisor:

> *"Should I raise my prices?"*
> *"I have two months of runway left. What do I do?"*
> *"Should I hire a second engineer or wait?"*

It decides for itself how much thought a question deserves. A small question gets a short answer; a decision you cannot undo gets the whole council.

---

## If something goes wrong

| What you see | What it means and what to do |
| :--- | :--- |
| `node: command not found` | Node.js is not installed, or you did not open a fresh terminal after installing. Redo Step 1. |
| `npm: command not found` | Same cause — npm comes with Node.js. Redo Step 1. |
| `'cd' ... no such file or directory` | You are not where you think you are. Type `ls` to see where you are, then `cd` into the right folder. |
| `Could not read package.json` | You are one folder too high up. Type `cd gui` and try again. |
| `Missing script: "start"` | Same cause as above — you are in the outer folder, not `gui`. |
| **`npm run build` works but `npm start` does nothing** | These need different things: `build` compiles code, `start` needs the window framework that downloads separately during `npm install`. Run `npm install` again; if that does not help, delete `gui/node_modules` and run it once more. |
| `Electron failed to install correctly` | Exactly the case above. Delete `gui/node_modules`, then `npm install`. |
| **"Runtime not found"** in the app | Claude Code is not installed or not signed in. Redo Step 2 and check `claude --version` works. |
| **"No repository selected"** in the app | You skipped Step 8. Go to Settings → Repository location. |
| The welcome screen keeps coming back | Onboarding has not finished yet. Click Get Started and complete the conversation. |
| Something else | Open an issue on GitHub and paste what the terminal printed. |

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

## Requirements, stated exactly

- **A working, authenticated Claude Code installation**, resolvable on your `PATH` as `claude`. That is the verified requirement, and the only one this project checks. Which Anthropic plan, subscription, or API arrangement applies, what it costs, and who is eligible are questions this project does not know the answer to and does not check — see [Anthropic's documentation](https://docs.claude.com/en/docs/claude-code/overview).
- **Node.js and npm**, for the desktop application only. Built and tested on Node 24. Older versions are untested here; if you need a supported floor, take it from the Next.js 15 and Electron 34 release notes rather than from this file.
- Nothing else. No API keys are stored, read, or required by any file in this repository.

---

## Using the engine without the desktop app

The desktop application is optional. The engine is plain markdown, so you can run it directly in a terminal from inside the repository folder:

```bash
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

## The prebuilt Windows download

If you would rather not build from source, the [releases page](https://github.com/bhargav-patnaik01/DWIGI/releases) has a Windows archive. Extract it and run `D.W.I.G.I.exe` from the extracted folder — the executable needs the files beside it, so do not move it out on its own. Setup from Step 8 onwards is identical.

> **The Windows V1 build is currently unsigned. Windows SmartScreen or
> organizational Application Control policies may warn about or block the
> application. If the binary is blocked, use the source installation instead.
> Do not disable your system's security protections.**

Signing status: **UNSIGNED** — a deliberate decision for V1, not a defect. `RELEASE_NOTES.md` and `KNOWN_LIMITATIONS.md` record the details, including a caveat about executable branding worth reading before you publish a binary of your own.

---

## Other useful commands

Run these from inside the `gui` folder:

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
