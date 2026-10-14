# Windows terminal compatibility test matrix

_Last reviewed: 2026-10-14. Release under test: `v0.1.13`._

This matrix records tests that must be run in the real Windows desktop
application. A build or Rust unit test is not sufficient evidence for these
items.

## Runtime smoke tests

| Area | Test | Status | Evidence |
|---|---|---:|---|
| Local Shell | Start `cmd.exe`, receive directory output and prompt | PASS | v0.1.13 live desktop test |
| Local Shell | Type a command and receive output | PASS | v0.1.13 live desktop test |
| SSH | Open saved `ge` session without hang/crash | PASS | Reached SSH password prompt |
| SSH | Complete authentication | NOT TESTED | Credentials intentionally not entered |
| SSH | Receive remote shell prompt | NOT TESTED | Requires authenticated disposable SSH target |
| Close/reconnect | Close a terminal and reopen it | NOT TESTED | Requires runtime test |
| Persistence | Restart application and reload sessions | PARTIAL | Session `ge` loaded; restart test pending |

## Windows terminal behavior

| Test | Status | Notes |
|---|---:|---|
| `cmd.exe` basic commands | PASS | Verified in v0.1.13 |
| PowerShell interactive input/output | NOT TESTED | |
| Bash/WSL interactive input/output | NOT TESTED | Requires installed WSL distribution |
| Unicode input/output | NOT TESTED | |
| Long output and scrolling | NOT TESTED | |
| Resize during command execution | NOT TESTED | |
| Ctrl+C | NOT TESTED | Rust coverage exists; desktop coverage pending |
| Ctrl+D/EOF | NOT TESTED | Rust coverage exists; desktop coverage pending |
| Ctrl+Z/job control | NOT SUPPORTED ON WINDOWS | Must report limitation, not emulate Unix behavior |
| Ctrl+Break | NOT TESTED | |
| Paste | NOT TESTED | |
| `vim` alternate screen | NOT TESTED | Requires compatible executable |
| `top`/`htop` alternate screen | NOT TESTED | Requires WSL/Linux target |
| `mc` mouse and alternate screen | NOT TESTED | Requires WSL/Linux target |
| Mouse reporting | NOT TESTED | |
| ANSI/VT-100 compatibility | NOT TESTED | |

## Required evidence for closing this matrix

1. Run each applicable test in the installed Windows build.
2. Record the exact application version and test date.
3. Attach sanitized diagnostic logs when a test fails.
4. Never include passwords, private keys, tokens, host fingerprints, or command
   contents containing secrets.
5. Use a disposable SSH/SFTP target for authenticated tests.

The matrix is intentionally separate from the release checklist: passing the
basic Local Shell test does not establish full-screen, keyboard, resize, or
SSH authentication parity.
