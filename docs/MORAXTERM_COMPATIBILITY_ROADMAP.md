# Moraxterm Compatibility Roadmap

## Purpose

This document tracks the remaining work required to make Moraxterm a practical,
clean-room alternative for the user's Windows and Linux third-party terminal workspace workflow.
third-party terminal workspace proprietary code is not copied. Compatibility is implemented from
observed behavior, public protocol tooling, and independent code.

## Current verified baseline

- Repository: `alimoradimllm/moraxterm`
- Branch: `main`
- Current published release: `v0.1.13`
- Rust core tests: passed.
- Python suite: 54 tests; 52 pass on Windows, with two platform-specific tests requiring guards or WSL fixtures.
- Tauri frontend build and Rust bridge check: passed.
- Windows native installer: built, installed per-user, launched, and loaded persisted sessions.
- Linux `.deb` and `.rpm` packages: built and verified.
- Secret values are excluded from imported session data and command plans.

## Completed in the current milestone

- Tauri UI loads persisted SQLite sessions automatically when the bridge is available.
- Sessions are grouped by protocol in the sidebar.
- Tauri toolbar actions now have handlers and status feedback.
- Tauri keyboard shortcuts are wired for new shell, close tab, quick connect, and search.
- Tauri frontend and Rust bridge both pass production checks.
- Tauri terminal tabs now use persistent Rust PTY processes with streamed output, input forwarding, and close/kill commands.
- Tauri now provides a SQLite-backed session editor: create, edit, delete, and reload sanitized session metadata from the UI.
- Tauri can import a user-selected INI file read-only, merge basic sessions and encoded bookmarks, deduplicate by name, and persist only sanitized metadata.
- Saved SSH sessions now launch `ssh` through their persistent PTY with structured port and user/host arguments; non-SSH sessions retain the local-shell fallback until their native backends are connected.
- Saved WSL, RDP, and VNC sessions now select native clients (`wsl`, `xfreerdp`, and `vncviewer`) with structured arguments and no password injection; availability still depends on the client being installed.
- The Tauri toolbar Split action now creates a two-pane layout with independent persistent PTYs, input routing, terminal tabs, and pane cleanup when closed.
- Tauri MultiExec mode now broadcasts typed input to every open persistent terminal and visibly toggles on/off from the toolbar.
- Tauri now has an SSH tunneling manager for local (`-L`), remote (`-R`), and dynamic SOCKS (`-D`) forwarding, with tracked child processes and explicit stop support; secrets are never accepted.
- Tauri terminal recording can capture each tab's streamed PTY output to an explicitly chosen file and stop recording without placing secrets in command arguments.
- Tauri Tools now supports fixed-operation ping, traceroute, DNS lookup, and TCP port checks with bounded port timeouts and structured platform-specific arguments.
- Tauri now provides an SFTP listing action using batch mode, `BatchMode=yes`, an eight-second connection timeout, and no password injection; results appear in the active terminal.
- The SFTP action now supports upload and download through validated batch transfers, with local and remote paths kept out of shell interpolation.
- The Tauri SFTP browser now supports remote path navigation, refresh, parent-directory movement, upload, and download from a dedicated modal.
- Saved Telnet sessions now launch native `telnet` clients, and Linux Serial sessions launch `socat` PTYs with explicit Windows limitation reporting.
- Tauri Macros now records terminal input events in memory, stops recording explicitly, and replays the latest macro into the active persistent PTY without storing secrets.
- SSH sessions now request X11 forwarding with `ssh -X`; the X server action reports `DISPLAY`, session type, and detected local X server binaries.
- Session records now support non-secret environment variables and startup commands; Tauri applies the environment to the PTY and sends the startup command after launch.
- Tauri settings now persist terminal font size, cursor blink, and dark/amber theme preferences locally and apply changes to existing and new terminals.
- Sessions now persist favorite flags and bookmark-group names; the tree supports custom group headings, favorite-first sorting, and one-click favorite toggling.
- Tauri now supports sanitized JSON session export and restore; sensitive-looking environment keys and startup commands are excluded before export and again before restore.
- The session tree now keeps a persistent recent-session list and provides right-click Open, Edit, Favorite, and Delete actions.
- The optimized native Linux Tauri build completed successfully.
- Native Linux Tauri packaging now produces verified `.deb` and `.rpm` bundles with the Moraxterm executable, desktop entry, and icon. AppImage remains disabled by default because the installed `linuxdeploy` plugin fails in this environment.
- Native Windows Tauri builds now produce a verified optimized `moraxterm-linux-ui.exe` and NSIS installer through `build-tauri-windows.cmd`; the Windows build uses the MSVC toolchain and the Moraxterm ICO asset.
- Release `v0.1.5` is prepared with native Tauri Linux `.deb`/`.rpm` and Windows NSIS artifacts; SHA-256 hashes were verified before publication.
- PTY resize now propagates from xterm.js pane dimensions through the Tauri bridge into `portable-pty`; zero dimensions are rejected and Linux regression coverage verifies resize behavior.
- Exited PTYs now remove themselves from the Rust process/recording maps and the UI disables input for exited tabs, preventing stale terminal state.
- Terminal tabs now retain their sanitized session and provide a reconnect control that starts a fresh PTY under the same tab after exit.
- Linux PTY regression coverage now verifies resize, output capture, and Ctrl+C terminal-interrupt processing.
- Linux PTY regression coverage also verifies Ctrl+D/EOF delivery to an interactive child process.
- SSH tabs now use structured `ConnectTimeout=10`, `ServerAliveInterval=30`, and `ServerAliveCountMax=3` options to improve failure detection and reconnect behavior without handling secrets.
- The Windows Tauri bridge now stores SQLite data under `%APPDATA%\\Moraxterm`, while Linux keeps its XDG-style data path; the platform-specific path was verified by installing the corrected Windows build and loading persisted sessions.
- v0.1.13 adds the Tauri event-listener permissions required for frontend terminal output delivery. Local Shell was verified with live Windows output, and saved SSH session `ge` was verified to reach the SSH password prompt without hanging or crashing. Credentials were not entered or retained.
- v0.1.13 provides opt-in diagnostic logging from Settings. Logs default to `%APPDATA%\\Moraxterm\\moraxterm-debug.log` and sanitize sensitive values.
- Terminal tabs now expose starting, connected, failed, and exited states in the UI; exited tabs show a reconnect instruction and no longer reference an unsafe raw event payload.
- The SFTP modal now includes a read-only local directory browser with refresh/up navigation, and transfer prompts default to the selected local path. Percentage progress and drag-and-drop remain open.
- SFTP uploads and downloads now use a serialized visible transfer queue with pending, running, completed, failed, and queued-cancelled states. Percentage progress and drag-and-drop remain open.
- SFTP transfers now run as cancellable backend jobs with completion events; cancelling a running job terminates its native `sftp` process. Byte-level progress, resume, and retry remain open.
- Failed SFTP jobs now receive one automatic retry, with an explicit `retrying` state and a two-attempt maximum. Byte-level progress and resume remain open.
- SFTP transfers now offer an explicit “Resume partial transfer” option using OpenSSH `reget`/`reput`; byte-level progress and drag-and-drop remain open.
- The SFTP local pane now accepts dropped files and queues them for upload; byte-level progress remains open.
- The local SFTP pane now supports read-only UTF-8 previews capped at 1 MiB; remote preview and editing remain open.
- Remote SFTP preview now downloads into a temporary file, enforces the same 1 MiB UTF-8 limit, and removes the temporary file after reading; editing remains open.
- SQLite regression coverage now verifies that legacy session payloads load with current serde defaults for newer fields.
- SSH session editing now provides a known-hosts presence check that returns only the file path and boolean entry status; fingerprints are not displayed or logged.
- Strict SSH host-key policy now performs a preflight and refuses to launch when the configured host is absent from `known_hosts`; `ask` and `accept-new` retain OpenSSH verification behavior.
- Session folders now render as indented nested hierarchy headings when folder paths contain `/` or `\\`; drag-and-drop movement and folder mutation controls remain open.
- Session entries are now draggable onto persisted folder headings and save their new folder path through the SQLite bridge; the synthetic Recent heading is not a move target.
- Folder create, recursive rename, and delete-to-parent controls are available; empty-folder metadata persists locally and session changes persist through SQLite.
- SFTP downloads display observed destination-file byte counts during transfer; upload progress remains explicitly indeterminate until the native client exposes remote counters.
- OS-backed credential commands now use Windows Credential Manager or the Linux-native keyring backend and never return stored secret values. The session editor provides masked save/status/delete controls, and SSH can consume a matching `username@host:port` entry through a temporary askpass helper that is removed on terminal exit; authenticated runtime testing remains open.
- Managed stale-host removal uses a structured `ssh-keygen -R` command, and the editor now supports scan, fingerprint confirmation, re-scan comparison, and safe `known_hosts` append for new keys.
- Windows RDP sessions now select native `mstsc.exe` instead of the unavailable FreeRDP executable; embedded RDP/VNC and runtime tests remain open.
- Security CI now runs RustSec, npm, and Gitleaks checks. The `portable-pty` 0.9 upgrade removed the unmaintained `serial` dependency; only transitive Tauri `proc-macro-error` and `glib` advisories remain.
- Unix terminal tabs expose an explicit resume action using `SIGCONT`; Windows reports the platform limitation instead of pretending Ctrl+Z/job-control support is complete.
- The session-tree action toolbar now uses a fixed flex layout so import, export, create, and reload controls remain on one row in the Windows sidebar.
- The remaining work and test limitations are maintained in [`docs/REMAINING_WORK.md`](REMAINING_WORK.md).

