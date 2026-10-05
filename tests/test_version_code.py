"""Release tags must produce monotonic Android version codes."""
import importlib.util
import pathlib
import unittest

PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "release_version.py"
spec = importlib.util.spec_from_file_location("release_version", PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class VersionCodeTests(unittest.TestCase):
    def test_valid_tags(self):
        self.assertEqual(module.version_code("v0.3.0"), 3000)
        self.assertEqual(module.version_code("v1.2.3"), 1002003)
        self.assertGreater(module.version_code("v0.3.1"), module.version_code("v0.3.0"))

    def test_invalid_tags(self):
        for tag in ("v0.2.0-beta", "v0.1000.0", "v2148.0.0", "v0.0.0", "v01.2.3", "../foo"):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                module.version_code(tag)
