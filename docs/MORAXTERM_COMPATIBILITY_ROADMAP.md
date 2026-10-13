# Moraxterm Compatibility Roadmap

## Purpose

This document tracks the remaining work required to make Moraxterm a practical,
clean-room alternative for the user's Windows and Linux MobaXterm workflow.
MobaXterm proprietary code is not copied. Compatibility is implemented from
observed behavior, public protocol tooling, and independent code.

## Current verified baseline

- Repository: `alimoradimllm/moraxterm`
- Branch: `main`
- Current release: `v0.1.2`
- Python tests: 54 passed
- Rust core tests: passed
- Windows GUI launches from the portable executable.
- Windows local shell input/output works.
- Linux `.deb` installs CLI, GUI, desktop entry, and icon.
- Windows portable ZIP includes a desktop-shortcut installer.
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
- Optimized native Linux Tauri build completed successfully.

## Priority definition

- **P0**: Required for a usable daily replacement.
- **P1**: Required for strong MobaXterm workflow compatibility.
- **P2**: Advanced parity and convenience features.
- **P3**: Future/mobile/platform expansion.

---

## P0 — Unified desktop foundation

### P0.1 Use one production UI

**Current gap:** The release GUI is Python/Tkinter while the Tauri UI is a
separate partial implementation.

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

**Current gap:** Linux has a PTY; Windows currently executes entered lines
through `cmd.exe /C` because ordinary redirected `cmd.exe` does not provide a
full console PTY.

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

## P1 — MobaXterm workspace features

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

**Current gap:** The current action displays an informational message only.

Tasks:

- MultiExec window.
- Select multiple sessions.
- Broadcast command input.
- Broadcast keyboard input.
- Per-session output and status.
- Stop one or all sessions.
- Command history and output export.

### P1.3 Tunneling manager

**Current gap:** Tunnel command planning exists, but no tunnel manager UI.

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

## P2 — Advanced MobaXterm features

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

- Native Tauri `.deb`.
- AppImage.
- Flatpak.
- RPM package.
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
- PowerShell desktop-shortcut installer.

Remaining:

- MSI or Inno Setup installer.
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

Pixel-perfect copying of proprietary MobaXterm UI and implementation is not a
requirement; functional and visual compatibility is the target.
