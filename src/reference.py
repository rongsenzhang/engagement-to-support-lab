"""R1: an independently specified review index and retrospective comparison.

This is not Kortext's algorithm and it does not estimate a probability.  It uses
only the four named day-28 inputs, with no fitting, calibration or selection.
"""
from __future__ import annotations

import hashlib
import json
import math
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd

from src.pipeline import capacity_metrics, evaluate, top_indices

ROOT = Path(__file__).resolve().parents[1]
BASELINE_COMMIT = "8324bae98803512329ecb407a07ad124108671d8"
FEATURES = ("days_since_last", "active_days_28", "overdue_fraction", "no_due_assessment")
PERCENTAGES = (5, 10, 15, 20, 30, 40, 50)
MODEL_IDS = ("inactivity", "activity", "trend", "context")
# SHA-256 values read from the tagged experiment commit, not from a new build.
FROZEN_BASELINE = {
    "artifacts/demo_data.json": "01bc4e705340f7264f72b030eb7116414b1c822e070ef28e577f4192214f5918",
    "artifacts/metrics.json": "14042f81a9a5de14902234817ef4a72512078648c6f557c7911e486639dca684",
    "artifacts/models.joblib": "456d5901ce8a4ed41e4f439924fe6a46b53d119f1a27bf0485b0cc2190a62a8c",
    "artifacts/test_features.csv": "076bbdf87ffe0aa7275e47cda6e1a812da9ef09e5e1dddd24f782d7bc4cbeca2",
    "artifacts/test_predictions.csv": "38b001d18a17af329a518f245268cc1e01c0fdf6cd2a8923a16ea28d4c8acd90",
    "artifacts/train_features.csv": "b6f2ad03a77711a03de2664935fb214a979a52d686e4538391e5036302c79719",
    "artifacts/validation_features.csv": "ae12a58ec2e58fd3b805d8ac3c2ecdd068f15f465cce7772397ff04d8a0fd95c",
    "web/data.js": "c5bd8c875b5b57f62976774792f0b8ad74a9c740e9b73761c96e987de96c3bbe",
    "src/pipeline.py": "6da2933297ad5aa0096cc02259c11e5726377f9acb6139883dd369d760a80c36",
    "docs/protocol.md": "5a471cdd5d5f8d31d1e6bce8c31f0cc33ef5389b39042e14063680e9614c7158",
}


def reference_score(row):
    """Return the score and its reconstructible components; reject absent inputs.

    A component is excluded only when no assessment was due.  An absent or
    malformed input is an error, never evidence of low engagement.  Fields
    outside FEATURES, including outcomes, are not consulted.
    """
    values = {}
    for field in FEATURES:
        if field not in row or row[field] is None:
            raise ValueError(f"Missing reference input: {field}")
        try:
            value = float(row[field])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid reference input: {field}") from exc
        if not math.isfinite(value):
            raise ValueError(f"Non-finite reference input: {field}")
        values[field] = value
    for field in ("days_since_last", "active_days_28"):
        value = values[field]
        if not 0 <= value <= 28 or not value.is_integer():
            raise ValueError(f"{field} must be an integer in 0..28")
    if not 0 <= values["overdue_fraction"] <= 1:
        raise ValueError("overdue_fraction must be in 0..1")
    if values["no_due_assessment"] not in (0, 1):
        raise ValueError("no_due_assessment must be 0 or 1")
    if values["no_due_assessment"] == 1 and values["overdue_fraction"] != 0:
        raise ValueError("No assessment due requires an overdue_fraction of zero")
    components = {
        "recency": values["days_since_last"] / 28,
        "sparsity": 1 - values["active_days_28"] / 28,
        "assessment": None if values["no_due_assessment"] else values["overdue_fraction"],
    }
    observed = [value for value in components.values() if value is not None]
    return {"score": 100 * sum(observed) / len(observed),
            "components": components, "component_count": len(observed)}


