# Moraxterm competitive product strategy

_Last reviewed: 2026-10-17._

Moraxterm should not try to win by copying every feature from MobaXterm and
Termius. It should combine MobaXterm's operator power with Termius's modern
workflow, while remaining local-first, cross-platform, and transparent about
security.

## What the competitors establish

### MobaXterm: operator breadth

MobaXterm's official feature list emphasizes a Windows-centered toolbox: a
tabbed Unix terminal, saved SSH/Telnet/RDP/VNC/XDMCP/FTP/SFTP/Serial sessions,
graphical SFTP, an X11 server, multi-execution, embedded servers and tools,
SSH gateways, SSH tunnels, package management, a remote text editor, macros,
password management, and terminal syntax highlighting.[1]

Its strength is the high-density sysadmin workflow: many protocols and tools
are available from one desktop, with a mature session sidebar and integrated
X11 behavior.

### Termius: modern workflow and sync

Termius's current product page emphasizes cross-device availability across
Windows, macOS, Linux, iOS, and Android, one-click connections, encrypted Vault
sync, hosts and groups, SFTP, port forwarding, snippets, known-host handling,
logs, autocomplete, workspace restore, split view, focus mode, and team-oriented
host organization.[2]

Its strength is reducing repeated connection setup and making a connection
workspace portable across devices and teams.

## Moraxterm's target position

> **The best local-first, cross-platform terminal workspace for serious
> operators: MobaXterm's power, Termius's workflow, without hiding where data
> and credentials live.**

“Better” is measured by these product outcomes:

1. A new user can create, test, trust, and connect to a host in under two
   minutes.
2. An operator can manage terminals, files, tunnels, tools, and repeated
   commands without leaving the workspace.
3. The same core workflow works on Windows and Linux.
4. Credentials, host keys, logs, and sync behavior are explicit and auditable.
5. Every visible control either performs its action or explains its limitation.

## Capability matrix

| Area | MobaXterm | Termius | Moraxterm now | Moraxterm priority |
|---|---|---|---|---|
| Local/remote terminal | Strong, Windows-focused | Strong, cross-device | Implemented for Windows/Linux | P0: ConPTY and full-screen reliability |
| Session organization | Mature saved sessions/sidebar | Hosts, groups, workspaces | SQLite sessions, folders, tabs | P1: polished hierarchy and search |
| SFTP | Integrated graphical browser | Integrated SFTP | Browser and transfer queue | P0: authenticated disposable-target tests and progress |
| Multi-execution | Mature | Workspace-oriented | MultiExec with exclusion/status | P0: output routing, stop, failure recovery |
| SSH tunnels | Graphical manager | Port forwarding | Start/stop manager | P1: profiles, logs, persistence, tests |
| SSH gateway / ProxyJump | Supported | Supported workflow | Editor and structured planner implemented | P0: disposable gateway runtime test |
| X11 | Embedded X server | Not the core differentiator | Status detection only | P1: lifecycle and forwarding verification |
| RDP/VNC/Serial/Telnet | Broad protocol coverage | SSH-centered | Launch paths and editors | P1: runtime verification, better embedding |
| Snippets/macros | Macros | Snippets/autocomplete | Macros | P1: snippets with scope, search, variables |
| Sync/collaboration | Portable/config-oriented | Encrypted Vault/team workflow | Local-first; no sync layer | P2: optional encrypted export/sync |
| Security/trust | Master-password model | Vault/known-host workflow | Secret-free backups and keyring path | P0: host-key approval and credential UX |
| Diagnostics | Embedded admin tools | Productive terminal workflow | Network Tools panel | P1: saved results, export, richer diagnostics |
| Remote editing | MobaTextEditor | SFTP workflow | Preview/edit-copy | P1: safe remote edit round trip |

## Build order

### P0 — reliability and trust

- Finish Windows ConPTY behavior: PowerShell, cmd, Bash/Fish, alternate screen,
  vim/top/mc, mouse reporting, resize, Unicode, paste, Ctrl+C/Ctrl+D/Ctrl+Z,
  Ctrl+Break, and long output.
1. Add first-connect host-key approval, changed-key warnings, and clear
   connection state. *(Known-host status, fingerprint scan, explicit
   fingerprint-confirmed approval, removal, and host-key policy controls are
   implemented; disposable-target runtime verification remains.)*
2. Finish Windows Credential Manager and Linux Secret Service flows with masked
   prompts and no secret logging.
3. Add ProxyJump/gateway fields and structured command planning. *(Implemented;
   disposable gateway runtime verification remains.)*
4. Add disposable SSH/SFTP integration tests.

### P1 — daily operator advantage

- Make the session manager excellent: nested groups, fast search, favorites,
  tags, duplicate detection, drag/drop, and workspace restore.
- Finish SFTP operations: mkdir, rename, delete, permissions, reliable upload
  progress, queue controls, retries, resume, and remote edit round trips.
- Upgrade MultiExec with per-target output, stop/cancel, failure retry, and
  command history.
- Upgrade Tunneling with saved profiles, concurrent status, logs, and safe
  defaults.
- Add snippets with variables such as `${host}`, `${user}`, and `${date}`;
  distinguish preview from execution.
- Add saved/exportable network diagnostic results.

### P2 — differentiation

- Optional encrypted workspace sync, disabled by default and backed by an
  explicit local/export policy.
- Cross-platform workspace restore with conflict handling.
- Pluggable operator tools with permission scopes instead of arbitrary shell
  execution.
- Remote file editor with diff, backup, explicit upload, and rollback.
- X11 lifecycle management and verified forwarding.
- Team workspaces that preserve auditability without forcing a hosted account.

## What Moraxterm should deliberately not copy

- Do not make cloud sync mandatory.
- Do not put passwords, private keys, tokens, or host fingerprints in JSON
  backups, logs, command arguments, or screenshots.
- Do not expose an unrestricted “run arbitrary command” button as a substitute
  for structured tools.
- Do not claim MobaXterm or Termius feature parity until the behavior is tested
  on the target desktop and protocol.

## Immediate next implementation slice

The next product slice after the current network Tools panel is **P0 SSH trust
and credentials**, not another decorative panel:

1. Add ProxyJump/gateway fields to the Session Editor.
2. Add first-connect host-key approval and changed-key warning UI.
3. Add masked Credential Manager/Secret Service save, test, delete, and status
   actions.
4. Exercise the flow against a disposable local SSH server.

This order gives Moraxterm a stronger trust model than either a purely local
legacy toolbox or a sync-first client, while directly improving the daily
connection workflow.

## Sources

[1] https://mobaxterm.mobatek.net/features.html — MobaXterm official features
[2] https://termius.com — Termius official product page
