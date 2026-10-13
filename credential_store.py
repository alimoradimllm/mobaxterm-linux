from __future__ import annotations

import os
import shutil
import subprocess


class KeyringUnavailable(RuntimeError):
    pass


def _secret_tool() -> str:
    path = shutil.which('secret-tool')
    if not path:
        raise KeyringUnavailable('secret-tool is not installed; install libsecret-tools')
    return path


def store_secret(reference: str, value: str, *, label: str = 'Moraxterm Linux credential') -> None:
    """Store a secret in Secret Service; callers must never log value."""
    if not reference or '\n' in reference:
        raise ValueError('invalid credential reference')
    subprocess.run([_secret_tool(), 'store', '--label', label, 'service', 'moraxterm-linux', 'reference', reference], input=value, text=True, check=True)


def lookup_secret(reference: str) -> str:
    if not reference or '\n' in reference:
        raise ValueError('invalid credential reference')
    result = subprocess.run([_secret_tool(), 'lookup', 'service', 'moraxterm-linux', 'reference', reference], text=True, capture_output=True, check=True)
    return result.stdout.rstrip('\n')


def delete_secret(reference: str) -> None:
    subprocess.run([_secret_tool(), 'clear', 'service', 'moraxterm-linux', 'reference', reference], check=True)
