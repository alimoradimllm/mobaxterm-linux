import unittest

from mobaxterm_cli import build_connect_plan, select_session
from session_model import Session, SessionValidationError


class ConnectTests(unittest.TestCase):
    def setUp(self):
        self.sessions = [
            Session(name='alpha', session_type='SSH', host='alpha.example', username='ali'),
            Session(name='files', session_type='Sftp', host='files.example'),
        ]

    def test_selects_session_by_exact_name(self):
        session = select_session(self.sessions, name='alpha')
        self.assertEqual(session.host, 'alpha.example')

    def test_selects_session_by_zero_based_index(self):
        session = select_session(self.sessions, index=1)
        self.assertEqual(session.session_type, 'Sftp')

    def test_unknown_name_is_rejected(self):
        with self.assertRaises(SessionValidationError):
            select_session(self.sessions, name='missing')

    def test_connect_plan_uses_backend_builder(self):
        plan = build_connect_plan(self.sessions[0])
        self.assertEqual(plan.argv[-1], 'ali@alpha.example')

    def test_wsl_connect_plan_uses_wsl_exe(self):
        plan = build_connect_plan(Session(name='WSL-Debian', session_type='WSL'))
        self.assertEqual(plan.argv, ('wsl.exe', '-d', 'Debian'))

    def test_vnc_connect_plan_uses_vncviewer(self):
        plan = build_connect_plan(Session(name='console', session_type='Vnc', host='console.example'))
        self.assertEqual(plan.argv, ('vncviewer', 'console.example:5900'))


if __name__ == '__main__':
    unittest.main()
