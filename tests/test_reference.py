"""Boundary, provenance and display-contract checks for the R1 reference index."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.reference import FEATURES, FROZEN_BASELINE, align_inputs, build_payload, reference_score, sha256


def row(**changes):
    return {"days_since_last": 14, "active_days_28": 14,
            "overdue_fraction": 1, "no_due_assessment": 0, **changes}


def test_known_index_reconstructs_two_or_three_components():
    result = reference_score(row())
    assert result["score"] == pytest.approx(200 / 3)
    assert result["components"] == {"recency": .5, "sparsity": .5, "assessment": 1}
    assert result["component_count"] == 3
    no_due = reference_score(row(overdue_fraction=0, no_due_assessment=1))
    assert no_due["score"] == 50
    assert no_due["components"]["assessment"] is None
    assert no_due["component_count"] == 2
    # A submitted due assessment contributes a measured zero; no due assessment
    # is excluded. These are deliberately different observations.
    submitted = reference_score(row(overdue_fraction=0))
    assert submitted["score"] == pytest.approx(100 / 3)


def test_boundaries_keep_index_units_and_monotonicity():
    assert reference_score(row(days_since_last=0, active_days_28=28, overdue_fraction=0))["score"] == 0
    assert reference_score(row(days_since_last=28, active_days_28=0))["score"] == 100
    original = reference_score(row())["score"]
    assert reference_score(row(days_since_last=21))["score"] > original
    assert reference_score(row(active_days_28=7))["score"] > original
    assert reference_score(row(overdue_fraction=.5))["score"] < original


@pytest.mark.parametrize("field,value", [
    ("days_since_last", -1), ("days_since_last", 29), ("days_since_last", .5),
    ("active_days_28", 29), ("active_days_28", float("nan")),
    ("overdue_fraction", float("inf")), ("overdue_fraction", -.1), ("overdue_fraction", 1.1),
    ("no_due_assessment", 2), ("no_due_assessment", None),
])
def test_invalid_inputs_stop_scoring(field, value):
    with pytest.raises(ValueError):
        reference_score(row(**{field: value}))


def test_missing_inputs_and_inconsistent_assessment_state_are_not_imputed():
    for field in FEATURES:
        sample = row()
        del sample[field]
        with pytest.raises(ValueError, match="Missing"):
            reference_score(sample)
    with pytest.raises(ValueError, match="No assessment due"):
        reference_score(row(no_due_assessment=1))


def test_labels_sensitive_fields_and_future_information_cannot_change_score():
    unchanged = reference_score(row())
    assert reference_score(row(outcome=1, final_result="Withdrawn", gender="M", date_unregistration=30)) == unchanged
    assert reference_score(row(outcome=0, final_result="Distinction", gender="F", date_unregistration=200)) == unchanged


def test_v01_experiment_files_remain_byte_identical_to_release():
    for relative, expected_hash in FROZEN_BASELINE.items():
        assert sha256(ROOT / relative) == expected_hash, relative


@pytest.fixture(scope="module")
def frozen():
    return (json.loads((ROOT / "artifacts/demo_data.json").read_text()),
            pd.read_csv(ROOT / "artifacts/test_features.csv"))


def test_join_rejects_duplicate_absent_or_disagreeing_rows(frozen):
    base, features = frozen
    with pytest.raises(ValueError, match="unique"):
        align_inputs(base, pd.concat([features, features.iloc[:1]]))
    with pytest.raises(ValueError, match="populations"):
        align_inputs(base, features.iloc[1:])
    changed = features.copy()
    changed.loc[0, "outcome"] = 1 - changed.loc[0, "outcome"]
    with pytest.raises(ValueError, match="Outcome disagreement"):
        align_inputs(base, changed)
    changed = features.copy()
    changed.loc[0, "days_since_last"] = 28
    with pytest.raises(ValueError, match="Signal disagreement"):
        align_inputs(base, changed)
    duplicate_base = copy.deepcopy(base)
    duplicate_base["students"].append(duplicate_base["students"][0])
    with pytest.raises(ValueError, match="duplicate aliases"):
        align_inputs(duplicate_base, features)


def test_committed_overlay_and_provenance_are_consistent(frozen):
    base, features = frozen
    result_path = ROOT / "artifacts/v0.2/reference_results.json"
    assert result_path.exists(), "Generate v0.2 artifacts after committing its protocol"
    text = result_path.read_text(encoding="utf-8")
    payload = json.loads(text)
    expected = build_payload(base, features)
    expected["meta"]["protocol_commit"] = payload["meta"]["protocol_commit"]
    assert payload == expected
    assert (ROOT / "web/reference-data.js").read_text(encoding="utf-8") == "window.LAB_REFERENCE = " + text.rstrip("\n") + ";\n"
    manifest = json.loads((ROOT / "artifacts/v0.2/manifest.json").read_text())
    assert manifest["frozen_v0.1_sha256"] == FROZEN_BASELINE
    for section in ("inputs_sha256", "outputs_sha256", "frozen_v0.1_sha256"):
        for relative, expected_hash in manifest[section].items():
            assert sha256(ROOT / relative) == expected_hash, relative
    assert manifest["protocol_commit"] == payload["meta"]["protocol_commit"]
    csv = pd.read_csv(ROOT / "artifacts/v0.2/reference_scores.csv")
    assert csv.id.tolist() == [item["id"] for item in payload["records"]]
    np.testing.assert_allclose(csv.score, [item["score"] for item in payload["records"]], atol=1e-12)
    assert payload["model"]["metrics"]["brier"] is None
    assert payload["model"]["calibration"] == []
    assert payload["comparison"]["population_n"] == len(base["students"])
    assert {item["k"] for item in payload["comparison"]["models"]} == {637}


def test_input_order_does_not_change_ranking_or_case_selection(frozen):
    base, features = frozen
    reversed_base = {**base, "students": list(reversed(base["students"]))}
    assert build_payload(base, features) == build_payload(reversed_base, features.iloc[::-1])


def test_examples_use_declared_categories_and_first_alias(frozen):
    base, features = frozen
    payload = build_payload(base, features)
    records = base["students"]
    k = payload["comparison"]["k"]
    a = {item["id"] for item in sorted(records, key=lambda item: (-item["scores"]["activity"], item["id"]))[:k]}
    c = {item["id"] for item in sorted(records, key=lambda item: (-item["scores"]["context"], item["id"]))[:k]}
    expected_groups = {
        "C_only_withdrawal": [item["id"] for item in records if item["outcome"] == 1 and item["id"] in c - a],
        "both_miss_withdrawal": [item["id"] for item in records if item["outcome"] == 1 and item["id"] not in a | c],
        "C_false_positive": [item["id"] for item in records if item["outcome"] == 0 and item["id"] in c],
        "no_due_assessment": [item["id"] for item in records if item["signals"]["no_due_assessment"] == 1],
    }
    for case in payload["cases"]:
        group = expected_groups[case["kind"]]
        assert case["population_count"] == len(group)
        assert case["id"] == (min(group) if group else None)
