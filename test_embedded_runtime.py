"""Smoke tests for the managed Windows embedded Unix runtime."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest


RUNTIME = Path(os.environ.get("LOCALAPPDATA", "")) / "Moraxterm" / "unix-runtime"
FISH = RUNTIME / "usr" / "bin" / "fish.exe"


@pytest.mark.skipif(os.name != "nt", reason="managed runtime path is Windows-specific")
def test_embedded_runtime_baseline_tools() -> None:
    if not FISH.is_file():
        pytest.skip(f"managed runtime is not installed: {FISH}")

    env = os.environ.copy()
    env["PATH"] = os.pathsep.join(
        [str(RUNTIME / "usr" / "bin"), str(RUNTIME / "bin"), r"C:\Windows\System32"]
    )
    result = subprocess.run(
        [str(FISH), "-lc", "command -v fish; command -v ping; command -v ssh; command -v telnet; command -v dig; ssh -V; dig localhost"],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout
    output = result.stdout + result.stderr
    for command in ("fish", "ping", "ssh", "telnet", "dig"):
        assert command in output, output
    assert "OpenSSH_" in output, output
    assert "Name:" in output or "Address:" in output, output
