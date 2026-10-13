import os
import sys
import unittest

from session_model import Session, SessionValidationError
from terminal_backend import TerminalProcess, build_local_command


class TerminalBackendTests(unittest.TestCase):
    def test_shell_session_uses_configured_command(self):
        plan = build_local_command(Session(name='shell', session_type='Shell', command='/bin/sh'))
        self.assertEqual(plan.argv, ('/bin/sh',))

    def test_terminal_session_defaults_to_user_shell(self):
        plan = build_local_command(Session(name='terminal', session_type='Terminal'))
        if os.name == 'nt':
            self.assertEqual(plan.argv, (os.environ.get('COMSPEC') or 'cmd.exe', '/Q', '/K'))
        else:
            self.assertEqual(plan.argv, (os.environ.get('SHELL') or '/bin/sh',))

    def test_command_arguments_are_preserved(self):
        plan = build_local_command(Session(name='shell', session_type='Shell', command=['/bin/echo', 'hello']))
        self.assertEqual(plan.argv, ('/bin/echo', 'hello'))

    def test_remote_session_is_rejected(self):
        with self.assertRaises(SessionValidationError):
            build_local_command(Session(name='ssh', session_type='SSH', host='example.test'))

    @unittest.skipUnless(os.name == 'posix', 'PTY backend requires POSIX')
    def test_pty_captures_output_and_exits(self):
        process = TerminalProcess.start([sys.executable, '-c', "print('terminal-ok', flush=True)"])
        try:
            output = process.read_until_exit(timeout=3)
            self.assertIn('terminal-ok', output)
            self.assertEqual(process.returncode, 0)
        finally:
            process.close()

    @unittest.skipUnless(os.name == 'posix', 'PTY backend requires POSIX')
    def test_close_is_idempotent(self):
        process = TerminalProcess.start([sys.executable, '-c', 'input()'])
        process.close()
        process.close()
        self.assertIsNotNone(process.returncode)


if __name__ == '__main__':
    unittest.main()
