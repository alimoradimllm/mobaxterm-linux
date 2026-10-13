# Cross-platform performance architecture

## Decision

Use a two-layer design:

- **Rust core** for session parsing, SQLite storage, credential references,
  command planning, PTY/process supervision, and protocol adapters.
- **Tauri 2 UI** with an xterm.js terminal frontend for Windows, Linux, and
  Android.

This is preferable to replacing the project with a second Python GUI:
Python remains useful for reverse-engineering/import compatibility tests, but
Rust gives one native core for all three targets. Tauri 2 has desktop and
Android targets, while xterm.js provides mature ANSI terminal rendering.

## Migration boundary

Keep the current Python implementation as the behavioral reference. Port one
vertical slice at a time:

1. Session model and secret-free JSON representation.
2. INI/bookmark importer.
3. SQLite repository.
4. SSH/SFTP/SCP/Mosh command planning.
5. PTY process service.
6. xterm.js terminal tab protocol.
7. RDP/VNC launch adapters.

Each Rust slice must pass equivalent fixtures from the Python test suite before
removing or changing the Python reference.

## Migration status

The first Rust vertical slice now exists under `rust-core/`:

- `Session` with validated SSH fields.
- `CommandPlan` with shell-safe rendering.
- Three Rust tests covering defaults, validation, quoting, and secret safety.
- Verified with `cargo test` on Debian WSL using Rust 1.85.1.

The Python implementation remains the compatibility reference until equivalent
Rust importer and storage fixtures are ported.

## Platform policy

- Windows: OpenSSH/FreeRDP/VNC binaries or bundled adapters.
- Linux: system OpenSSH, FreeRDP, TigerVNC, Secret Service, and PTY.
- Android: SSH/SFTP/Mosh and local terminal features first; RDP/VNC depend on
  native Android clients or a documented remote-desktop plugin. Do not pretend
  desktop binaries are Android-compatible.
- Secrets: platform keychain APIs only. Never place passwords in argv, JSON,
  SQLite, logs, or imported Moraxterm data.

## Measured baseline

The current Python importer processed the real sanitized configuration 20 times
in 13.552 seconds in Debian WSL (about 0.68 seconds per import). This is not a
terminal latency benchmark. The Rust target should add benchmarks for import,
session lookup, PTY relay, and terminal rendering before claiming improvement.

## Acceptance criteria

- Windows, Ubuntu, and Android builds from one repository.
- Existing 54 Python regression tests remain green during migration.
- Rust tests cover every ported fixture.
- SSH key login remains successful without password arguments.
- GUI supports persistent sessions, tabs, split panes, resize, copy/paste,
  search, and clean process shutdown.
- `.deb`, Windows installer, and Android APK/AAB are produced in CI.
