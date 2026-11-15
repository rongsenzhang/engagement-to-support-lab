"""Reproducible publication and safe output handling, using isolated source fixtures."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build_site import ASSET_NAMES, build_site
import package_demo

REVISION = "a" * 40


@pytest.fixture
def source(tmp_path):
    root = tmp_path / "repo"
    web = root / "web"
    web.mkdir(parents=True)
    (web / "index.html").write_text('''<!doctype html><html><head>
<meta name="lab-build-id" content="">
<meta name="lab-version" content="">
<link rel="stylesheet" href="styles.css">
</head><body><main>Research preview</main>
<script src="data.js"></script>
<script src="reference-data.js"></script>
<script src="app.js"></script>
<script src="updates.js"></script>
</body></html>''', encoding="utf-8")
    for name in ASSET_NAMES:
        (web / name).write_text("/* fixture: " + name + " */\n", encoding="utf-8")
    (root / "artifacts").mkdir()
    (root / "artifacts/frozen.json").write_text('{"frozen":true}\n', encoding="utf-8")
    return root


def snapshot(directory):
    return {p.relative_to(directory).as_posix(): p.read_bytes()
            for p in directory.rglob("*") if p.is_file()}


class Tags(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.meta = {}
        self.references = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            self.meta[attrs.get("name")] = attrs.get("content")
        if tag == "script" and "src" in attrs:
            self.references.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.references.append(attrs["href"])


def test_manifest_hashes_html_references_and_source_preservation(source):
    before = snapshot(source)
    manifest = build_site(source, revision=REVISION)
    output = source / "dist/site"
    assert set(manifest) == {"schema_version", "version", "build_id", "revision", "assets", "html"}
    assert manifest["schema_version"] == 1 and manifest["version"] == "0.2"
    assert manifest["revision"] == REVISION
    assert re.fullmatch(r"[0-9a-f]{64}", manifest["build_id"])
    assert json.loads((output / "version.json").read_text()) == manifest
    assert set(manifest["assets"]) == set(ASSET_NAMES)
    for name, asset in manifest["assets"].items():
        data = (source / "web" / name).read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        assert asset == {"path": f"assets/{Path(name).stem}.{digest[:12]}{Path(name).suffix}", "sha256": digest}
        assert (output / asset["path"]).read_bytes() == data
    html = (output / "index.html").read_bytes()
    assert manifest["html"] == {"path": "index.html", "sha256": hashlib.sha256(html).hexdigest()}
    tags = Tags(html.decode())
    assert tags.meta["lab-build-id"] == manifest["build_id"]
    assert tags.meta["lab-version"] == "0.2"
    assert set(tags.references) == {a["path"] for a in manifest["assets"].values()}
    assert all((source / name).read_bytes() == content for name, content in before.items())


def test_build_is_deterministic_in_same_and_different_directories(source, tmp_path):
    first = build_site(source, revision=REVISION)
    files = snapshot(source / "dist/site")
    assert build_site(source, revision=REVISION) == first
    assert snapshot(source / "dist/site") == files
    elsewhere = tmp_path / "separate-site"
    assert build_site(source, output=elsewhere, revision=REVISION) == first
    assert snapshot(elsewhere) == files


@pytest.mark.parametrize("changed", ["index.html", *ASSET_NAMES])
def test_every_original_source_content_participates_in_build_identity(source, changed):
    old = build_site(source, revision=REVISION)
    path = source / "web" / changed
    path.write_bytes(path.read_bytes() + b"\n")
    new = build_site(source, revision=REVISION)
    assert old["build_id"] != new["build_id"]
    assert old["html"]["sha256"] != new["html"]["sha256"]
    if changed != "index.html":
        assert old["assets"][changed] != new["assets"][changed]
        assert not (source / "dist/site" / old["assets"][changed]["path"]).exists()
    for name in set(ASSET_NAMES) - {changed}:
        assert old["assets"][name] == new["assets"][name]


def test_revision_participates_in_build_identity(source):
    first = build_site(source, revision=REVISION)
    second = build_site(source, revision="b" * 40)
    assert first["build_id"] != second["build_id"]
    assert first["assets"] == second["assets"]


def test_default_revision_reads_actual_git_head(source):
    subprocess.run(["git", "init", "-q", str(source)], check=True)
    subprocess.run(["git", "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                    "commit", "--allow-empty", "-qm", "fixture"], cwd=source, check=True)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
    assert build_site(source)["revision"] == head


@pytest.mark.parametrize("revision", ["", "abc1234", "g" * 40, "a" * 64, "a" * 39 + "\n", "A" * 40, 12])
def test_invalid_revision_cannot_create_output(source, revision):
    with pytest.raises(ValueError, match="revision"):
        build_site(source, revision=revision)
    assert not (source / "dist").exists()


@pytest.mark.parametrize("relative", [".", "..", "web", "src", "dist"])
def test_unsafe_repository_output_rejected_without_source_changes(source, relative):
    before = snapshot(source)
    with pytest.raises(ValueError, match="Output"):
        build_site(source, output=source / relative, revision=REVISION)
    assert snapshot(source) == before


def test_nonempty_unmanaged_output_and_symlink_are_rejected(source, tmp_path):
    target = tmp_path / "existing"
    target.mkdir()
    (target / "important.txt").write_text("preserve")
    before = snapshot(target)
    with pytest.raises(ValueError, match="Nonempty"):
        build_site(source, output=target, revision=REVISION)
    link = tmp_path / "linked-output"
    link.symlink_to(target, target_is_directory=True)
    with pytest.raises(ValueError, match="symbolic link"):
        build_site(source, output=link, revision=REVISION)
    assert snapshot(target) == before


def test_rebuild_preserves_unrelated_files_in_managed_output(source):
    build_site(source, revision=REVISION)
    extra = source / "dist/site/user-notes.txt"
    extra.write_text("keep this", encoding="utf-8")
    build_site(source, revision="b" * 40)
    assert extra.read_text() == "keep this"


def test_changed_generated_output_is_not_overwritten(source):
    build_site(source, revision=REVISION)
    html = source / "dist/site/index.html"
    html.write_text("user edits", encoding="utf-8")
    before = snapshot(source / "dist/site")
    with pytest.raises(ValueError, match="changed or removed"):
        build_site(source, revision="b" * 40)
    assert snapshot(source / "dist/site") == before


def test_manifest_cannot_delete_or_overwrite_paths_outside_assets(source):
    build_site(source, revision=REVISION)
    version = source / "dist/site/version.json"
    manifest = json.loads(version.read_text())
    manifest["assets"]["app.js"]["path"] = "../../web/app.js"
    version.write_text(json.dumps(manifest))
    before = snapshot(source)
    with pytest.raises(ValueError, match="Unsafe asset"):
        build_site(source, revision=REVISION)
    assert snapshot(source) == before


@pytest.mark.parametrize("replacement", [
    ('name="lab-build-id" content=""', 'name="lab-build-id" content="stale"'),
    ('name="lab-version" content=""', 'name="other" content=""'),
    ('<script src="updates.js"></script>', ''),
    ('<script src="app.js"></script>', '<script src="https://example.invalid/app.js"></script>'),
])
def test_incomplete_or_prebuilt_source_html_is_rejected(source, replacement):
    html = source / "web/index.html"
    html.write_text(html.read_text().replace(*replacement))
    with pytest.raises(ValueError):
        build_site(source, revision=REVISION)
    assert not (source / "dist").exists()


def test_offline_package_inlines_updates_but_keeps_build_metadata_empty(source, monkeypatch):
    monkeypatch.setattr(package_demo, "ROOT", source)
    package_demo.main()
    html = (source / "dist/Engagement_Lab_v0.2.html").read_text()
    tags = Tags(html)
    assert tags.references == []
    assert tags.meta["lab-build-id"] == tags.meta["lab-version"] == ""
    assert "/* fixture: updates.js */" in html
    assert (source / "dist/Engagement_Lab_v0.2_Source.zip").is_file()
