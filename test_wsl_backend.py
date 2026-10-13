import unittest

from session_model import Session, SessionValidationError
from wsl_backend import build_wsl


class WslBackendTests(unittest.TestCase):
    def test_debian_distribution_from_imported_session_name(self):
        plan = build_wsl(Session(
            name='WSL-Debian',
            session_type='WSL',
            options={'distribution_id': '2'},
        ))
        self.assertEqual(plan.argv, ('wsl.exe', '-d', 'Debian'))

    def test_distribution_and_user_are_explicit(self):
        plan = build_wsl(Session(
            name='local',
            session_type='WSL',
            username='ali',
            command='bash -lc "uname -a"',
            options={'distribution': 'Ubuntu-24.04'},
        ))
        self.assertEqual(plan.argv[:5], ('wsl.exe', '-d', 'Ubuntu-24.04', '-u', 'ali'))
        self.assertEqual(plan.argv[-1], 'bash -lc "uname -a"')

    def test_unknown_distribution_requires_explicit_name(self):
        with self.assertRaises(SessionValidationError):
            build_wsl(Session(name='WSL-Unknown', session_type='WSL'))

    def test_wrong_session_type_is_rejected(self):
        with self.assertRaises(SessionValidationError):
            build_wsl(Session(name='ssh', session_type='SSH', host='example'))


if __name__ == '__main__':
    unittest.main()
