"""Retain main-history assets so cached earlier HTML can still load its files.

Git blobs are copied as data; historical code is never executed. The current
version.json remains unchanged and compatibility.json records the extra files.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess

from build_site import ASSET_NAMES, ROOT, _asset_path, _output_path, _previous_files, _write_atomic, sha256

DEFAULT_LEGACY_REVISION = "c648e192fa9dd629cb70ff4fb61c11296e506ca1"
LEGACY_NAMES = ("app.js", "data.js", "reference-data.js", "styles.css")


def _git(root, *args):
    try:
        return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True).stdout
    except subprocess.CalledProcessError as exc:
        raise ValueError("Required Git history is unavailable: " + exc.stderr.decode("utf-8", errors="replace").strip()) from exc


def _commit(root, revision):
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Compatibility revisions must be full lowercase Git commit SHAs")
    if _git(root, "cat-file", "-t", revision).strip() != b"commit":
        raise ValueError("Compatibility revision must name an actual Git commit")
    return revision


def _tree_assets(root, revision):
    entries = _git(root, "ls-tree", "-z", revision, "--", *["web/" + name for name in ASSET_NAMES])
    result = {}
    for entry in entries.split(b"\0"):
        if not entry:
            continue
        metadata, path = entry.split(b"\t", 1)
        mode, kind, object_id = metadata.decode("ascii").split()
        if kind != "blob" or mode not in ("100644", "100755"):
            raise ValueError("Historical application assets must be regular files")
        result[path.decode("utf-8").removeprefix("web/")] = object_id
    return result


def _existing_compatibility(output):
    path = output / "compatibility.json"
    if not path.exists() and not path.is_symlink():
        return
    if path.is_symlink() or not path.is_file():
        raise ValueError("Refusing to replace an unrelated compatibility manifest")
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
        if (not isinstance(old, dict) or old.get("schema_version") != 1
                or not isinstance(old.get("assets"), dict)
                or any(not isinstance(old.get(key), str) or not re.fullmatch(r"[0-9a-f]{40}", old[key])
                       for key in ("source_revision", "legacy_revision"))):
            raise ValueError("Unrecognised existing compatibility manifest")
        for relative, digest in old["assets"].items():
            if (not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest)
                    or (relative not in LEGACY_NAMES
                        and relative not in {_asset_path(name, digest) for name in ASSET_NAMES})):
                raise ValueError("Unsafe existing compatibility asset")
            asset = output / relative
            if asset.is_symlink() or not asset.is_file() or sha256(asset.read_bytes()) != digest:
                raise ValueError("Existing compatibility asset was changed: " + relative)
    except (json.JSONDecodeError, UnicodeError) as exc:
        raise ValueError("Refusing to replace an unrelated compatibility manifest") from exc


def preserve_assets(root=ROOT, output=None, legacy_revision=DEFAULT_LEGACY_REVISION):
    """Add ancestor/legacy resources to an already built site without deleting files."""
    root = Path(root).resolve()
    output = _output_path(root, output)
    current_files = _previous_files(output)
    if not current_files:
        raise ValueError("Build the current site before preserving compatibility assets")
    current = json.loads((output / "version.json").read_text(encoding="utf-8"))
    revision = _commit(root, current["revision"])
    legacy_revision = _commit(root, legacy_revision)
    if _git(root, "rev-parse", "--is-shallow-repository").strip() != b"false":
        raise ValueError("Compatibility preservation requires full Git history, not a shallow checkout")
    ancestors = _git(root, "rev-list", "--first-parent", revision).decode("ascii").splitlines()
    if legacy_revision not in ancestors:
        raise ValueError("Legacy revision must be in the current build's first-parent history")
    current_paths = {entry["path"] for entry in current["assets"].values()}
    blobs = {}
    files = {}

    def read_blob(object_id):
        if object_id not in blobs:
            blobs[object_id] = _git(root, "cat-file", "blob", object_id)
        return blobs[object_id]

    for ancestor in ancestors:
        for name, object_id in _tree_assets(root, ancestor).items():
            content = read_blob(object_id)
            relative = _asset_path(name, sha256(content))
            if relative not in current_paths:
                if relative in files and files[relative] != content:
                    raise ValueError("Historical asset filename hash collision")
                files[relative] = content
    legacy = _tree_assets(root, legacy_revision)
    if not set(LEGACY_NAMES) <= set(legacy):
        raise ValueError("Legacy revision does not contain all four unversioned assets")
    for name in LEGACY_NAMES:
        files[name] = read_blob(legacy[name])
    manifest = {"schema_version": 1, "source_revision": revision,
                "legacy_revision": legacy_revision,
                "assets": {relative: sha256(content) for relative, content in sorted(files.items())}}
    _existing_compatibility(output)
    for relative, content in files.items():
        path = output / relative
        if path.is_symlink() or (path.exists() and (not path.is_file() or path.read_bytes() != content)):
            raise ValueError("Refusing to overwrite a mismatching compatibility asset: " + relative)
    for relative, content in sorted(files.items()):
        if not (output / relative).exists():
            _write_atomic(output / relative, content)
    _write_atomic(output / "compatibility.json", (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8"))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Existing built site (default: dist/site)")
    parser.add_argument("--legacy-revision", default=DEFAULT_LEGACY_REVISION,
                        help="Full Git revision of the last unversioned deployment")
    args = parser.parse_args()
    manifest = preserve_assets(output=args.output, legacy_revision=args.legacy_revision)
    print(json.dumps({"source_revision": manifest["source_revision"],
                      "compatibility_assets": len(manifest["assets"])}, indent=2))


if __name__ == "__main__":
    main()
