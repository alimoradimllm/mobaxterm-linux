#!/usr/bin/env python3
"""Cross-platform local terminal process support for Moraxterm."""
from __future__ import annotations

import errno
import os
import queue
import select
import signal
import subprocess
import threading
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
        raise SessionValidationError("local terminal commands require Shell, Terminal, or WSL sessions")
    session.validate()
    command = session.command
    if command is None:
        if os.name == "nt":
            command = (os.environ.get("COMSPEC") or "cmd.exe", "/Q", "/K")
        else:
            command = os.environ.get("SHELL") or "/bin/sh"
    argv = (command,) if isinstance(command, str) else tuple(str(item) for item in command)
    if not argv or not argv[0]:
        raise SessionValidationError("local command cannot be empty")
    return LocalCommandPlan(argv)


class TerminalProcess:
    """A child process attached to a POSIX PTY or Windows pipes."""

    def __init__(self, process: subprocess.Popen[bytes], master_fd: int | None = None,
                 output_queue: queue.Queue[bytes] | None = None) -> None:
        self._process = process
        self._master_fd = master_fd
        self._output_queue = output_queue
        self._closed = False

    @classmethod
    def start(cls, argv: Sequence[str], *, cwd: str | None = None,
              env: dict[str, str] | None = None) -> "TerminalProcess":
        if not argv or not argv[0]:
            raise ValueError("argv cannot be empty")
        if os.name == "nt":
            output_queue: queue.Queue[bytes] = queue.Queue()
            process = subprocess.Popen(
                list(argv), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, cwd=cwd, env=env,
                creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
            )
            assert process.stdout is not None
            def reader() -> None:
                while True:
                    chunk = process.stdout.read(4096)
                    if not chunk:
                        break
                    output_queue.put(chunk)
            threading.Thread(target=reader, daemon=True).start()
            return cls(process, output_queue=output_queue)

        master_fd, slave_fd = os.openpty()
        try:
            process = subprocess.Popen(
                list(argv), stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
                cwd=cwd, env=env, start_new_session=True, close_fds=True,
            )
        except BaseException:
            os.close(master_fd)
            os.close(slave_fd)
            raise
        os.close(slave_fd)
        return cls(process, master_fd=master_fd)

    @property
    def pid(self) -> int:
        return self._process.pid

    def fileno(self) -> int:
        if self._closed or self._master_fd is None:
            raise RuntimeError("terminal does not expose a POSIX file descriptor")
        return self._master_fd

    @property
    def returncode(self) -> int | None:
        return self._process.poll()

    def write(self, data: str | bytes) -> None:
        if self._closed:
            raise RuntimeError("terminal is closed")
        payload = data.encode() if isinstance(data, str) else data
        if self._master_fd is not None:
            os.write(self._master_fd, payload)
        elif self._process.stdin is not None:
            if self._output_queue is not None:
                command = payload.decode(errors="replace").strip()
                if not command:
                    return
                child = subprocess.Popen(
                    [os.environ.get("COMSPEC") or "cmd.exe", "/C", command],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                )
                assert child.stdout is not None
                def command_reader() -> None:
                    for chunk in iter(lambda: child.stdout.read(4096), b""):
                        if chunk:
                            self._output_queue.put(chunk)
                    child.stdout.close()
                threading.Thread(target=command_reader, daemon=True).start()
                return
            self._process.stdin.write(payload)
            self._process.stdin.flush()

    def read(self, timeout: float = 0.1, max_bytes: int = 65536) -> bytes:
        if self._closed:
            return b""
        if self._output_queue is not None:
            chunks: list[bytes] = []
            try:
                chunks.append(self._output_queue.get(timeout=timeout))
            except queue.Empty:
                return b""
            total = len(chunks[0])
            while total < max_bytes:
                try:
                    chunk = self._output_queue.get_nowait()
                except queue.Empty:
                    break
                chunks.append(chunk)
                total += len(chunk)
            return b"".join(chunks)[:max_bytes]
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
                if os.name == "nt":
                    self._process.terminate()
                    try:
                        self._process.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        self._process.kill()
                        self._process.wait(timeout=1)
                else:
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
            if self._master_fd is not None:
                try:
                    os.close(self._master_fd)
                except OSError:
                    pass
            if self._process.stdin is not None:
                self._process.stdin.close()
            if self._process.stdout is not None:
                self._process.stdout.close()

    def __enter__(self) -> "TerminalProcess":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
