# AGENTS.md — Moraxterm Continuation Guide

This file is the handoff document for any AI agent, coding model, or human contributor continuing the Moraxterm project. Read it before changing code.

## Project identity

- Project: **Moraxterm**, a cross-platform terminal workspace inspired by MobaXterm.
- Repository: `https://github.com/alimoradimllm/moraxterm`
- Main branch: `main`
- Primary UI: `tauri-ui/` — Tauri 2, Vite, JavaScript, xterm.js.
- Native bridge: `tauri-ui/src-tauri/` — Rust/Tauri commands and process management.
- Shared Rust core: `rust-core/` — sessions, persistence, terminal abstractions, and tests.
- Documentation: `docs/REMAINING_WORK.md` and `docs/MORAXTERM_COMPATIBILITY_ROADMAP.md`.
- Current source head when this file was created: `93f3e57`.
- Latest published release at handoff: `v0.1.14`.

## How to continue the work

1. Read this file and the relevant section of `docs/REMAINING_WORK.md`.
2. Inspect the current implementation before editing; do not rely on an old summary.
3. Choose one concrete remaining item.
4. Implement a real artifact, not a stub or a plan.
5. Run the required checks listed below.
6. Runtime-test desktop behavior when the change affects the UI, terminal, process lifecycle, persistence, or packaging.
7. Update this file when the change affects project state, workflows, verification status, known limitations, or design decisions.
8. Update the relevant roadmap/remaining-work documentation when feature status changes.
9. Commit the complete change with a specific message.
10. Push the commit to `origin/main` in the same work cycle.
11. Verify that the working tree is clean and synchronized before reporting completion.

**Every code or documentation change must be committed and pushed to GitHub unless the user explicitly asks for a local-only change.** Never say a change is complete when it exists only in the working tree.

## Required verification

For frontend or shared UI changes:

```bash
node --check tauri-ui/src/main.js
npm --prefix tauri-ui run build
cargo check --manifest-path tauri-ui/src-tauri/Cargo.toml
git diff --check
```

For changes that may affect Python tooling or fixtures:

```bash
python -m unittest discover -q
```

The Windows suite currently reports 54 tests with four platform-specific skips. `pytest` is not assumed to be installed.

For a release or Windows desktop runtime change:

```bash
cd tauri-ui
npm run tauri -- build
```

Then launch the exact built executable and verify the affected workflow in the desktop application. Compilation, packaging, and CI do not prove runtime correctness.

After committing and pushing:

```bash
git status --short --branch
git log -1 --oneline
```

Expected status is clean and tracking `origin/main`.

## Product behavior and design rules

### MobaXterm-style UI

- The default application and terminal theme is colorful MobaXterm-inspired styling.
- Application and terminal themes remain independently selectable.
- Protocol icons must change the session type, highlight the selected icon, and show relevant fields.
- Session editor sections are Basic, Advanced, Terminal, Network, and Bookmark.
- Session folders are hierarchical, collapsible, draggable, and persistent.
- SSH sessions must be movable into folders by dragging the session row onto a folder row. Users should not need to type a folder path for this workflow.

### MultiExec is modeled on MobaXterm

Do not replace this with a prompt-only or hidden implementation. MultiExec must preserve:

- A persistent top banner while MultiExec is active.
- Multi-paste and Exit multi-execution mode controls.
- `Ctrl+Shift+Insert` triggers Multi-paste while MultiExec is active.
- Multiple terminal panes receiving the same input.
- A per-terminal `Exclude ... from MultiExec mode` checkbox.
- Target selection and stop controls where useful.
- Visible per-target command status indicators such as `✓ sent` and `✕ failed`.
- Clear stopped-session behavior inside each pane.

### Terminal lifecycle

- States are `starting`, `connected`, `failed`, and `exited`.
- A stopped/failed pane must show clear, clickable actions to exit the tab, restart/reconnect, and save output.
- Enter/Return, R, and S keyboard actions must remain consistent with those visible actions.
- Do not claim authenticated SSH success without a disposable test target and explicit runtime evidence.

## Security and privacy rules

- Never put passwords, private keys, tokens, API keys, fingerprints, host keys, connection strings, or sensitive command contents in source, documentation, logs, commits, screenshots, or release artifacts.
- Use `[REDACTED]` in reports and public artifacts.
- Never type passwords, private keys, card data, CVCs, or one-time codes through browser or desktop automation.
- Use OS-backed credential storage and keyring abstractions; do not store secrets in session records.
- Keep diagnostic logging opt-in, Settings-controlled, local, and sanitized.
- Use structured process arguments; never build commands through unsafe shell interpolation.
- Configuration import must remain read-only and secret-free.
- CLI execution must be explicit through `--execute`; dry-run is the default.
- Do not expose SSH-agent key material. Availability and identity count are acceptable.
- Do not publish personal Windows paths, WSL paths, workspace paths, credentials, or host data.

