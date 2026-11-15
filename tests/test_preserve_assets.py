"""Exercise cached-page compatibility against real, isolated Git histories."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build_site import ASSET_NAMES, build_site
from preserve_assets import LEGACY_NAMES, preserve_assets


def git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root, stderr=subprocess.PIPE).decode().strip()


def commit(root, message):
    git(root, "add", "web")
    git(root, "commit", "-qm", message)
    return git(root, "rev-parse", "HEAD")


def hashed_path(name, data):
    digest = hashlib.sha256(data).hexdigest()
    return "assets/%s.%s%s" % (Path(name).stem, digest[:12], Path(name).suffix)


def snapshot(path):
    return {p.relative_to(path).as_posix(): p.read_bytes() for p in path.rglob("*") if p.is_file()}


@pytest.fixture
def history(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    git(root, "init", "-q", "-b", "main")
    git(root, "config", "user.name", "Compatibility Test")
    git(root, "config", "user.email", "test@example.invalid")
    web = root / "web"
    web.mkdir()
    (web / "index.html").write_text('''<!doctype html><html><head>
<meta name="lab-build-id" content=""><meta name="lab-version" content="">
<link rel="stylesheet" href="styles.css"></head><body>
<script src="data.js"></script><script src="reference-data.js"></script>
<script src="app.js"></script><script src="updates.js"></script></body></html>''')
    original = {name: ("/* legacy " + name + " */\n").encode() for name in LEGACY_NAMES}
    for name, data in original.items():
        (web / name).write_bytes(data)
    legacy = commit(root, "Last unversioned deployment")
    (web / "updates.js").write_bytes(b"/* update watcher */\n")
    app_first = b"/* first versioned app */\n"
    (web / "app.js").write_bytes(app_first)
    first = commit(root, "First versioned deployment")
    app_skipped = b"/* skipped deployment */\n"
    (web / "app.js").write_bytes(app_skipped)
    commit(root, "Changed app without deploying")
    # A normal rollback commit retains the earlier versioned content in history.
    (web / "app.js").write_bytes(original["app.js"])
    current = commit(root, "Rollback app while keeping versioned publishing")
    git(root, "checkout", "-qb", "unmerged", first)
    side_content = b"/* unmerged branch only */\n"
    (web / "app.js").write_bytes(side_content)
    commit(root, "This branch was never merged")
    git(root, "checkout", "-q", "main")
    manifest = build_site(root)
    return {"root": root, "legacy": legacy, "current": current, "original": original,
            "first": app_first, "skipped": app_skipped, "side": side_content,
            "build": manifest}


def test_retains_multiple_generations_skipped_deployments_and_rollback(history):
    root = history["root"]
    site = root / "dist/site"
    current_before = snapshot(site)
    source_before = snapshot(root / "web")
    compat = preserve_assets(root, legacy_revision=history["legacy"])
    assert set(compat) == {"schema_version", "source_revision", "legacy_revision", "assets"}
    assert compat["source_revision"] == history["current"]
    assert compat["legacy_revision"] == history["legacy"]
    assert compat["schema_version"] == 1
    for name in LEGACY_NAMES:
        assert (site / name).read_bytes() == history["original"][name]
    for data in (history["first"], history["skipped"]):
        relative = hashed_path("app.js", data)
        assert (site / relative).read_bytes() == data
        assert compat["assets"][relative] == hashlib.sha256(data).hexdigest()
    assert hashed_path("app.js", history["side"]) not in compat["assets"]
    assert not (site / hashed_path("app.js", history["side"])).exists()
    assert not set(compat["assets"]) & {a["path"] for a in history["build"]["assets"].values()}
    for relative, digest in compat["assets"].items():
        assert hashlib.sha256((site / relative).read_bytes()).hexdigest() == digest
    assert snapshot(root / "web") == source_before
    assert all((site / relative).read_bytes() == data for relative, data in current_before.items())


def test_first_parent_includes_merge_result_without_feature_intermediates(history):
    root = history["root"]
    git(root, "checkout", "-qb", "feature")
    intermediate = b"/* feature work in progress */\n"
    (root / "web/app.js").write_bytes(intermediate)
    commit(root, "Intermediate feature content")
    final = b"/* merged feature content */\n"
    (root / "web/app.js").write_bytes(final)
    commit(root, "Final feature content")
    git(root, "checkout", "-q", "main")
    git(root, "merge", "--no-ff", "-qm", "Merge feature", "feature")
    # A following main commit makes the merged application's hash historical.
    (root / "web/app.js").write_bytes(b"/* newer main content */\n")
    commit(root, "Next main version")
    build_site(root)
    compat = preserve_assets(root, legacy_revision=history["legacy"])
    assert hashed_path("app.js", final) in compat["assets"]
    assert hashed_path("app.js", intermediate) not in compat["assets"]
    assert hashed_path("app.js", history["side"]) not in compat["assets"]


def test_repeated_preparation_is_deterministic_and_preserves_unrelated_files(history):
    root = history["root"]
    site = root / "dist/site"
    extra = site / "owner-notes.txt"
    extra.write_text("keep this")
    first = preserve_assets(root, legacy_revision=history["legacy"])
    before = snapshot(site)
    assert preserve_assets(root, legacy_revision=history["legacy"]) == first
    assert snapshot(site) == before


@pytest.mark.parametrize("kind", ["legacy", "historical", "symlink", "manifest"])
def test_conflicting_existing_paths_are_not_overwritten(history, kind, tmp_path):
    root = history["root"]
    site = root / "dist/site"
    if kind == "manifest":
        target = site / "compatibility.json"
    elif kind == "historical":
        target = site / hashed_path("app.js", history["first"])
    else:
        target = site / "app.js"
    if kind == "symlink":
        real = tmp_path / "owner-file.js"
        real.write_bytes(b"owner data")
        target.symlink_to(real)
    else:
        target.write_bytes(b"owner data")
    before = snapshot(site)
    with pytest.raises(ValueError):
        preserve_assets(root, legacy_revision=history["legacy"])
    assert snapshot(site) == before
    if kind == "symlink":
        assert target.is_symlink() and real.read_bytes() == b"owner data"


def test_modified_previously_preserved_asset_is_not_overwritten(history):
    root = history["root"]
    preserve_assets(root, legacy_revision=history["legacy"])
    site = root / "dist/site"
    (site / "app.js").write_text("owner modification")
    before = snapshot(site)
    with pytest.raises(ValueError, match="changed"):
        preserve_assets(root, legacy_revision=history["legacy"])
    assert snapshot(site) == before


@pytest.mark.parametrize("problem", ["fake_revision", "blob_revision", "side_legacy", "unsafe_output", "unbuilt"])
def test_invalid_history_or_output_cannot_add_compatibility_files(history, problem):
    root = history["root"]
    site = root / "dist/site"
    legacy = history["legacy"]
    output = None
    if problem in ("fake_revision", "blob_revision"):
        manifest = history["build"].copy()
        manifest["revision"] = ("f" * 40 if problem == "fake_revision"
                                else git(root, "rev-parse", "HEAD:web/app.js"))
        (site / "version.json").write_text(json.dumps(manifest))
    elif problem == "side_legacy":
        legacy = git(root, "rev-parse", "unmerged")
    elif problem == "unsafe_output":
        output = root / "web"
    else:
        output = root / "dist/not-built"
    before = snapshot(site)
    with pytest.raises(ValueError):
        preserve_assets(root, output=output, legacy_revision=legacy)
    assert snapshot(site) == before
    assert not (site / "compatibility.json").exists()


def test_shallow_history_is_rejected(history, tmp_path):
    clone = tmp_path / "shallow"
    git(history["root"], "clone", "--quiet", "--depth", "1", history["root"].as_uri(), str(clone))
    build_site(clone)
    # Use the existing tip as the supplied legacy commit so the shallow guard,
    # rather than a missing legacy object, is what rejects the checkout.
    with pytest.raises(ValueError, match="shallow"):
        preserve_assets(clone, legacy_revision=history["current"])
