import pathlib
import unittest


PROJECT = pathlib.Path(__file__).parent


class PackagingTests(unittest.TestCase):
    def test_project_declares_installable_cli(self):
        pyproject = (PROJECT / 'pyproject.toml').read_text(encoding='utf-8')
        self.assertIn('name = "moraxterm"', pyproject)
        self.assertIn('moraxterm = "mobaxterm_cli:main"', pyproject)


if __name__ == '__main__':
    unittest.main()
