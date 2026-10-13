#!/usr/bin/env python3
"""Read-only Moraxterm configuration/session inventory helpers.

This module intentionally does not decrypt, export, or modify secrets.
It preserves raw values in memory for parsing, but summaries redact fields
whose names indicate credentials or private keys.
"""
from __future__ import annotations

import configparser
import hashlib
import json
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

_SECRET_WORDS = ("password", "passphrase", "secret", "privatekey", "private_key", "token")
_SESSION_WORDS = ("session", "ssh", "sftp", "scp", "rdp", "vnc", "telnet", "serial", "mosh", "ftp")


def _is_secret(name: str) -> bool:
    key = name.lower().replace("-", "_")
    return any(word in key for word in _SECRET_WORDS)


def _redact(name: str, value: str) -> str:
    if not _is_secret(name):
        return value
    return "<redacted>" if value else ""


@dataclass(frozen=True)
class KeyValue:
    name: str
    value: str
    redacted: bool


@dataclass(frozen=True)
class Section:
    name: str
    kind: str
    values: tuple[KeyValue, ...]


def classify_section(name: str, keys: list[str]) -> str:
    haystack = (name + " " + " ".join(keys)).lower()
    if any(word in haystack for word in _SESSION_WORDS):
        return "session"
    if any(word in haystack for word in ("password", "credential", "master")):
        return "credentials"
    if any(word in haystack for word in ("proxy", "terminal", "x11", "rdp", "vnc", "theme")):
        return "feature-settings"
    return "settings"


def parse_ini(path: str | Path) -> list[Section]:
    """Parse an INI file without interpolation and return ordered sections."""
    parser = configparser.RawConfigParser(interpolation=None, strict=False)
    parser.optionxform = str
    with Path(path).open("r", encoding="utf-8-sig", errors="replace") as handle:
        parser.read_file(handle)
    sections: list[Section] = []
    for name in parser.sections():
        pairs = tuple(
            KeyValue(key, value, _is_secret(key))
            for key, value in parser.items(name, raw=True)
        )
        sections.append(Section(name, classify_section(name, [p.name for p in pairs]), pairs))
    return sections


def inspect_mxtpro(path: str | Path) -> dict[str, Any]:
    """Inspect ZIP metadata in a .mxtpro file without exposing entry contents."""
    target = Path(path)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    with zipfile.ZipFile(target) as archive:
        entries = []
        for info in archive.infolist():
            entries.append({
                "name": info.filename,
                "size": info.file_size,
                "compressed_size": info.compress_size,
                "sha256": hashlib.sha256(archive.read(info)).hexdigest(),
            })
        return {"path": str(target), "sha256": digest, "entries": entries}


def summarize(sections: list[Section]) -> dict[str, Any]:
    return {
        "section_count": len(sections),
        "counts_by_kind": {
            kind: sum(section.kind == kind for section in sections)
            for kind in sorted({section.kind for section in sections})
        },
        "sections": [
            {
                "name": section.name,
                "kind": section.kind,
                "values": [
                    {"name": p.name, "value": _redact(p.name, p.value), "redacted": p.redacted}
                    for p in section.values
                ],
            }
            for section in sections
        ],
    }


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser(description="Inventory Moraxterm INI or MXTPRO files")
    ap.add_argument("path", type=Path)
    args = ap.parse_args()
    if args.path.suffix.lower() == ".mxtpro":
        result = inspect_mxtpro(args.path)
    else:
        result = summarize(parse_ini(args.path))
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
