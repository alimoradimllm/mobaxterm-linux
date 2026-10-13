import shutil
import unittest

from rdp_backend import build_rdp, rdp_client_name
from session_model import Session, SessionValidationError


class RdpBackendTests(unittest.TestCase):
    def test_builds_freerdp_command(self):
        session = Session(
            name='desktop',
            session_type='Rdp',
            host='desktop.example',
            port=3389,
            username='ali',
            options={
                'domain': 'CORP',
                'fullscreen': True,
                'clipboard': True,
                'dynamic_resolution': True,
            },
        )
        plan = build_rdp(session)
        self.assertEqual(plan.argv[0], rdp_client_name())
        self.assertIn(plan.argv[0], ('xfreerdp', 'xfreerdp3'))
        self.assertEqual(plan.argv[1], '/v:desktop.example:3389')
        self.assertIn('/u:ali', plan.argv)
        self.assertIn('/d:CORP', plan.argv)
        self.assertIn('/f', plan.argv)
        self.assertIn('+clipboard', plan.argv)
        self.assertIn('/dynamic-resolution', plan.argv)
        self.assertNotIn('/p:', ' '.join(plan.argv))

    def test_builds_gateway_options(self):
        session = Session(
            name='desktop', session_type='Rdp', host='internal.example',
            options={'gateway': {'host': 'rdpgw.example', 'port': 443, 'username': 'gw'}},
        )
        plan = build_rdp(session)
        self.assertIn('/g:rdpgw.example', plan.argv)
        self.assertIn('/gu:gw', plan.argv)
        self.assertIn('/gp:443', plan.argv)

    def test_wrong_session_type_is_rejected(self):
        with self.assertRaises(SessionValidationError):
            build_rdp(Session(name='ssh', session_type='SSH', host='example'))


if __name__ == '__main__':
    unittest.main()