def align_inputs(base, features):
    """Check a complete one-to-one join before using features or stored outcomes."""
    required = {"id", "code_module", "code_presentation", "outcome", *FEATURES}
    if not required <= set(features.columns):
        raise ValueError(f"Missing feature columns: {sorted(required - set(features.columns))}")
    if features.id.isna().any() or not features.id.is_unique:
        raise ValueError("Feature aliases must be present and unique")
    students = base.get("students", [])
    if not students:
        raise ValueError("The frozen population cannot be empty")
    ids = [row["id"] for row in students]
    if len(set(ids)) != len(ids):
        raise ValueError("Frozen payload contains duplicate aliases")
    if set(ids) != set(features.id):
        raise ValueError("Feature and payload populations do not match")
    if base["meta"]["cutoff_day"] != 28:
        raise ValueError("R1 is specified only for the day-28 snapshot")
    if {model["id"] for model in base["models"]} != set(MODEL_IDS):
        raise ValueError("Expected the four unchanged v0.1 comparison models")
    records = sorted(students, key=lambda row: row["id"])
    frame = features.set_index("id").loc[[row["id"] for row in records]].reset_index()
    for record, row in zip(records, frame.to_dict("records")):
        if record["outcome"] not in (0, 1) or row["outcome"] not in (0, 1):
            raise ValueError("Outcomes must be binary")
        if record["outcome"] != row["outcome"]:
            raise ValueError(f"Outcome disagreement for {record['id']}")
        if record["module"] != row["code_module"] or record["presentation"] != row["code_presentation"]:
            raise ValueError(f"Population identity disagreement for {record['id']}")
        # Catch stale or independently edited inputs rather than trusting a join
        # on aliases alone.  Scoring itself remains outcome-independent.
        reference_score(row)
        for field in FEATURES:
            if not math.isclose(float(record["signals"][field]), float(row[field]), rel_tol=0, abs_tol=1e-12):
                raise ValueError(f"Signal disagreement for {record['id']}: {field}")
        for model_id in MODEL_IDS:
            if not math.isfinite(float(record["scores"][model_id])):
                raise ValueError(f"Non-finite frozen prediction for {record['id']}")
    return records, frame


def build_payload(base, features):
    """Compare R1 with frozen outputs; never refit or choose a default model."""
    students, frame = align_inputs(base, features)
    records = [{"id": row["id"], **reference_score(row)} for row in frame.to_dict("records")]
    ids = np.asarray([row["id"] for row in students])
    outcomes = np.asarray([row["outcome"] for row in students], dtype=int)
    scores = np.asarray([row["score"] for row in records])
    model = {
        "id": "reference", "label": "R · Transparent reference", "kind": "index",
        "features": list(FEATURES), "metrics": evaluate(outcomes, scores, ids, probability=False),
        "validation_metrics": None, "calibration": [], "coefficients": [],
        "capacity": [capacity_metrics(outcomes, scores, ids, percent) for percent in PERCENTAGES],
    }
    frozen_models = {item["id"]: item for item in base["models"]}
    comparisons = []
    selected_sets = {}
    for model_id in (*MODEL_IDS, "reference"):
        score_values = scores if model_id == "reference" else np.asarray([row["scores"][model_id] for row in students])
        probability = model_id in ("activity", "trend", "context")
        metrics = evaluate(outcomes, score_values, ids, probability=probability)
        capacity = capacity_metrics(outcomes, score_values, ids, 10)
        selected_sets[model_id] = set(ids[top_indices(score_values, ids, .1)])
        label = model["label"] if model_id == "reference" else frozen_models[model_id]["label"]
        comparisons.append({"id": model_id, "label": label, **metrics, **capacity,
                            "fn": int(outcomes.sum()) - capacity["tp"]})
    a, c = selected_sets["activity"], selected_sets["context"]
    case_definitions = [
        ("C_only_withdrawal", "C includes; A misses", "Subsequent module withdrawal; selected by C but not A at the same 10% review capacity.",
         lambda row: row["outcome"] == 1 and row["id"] in c and row["id"] not in a),
        ("both_miss_withdrawal", "Both A and C miss", "Subsequent module withdrawal; outside both A and C review lists at 10% capacity.",
         lambda row: row["outcome"] == 1 and row["id"] not in a and row["id"] not in c),
        ("C_false_positive", "C includes; no withdrawal", "Selected by C at 10% capacity, with no subsequent module withdrawal recorded. This does not establish whether support was needed.",
         lambda row: row["outcome"] == 0 and row["id"] in c),
        ("no_due_assessment", "No assessment due", "No eligible assessment due by day 28. R1 averages two activity components; it does not invent an assessment observation.",
         lambda row: row["signals"]["no_due_assessment"] == 1),
    ]
    cases = []
    for kind, label, description, predicate in case_definitions:
        matching = [row["id"] for row in students if predicate(row)]
        cases.append({"kind": kind, "label": label, "description": description,
                      "id": matching[0] if matching else None, "population_count": len(matching)})
    return {
        "meta": {
            "version": "0.2.0", "score_spec": "R1", "cutoff_day": 28,
            "evaluation_status": "exploratory", "baseline_commit": BASELINE_COMMIT,
            "target": base["meta"]["target"],
            "units": "0–100 review index; higher values rank first; not a probability",
            "formula": "100 × mean(days_since_last/28, 1-active_days_28/28, overdue_fraction when an assessment was due)",
            "selection_rule": "Equal component weights fixed by specification; no fitting, tuning, calibration or model selection.",
            "case_selection": "Lexicographically smallest alias per specified day-28 category. The first three A/C cases use the global top-10% lists; the no-assessment-due case uses the entire cohort. Categories may overlap and are not representative samples.",
            "evaluation_note": "2014J outcomes were inspected in v0.1. This is a retrospective exploratory comparison, not a new untouched test or evidence of intervention benefit.",
            "missingness_note": "An absent/invalid required input stops generation. No assessment due excludes that component; a zero recorded activity count does not establish a complete data feed or absence of offline learning.",
            "proprietary_boundary": "R1 is our transparent reference design, not a reconstruction or benchmark of Kortext's proprietary scoring.",
        },
        "model": model, "records": records, "cases": cases,
        "comparison": {"population_n": len(students), "positives": int(outcomes.sum()),
                       "percent": 10, "k": comparisons[0]["k"], "models": comparisons},
    }


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def protocol_revision(root):
    """Require the protocol to have been committed before generating results."""
    relative = "docs/protocol_v0.2.md"
    result = subprocess.run(["git", "log", "-1", "--format=%H", "--", relative],
                            cwd=root, check=True, text=True, capture_output=True)
    revision = result.stdout.strip()
    if not revision:
        raise ValueError("Commit docs/protocol_v0.2.md before generating the comparison")
    committed = subprocess.run(["git", "show", f"{revision}:{relative}"], cwd=root,
                               check=True, capture_output=True).stdout
    if committed != (root / relative).read_bytes():
        raise ValueError("The current protocol differs from its committed revision")
    return revision


