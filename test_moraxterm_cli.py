import json
import os
import subprocess
import sys
import unittest

from moraxterm_cli import (
    build_parser,
    execute_plan,
    filter_sessions,
    missing_dependencies,
    run_capture,
)
from session_model import Session, SessionValidationError
from ssh_backend import CommandPlan


class CliTests(unittest.TestCase):
    def test_list_command_accepts_json_sessions(self):
        parser = build_parser()
        args = parser.parse_args(['list', '--sessions', 'sessions.json'])
        self.assertEqual(args.action, 'list')
        self.assertEqual(args.sessions, 'sessions.json')

    def test_run_command_accepts_command_arguments(self):
        parser = build_parser()
        args = parser.parse_args(['run', '--type', 'Shell', '--command', '/bin/echo', 'hello'])
        self.assertEqual(args.session_type, 'Shell')
        self.assertEqual(args.command, ['/bin/echo', 'hello'])

    def test_import_command_accepts_ini_path(self):
        parser = build_parser()
        args = parser.parse_args(['import', 'Moraxterm.ini'])
        self.assertEqual(args.action, 'import')
        self.assertEqual(args.path, 'Moraxterm.ini')

    def test_connect_requires_explicit_execute_flag(self):
        parser = build_parser()
        args = parser.parse_args(['connect', '--sessions', 'sessions.json', '--index', '0', '--execute'])
        self.assertTrue(args.execute)

    def test_filter_matches_name_host_and_type_case_insensitively(self):
        sessions = [
            Session(name='GitLab', session_type='SSH', host='git.example'),
            Session(name='Desktop', session_type='Rdp', host='git.example'),
        ]
        result = filter_sessions(sessions, search='GIT', session_type='ssh')
        self.assertEqual([session.name for session in result], ['GitLab'])

    def test_filter_rejects_empty_search_result(self):
        with self.assertRaises(SessionValidationError):
            filter_sessions([], search='missing')

    def test_missing_dependencies_reports_only_unavailable_executables(self):
        plan = CommandPlan(('definitely-not-installed-moraxterm-tool',))
        self.assertEqual(missing_dependencies(plan), ['definitely-not-installed-moraxterm-tool'])

    @unittest.skipUnless(os.name == 'posix', 'PTY backend requires POSIX')
    def test_execute_plan_runs_a_local_safe_command(self):
        code = "print('execute-ok', flush=True)"
        self.assertEqual(execute_plan(CommandPlan((sys.executable, '-c', code))), 0)

        result = run_capture([sys.executable, '-c', "print('cli-ok')"])
        self.assertEqual(result.returncode, 0)
        self.assertIn('cli-ok', result.output)

    def test_cli_module_lists_a_session_file(self):
        sessions = json.dumps([{
            'name': 'local', 'session_type': 'Shell', 'command': ['/bin/echo', 'listed']
        }])
        completed = subprocess.run(
            [sys.executable, '-m', 'moraxterm_cli', 'list', '--sessions', '-'],
            input=sessions,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn('local', completed.stdout)
        self.assertIn('local-shell', completed.stdout)


if __name__ == '__main__':
    unittest.main()
