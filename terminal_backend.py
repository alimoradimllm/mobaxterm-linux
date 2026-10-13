#!/usr/bin/env python3
"""POSIX PTY support for local Shell and Terminal sessions."""
from __future__ import annotations

import errno
import os
import select
import signal
import subprocess
import time
from dataclasses import dataclass
from typing import Sequence

from session_model import Session, SessionValidationError


@dataclass(frozen=True)
class LocalCommandPlan:
    argv: tuple[str, ...]


def build_local_command(session: Session) -> LocalCommandPlan:
    """Build a local command without executing it."""
    if session.session_type not in {"Shell", "Terminal", "WSL"}:
        raise SessionValidationError(
            "local terminal commands require Shell, Terminal, or WSL sessions"
        )
    session.validate()
    command = session.command
    if command is None:
        command = os.environ.get("SHELL") or "/bin/sh"
    if isinstance(command, str):
        argv = (command,)
    else:
        argv = tuple(str(item) for item in command)
    if not argv or not argv[0]:
        raise SessionValidationError("local command cannot be empty")
    return LocalCommandPlan(argv)


class TerminalProcess:
    """A child process attached to a pseudo-terminal."""

    def __init__(self, process: subprocess.Popen[bytes], master_fd: int) -> None:
        self._process = process
        self._master_fd = master_fd
        self._closed = False

    @classmethod
    def start(
        cls,
        argv: Sequence[str],
        *,
        cwd: str | None = None,
        env: dict[str, str] | None = None,
    ) -> "TerminalProcess":
        if os.name != "posix":
            raise OSError("TerminalProcess requires a POSIX environment")
        if not argv or not argv[0]:
            raise ValueError("argv cannot be empty")
        master_fd, slave_fd = os.openpty()
        try:
            process = subprocess.Popen(
                list(argv),
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                cwd=cwd,
                env=env,
                start_new_session=True,
                close_fds=True,
            )
        except BaseException:
            os.close(master_fd)
            os.close(slave_fd)
            raise
        os.close(slave_fd)
        return cls(process, master_fd)

    @property
    def pid(self) -> int:
        return self._process.pid

    def fileno(self) -> int:
        """Return the PTY master descriptor for select/poll loops."""
        if self._closed:
            raise RuntimeError("terminal is closed")
        return self._master_fd

    @property
    def returncode(self) -> int | None:
        return self._process.poll()

    def write(self, data: str | bytes) -> None:
        if self._closed:
            raise RuntimeError("terminal is closed")
        payload = data.encode() if isinstance(data, str) else data
        os.write(self._master_fd, payload)

    def read(self, timeout: float = 0.1, max_bytes: int = 65536) -> bytes:
        if self._closed:
            return b""
        ready, _, _ = select.select([self._master_fd], [], [], timeout)
        if not ready:
            return b""
        try:
            return os.read(self._master_fd, max_bytes)
        except OSError as exc:
            if exc.errno == errno.EIO:
                return b""
            raise

    def read_until_exit(self, timeout: float = 10.0) -> str:
        deadline = time.monotonic() + timeout
        chunks: list[bytes] = []
        while time.monotonic() < deadline:
            chunk = self.read(min(0.1, max(0.0, deadline - time.monotonic())))
            if chunk:
                chunks.append(chunk)
            if self.returncode is not None:
                while True:
                    tail = self.read(0)
                    if not tail:
                        break
                    chunks.append(tail)
                return b"".join(chunks).decode(errors="replace")
        raise TimeoutError("terminal process did not exit before timeout")

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            if self.returncode is None:
                try:
                    os.killpg(self.pid, signal.SIGHUP)
                except ProcessLookupError:
                    pass
                try:
                    self._process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(self.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    self._process.wait(timeout=1)
        finally:
            try:
                os.close(self._master_fd)
            except OSError:
                pass

    def __enter__(self) -> "TerminalProcess":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