def build_reference(root=ROOT):
    """Write a deterministic overlay and provenance without editing v0.1 files."""
    root = Path(root)
    revision = protocol_revision(root)
    for relative, expected_hash in FROZEN_BASELINE.items():
        if sha256(root / relative) != expected_hash:
            raise ValueError(f"Frozen v0.1 file changed: {relative}")
    base_path, feature_path = root / "artifacts/demo_data.json", root / "artifacts/test_features.csv"
    base = json.loads(base_path.read_text(encoding="utf-8"))
    features = pd.read_csv(feature_path, dtype={"id": str})
    payload = build_payload(base, features)
    payload["meta"]["protocol_commit"] = revision
    output = root / "artifacts/v0.2"
    output.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    (output / "reference_results.json").write_text(text + "\n", encoding="utf-8")
    (root / "web/reference-data.js").write_text("window.LAB_REFERENCE = " + text + ";\n", encoding="utf-8")
    pd.DataFrame([{"id": row["id"], "score": row["score"], **row["components"],
                   "component_count": row["component_count"]} for row in payload["records"]]).to_csv(
                       output / "reference_scores.csv", index=False, lineterminator="\n")
    inputs = ("docs/protocol_v0.2.md", "artifacts/demo_data.json", "artifacts/test_features.csv",
              "src/reference.py", "src/pipeline.py", "build_reference.py", "requirements.txt")
    outputs = ("artifacts/v0.2/reference_results.json", "artifacts/v0.2/reference_scores.csv", "web/reference-data.js")
    manifest = {
        "version": "0.2.0", "score_spec": "R1", "baseline_commit": BASELINE_COMMIT,
        "protocol_commit": revision, "evaluation_status": "exploratory",
        "frozen_v0.1_sha256": FROZEN_BASELINE,
        "command": "python build_reference.py", "randomness": "None; no model fitting or resampling.",
        "csv_nulls": "An empty assessment cell in reference_scores.csv means not applicable (no assessment due), matching JSON null; it is not a zero or an unknown input.",
        "inputs_sha256": {name: sha256(root / name) for name in inputs},
        "outputs_sha256": {name: sha256(root / name) for name in outputs},
        "population_n": payload["comparison"]["population_n"],
        "note": "The protocol commit and input/code hashes identify this experiment without a self-referential output commit hash. The containing Git commit versions this manifest.",
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload
