#!/usr/bin/env python3
"""Parse the decoded MobaXterm SEPARAMS session schema."""
from __future__ import annotations

import configparser
import json
from pathlib import Path
from typing import Any


def parse_separams(path: str | Path) -> list[dict[str, Any]]:
    parser = configparser.RawConfigParser(interpolation=None, strict=False)
    parser.optionxform = str
    with Path(path).open("r", encoding="utf-8-sig", errors="replace") as handle:
        parser.read_file(handle)

    result: list[dict[str, Any]] = []
    for section in parser.sections():
        values = dict(parser.items(section, raw=True))
        fields: dict[str, dict[str, str]] = {}
        for key, value in values.items():
            if key.startswith("Caption_"):
                field_id = key.removeprefix("Caption_")
                fields.setdefault(field_id, {})["caption"] = value
            elif key.startswith("DfltVal_"):
                field_id = key.removeprefix("DfltVal_")
                fields.setdefault(field_id, {})["default"] = value
            elif key.startswith("ParmLev_"):
                field_id = key.removeprefix("ParmLev_")
                fields.setdefault(field_id, {})["level"] = value
        result.append({
            "source_section": section,
            "name": values.get("SectionName", section),
            "icon": values.get("SectionIcon"),
            "show_terminal_section": values.get("ShowTermSection"),
            "show_network_section": values.get("ShowNetSection"),
            "subsections": [value for key, value in values.items() if key.startswith("Sub")],
            "fields": [
                {"id": field_id, **field}
                for field_id, field in fields.items()
            ],
        })
    return result


def schema_summary(path: str | Path) -> dict[str, Any]:
    sessions = parse_separams(path)
    return {
        "session_type_count": len(sessions),
        "session_types": [
            {
                "name": session["name"],
                "field_count": len(session["fields"]),
                "fields": session["fields"],
            }
            for session in sessions
        ],
    }


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("path", type=Path)
    args = ap.parse_args()
    print(json.dumps(schema_summary(args.path), indent=2, ensure_ascii=False))
