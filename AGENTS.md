# AGENTS.md — Moraxterm Continuation Guide

This file is the handoff document for any AI agent, coding model, or human contributor continuing the Moraxterm project. Read it before changing code.

## Project identity

- Project: **Moraxterm**, a cross-platform terminal workspace inspired by MobaXterm.
- Repository: `https://github.com/alimoradimllm/moraxterm`
- Main branch: `main`
- Primary UI: `tauri-ui/` — Tauri 2, Vite, TypeScript, React, and xterm.js.
- Native bridge: `tauri-ui/src-tauri/` — Rust/Tauri commands and process management.
- Shared Rust core: `rust-core/` — sessions, persistence, terminal abstractions, and tests.
- Documentation: `docs/REMAINING_WORK.md` and `docs/MORAXTERM_COMPATIBILITY_ROADMAP.md`.
- Latest published release: `v0.1.24`.

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

- The first React/TypeScript frontend migration slice now owns the desktop shell, session sidebar, home dashboard, tabs, quick-connect input, and one real xterm.js terminal path while preserving the existing Tauri command/event names. The legacy JavaScript implementation remains in the tree during the incremental migration and must not be removed until feature parity is verified.
- The React migration now includes a typed Session Editor with Basic, SSH, and Terminal tabs, protocol selection, SSH-agent forwarding, remote-shell selection, and `save_session` persistence through the existing Rust bridge.
- The React migration now includes typed Settings and Macro Manager panels. Settings persist local appearance/terminal preferences; macros persist locally with bounded import/export/delete/play controls and existing `write_terminal` playback.
- The React migration now includes a typed MultiExec manager. It lists open terminal tabs, supports per-tab inclusion/exclusion, broadcasts input through the existing `write_terminal` bridge, and reports sent/failed status.
- The React migration now includes a typed SFTP/FTP browser pane. It uses the existing `sftp_list`, `sftp_operation`, and `sftp_transfer` Tauri commands for remote listing, folder/rename/delete/permissions operations, upload, and download. The rebuilt pane was visually verified, including a bounded authentication failure state; authenticated transfer runtime testing remains open.
- The first Embedded Unix slice is implemented as a new `Unix` session type. It persists Fish/runtime-root/host-mount settings and launches only from a private runtime root with isolated HOME, PATH, and temporary directories; it never falls back to Windows cmd.exe. A managed MSYS2 POSIX runtime is installed locally and Fish 4.9.3 was verified; packaging that runtime for distribution remains open.
- The typed Session Editor now exposes protocol-specific WSL, Serial, and Telnet settings backed by the existing Rust session schema. Frontend and native tests pass; runtime editor interaction remains subject to the known Tauri UIA timeout limitation.
- The Session model and typed editor now include RDP resolution/fullscreen/audio and VNC display/view-only/shared-connection settings. Legacy session payloads remain compatible through serde defaults; frontend and native tests pass.
- The React terminal pane now exposes Resume, Reconnect, and Close lifecycle controls using the existing native commands. Frontend, Tauri tests, and a rebuilt desktop executable pass; installed-app interaction remains subject to the known UIA limitation.
- The React Session Editor now exposes SSH ProxyJump/gateway and host-key policy fields (`ask`, `strict`, `accept-new`) backed by the existing structured Rust SSH planner. It also provides known-host status, fingerprint scanning, explicit fingerprint-confirmed approval, and removal controls. Automated checks pass. The disposable WSL runtime harness passes unknown-host rejection, explicit approval, changed-key rejection, and gateway forwarding through an explicit `ProxyCommand`; literal `-J` is intercepted by this image's system SSH wrapper and remains open for a clean environment test.
- React workspace split mode now renders two independent terminal panes from the active tab set, with a toolbar toggle, divider, and per-pane lifecycle controls. Frontend, Tauri tests, and a rebuilt desktop executable pass; installed-app split interaction remains open.
- React workspace duplication now creates a uniquely named copy of the active session tab and starts it as an independent terminal. Frontend, Tauri tests, and a rebuilt desktop executable pass; installed-app duplicate interaction remains open.
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

- Windows terminal matrix: PTY-level tests now pass for PowerShell, WSL/Bash, Unicode, resize, paste, Ctrl+C, Windows EOF, alternate screen (`vim`, `less`), mouse-reporting enable sequences, and 20000-line output (`rust-core/tests/windows_pty_matrix.rs`). Still open: the same checks in the installed desktop app (xterm.js rendering, keyboard mapping, real paste path), Ctrl+Break, `mc`/`htop`, and a VT conformance run.
- Authenticated SSH/SFTP testing against a disposable target.
- Runtime validation of host-key approval/change warnings and SSH-agent authentication.
- `scripts/disposable_sftp_runtime_test.sh` passes in Debian WSL (OpenSSH client-level SFTP/SCP/resume/strict-host-key checks against a throwaway loopback sshd); it does not cover the Moraxterm UI or Tauri commands.
- `scripts/disposable_sftp_commands_test.sh` passes: the real `sftp_list`/`sftp_operation`/`sftp_transfer` bridge functions and the queued transfer core (`begin_sftp_transfer`/`cancel_sftp_job`: put/get, `reput`/`reget` resume, failure reporting, cancel) work against a disposable sshd. Test-only env hooks: `MORAXTERM_TEST_SSH_CONFIG`, `MORAXTERM_TEST_SFTP_LIMIT_KBIT` (compiled under `cfg(test)` only). The SFTP UI, Tauri event delivery to the frontend, and upload-byte progress remain untested.
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
- Network diagnostics preflight platform tools before ping/traceroute/DNS execution; TCP checks use Rust sockets directly. This host has `ping`, `tracert`, and `nslookup`, but not `getent` or `traceroute`.
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

**Every change, however small, must add an entry to the "Change history" section below in the same commit** (newest first: date, what changed, what was verified, what is still open). The commit hash is added by the next entry, since a commit cannot contain its own hash.

Keep entries factual and concise. Do not record secrets or temporary personal paths. Always commit and push the updated `AGENTS.md` together with the code change.

## Change history

Newest first. Each entry: what changed, what was verified, what is still open. Hashes refer to `origin/main`.

### 2026-10-17 — Windows ConPTY behavior matrix as automated tests
- Added `rust-core/tests/windows_pty_matrix.rs` (Windows only, 12 tests) driving real `cmd.exe`, PowerShell, `vim.exe`, and Debian WSL through `TerminalProcess`: command I/O, PowerShell interactivity, Unicode round trip and input length, 20000-line output (all 20000 lines delivered), resize (including mid-command, and `stty size` in WSL), Ctrl+C in `cmd.exe` and PowerShell, Ctrl+Z+Enter EOF, multi-line paste, `vim` alternate screen plus mouse-reporting enable, and `less` alternate screen over WSL. No production code changed; no bug found in `TerminalProcess`.
- Verified: plain `cargo test` in `rust-core` passes (12 new tests plus existing suites).
- Findings to preserve: (1) children inherit a parent's "ignore Ctrl+C" console flag, so Ctrl+C silently does nothing in a terminal if the launcher disabled it; the tests clear the flag via `SetConsoleCtrlHandler`. Check how the installed app is launched before blaming the PTY layer. (2) procps `top` does not use the alternate screen, so use `less`/`vim` for that check. (3) Test markers must not occur in the echoed command, or waits return on the echo.
- Updated `docs/WINDOWS_TERMINAL_TEST_MATRIX.md` ("PTY PASS" rows) and `docs/REMAINING_WORK.md`.
- Open: all of this is PTY-level. xterm.js rendering, keyboard mapping, the real paste path, and the installed app are untested; Ctrl+Break, `mc`, `htop`, VT conformance remain open.

### 2026-10-17 — Queued SFTP transfer core made testable; cancel reaps the process (`ec37102`)
- `start_sftp_transfer` / `cancel_sftp_transfer` now delegate to `begin_sftp_transfer` / `cancel_sftp_job`, which take an injectable emitter (`SftpEmitter`) and job map (`SftpJobs`) instead of a Tauri `AppHandle`. Tauri command names, arguments, and event names (`sftp-transfer-progress`, `sftp-transfer-exit`) are unchanged.
- Job ids now end in an atomic counter (`sftp-<epoch>.<ms>-<n>`) so two jobs started in the same millisecond cannot collide in the job map.
- Cancelling a job now calls `wait()` after `kill()` so the child process is reaped.
- New ignored test `sftp_queued_transfer_resume_and_cancel_against_disposable_server` covers upload, download, `reget` resume, `reput` resume, missing-remote-file failure (`success=false`), cancel of a throttled running job (exactly one exit event, job removed, second cancel is a no-op), and id uniqueness. `scripts/disposable_sftp_commands_test.sh` now runs both ignored SFTP tests.
- Verified: `DISPOSABLE_SFTP_COMMANDS_TEST=PASS` (2 tests) in Debian WSL with Windows `sftp.exe`; `cargo test` 6 passed / 2 ignored; `node --check`, `npm run build`, `cargo check`, `git diff --check` clean.
- Open: SFTP UI and frontend event handling untested at runtime; upload-byte progress still indeterminate; no installed-app run.

### 2026-10-17 — SFTP delete fix and bridge command test (`09440c8`)
- Fixed `sftp_operation` delete: `rm` and `rmdir` were sent in one `sftp -b` batch, which aborts on the first failure, so deleting a file or directory always errored. It now runs `rm`, then falls back to `rmdir` (`run_sftp_script`).
- Added `sftp_batch_command` (shared structured `sftp -b -` builder replacing five duplicated blocks) with a `cfg(test)`-only `MORAXTERM_TEST_SSH_CONFIG` hook so tests never touch the real `~/.ssh`.
- Added `scripts/disposable_sftp_commands_test.sh` and the ignored test `sftp_commands_roundtrip_against_disposable_server` (list, mkdir, rename, chmod, upload, download byte-exact, delete file and directory).
- Verified: `DISPOSABLE_SFTP_COMMANDS_TEST=PASS`; the first run failed on the delete bug before the fix.
- Side effect: the commit included regenerated `tauri-ui/src-tauri/gen/schemas/*.json`; consider git-ignoring them.

### 2026-10-17 — Disposable SFTP/SCP client harness (`b4f9332`)
- Added `scripts/disposable_sftp_runtime_test.sh`: loopback-only throwaway `sshd` with temporary keys exercising OpenSSH `sftp`/`scp` directly (list, mkdir/rename/chmod, byte-exact upload/download, `reput`/`reget`, delete, `scp` both ways, strict unknown-host rejection).
- Verified: `DISPOSABLE_SFTP_RUNTIME_TEST=PASS` in Debian WSL. Covers OpenSSH clients only, not Moraxterm code.


## Reporting format

Final reports should be concise and state:

1. What changed.
2. What was actually verified, including real test results.
3. Commit hash and push status.
4. Remaining limitations or runtime gaps.

Never report a planned action as completed. If runtime testing or a required dependency is blocked, state the blocker plainly.
