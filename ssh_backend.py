#!/usr/bin/env python3
"""Build safe OpenSSH-compatible commands from Session objects."""
from __future__ import annotations

from dataclasses import dataclass
from shlex import join

from session_model import Session, SessionValidationError


@dataclass(frozen=True)
class CommandPlan:
    argv: tuple[str, ...]

    @property
    def shell_command(self) -> str:
        return join(self.argv)


def _host_target(session: Session) -> str:
    if not session.host:
        raise SessionValidationError("SSH-compatible sessions require a host")
    return f"{session.username}@{session.host}" if session.username else session.host


def _common_options(session: Session) -> list[str]:
    session.validate()
    args: list[str] = []
    if session.port is not None:
        args += ["-p", str(session.port)]
    if session.private_key:
        args += ["-i", session.private_key]
    options = session.options
    if options.get("compression"):
        args.append("-C")
    if options.get("x11_forwarding"):
        args.append("-X")
    if options.get("agent_forwarding"):
        args.append("-A")
    if options.get("strict_host_key_checking") is False:
        args += ["-o", "StrictHostKeyChecking=no"]
    if options.get("known_hosts_file"):
        args += ["-o", f"UserKnownHostsFile={options['known_hosts_file']}"]
    if session.gateway.get("host"):
        gateway = session.gateway["host"]
        gateway_user = session.gateway.get("username")
        target = f"{gateway_user}@{gateway}" if gateway_user else gateway
        gateway_port = session.gateway.get("port")
        if gateway_port:
            target = f"{target}:{gateway_port}"
        args += ["-J", target]
    if session.proxy.get("command"):
        args += ["-o", f"ProxyCommand={session.proxy['command']}"]
    return args


def build_ssh(session: Session) -> CommandPlan:
    if session.session_type not in {"SSH", "Mosh"}:
        raise SessionValidationError("build_ssh requires an SSH or Mosh session")
    args = ["ssh", *_common_options(session), _host_target(session)]
    if session.command:
        args.append(session.command)
    return CommandPlan(tuple(args))


def build_sftp(session: Session) -> CommandPlan:
    if session.session_type != "Sftp":
        raise SessionValidationError("build_sftp requires an Sftp session")
    args = ["sftp", *_common_options(session), _host_target(session)]
    return CommandPlan(tuple(args))


def build_mosh(session: Session) -> CommandPlan:
    if session.session_type != "Mosh":
        raise SessionValidationError("build_mosh requires a Mosh session")
    args = ["mosh"]
    if session.private_key:
        args += ["--ssh", f"ssh -i {session.private_key}"]
    args.append(_host_target(session))
    return CommandPlan(tuple(args))