## Priority definition

- **P0**: Required for a usable daily replacement.
- **P1**: Required for strong third-party terminal workspace workflow compatibility.
- **P2**: Advanced parity and convenience features.
- **P3**: Future/mobile/platform expansion.

---

## P0 — Unified desktop foundation

### P0.1 Use one production UI

**Current gap:** The native Tauri UI is now the production direction, but the
Python/Tkinter fallback still exists and the two implementations are not yet
feature-identical.

Tasks:

- Move the released Windows and Linux GUI to the Tauri 2 frontend.
- Connect Tauri commands to the Rust core.
- Remove duplicate behavior between Tkinter and Tauri.
- Keep one shared session model and one shared settings model.
- Produce native Windows and Linux release builds from the same UI.

Acceptance criteria:

- Windows and Linux show the same major UI layout.
- A feature added to one desktop platform is available on the other.
- Release documentation identifies only the production UI.

### P0.2 Persistent interactive terminal tabs

**Current gap:** Linux PTY behavior is covered by Rust regression tests. Windows
still needs full ConPTY/full-screen runtime validation; the current native
process path must not be treated as complete terminal parity.

Tasks:

- Add persistent PTY/conPTY support for Windows.
- Keep `portable-pty` or an equivalent Rust abstraction in the Rust core.
- Stream output through Tauri events.
- Send keyboard input directly to the process.
- Implement resize events.
- Implement Ctrl+C, Ctrl+D, Ctrl+Z, and Ctrl+Break behavior.
- Preserve terminal state for full-screen programs.

