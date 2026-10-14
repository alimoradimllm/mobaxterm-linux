# Moraxterm remaining work and verification status

_Last reviewed: 2026-10-14. Repository: `alimoradimllm/moraxterm`. Current release: `v0.1.13`._

This document separates verified behavior from planned work. It is not a claim
of full third-party terminal workspace parity.

## Verified in the current source tree

- Native Tauri desktop builds exist for Windows and Linux.
- Linux `.deb` and `.rpm` packages include the executable, desktop entry, and
  icon.
- Windows NSIS installer builds and installs a per-user copy.
- Windows session storage now uses `%APPDATA%\Moraxterm` instead of the Linux
  `~/.local/share/moraxterm-linux` path. This fix is commit `5f0dd72`.
- The installed Windows build loaded two persisted sessions during a live test.
- Rust core tests pass, including session validation, import, SQLite, PTY output,
  resize, Ctrl+C, and Ctrl+D/EOF behavior.
- Frontend production build and Tauri bridge `cargo check` pass.
- Python suite contains 54 tests. On Windows, 52 pass; two tests depend on a
  WSL-only research file or a POSIX shell assumption and need platform guards.
- A native WebView interactive smoke test was attempted. The application opened,
  but the desktop UI automation provider became unresponsive after WebView
  interaction. This is an automation limitation until a more reliable test
  harness is added; it is not recorded as a successful full terminal test.
- v0.1.13 Local Shell runtime verification passed: Windows `cmd.exe` produced
  directory output and an interactive prompt through xterm.js.
- v0.1.13 saved SSH session `ge` runtime verification passed through process
  startup and the SSH password prompt. Authentication was not attempted because
  credentials must never be entered into logs or documentation.
- v0.1.13 includes opt-in diagnostic logging from Settings at
  `%APPDATA%\\Moraxterm\\moraxterm-debug.log` by default.
- Terminal state feedback now distinguishes startup, connected, failed, and
  exited tabs. Full remote connection status, latency, retry policy, and
  authenticated SSH lifecycle tests remain open.
- The SFTP modal now provides a read-only local directory listing with
  refresh/up navigation. Transfer queue, progress, cancellation, resume,
  drag-and-drop, preview/editor, and SCP fallback work remain open.
- SFTP transfers now run through a serialized visible queue with explicit
  pending/running/completed/failed states and cancellation before a job starts.
  Byte-level progress, resume, and drag-and-drop remain open.
- Running SFTP jobs can now be cancelled through the backend, which terminates
  the native `sftp` process and reports a completion event. Byte-level
  progress and drag-and-drop remain open.
- Failed transfers now retry once and then stop with a failed state. Byte-level
  progress and drag-and-drop remain open.
- The SFTP browser now exposes a resume option backed by OpenSSH `reget` and
  `reput`. Byte-level progress and drag-and-drop remain open.
- The SFTP local pane now accepts dropped files and queues them for upload.
  Download jobs display observed destination-file byte growth; upload progress
  remains indeterminate because the native batch client exposes no reliable
  remote byte counter.
- Local SFTP preview now supports read-only UTF-8 files up to 1 MiB. Remote
  preview and editing remain open.
- Remote SFTP preview now uses a cleaned-up temporary file with the same 1 MiB
  UTF-8 limit. Editing remains open.
- A migration regression test now covers legacy SQLite payloads and current
  default fields. Broader schema migration fixtures remain open.
- SSH editing now checks whether a host entry exists in `known_hosts` without
  exposing fingerprints. Explicit approval/change-warning UI and updates remain
  open.
- Strict SSH sessions now refuse launch when no matching `known_hosts` entry is
  present. Native approval and changed-key warning UI remain delegated to
  OpenSSH; managed in-app approval/update UI remains open.
- Session folder paths now render as indented nested headings. Folder drag and
  drop, rename, and movement controls remain open.
- Session entries can now be dragged onto persisted folder headings and saved
  to SQLite. Folder create, recursive rename, and delete-to-parent controls are
  implemented; folder metadata is stored locally so empty folders persist.

## P0: daily terminal and SSH workflow

### Windows terminal runtime

- Replace the current Windows process path with verified ConPTY behavior where
  `portable-pty` does not provide full-screen compatibility.
- Test persistent input and output with PowerShell, `cmd.exe`, Bash, `vim`,
  `top`, `mc`, alternate-screen buffers, mouse reporting, and resize.
