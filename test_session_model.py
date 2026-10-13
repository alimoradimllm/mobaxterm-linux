import unittest

from session_model import Session, SessionValidationError, session_from_fields


class SessionModelTests(unittest.TestCase):
    def test_ssh_defaults_and_backend(self):
        session = Session(name='prod', session_type='SSH', host='server.example')
        session.validate()
        self.assertEqual(session.backend, 'openssh')
        self.assertEqual(session.port, 22)

    def test_import_fields_without_secret_values(self):
        session = session_from_fields(
            'jumped',
            'SSH',
            {
                'remote_host': 'server.example',
                'username': 'ali',
                'port': '2222',
                'private_key': '/home/ali/.ssh/id_ed25519',
                'credential_ref': 'vault:ssh-prod',
                'gateway': {'host': 'jump.example', 'port': 22},
            },
        )
        self.assertEqual(session.port, 2222)
        self.assertEqual(session.credential_ref, 'vault:ssh-prod')
        self.assertNotIn('password', session.public_dict())

    def test_required_host_and_port_validation(self):
        with self.assertRaises(SessionValidationError):
            Session(name='bad', session_type='Rdp').validate()
        with self.assertRaises(SessionValidationError):
            Session(name='bad', session_type='SSH', host='x', port=70000).validate()

    def test_local_shell_does_not_require_host(self):
        session = Session(name='local', session_type='Shell', command='/bin/bash')
        session.validate()
        self.assertEqual(session.backend, 'local-shell')


if __name__ == '__main__':
    unittest.main()