Acceptance criteria:

- `vim`, `top`, `mc`, PowerShell, Bash, and Windows command-line programs work.
- Terminal resize changes the remote/local process dimensions.
- Closing a tab terminates only that tab's process.

### P0.3 Session tree and editor

**Current gap:** The GUI can import and display a basic list but does not
provide a complete session manager.

Tasks:

- Load SQLite sessions automatically at startup.
- Add bookmark groups and nested folders.
- Add create, edit, rename, duplicate, move, and delete operations.
- Add protocol-specific session editor pages.
- Add favorites and recent sessions.
- Add right-click context menus.
- Add protocol icons and connection state indicators.
- Add duplicate detection during import.
- Add export of sanitized session metadata.

Acceptance criteria:

- Imported sessions remain available after restarting the application.
- A user can create and edit SSH, RDP, VNC, WSL, Telnet, and Serial entries.
- Secrets never appear in SQLite, logs, JSON exports, or command-line arguments.

---

## P0 — SSH and file-transfer workflow

### P0.4 Real SSH connections inside tabs

**Current gap:** SSH command plans exist, but GUI connection lifecycle is
incomplete.

Tasks:

- Launch SSH from a persistent terminal tab.
- Add host-key verification UI.
- Add known-hosts management.
- Add reconnect and retry behavior.
- Add keepalive settings.
- Add connection status and latency.
- Add SSH agent selection.
- Add Linux Secret Service and Windows Credential Manager adapters.
- Add password prompts without storing password values.
- Add ProxyJump and gateway editor.

