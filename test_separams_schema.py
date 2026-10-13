import unittest
from separams_schema import parse_separams


class SeparamsTests(unittest.TestCase):
    def test_real_decoded_schema_contains_core_session_types(self):
        sessions = parse_separams('/home/ali/mobaxterm-research/resources-decoded/SEPARAMS.decoded')
        names = {session['name'] for session in sessions}
        self.assertEqual(len(sessions), 21)
        self.assertTrue({'SSH', 'Sftp', 'Rdp', 'Vnc', 'Serial', 'Mosh', 'WSL'} <= names)
        ssh = next(session for session in sessions if session['name'] == 'SSH')
        captions = {field.get('caption') for field in ssh['fields']}
        self.assertIn('Remote host', captions)
        network_sections = [session for session in sessions if session['name'] == 'Network']
        self.assertEqual(len(network_sections), 4)
        self.assertTrue(any(
            any(field.get('caption') == 'SSH gateway login' for field in session['fields'])
            for session in network_sections
        ))


if __name__ == '__main__':
    unittest.main()
