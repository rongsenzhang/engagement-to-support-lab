"""Public source downloads must not include local credentials or Workers state."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

import package_demo


class CloudPackageTest(unittest.TestCase):
    def test_source_zip_excludes_nested_cloud_secrets_and_local_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            public = ["web/index.html", "cloud/wrangler.jsonc", "cloud/worker.mjs"]
            private = [
                ".env", "src/.env.local", "cloud/.dev.vars", "cloud/.dev.vars.production",
                "cloud/.wrangler/state/v3/do.sqlite", "nested/.dev.vars.d/local.key",
                "nested/.env.overrides/value.txt", "cloud/node_modules/dependency/index.js",
            ]
            for name in public + private:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("fixture", encoding="utf-8")
            (root / "cloud" / "alias.txt").symlink_to(root / ".env")
            (root / "cloud" / "alias-dir").symlink_to(root / "nested", target_is_directory=True)
            with patch.object(package_demo, "ROOT", root):
                package_demo.main()
            source, = (root / "dist").glob("*_Source.zip")
            with ZipFile(source) as archive:
                self.assertEqual(set(archive.namelist()), {"engagement_lab/" + n for n in public})
