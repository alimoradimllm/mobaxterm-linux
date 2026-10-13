import unittest

from session_model import session_from_fields
from telnet_serial_backend import build_scp, build_serial, build_telnet


class AdditionalBackendTests(unittest.TestCase):
    def test_scp_plan_has_no_password(self):
        session = session_from_fields('copy', 'Scp', {'host': 'example.test', 'username': 'ali', 'options': {'source': '/tmp/a', 'destination': '/tmp/b'}})
        plan = build_scp(session)
        self.assertEqual(plan.argv, ('scp', '-P', '22', 'ali@example.test:/tmp/a', '/tmp/b'))
        self.assertNotIn('password', plan.shell_command.lower())

    def test_telnet_plan(self):
        session = session_from_fields('telnet', 'Telnet', {'host': 'example.test'})
        self.assertEqual(build_telnet(session).argv, ('telnet', 'example.test', '23'))

    def test_serial_plan(self):
        session = session_from_fields('serial', 'Serial', {'options': {'device': '/dev/ttyUSB0', 'baud': 9600}})
        self.assertEqual(build_serial(session).argv, ('socat', '-', 'OPEN:/dev/ttyUSB0,b9600,raw,echo=0'))


if __name__ == '__main__':
    unittest.main()
