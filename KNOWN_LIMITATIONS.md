# Known limitations — v1.3.0

Everything here is observed, not speculative. This is under active development; the list is meant to set expectations honestly rather than to look short.

---

## Windows binary

> **This build is unsigned. Windows SmartScreen or organizational Application
> Control policies may warn about or block the application. If the binary is
> blocked, use the source installation instead. Do not disable your system's
> security protections.**

Signing status: **UNSIGNED**. This is a deliberate decision for this release, not a defect in the build.

**v1.3.0 ships as a portable build only — no installer.** electron-builder's NSIS installer target has to self-execute its own unsigned installer stub once, in-process, to generate and sign the uninstaller. On the machine this release was built on, **Windows Smart App Control** enforces a policy that blocks exactly that self-execution (`HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy`: `CodeIntegrityPolicyEnforcementStatus=2`, confirmed by reproducing the block directly with `Start-Process` — *"An Application Control policy has blocked this file"*). This is a property of the build machine, not of the application: the portable target, which does not need this self-execution step, built and launched cleanly from the same `npm ci` install. **A GitHub Actions release pipeline will become the canonical installer builder** in a future release, run on a machine without this restriction, so the installer is no longer coupled to whichever developer's machine happens to cut the release.

**The executable's version metadata may report Electron rather than D.W.I.G.I.** electron-builder performs icon stamping and version metadata as part of the same packaging step. Where it completes — as it did for this release — Windows file properties correctly report `D.W.I.G.I`, `1.3.0`, and `Copyright © 2026 Bhargav Patnaik`. Where it cannot complete (see above), Windows file properties fall back to `Electron 34.5.8` by `GitHub, Inc.` The application itself is unaffected either way — the payload is correct and behaves normally — but an unsigned *and* unbranded executable gives a user little to distinguish it from a repackaged Electron app.

---

## Hosted Runtime and the read-only Tool Adapter (new in v1.3.0)

- **A Hosted engine (OpenAI, Ollama, LM Studio, OpenRouter, Azure OpenAI) cannot host the Executive Council.** It can read, through eight fixed read-only tools, and it can converse — it cannot write Decision Records or maintain Business Memory, which the Council depends on.
- **Read-only tool support on Ollama, LM Studio, and OpenRouter is declared `unknown`, not `supported`.** Whether the connected model actually honours structured function-calling is a property of which model is loaded, not of the transport, and is not verified generically. The tools are still offered; if the model ignores them, the connection simply behaves as plain conversation.
- **Azure OpenAI is listed but not yet connectable.** Its manifest and request format are complete; the connect-time UI for resource name, deployment name, and API version has not been built.
- **No Trusted Session.** Nothing a Hosted engine can call ever needs approval, by construction — all eight tools are read-only — so there is no "Always Allow" concept to build or to have skipped by accident.

---

## What the interface will not claim

- **No live per-executive activity.** The runtime reports which tools ran and says nothing about which executive lenses participated in a deliberation. The Executive Board therefore shows how the council is *configured*, never who is "thinking". To audit real routing, ask the advisor to stress-test a recommendation — that answer comes from the engine, which does know.
- **Single-agent answers carry no red-team pass.** Choosing one executive excludes the challenge lenses by definition, so the falsification step that normally attacks a recommendation does not run. The mode says so on screen. Use Council Chat for anything you intend to act on.

---

## Reasoning and memory

- **Onboarding will not fill the whole memory schema.** It is bounded by the engine's own follow-up cap. This is intentional — the rest accumulates through normal use — but a first conversation leaves many fields `unknown`, and advice is correspondingly hedged.
- **Four financial fields can never be inferred**: cash position, runway, monthly burn, and revenue. They come from you or stay unknown. Advice that would depend on them is capped in confidence until you supply them.
- **Routing thresholds are Version 1 heuristics.** The domain routing table and the Existential budget triggers were derived analytically, not from observed founder decisions, and are scheduled for behavioural validation. They are documented as such in `docs/DECISIONS.md`.
- **Calibration requires review to be useful.** The system records predictions with dates; scoring them happens when you conduct a review. Until then the calibration ledger is empty, which is the correct state for a new installation rather than a fault.
- **The context bound in ADR-007 is breached, and is left that way deliberately.** A Full deliberation reads up to 12 files against a stated bound of 6. ADR-012 reduced the peak from 13 by loading a lens's reasoning only after the gate admits it, but the routing base alone is 6 files, so any deliberation with two or more lenses exceeds the bound. The criterion is arithmetically unreachable while executives are separate files. `docs/validation/check-references.sh` reports this as a failure on purpose rather than raising the bound to make it disappear; ADR-012 carries the measured numbers and the recommendation.
- **`/deliberate-isolated` is experimental.** It changes execution only — every routed lens reasons in its own context — and exists so the anchoring question can be measured rather than argued. It is not the default and not a replacement for `/deliberate`. Whether it produces better deliberation is genuinely unestablished; `docs/validation/BENCHMARK.md` states which classes of claim its harness can settle and which it cannot.

---

## Repository and privacy

- **`journal/` and `dossier/` are tracked by design** (ADR-002), because decision history is the learning mechanism. If you make your fork public, Decision Records — and the business reasoning inside them — are published with it. Neither directory exists on a fresh clone. If your repository is public and your decisions are not, add them to `.gitignore`.
- `core/business_memory.md` is gitignored by default. It holds cash position, runway, and customer facts.

---

## Interface

- The welcome screen scrolls to reach its footer in a narrow window.
- Light theme is supported and considered, but dark is the primary design target and receives more attention.
- Conversation transcripts are never pruned or expired. On a long-running installation the application-data directory grows without bound.

---

## Platform

- The Executive Council requires a Native engine — Claude Code or Gemini CLI, run as a child process — and cannot substitute a Hosted engine for it (see Hosted Runtime, above). A working, authenticated Native engine installation is required to use the Council.
- Built and tested on Windows with Node 24. macOS and Linux packaging targets are configured but have not been exercised.
