"""Build a reproducible static site with content-addressed application assets.

Only generated files named by a verified previous manifest may be replaced or
removed. Source files and unrelated files in a managed output are never deleted.
"""
from __future__ import annotations

import argparse
import hashlib
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
VERSION = "0.2"
ASSET_NAMES = ("app.js", "data.js", "reference-data.js", "updates.js", "styles.css")


def sha256(content):
    return hashlib.sha256(content).hexdigest()


def _revision(root, revision):
    if revision is None:
        revision = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=root, check=True,
            text=True, capture_output=True,
        ).stdout.strip()
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("revision must be a full, lowercase 40-character Git commit SHA")
    return revision


def _asset_path(name, digest):
    path = Path(name)
    return f"assets/{path.stem}.{digest[:12]}{path.suffix}"


class _SourceTags(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metas = {}
        self.assets = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "meta" and values.get("name") in ("lab-build-id", "lab-version"):
            self.metas.setdefault(values["name"], []).append((self.get_starttag_text(), values))
        if tag == "script" and "src" in values:
            self.assets.append((self.get_starttag_text(), "src", values["src"]))
        if tag == "link" and "stylesheet" in (values.get("rel") or "").split():
            self.assets.append((self.get_starttag_text(), "href", values.get("href")))

    handle_startendtag = handle_starttag


def _attribute(tag, attribute, value):
    pattern = re.compile(r"(\b" + attribute + r"\s*=\s*)([\"'])(.*?)\2", re.DOTALL | re.IGNORECASE)
    changed, count = pattern.subn(lambda match: match[1] + '"' + escape(value, quote=True) + '"', tag)
    if count != 1:
        raise ValueError(f"Expected one quoted {attribute} attribute in {tag!r}")
    return changed


def _render_html(source, assets, build_id):
    parser = _SourceTags()
    parser.feed(source)
    parser.close()
    html = source
    for name, value in (("lab-build-id", build_id), ("lab-version", VERSION)):
        entries = parser.metas.get(name, [])
        if len(entries) != 1 or entries[0][1].get("content") != "":
            raise ValueError(f"Source HTML needs exactly one empty {name} meta placeholder")
        tag = entries[0][0]
        html = html.replace(tag, _attribute(tag, "content", value), 1)
    names = [name for _, _, name in parser.assets]
    if sorted(names, key=str) != sorted(ASSET_NAMES):
        raise ValueError("Source HTML must reference each expected script and stylesheet exactly once")
    for tag, attribute, name in parser.assets:
        html = html.replace(tag, _attribute(tag, attribute, assets[name]["path"]), 1)
    return html.encode("utf-8")


def _output_path(root, output):
    candidate = root / "dist/site" if output is None else Path(output)
    if not candidate.is_absolute():
        candidate = root / candidate
    if candidate.is_symlink():
        raise ValueError("Output directory must not be a symbolic link")
    output = candidate.resolve()
    if output == root or output in root.parents:
        raise ValueError("Output must not be the repository or one of its parent directories")
    if root in output.parents and root / "dist" not in output.parents:
        raise ValueError("Output inside the repository must be a directory below dist/")
    if output.exists() and not output.is_dir():
        raise ValueError("Output must be a directory")
    if (output / "assets").is_symlink():
        raise ValueError("Generated assets directory must not be a symbolic link")
    return output


def _previous_files(output):
    """Recognise only this manifest format and verify every file before touching it."""
    if not output.exists() or not any(output.iterdir()):
        return {}
    manifest_path = output / "version.json"
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError("Nonempty output is not a previously generated site")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if (manifest["schema_version"] != 1 or manifest["version"] != VERSION
                or not re.fullmatch(r"[0-9a-f]{64}", manifest["build_id"])
                or not re.fullmatch(r"[0-9a-f]{40}", manifest["revision"])
                or set(manifest["assets"]) != set(ASSET_NAMES)
                or manifest["html"]["path"] != "index.html"):
            raise ValueError("Unrecognised site manifest")
        files = {"index.html": manifest["html"]["sha256"]}
        for name, asset in manifest["assets"].items():
            digest = asset["sha256"]
            if not re.fullmatch(r"[0-9a-f]{64}", digest) or asset["path"] != _asset_path(name, digest):
                raise ValueError("Unsafe asset entry in previous manifest")
            files[asset["path"]] = digest
        if not re.fullmatch(r"[0-9a-f]{64}", files["index.html"]):
            raise ValueError("Invalid HTML digest in previous manifest")
        for relative, digest in files.items():
            path = output / relative
            if path.is_symlink() or not path.is_file() or sha256(path.read_bytes()) != digest:
                raise ValueError(f"Previously generated file was changed or removed: {relative}")
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Nonempty output has no valid site manifest") from exc
    return files


def _write_atomic(path, content):
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".lab-build-", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(content)
            stream.close()
            temporary.chmod(0o644)
            temporary.replace(path)
        finally:
            if temporary.exists():
                temporary.unlink()


def build_site(root=ROOT, output=None, revision=None):
    """Return the version manifest after building; never modify web/ or artifacts/."""
    root = Path(root).resolve()
    revision = _revision(root, revision)
    output = _output_path(root, output)
    source = (root / "web/index.html").read_bytes()
    contents = {name: (root / "web" / name).read_bytes() for name in ASSET_NAMES}
    assets = {name: {"path": _asset_path(name, sha256(content)), "sha256": sha256(content)}
              for name, content in contents.items()}
    # Length-prefix each original input, so boundaries cannot be ambiguous.
    identity = hashlib.sha256(b"engagement-lab-site-v1\0" + VERSION.encode("ascii"))
    for name, content in [("revision", revision.encode("ascii")), ("index.html", source), *contents.items()]:
        identity.update(name.encode("utf-8") + b"\0")
        identity.update(len(content).to_bytes(8, "big") + content)
    build_id = identity.hexdigest()
    html = _render_html(source.decode("utf-8"), assets, build_id)
    manifest = {"schema_version": 1, "version": VERSION, "build_id": build_id,
                "revision": revision, "assets": assets,
                "html": {"path": "index.html", "sha256": sha256(html)}}
    old_files = _previous_files(output)
    new_files = {asset["path"]: contents[name] for name, asset in assets.items()}
    new_files["index.html"] = html
    for relative, content in new_files.items():
        path = output / relative
        if path.is_symlink() or (path.exists() and relative not in old_files
                                and (not path.is_file() or path.read_bytes() != content)):
            raise ValueError(f"Refusing to overwrite an unrelated output file: {relative}")
    output.mkdir(parents=True, exist_ok=True)
    (output / "assets").mkdir(exist_ok=True)
    for relative, content in new_files.items():
        _write_atomic(output / relative, content)
    _write_atomic(output / "version.json", (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8"))
    for relative in old_files.keys() - new_files.keys():
        (output / relative).unlink()
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Output directory (default: dist/site)")
    parser.add_argument("--revision", help="Full 40-character Git revision (default: current HEAD)")
    args = parser.parse_args()
    manifest = build_site(output=args.output, revision=args.revision)
    print(json.dumps({"version": manifest["version"], "build_id": manifest["build_id"],
                      "revision": manifest["revision"]}, indent=2))


if __name__ == "__main__":
    main()
