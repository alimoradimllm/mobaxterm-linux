#!/usr/bin/env python3
"""Build WSL command plans without launching a distribution."""
from __future__ import annotations

import re

from ssh_backend import CommandPlan
from session_model import Session, SessionValidationError


def _distribution(session: Session) -> str:
    explicit = session.options.get('distribution')
    if explicit:
        return str(explicit)
    name = session.name.strip()
    if name.startswith('WSL-'):
        inferred = re.sub(r'\s*\([^)]*\)\s*$', '', name[4:]).strip()
        if inferred and any(inferred.lower().startswith(prefix) for prefix in (
            'debian', 'ubuntu', 'almalinux', 'fedora', 'arch', 'kali', 'opensuse',
        )):
            return inferred
    raise SessionValidationError(
        'WSL sessions require options.distribution or a name like WSL-Debian'
    )


def build_wsl(session: Session) -> CommandPlan:
    if session.session_type != 'WSL':
        raise SessionValidationError('build_wsl requires a WSL session')
    session.validate()
    args = ['wsl.exe', '-d', _distribution(session)]
    if session.username:
        args += ['-u', session.username]
    if session.command:
        args.append('--')
        if isinstance(session.command, str):
            args += ['sh', '-lc', session.command]
        else:
            args.extend(str(item) for item in session.command)
    return CommandPlan(tuple(args))
