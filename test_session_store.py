import tempfile
import unittest
from pathlib import Path

from session_model import session_from_fields
from session_store import SessionStore


class SessionStoreTests(unittest.TestCase):
    def test_round_trip_does_not_store_secret_field(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sessions.sqlite3'
            session = session_from_fields('test', 'SSH', {'host': 'example.test', 'username': 'ali', 'credential_ref': 'ref-1'})
            with SessionStore(path) as store:
                store.replace_all([session])
                loaded = store.list()
            self.assertEqual(loaded[0].name, 'test')
            self.assertNotIn('password', path.read_text(encoding='utf-8', errors='ignore').lower())


if __name__ == '__main__':
    unittest.main()