## Current implemented areas

The source currently includes:

- Persistent sessions and SQLite migration support.
- Nested, collapsible session folders with create, rename, delete-to-parent, persistence, and drag/drop movement.
- Local Shell, SSH, WSL, Telnet, Serial, RDP, and VNC session models/launch planning.
- Windows ConPTY-related terminal handling and connection-state feedback.
- SFTP browsing, queued transfers, cancellation, bounded retries, resume, drag/drop upload, and bounded previews.
- OS-backed SSH credentials with temporary askpass handling.
- Known-host status, strict preflight, managed removal, scanning, and approval workflows.
- MobaXterm-style session editor, themes, keyword highlighting, SSH-agent status/polling, and protocol selection.
- Workspace tabs, tab drag/reordering, split panes, and MultiExec modeled after MobaXterm.
- In-pane stopped/failed terminal actions and keyboard shortcuts.
- Dependency/security scanning and signed release checksum workflow.

Treat the implementation as real but keep runtime gaps explicit. Verify behavior before marking an item complete.

## Known open work

Consult `docs/REMAINING_WORK.md` for the full list. Important open areas include:

- Full Windows terminal matrix: PowerShell, WSL/Bash, Unicode, resize, paste, control keys, ANSI/VT behavior, alternate-screen applications, mouse reporting, and long output.
- Authenticated SSH/SFTP testing against a disposable target.
- Runtime validation of host-key approval/change warnings and SSH-agent authentication.
- Reliable upload-byte progress remains open. Local browser metadata (type, size, modification epoch), bounded local text editing, remote edit-copy workflow, direct-operation SFTP client preflight, and non-resumable SCP fallback are implemented; disposable-target fallback testing remains open.
- Detached terminal windows.
- Selective MultiExec stop/status refinements and command-result semantics beyond write acknowledgement.
- Multiple tunnel profiles/status/logs are implemented in source; disposable-target runtime testing remains open.
- Macro library persistence/import/export is implemented in source; installed-app file-dialog runtime testing remains open.
- Local Shell settings persist a selector for system default, cmd, PowerShell, Bash, Fish, Zsh, and Nushell; the Settings UI checks PATH and disables unavailable optional shells. Installed-build verification passed for system default `cmd.exe`; optional-shell runtime checks remain open.
- WSL distribution discovery is implemented through `wsl.exe --list --verbose` with UTF-16LE decoding; the selector displays distro name, running state, and WSL version while saving the raw distro name. Runtime launch tests remain open.
- WSL user discovery is implemented through `wsl.exe --distribution <name> -- cat /etc/passwd`; the editor populates a username datalist while preserving manual entry. Live Debian query succeeded; authenticated WSL launch testing remains open.
- Serial device discovery is implemented for Windows registry COM ports and Linux `/dev` serial devices; no serial device is present on the current host for runtime launch testing.
- Telnet editor mode selection (Auto/Raw/Line), active-pane Ctrl+C break control, and bounded UTF-8 text-file streaming (1 MiB) are implemented; binary transfer and disposable Telnet runtime testing remain open.
- Terminal launch now performs executable preflight for SSH, RDP, VNC, WSL, Telnet, Serial, and configured Local Shell sessions after validating required fields. WSL additionally probes the selected distribution and optional user with structured `wsl.exe --distribution <name> --user <user> -- true` arguments; missing clients, distributions, or users return clear errors before the terminal process is created.
- X-server lifecycle, scanner/network tools, resource metrics, editors, and advanced viewers.
- Clean-machine Windows/Linux installation testing.
- Authenticode/package signing, updater implementation, reproducible builds, ARM64, AppImage, and Flatpak.

Do not publish another release solely because a local build passes. Release only after the relevant installed-application workflows are runtime-tested and release assets are verified.

## Change-log rule for this file

After every meaningful change, update this file if any of the following changed:

- Current commit/release state.
- Implemented feature list.
- Verification evidence.
- Known limitations or remaining work.
- Security or privacy rules.
- A design decision future agents must preserve.

Keep entries factual and concise. Do not record secrets or temporary personal paths. Always commit and push the updated `AGENTS.md` together with the code change.

## Reporting format

Final reports should be concise and state:

1. What changed.
2. What was actually verified, including real test results.
3. Commit hash and push status.
4. Remaining limitations or runtime gaps.

Never report a planned action as completed. If runtime testing or a required dependency is blocked, state the blocker plainly.
