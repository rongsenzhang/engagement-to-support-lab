"""Check the public browser assets and the contents of source downloads."""
from html.parser import HTMLParser
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

import package_demo
import build_cloud


class CloudPackageTest(unittest.TestCase):
    def test_cloud_stages_every_script_and_stylesheet_linked_from_the_page(self):
        class PageAssets(HTMLParser):
            def __init__(self):
                super().__init__()
                self.paths = set()

            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == "script" and "src" in attrs:
                    self.paths.add(attrs["src"])
                elif tag == "link" and attrs.get("rel") == "stylesheet":
                    self.paths.add(attrs["href"])

        assets = PageAssets()
        assets.feed((build_cloud.ROOT / "web" / "index.html").read_text(encoding="utf-8"))
        self.assertFalse(assets.paths.difference(build_cloud.STATIC_FILES))

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
