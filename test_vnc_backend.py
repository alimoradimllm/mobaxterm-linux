import unittest

from session_model import Session, SessionValidationError
from vnc_backend import build_vnc


class VncBackendTests(unittest.TestCase):
    def test_builds_vncviewer_command(self):
        session = Session(
            name='console',
            session_type='Vnc',
            host='console.example',
            port=5902,
            options={'fullscreen': True, 'view_only': True, 'shared': True},
        )
        plan = build_vnc(session)
        self.assertEqual(plan.argv[:2], ('vncviewer', 'console.example:5902'))
        self.assertIn('-FullScreen', plan.argv)
        self.assertIn('-ViewOnly', plan.argv)
        self.assertIn('-Shared', plan.argv)
        self.assertNotIn('-Password', plan.argv)

    def test_default_vnc_port(self):
        plan = build_vnc(Session(name='console', session_type='Vnc', host='console.example'))
        self.assertEqual(plan.argv, ('vncviewer', 'console.example:5900'))

    def test_geometry_option(self):
        plan = build_vnc(Session(
            name='console', session_type='Vnc', host='console.example',
            options={'geometry': '1920x1080'},
        ))
        self.assertIn('-Geometry', plan.argv)
        self.assertIn('1920x1080', plan.argv)

    def test_wrong_session_type_is_rejected(self):
        with self.assertRaises(SessionValidationError):
            build_vnc(Session(name='ssh', session_type='SSH', host='example'))


if __name__ == '__main__':
    unittest.main()
