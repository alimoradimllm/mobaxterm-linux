#!/usr/bin/env python3
"""Build FreeRDP command plans without handling passwords."""
from __future__ import annotations

import shutil

from ssh_backend import CommandPlan
from session_model import Session, SessionValidationError


def _freerdp_binary() -> str:
    for candidate in ('xfreerdp', 'xfreerdp3'):
        if shutil.which(candidate):
            return candidate
    return 'xfreerdp'


def rdp_client_name() -> str:
    """Return the installed FreeRDP client name, with a portable fallback."""
    return _freerdp_binary()


def build_rdp(session: Session) -> CommandPlan:
    if session.session_type != 'Rdp':
        raise SessionValidationError('build_rdp requires an Rdp session')
    session.validate()
    if not session.host:
        raise SessionValidationError('RDP sessions require a host')
    port = session.port or 3389
    args = [_freerdp_binary(), f'/v:{session.host}:{port}']
    if session.username:
        args.append(f'/u:{session.username}')
    options = session.options
    if options.get('domain'):
        args.append(f"/d:{options['domain']}")
    if options.get('fullscreen'):
        args.append('/f')
    if options.get('clipboard'):
        args.append('+clipboard')
    if options.get('dynamic_resolution'):
        args.append('/dynamic-resolution')
    if options.get('multimedia'):
        args.append('+multimedia')
    gateway = options.get('gateway') or session.gateway
    if gateway.get('host'):
        args.append(f"/g:{gateway['host']}")
    if gateway.get('username'):
        args.append(f"/gu:{gateway['username']}")
    if gateway.get('port'):
        args.append(f"/gp:{gateway['port']}")
    return CommandPlan(tuple(args))
