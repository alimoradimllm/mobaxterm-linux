from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Iterable

from session_model import Session, session_from_fields


class SessionStore:
    """SQLite store for sanitized sessions; never stores secret values."""

    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path or '~/.local/share/moraxterm-linux/sessions.sqlite3').expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(self.path)
        self._db.execute('''CREATE TABLE IF NOT EXISTS sessions (
            name TEXT PRIMARY KEY, session_type TEXT NOT NULL, payload TEXT NOT NULL
        )''')
        self._db.commit()

    def replace_all(self, sessions: Iterable[Session]) -> None:
        rows = [(s.name, s.session_type, json.dumps(s.public_dict(), sort_keys=True)) for s in sessions]
        with self._db:
            self._db.execute('DELETE FROM sessions')
            self._db.executemany('INSERT INTO sessions(name, session_type, payload) VALUES (?, ?, ?)', rows)

    def list(self) -> list[Session]:
        rows = self._db.execute('SELECT payload FROM sessions ORDER BY name').fetchall()
        result = []
        for (payload,) in rows:
            item = json.loads(payload)
            result.append(session_from_fields(item['name'], item['session_type'], item))
        return result

    def close(self) -> None:
        self._db.close()

    def __enter__(self) -> 'SessionStore':
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
