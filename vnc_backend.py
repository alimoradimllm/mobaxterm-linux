#!/usr/bin/env python3
"""Build vncviewer command plans without handling passwords."""
from __future__ import annotations

import re

from ssh_backend import CommandPlan
from session_model import Session, SessionValidationError


def build_vnc(session: Session) -> CommandPlan:
    if session.session_type != 'Vnc':
        raise SessionValidationError('build_vnc requires a Vnc session')
    session.validate()
    if not session.host:
        raise SessionValidationError('VNC sessions require a host')
    port = session.port or 5900
    args = ['vncviewer', f'{session.host}:{port}']
    options = session.options
    if options.get('fullscreen'):
        args.append('-FullScreen')
    if options.get('view_only'):
        args.append('-ViewOnly')
    if options.get('shared'):
        args.append('-Shared')
    geometry = options.get('geometry')
    if geometry:
        if not re.fullmatch(r'\d+x\d+', str(geometry)):
            raise SessionValidationError('VNC geometry must look like WIDTHxHEIGHT')
        args += ['-Geometry', str(geometry)]
    return CommandPlan(tuple(args))
