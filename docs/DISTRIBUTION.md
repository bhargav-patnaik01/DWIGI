# Distribution

How D.W.I.G.I is packaged, signed, and updated. Two of the three are not implemented; this document is what makes them cheap to implement later rather than archaeology.

**A QA and operations artifact, not a system file.** Never read during an interaction; does not count against ADR-007's context bound.

---

## 1. What ships

| Target | Artifact | State |
| :--- | :--- | :--- |
| Windows installer | `DWIGI-Setup-<version>-x64.exe` (NSIS) | Configured; **unsigned** |
| Windows portable | `DWIGI-Portable-<version>-x64.exe` | Configured; **unbuilt** |
| macOS | `.dmg` | Configured; **never exercised** |
| Linux | `.AppImage` | Configured; **never exercised** |

The installer creates a desktop shortcut and a Start Menu entry, registers an uninstall entry reading `D.W.I.G.I <version>`, installs per-user (no elevation prompt), and lets the founder choose the directory.

### The engine travels inside the installer

`build.extraResources` copies the kernel, `core/`, and `.claude/commands/` to `resources/engine/`. Workspace creation reads from there (`electron/workspace/index.ts`), which is what makes "no cloning, no templates, no manual setup" true for someone who has never heard of Git.

**`core/business_memory.md` is excluded by an explicit filter**, and excluded again by a denylist in the copier. Two independent fences, because the development tree contains a real company's cash position and the leak would be invisible — every build would succeed and every installer would carry it.

### What must never appear in a shipped artifact

`Electron`, `Next.js`, `React`, `node_modules`, a developer's home directory, or any version string that is not this application's. `win.signAndEditExecutable` stays **true** for this reason: that one flag controls version-resource stamping as well as signing, and disabling it to quiet the unsigned warning also strips the product name, version, and copyright — which is exactly how v1.0.0 shipped an executable reporting itself as *Electron 34.5.8 by GitHub, Inc.*

---

## 2. Code signing — where the certificate plugs in

**Nothing in this repository needs to change to sign a build.** That is the design, and it is why no certificate path is hardcoded.

### Standard certificate (`.pfx`)

electron-builder reads two environment variables and requires no configuration:

```bash
CSC_LINK=/absolute/path/to/certificate.pfx     # or a base64 blob, or an https URL
CSC_KEY_PASSWORD=<password>
npm run package:installer
```

In CI, set both as secrets. `CSC_LINK` accepts base64 precisely so a certificate never has to touch a runner's disk.

### EV certificate on a hardware token

EV certificates cannot be exported, so the two variables above do not apply. Add to `build.win`:

```json
"certificateSubjectName": "<exact subject on the token>",
"signingHashAlgorithms": ["sha256"]
```

Signing then runs through the machine's certificate store, and the build must run on the machine holding the token.

### macOS notarisation

Requires an Apple Developer account and three more variables — `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — plus `build.mac.notarize: true`. Not configured, because the macOS target has never been built.

### Publisher fields

`build.win.publisherName` and `build.copyright` are the two strings a Windows user sees in the SmartScreen dialog and in file properties. They live in `package.json` and are the only fields that must change if the publishing entity ever does.

### Verifying a signed build

```powershell
Get-AuthenticodeSignature "release\D.W.I.G.I.exe" | Format-List
(Get-Item "release\D.W.I.G.I.exe").VersionInfo
```

The second command is worth running on **every** build, signed or not: it is the check that would have caught the v1.0.0 branding failure, and it takes two seconds.

---

## 3. Auto-update — architecture only, deliberately unimplemented

Not built. This section exists so that building it is a sprint rather than a redesign.

### Update provider

`electron-updater`, backed by **GitHub Releases**. It is already the distribution channel, needs no server, and `publish: null` in `package.json` is the single line that currently disables it — replaced by:

```json
"publish": [{ "provider": "github", "owner": "bhargav-patnaik01", "repo": "DWIGI" }]
```

Rejected alternatives: a self-hosted `generic` provider (an availability dependency for a local-first tool), and S3 (an AWS account for a project that has none).

**Updates cannot ship before signing does.** An unsigned auto-updater downloads and executes an unverified binary on a schedule — strictly worse than no updater, because the founder is no longer choosing to trust each download. Signing is a prerequisite, not a companion task.

### Channels

| Channel | Audience | Tag |
| :--- | :--- | :--- |
| `latest` | Default | `v1.2.1` |
| `beta` | Opt-in from Settings | `v1.3.0-beta.1` |

Two, not three. A third channel needs a third audience to justify it, and this project does not have one.

### Version checking

Poll on launch and every six hours. Never on a keystroke, never mid-turn — a turn can be a Maximum-budget deliberation the founder is waiting on, and an update prompt across it would interrupt exactly the moment the product exists to serve.

The founder is **told**, never interrupted: a quiet affordance in Settings and a one-line notice, with the install deferred to a restart they choose. Silent auto-install is refused for a specific reason — this application spawns an AI runtime that writes to a founder's decision journal, and swapping the binary underneath a running deliberation is not a risk worth the convenience.

### Migration path

Three stores already carry versions and already migrate forward, so an update inherits working migration rather than needing new machinery:

| Store | Version field | Behaviour on an older record |
| :--- | :--- | :--- |
| Workspace manifest | `schemaVersion` | Migrated on open; a **newer** version is refused untouched |
| Conversation transcripts | `v` per line | Unknown versions skipped and disclosed, never guessed |
| Interface preferences | zustand `version` | `migrate()` supplies defaults; the workspace pointer is preserved |

The rule they share is the one to keep: **forward-only, never lossy by default, and a record from the future is left alone rather than downgraded.** An update that rewrote a newer manifest would silently discard settings the newer build wrote.

### Rollback

1. **The founder's route.** Uninstall, download the previous release, reinstall. It works today and costs nothing to support because `deleteAppDataOnUninstall` is `false` — transcripts, credentials, and preferences survive, and the workspace is a folder the uninstaller never touches.
2. **The publisher's route.** Delete the bad release from GitHub; `electron-updater` stops offering it. Clients that already updated do not roll back on their own, which is why staged rollout matters more than rollback.
3. **Staged rollout.** `electron-updater` honours a `stagingPercentage` in the release metadata. Ship at 10%, watch, widen.

**What rollback cannot undo:** a workspace manifest migrated to a newer `schemaVersion`. The older build refuses to read it — correctly, since it would drop fields it does not model. Any release that bumps `WORKSPACE_SCHEMA_VERSION` is therefore effectively one-way for that workspace, and should say so in its release notes.

---

## 4. Release checklist

Mechanical, and every item exists because something once shipped without it.

- [ ] `package.json` `version` bumped — it feeds About, Diagnostics, the installer, and the executable's version resource
- [ ] `npm run typecheck` — both projects
- [ ] `npm test` — hermetic, spends no tokens
- [ ] `npm run build` — the export and CSP hashes
- [ ] `bash docs/validation/check-references.sh` — the two known failures are ADR-007's bound and the kernel word budget; **any third is a regression**
- [ ] `npm run package:installer`
- [ ] `(Get-Item ...).VersionInfo` reports **D.W.I.G.I**, the right version, and the right publisher — not Electron
- [ ] Install the artifact on a clean machine; confirm shortcuts, the uninstall entry, and the icon
- [ ] Launch and complete first run without a terminal
- [ ] `RELEASE_NOTES.md` and `KNOWN_LIMITATIONS.md` updated, including signing status