- Verify Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+Break, paste, Unicode, and long output.
- Add automated tests that run on a real Windows desktop session rather than
  relying only on UI Automation tree inspection.

### SSH trust and credentials

- Add an explicit host-key prompt before first connection.
- Read and update `known_hosts` without exposing fingerprints in logs.
- Warn when a host key changes and require an explicit user decision.
- Connect Linux Secret Service and Windows Credential Manager adapters.
- Add password prompts that never persist or place values in command arguments.
- Add SSH-agent selection and status.
- Add ProxyJump/gateway fields to the session editor.
- Add connection state, retry, latency, and clear failure messages.

### SFTP

- Add a local file browser beside the remote browser.
- Add rename, delete, mkdir, permissions, and file metadata.
- Add transfer queue, progress, cancellation, retry, and resume.
- Add drag-and-drop transfers.
- Add safe preview/editor behavior for text files.
- Add SCP fallback when SFTP is unavailable.
- Add integration tests with a disposable local SSH/SFTP server.

## P1: workspace and protocol parity

### Session manager

- Add nested folders and drag-and-drop movement.
- Add rename and duplicate operations.
- Add protocol-specific editors for SSH, RDP, VNC, WSL, Telnet, and Serial.
- Add connection-state indicators and complete duplicate handling during import.
- Add migration tests for older SQLite records.

### Workspace

- Add horizontal panes and draggable pane boundaries.
- Add tab movement, duplication, and detachment into a separate window.
- Add close confirmation for active connections.
- Add selective MultiExec targets, per-session output, status, and stop controls.
- Add multiple tunnel profiles and concurrent tunnel status/logs.
- Persist macro libraries with explicit import/export and secure content handling.

### Remote protocols

- OS-backed credential commands now use the `keyring` crate with Windows-native
  and Linux-native backends. They expose status/store/delete only; secret values
  are never returned. Wiring these commands into SSH authentication and the
  interactive credential editor remains open.
- Managed host-key removal is now available through a structured `ssh-keygen -R`
  bridge for the configured host/port. New-key approval remains delegated to
  OpenSSH so the application does not silently trust unverified key material.

- Add embedded or tightly integrated RDP/VNC windows where platform support
  allows it.
- Add Serial device discovery and baud/data/parity/flow-control configuration.
- Add Telnet options, break signal, and file transfer controls.
- Add WSL distribution, user, working-directory, and shell-profile selectors.

## P2: advanced tools and operations

- Manage X-server lifecycle, tray state, XDMCP, and access control.
- Add network scanner and real bandwidth/latency panels.
- Add local/remote process, service, and disk-usage viewers.
- Add text and hex editor workflows with safe file boundaries.
- Replace placeholder status values with measured CPU, memory, throughput,
  uptime, load, process count, latency, and per-session bandwidth.
- Add ARM64 packages, AppImage/Flatpak where tooling is reproducible, an
  uninstaller, Start Menu registration, Add/Remove Programs metadata, and
  automatic update support.
- Add code signing, dependency scanning, secret scanning, reproducible builds,
  and signed release verification.
- Run installation tests in clean Windows and Linux virtual machines.

## P3: deferred

Android remains deferred until Windows and Linux desktop behavior is stable.

## Release gate

Do not publish a new release until all of the following are true:

1. Rust tests, Python tests with platform guards, frontend build, Tauri bridge
   check, and `git diff --check` pass.
2. Windows installer and Linux packages are rebuilt from the same commit.
3. Installed Windows and Linux smoke tests verify startup, session loading,
   local terminal input/output, close, reconnect, and database persistence.
4. SSH/SFTP tests use disposable local infrastructure and never include real
   credentials.
5. The release assets and SHA-256 list are generated from the final binaries.
6. The GitHub release assets are read back after upload.

## Documentation maintenance rules

- Record completed work only when a command, test, installed artifact, or remote
  read-back provides evidence.
- Mark platform-specific test failures as platform limitations instead of
  changing behavior to satisfy the wrong operating system.
- Never put passwords, private keys, tokens, host fingerprints, license values,
  or connection strings in documentation, fixtures, screenshots, or commits.
- Update this document and the main roadmap together when a priority changes.
- Keep the Windows runtime evidence in [`WINDOWS_TERMINAL_TEST_MATRIX.md`](WINDOWS_TERMINAL_TEST_MATRIX.md).
