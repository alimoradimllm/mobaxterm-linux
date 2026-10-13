#!/usr/bin/env python3
"""Typed, backend-neutral session model for the Linux reimplementation."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


BACKENDS = {
    "SSH": "openssh",
    "Sftp": "openssh-sftp",
    "Scp": "openssh-scp",
    "Telnet": "telnet",
    "Rsh": "rsh",
    "Xdmcp": "xdmcp",
    "Rdp": "freerdp",
    "Vnc": "libvnc",
    "Ftp": "ftp",
    "Serial": "serial",
    "File/folder": "file",
    "Shell": "local-shell",
    "Browser": "browser",
    "Mosh": "mosh",
    "Aws S3": "s3",
    "WSL": "wsl",
    "Terminal": "local-terminal",
    "Network": "network",
    "Bookmark": "bookmark",
}


class SessionValidationError(ValueError):
    pass


@dataclass
class Session:
    """A portable session representation.

    Values are intentionally plain data. Credential values are never included
    in this object; callers reference a credential-store identifier instead.
    """

    name: str
    session_type: str
    host: str | None = None
    port: int | None = None
    username: str | None = None
    private_key: str | None = None
    credential_ref: str | None = None
    command: str | None = None
    proxy: dict[str, Any] = field(default_factory=dict)
    gateway: dict[str, Any] = field(default_factory=dict)
    options: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)

    @property
    def backend(self) -> str:
        try:
            return BACKENDS[self.session_type]
        except KeyError as exc:
            raise SessionValidationError(f"unsupported session type: {self.session_type}") from exc

    def validate(self) -> None:
        self.backend
        if not self.name.strip():
            raise SessionValidationError("session name cannot be empty")
        if self.port is not None and not 1 <= self.port <= 65535:
            raise SessionValidationError("port must be between 1 and 65535")
        if self.session_type in {"SSH", "Sftp", "Scp", "Telnet", "Rsh", "Rdp", "Vnc", "Ftp", "Mosh"} and not self.host:
            raise SessionValidationError(f"{self.session_type} sessions require a host")
        if self.session_type in {"SSH", "Sftp", "Scp"} and self.port is None:
            self.port = 22
        if self.session_type == "Telnet" and self.port is None:
            self.port = 23
        if self.session_type == "Mosh" and self.port is not None and not 1 <= self.port <= 65535:
            raise SessionValidationError("invalid Mosh port")

    def public_dict(self) -> dict[str, Any]:
        """Return a JSON-safe representation without secret material."""
        self.validate()
        return {
            "name": self.name,
            "session_type": self.session_type,
            "backend": self.backend,
            "host": self.host,
            "port": self.port,
            "username": self.username,
            "private_key": self.private_key,
            "credential_ref": self.credential_ref,
            "command": self.command,
            "proxy": dict(self.proxy),
            "gateway": dict(self.gateway),
            "options": dict(self.options),
            "tags": list(self.tags),
        }


def session_from_fields(name: str, session_type: str, fields: dict[str, Any]) -> Session:
    """Build a Session from normalized field names used by importers."""
    raw_port = fields.get("port")
    port = int(raw_port) if raw_port not in (None, "") else None
    session = Session(
        name=name,
        session_type=session_type,
        host=fields.get("host") or fields.get("remote_host"),
        port=port,
        username=fields.get("username") or fields.get("user"),
        private_key=fields.get("private_key"),
        credential_ref=fields.get("credential_ref"),
        command=fields.get("command") or fields.get("execute_command"),
        proxy=dict(fields.get("proxy") or {}),
        gateway=dict(fields.get("gateway") or {}),
        options=dict(fields.get("options") or {}),
        tags=list(fields.get("tags") or []),
    )
    session.validate()
    return session
