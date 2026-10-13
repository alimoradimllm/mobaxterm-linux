import unittest

from session_model import Session, SessionValidationError
from ssh_backend import build_mosh, build_sftp, build_ssh


class SshBackendTests(unittest.TestCase):
    def test_ssh_command_with_gateway_and_options(self):
        plan = build_ssh(Session(
            name='prod',
            session_type='SSH',
            host='app.example',
            username='ali',
            private_key='/home/ali/.ssh/id_ed25519',
            gateway={'host': 'jump.example', 'username': 'jump', 'port': 2222},
            options={'compression': True, 'x11_forwarding': True},
            command='uname -a',
        ))
        self.assertEqual(plan.argv, (
            'ssh', '-p', '22', '-i', '/home/ali/.ssh/id_ed25519', '-C', '-X',
            '-J', 'jump@jump.example:2222', 'ali@app.example', 'uname -a'
        ))
        self.assertIn("'uname -a'", plan.shell_command)

    def test_sftp_uses_sftp_binary(self):
        plan = build_sftp(Session(name='files', session_type='Sftp', host='files.example'))
        self.assertEqual(plan.argv[:2], ('sftp', '-p'))
        self.assertEqual(plan.argv[-1], 'files.example')

    def test_mosh_plan(self):
        plan = build_mosh(Session(name='mobile', session_type='Mosh', host='server', username='ali'))
        self.assertEqual(plan.argv, ('mosh', 'ali@server'))

    def test_wrong_session_type_rejected(self):
        with self.assertRaises(SessionValidationError):
            build_sftp(Session(name='bad', session_type='SSH', host='x'))


if __name__ == '__main__':
    unittest.main()
