import tempfile
import unittest
from pathlib import Path

from moraxterm_importer import import_ini


class BookmarkImporterTests(unittest.TestCase):
    def test_imports_encoded_ssh_bookmark(self):
        content = """[Bookmarks]\nSubRep=Lab\nserver-one=#109#0%server.example%60222%ali%%-1%-1%%%%%0%0%0%%%-1%-1%0%%%0\n"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'Moraxterm.ini'
            path.write_text(content, encoding='utf-8')
            sessions = import_ini(path)
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0].name, 'server-one')
        self.assertEqual(sessions[0].session_type, 'SSH')
        self.assertEqual(sessions[0].host, 'server.example')
        self.assertEqual(sessions[0].port, 60222)
        self.assertEqual(sessions[0].username, 'ali')

    def test_imports_encoded_rdp_and_wsl_bookmarks(self):
        content = """[Bookmarks]\nrdp-box=#91#4%10.0.0.5%3389%administrator%0%-1%-1%-1%-1%0%0%-1%%%%%0%0%%-1%%-1%-1%0%-1%0%-1\nwsl-box=#149#14%2%\n"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'Moraxterm.ini'
            path.write_text(content, encoding='utf-8')
            sessions = import_ini(path)
        self.assertEqual([s.session_type for s in sessions], ['Rdp', 'WSL'])
        self.assertEqual(sessions[0].host, '10.0.0.5')
        self.assertEqual(sessions[0].port, 3389)
        self.assertEqual(sessions[1].options['distribution_id'], '2')


if __name__ == '__main__':
    unittest.main()
