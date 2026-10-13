#!/usr/bin/env python3
"""Small command-line frontend for the Linux session compatibility layer."""
from __future__ import annotations

import argparse
import json
import os
import select
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from session_model import Session, SessionValidationError, session_from_fields
from terminal_backend import TerminalProcess, build_local_command
from moraxterm_importer import import_ini
from rdp_backend import build_rdp
from ssh_backend import CommandPlan, build_mosh, build_sftp, build_ssh
from wsl_backend import build_wsl
from vnc_backend import build_vnc
from telnet_serial_backend import build_scp, build_serial, build_telnet


@dataclass(frozen=True)
class CaptureResult:
    returncode: int | None
    output: str


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='moraxterm')
    commands = parser.add_subparsers(dest='action', required=True)

    listing = commands.add_parser('list', help='list sessions from a JSON file')
    listing.add_argument('--sessions', required=True, help='JSON path or - for stdin')

    importing = commands.add_parser('import', help='convert a Moraxterm INI to safe JSON sessions')
    importing.add_argument('path', help='Moraxterm INI path')

    connect = commands.add_parser('connect', help='select an imported session and print its backend command')
    connect.add_argument('--sessions', required=True, help='safe JSON session file')
    selector = connect.add_mutually_exclusive_group(required=True)
    selector.add_argument('--name')
    selector.add_argument('--index', type=int)
    selector.add_argument('--search', help='case-insensitive match against session name or host')
    connect.add_argument('--type', dest='session_type', help='filter by session type, such as SSH or Rdp')
    connect.add_argument('--execute', action='store_true', help='launch the selected command; default is dry-run')

    run = commands.add_parser('run', help='run a local Shell/Terminal/WSL session')
    run.add_argument('--name', default='CLI session')
    run.add_argument('--type', dest='session_type', default='Shell', choices=['Shell', 'Terminal', 'WSL'])
    run.add_argument('--cwd')
    run.add_argument('--capture', action='store_true', help='capture output instead of attaching interactively')
    run.add_argument('--command', nargs='*', default=None)
    return parser


def _read_sessions(source: str) -> list[Session]:
    text = sys.stdin.read() if source == '-' else Path(source).read_text(encoding='utf-8')
    raw = json.loads(text)
    if not isinstance(raw, list):
        raise ValueError('session file must contain a JSON list')
    sessions: list[Session] = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError('each session must be a JSON object')
        name = str(item.get('name', 'Unnamed session'))
        session_type = str(item.get('session_type', item.get('type', 'Shell')))
        fields = dict(item)
        command = fields.get('command')
        if isinstance(command, str):
            fields['command'] = command
        sessions.append(session_from_fields(name, session_type, fields))
    return sessions


def list_sessions(source: str) -> str:
    rows = []
    for session in _read_sessions(source):
        rows.append({
            'name': session.name,
            'session_type': session.session_type,
            'backend': session.backend,
            'host': session.host,
        })
    return json.dumps(rows, indent=2)


def filter_sessions(
    sessions: Sequence[Session],
    *,
    search: str | None = None,
    session_type: str | None = None,
) -> list[Session]:
    result = list(sessions)
    if search:
        needle = search.casefold()
        result = [
            session for session in result
            if needle in session.name.casefold()
            or needle in (session.host or '').casefold()
            or any(needle in tag.casefold() for tag in session.tags)
        ]
    if session_type:
        wanted = session_type.casefold()
        result = [session for session in result if session.session_type.casefold() == wanted]
    if (search or session_type) and not result:
        raise SessionValidationError('no sessions matched the requested filter')
    return result