Acceptance criteria:

- An imported SSH session can be opened from the session tree.
- Host-key approval is explicit.
- Passwords and private keys are never printed or committed.
- Reconnect works after a temporary network failure.

### P0.5 SFTP and file browser

**Current gap:** The screenshot's integrated file browser and SFTP workflow are
not implemented in the GUI.

Tasks:

- Add local file browser.
- Add remote SFTP browser.
- Add upload and download.
- Add drag-and-drop transfer.
- Add rename, delete, mkdir, and permissions.
- Add transfer queue and progress.
- Add resume support.
- Add file preview and text editing.
- Add SCP fallback where SFTP is unavailable.

Acceptance criteria:

- A user can browse local and remote files beside a terminal.
- Upload/download progress is visible.
- Failed transfers can be retried without restarting the session.

---

## P1 — workspace features

### P1.1 Tabs, panes, and windows

Tasks:

- Vertical split panes.
- Horizontal split panes.
- Independent PTY per pane.
- Drag pane boundaries.
- Move tabs between panes.
- Duplicate tab.
- Detach tab into a window.
- Reconnect tab.
- Tab activity and connection indicators.
- Close confirmation for active connections.

### P1.2 MultiExec

**Current gap:** Broadcast mode works across open tabs and panes, but a
selectable MultiExec workspace with per-session status and output is not yet
complete.

Tasks:

- MultiExec window.
- Select multiple sessions.
- Broadcast command input.
- Broadcast keyboard input.
- Per-session output and status.
- Stop one or all sessions.
- Command history and output export.

### P1.3 Tunneling manager

**Current gap:** Local, remote, and SOCKS tunnel commands plus start/stop
tracking exist; profile editing, multiple concurrent tunnels, startup
policies, and richer status/log UI remain.

Tasks:

- Local port forwarding.
- Remote port forwarding.
- Dynamic SOCKS forwarding.
- Add/edit/delete tunnel profiles.
- Start/stop controls.
- Tunnel status and logs.
- Automatic startup with a session.
- Multiple concurrent tunnels.

### P1.4 Terminal customization

Tasks:

- Font family and size.
- Color themes.
- Cursor style.
- Scrollback size.
- Copy/paste settings.
- Bell settings.
- Terminal search.
- Transcript logging.
- ANSI/VT-100 compatibility testing.
- Mouse reporting.
- Alternate-screen support.

---

## P1 — Remote protocols and tools

### P1.5 RDP and VNC GUI integration

**Current gap:** FreeRDP and VNC command planners exist; integrated GUI
sessions have not been completed.

Tasks:

- RDP tab/window integration.
- VNC tab/window integration.
- Credential prompts.
- Clipboard sharing.
- Drive sharing.
- Audio redirection.
- Multi-monitor support.
- Scaling and fullscreen.
- Reconnect and connection status.

### P1.6 Serial and Telnet UI

Tasks:

- Serial device discovery.
- Baud rate, data bits, parity, stop bits, and flow control.
- Telnet options.
- Serial/Telnet logging.
- Break signal.
- Send/receive file support.
- Connection profiles in the session editor.

