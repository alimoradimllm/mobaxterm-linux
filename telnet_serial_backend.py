from __future__ import annotations

from ssh_backend import CommandPlan
from session_model import Session, SessionValidationError


def build_telnet(session: Session) -> CommandPlan:
    if session.session_type != 'Telnet' or not session.host:
        raise SessionValidationError('build_telnet requires a Telnet session with a host')
    session.validate()
    return CommandPlan(('telnet', session.host, str(session.port or 23)))


def build_serial(session: Session) -> CommandPlan:
    if session.session_type != 'Serial':
        raise SessionValidationError('build_serial requires a Serial session')
    device = session.options.get('device') or session.host
    baud = str(session.options.get('baud', 115200))
    if not device:
        raise SessionValidationError('Serial sessions require options.device or host')
    return CommandPlan(('socat', '-', f'OPEN:{device},b{baud},raw,echo=0'))


def build_scp(session: Session) -> CommandPlan:
    if session.session_type != 'Scp' or not session.host:
        raise SessionValidationError('build_scp requires an Scp session with a host')
    session.validate()
    source = str(session.options.get('source', '.'))
    destination = str(session.options.get('destination', '.'))
    target = f"{session.username}@{session.host}" if session.username else session.host
    return CommandPlan(('scp', '-P', str(session.port or 22), f'{target}:{source}', destination))
