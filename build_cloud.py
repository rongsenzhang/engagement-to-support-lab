"""Stage the public demo and the tutor chat's day-28 evidence for Workers Assets."""

import csv
import json
import re
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from src.chat_evidence import get_evidence


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "dist" / "cloud-assets"
STATIC_FILES = (
    "index.html", "styles.css", "robustness.css", "study.css", "tutor-chat.css",
    "data.js", "reference-data.js", "robustness-data.js", "robustness.js",
    "record-context-data.js", "demo-identities.js", "study-data.js", "study.js", "tutor-chat.js", "app.js",
)
QUEUE_MODELS = ("inactivity", "activity", "trend", "context", "reference")
# Workers Free static asset limits, shared by the demo and the private evidence route.
MAX_FILES = 20_000
MAX_FILE_BYTES = 25 * 1024 * 1024


def stage(directory):
    for name in STATIC_FILES:
        path = ROOT / "web" / name
        if path.is_symlink():
            raise ValueError(f"Expected a regular web asset: {name}")
        shutil.copyfile(path, directory / name)

    evidence_dir = directory / "evidence"
    evidence_dir.mkdir()
    # The published queue population is keyed by an anonymous enrolment alias.
    # get_evidence applies the same field allowlist as the local chat server.
    with (ROOT / "artifacts" / "test_predictions.csv").open(encoding="utf-8", newline="") as table:
        for row in csv.DictReader(table):
            alias = row["id"]
            if not re.fullmatch(r"S-[0-9A-F]{10}", alias):
                raise ValueError("Invalid record alias in queue population")
            data = {model: get_evidence(alias, model) for model in QUEUE_MODELS}
            with (evidence_dir / f"{alias}.json").open("x", encoding="utf-8") as output:
                json.dump(data, output, ensure_ascii=False, allow_nan=False, separators=(",", ":"))

    files = [p for p in directory.rglob("*") if p.is_file()]
    largest = max(files, key=lambda path: path.stat().st_size)
    size = largest.stat().st_size
    if len(files) > MAX_FILES or size > MAX_FILE_BYTES:
        raise ValueError(f"Workers asset limits exceeded: {len(files)} files, largest {size} bytes")
    return len(files), largest.name, size


def main():
    OUT.parent.mkdir(exist_ok=True)
    with TemporaryDirectory(dir=OUT.parent) as temp:
        staging = Path(temp) / "new"
        staging.mkdir()
        count, largest, size = stage(staging)
        # Replace the generated tree only after every input was successfully built.
        previous = Path(temp) / "previous"
        if OUT.exists():
            OUT.rename(previous)
        try:
            staging.rename(OUT)
        except OSError:
            if previous.exists():
                previous.rename(OUT)
            raise
    print(f"Built {count} assets in {OUT}. Largest: {largest} ({size:,} bytes).")


if __name__ == "__main__":
    main()