### P1.7 WSL and local environments

Tasks:

- WSL distribution picker.
- WSL user and working-directory selection.
- Windows PowerShell profile selection.
- Linux shell profile selection.
- Environment variable editor.
- Local command history.
- Local session persistence.

---

## P2 — Advanced third-party terminal workspace features

### P2.1 X server

- Integrated X server lifecycle.
- DISPLAY configuration.
- X11 forwarding tests.
- XDMCP support.
- X server tray controls.
- Access-control configuration.
- Remote GUI application launch.

### P2.2 Macros

- Macro recording.
- Macro playback.
- Macro editor.
- Macro keyboard shortcuts.
- Session-specific macros.
- Macro import/export.
- Secure handling of macro content.

### P2.3 Network and system tools

- Ping.
- Traceroute.
- DNS lookup.
- Port check.
- Network scanner.
- Bandwidth monitor.
- Local and remote process viewer.
- Remote service manager.
- Disk-usage viewer.
- Text editor.
- Hex editor.
- Network monitoring panels.

### P2.4 Live status bar

**Current gap:** Some status values are visual placeholders.

Tasks:

- Real CPU values.
- Real memory values.
- Real network throughput.
- Disk usage.
- Remote uptime.
- Load average.
- Process count.
- Connection latency.
- Per-session bandwidth.

---

## P2 — Packaging and operations

### P2.5 Linux packaging

Completed:

- Debian package.
- Desktop menu entry.
- Application icon.
- CLI and GUI launchers.

Remaining:

- ARM64 package.
- Uninstaller.
- Automatic update support.
- Desktop-environment compatibility testing.

### P2.6 Windows packaging

Completed:

- CLI executable.
- GUI executable.
- Embedded icon.
- Portable ZIP.
- Native NSIS installer.
- PowerShell desktop-shortcut installer.

Remaining:

- Start Menu shortcut.
- Add/Remove Programs registration.
- Uninstaller.
- Code signing.
- Automatic updates.
- Windows Credential Manager integration.

### P2.7 Quality and security

- GUI automation tests on Windows and Linux.
- Installer smoke tests in clean virtual machines.
- Cross-platform terminal regression tests.
- SSH host-key regression tests.
- SFTP transfer tests.
- RDP/VNC integration tests.
- Secret-scanning CI.
- Dependency vulnerability scanning.
- Reproducible release builds.
- Signed release checksums.

---

## P3 — Android

Android is intentionally deferred until Windows and Linux desktop behavior is
stable.

Future tasks:

- Android Tauri UI.
- Android PTY integration.
- Android SSH/SFTP support.
- Android secure credential storage.
- Android file picker.
- Mobile session layout.
- Android package and update workflow.

---

## Recommended implementation order

1. Tauri becomes the production Windows/Linux UI.
2. Persistent Windows and Linux PTY tabs.
3. Automatic SQLite session loading.
4. Session tree and session editor.
5. Real SSH connections and credential adapters.
6. SFTP/local file browser.
7. Split panes and tab management.
8. MultiExec.
9. Tunneling manager.
10. RDP/VNC GUI integration.
11. Serial/Telnet UI.
12. X server integration.
13. Macros and network tools.
14. Live monitoring.
15. Native installers and signed builds.
16. Android support.

## Definition of practical parity

Moraxterm can be considered a practical desktop replacement when all P0 items
and the following P1 items are complete:

- The same production UI runs on Windows and Linux.
- Sessions persist and can be edited.
- SSH opens in a real interactive terminal tab.
- SFTP browsing and transfer work.
- Split panes work.
- MultiExec works.
- Tunneling can be created and managed.
- RDP/VNC sessions can be launched from the session manager.
- Credentials are stored by the platform keyring.
- Desktop installers create working application entries and icons.

Pixel-perfect copying of proprietary third-party terminal workspace UI and implementation is not a
requirement; functional and visual compatibility is the target.
