import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from moraxterm_config import inspect_mxtpro, parse_ini, summarize


class ConfigTests(unittest.TestCase):
    def test_ini_sections_are_classified_and_secrets_redacted(self):
        content = """[SessionSSH]\nHost=example.test\nUser=ali\nPassword=do-not-print\n\n[Terminal]\nFont=Monospace\n"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Moraxterm.ini"
            path.write_text(content, encoding="utf-8")
            sections = parse_ini(path)
            result = summarize(sections)
        self.assertEqual(result["section_count"], 2)
        self.assertEqual(result["counts_by_kind"]["session"], 1)
        session = result["sections"][0]
        password = next(item for item in session["values"] if item["name"] == "Password")
        self.assertEqual(password["value"], "<redacted>")
        self.assertTrue(password["redacted"])

    def test_mxtpro_reports_metadata_not_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Custom.mxtpro"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("Pro.key", "secret-license-value")
            result = inspect_mxtpro(path)
        self.assertEqual(result["entries"][0]["name"], "Pro.key")
        self.assertEqual(result["entries"][0]["size"], 20)
        self.assertNotIn("secret-license-value", json.dumps(result))
        self.assertEqual(len(result["entries"][0]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
