import tempfile
import unittest
from pathlib import Path

from mobaxterm_importer import import_ini, import_sections
from mobaxterm_config import parse_ini


class ImporterTests(unittest.TestCase):
    def test_imports_ssh_fields_and_excludes_secrets(self):
        content = """[SessionSSH]\nHost=server.example\nUser=ali\nPort=2222\nCommand=uname -a\nCompression=1\nX11Forwarding=true\nPassword=must-not-enter-model\nSSHPrivateKey=/secret/id_ed25519\n"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'MobaXterm.ini'
            path.write_text(content, encoding='utf-8')
            sessions = import_ini(path)
        self.assertEqual(len(sessions), 1)
        session = sessions[0]
        self.assertEqual(session.session_type, 'SSH')
        self.assertEqual(session.host, 'server.example')
        self.assertEqual(session.port, 2222)
        self.assertEqual(session.username, 'ali')
        self.assertEqual(session.options['compression'], True)
        self.assertEqual(session.options['x11_forwarding'], True)
        self.assertIsNone(session.private_key)
        self.assertNotIn('password', str(session.public_dict()).lower())
        self.assertNotIn('must-not-enter-model', str(session.public_dict()))

    def test_infers_local_shell_and_skips_non_session_sections(self):
        content = """[Terminal]\nCommand=/bin/bash\n\n[SessionShell]\nCommand=/bin/zsh\n"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'MobaXterm.ini'
            path.write_text(content, encoding='utf-8')
            sessions = import_ini(path)
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0].session_type, 'Shell')
        self.assertEqual(sessions[0].command, '/bin/zsh')

    def test_unknown_session_type_is_reported_not_silently_mapped(self):
        sections = parse_ini_from_text('[SessionQuantum]\nHost=x\n')
        with self.assertRaises(ValueError):
            import_sections(sections)

    def test_global_settings_sections_are_not_imported_as_sessions(self):
        sections = parse_ini_from_text('[Misc]\nLastSession=example\n[SSH]\nEnableSFTP=1\n')
        self.assertEqual(import_sections(sections), [])


def parse_ini_from_text(text):
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'input.ini'
        path.write_text(text, encoding='utf-8')
        return parse_ini(path)


if __name__ == '__main__':
    unittest.main()