def select_session(sessions: Sequence[Session], *, name: str | None = None, index: int | None = None) -> Session:
    if (name is None) == (index is None):
        raise SessionValidationError('provide exactly one of name or index')
    if name is not None:
        matches = [session for session in sessions if session.name == name]
        if not matches:
            raise SessionValidationError(f"session not found: {name}")
        if len(matches) > 1:
            raise SessionValidationError(f"session name is ambiguous: {name}")
        return matches[0]
    if index is None or index < 0 or index >= len(sessions):
        raise SessionValidationError(f"session index out of range: {index}")
    return sessions[index]


def build_connect_plan(session: Session) -> CommandPlan:
    if session.session_type == 'Rdp':
        return build_rdp(session)
    if session.session_type == 'WSL':
        return build_wsl(session)
    if session.session_type == 'Vnc':
        return build_vnc(session)
    if session.session_type == 'Sftp':
        return build_sftp(session)
    if session.session_type == 'Scp':
        return build_scp(session)
    if session.session_type == 'Telnet':
        return build_telnet(session)
    if session.session_type == 'Serial':
        return build_serial(session)
    if session.session_type == 'Mosh':
        return build_mosh(session)
    if session.session_type == 'SSH':
        return build_ssh(session)
    raise SessionValidationError(
        f"backend {session.backend!r} is not implemented by connect yet"
    )


def run_capture(argv: Sequence[str], *, cwd: str | None = None, timeout: float = 30) -> CaptureResult:
    with TerminalProcess.start(argv, cwd=cwd) as process:
        output = process.read_until_exit(timeout=timeout)
        return CaptureResult(process.returncode, output)


def run_interactive(argv: Sequence[str], *, cwd: str | None = None) -> int:
    process = TerminalProcess.start(argv, cwd=cwd)
    try:
        while process.returncode is None:
            readable, _, _ = select.select([sys.stdin, process.fileno()], [], [], 0.1)
            if sys.stdin in readable:
                data = os.read(sys.stdin.fileno(), 4096)
                if not data:
                    break
                process.write(data)
            if process.fileno() in readable:
                data = process.read(0)
                if data:
                    os.write(sys.stdout.fileno(), data)
        while True:
            data = process.read(0)
            if not data:
                break
            os.write(sys.stdout.fileno(), data)
        return process.returncode or 0
    finally:
        process.close()


def missing_dependencies(plan: CommandPlan) -> list[str]:
    if not plan.argv:
        return ['<empty command>']
    executable = plan.argv[0]
    if os.path.isabs(executable):
        return [] if os.access(executable, os.X_OK) else [executable]
    return [] if shutil.which(executable) else [executable]


def execute_plan(plan: CommandPlan) -> int:
    """Execute a command plan only after explicit caller opt-in."""
    missing = missing_dependencies(plan)
    if missing:
        raise SessionValidationError(f"missing executable(s): {', '.join(missing)}")
    return run_interactive(plan.argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.action == 'list':
            print(list_sessions(args.sessions))
            return 0
        if args.action == 'import':
            sessions = import_ini(args.path)
            print(json.dumps([session.public_dict() for session in sessions], indent=2))
            return 0
        if args.action == 'connect':
            sessions = filter_sessions(
                _read_sessions(args.sessions),
                search=args.search,
                session_type=args.session_type,
            )
            if args.search:
                if len(sessions) != 1:
                    raise SessionValidationError(
                        f"search matched {len(sessions)} sessions; refine with --type or use --name"
                    )
                session = sessions[0]
            else:
                session = select_session(sessions, name=args.name, index=args.index)
            plan = build_connect_plan(session)
            if args.execute:
                return execute_plan(plan)
            print(plan.shell_command)
            return 0
        fields: dict[str, Any] = {'command': args.command} if args.command else {}
        session = session_from_fields(args.name, args.session_type, fields)
        plan = build_local_command(session)
        if args.capture:
            result = run_capture(plan.argv, cwd=args.cwd)
            sys.stdout.write(result.output)
            return result.returncode or 0
        return run_interactive(plan.argv, cwd=args.cwd)
    except (OSError, ValueError, SessionValidationError, TimeoutError) as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
