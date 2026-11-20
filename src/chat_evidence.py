"""Provide the selected tutor with the public facts visible at the day-28 cutoff."""

import json
from functools import lru_cache
from pathlib import Path

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"
SIGNALS = (
    "clicks_28", "active_days_28", "clicks_7", "active_days_7",
    "clicks_previous_7", "active_days_previous_7", "days_since_last",
    "no_activity", "due_count", "submitted_count", "overdue_count",
)


@lru_cache(maxsize=1)
def _tables():
    # Load the same published values as the queue, including the R overlay.
    with (ARTIFACTS / "demo_data.json").open(encoding="utf-8") as source:
        base = json.load(source)
    with (ARTIFACTS / "v0.2" / "reference_results.json").open(encoding="utf-8") as source:
        overlay = json.load(source)
    records = {row["id"]: row for row in base["students"]}
    models = {m["id"]: m["label"] for m in [*base["models"], overlay["model"]]}
    reference = {row["id"]: row for row in overlay["records"]}
    return records, models, reference


def get_evidence(record_id, model_id):
    """Build an explicit allowlist. Outcomes and cohort tables never enter the request."""
    records, models, reference = _tables()
    if not isinstance(record_id, str) or record_id not in records:
        raise ValueError("Unknown review record.")
    if not isinstance(model_id, str) or model_id not in models:
        raise ValueError("Unknown queue model.")
    row = records[record_id]
    signals = row["signals"]
    estimate = {"model": models[model_id]}
    if model_id == "reference":
        r = reference[record_id]
        estimate.update(
            value=r["score"], units="R1 review index (0 to 100)",
            rule="100 times the mean of applicable components; omit assessment when none was due.",
            components={k: r["components"][k] for k in ("assessment", "recency", "sparsity")},
        )
    elif model_id == "inactivity":
        estimate.update(
            value=row["scores"][model_id], units="days since last recorded activity",
            rule="A record with no activity in this window receives 28 days.",
        )
    else:
        estimate.update(
            value=row["scores"][model_id],
            units="estimated probability of later withdrawal from this module (0 to 1)",
            contribution_units="additive calibrated log-odds relative to training means",
            contributions=[{k: term[k] for k in ("label", "contribution")}
                           for term in row["contributions"][model_id]],
        )
    return {
        "source": "Historical public OULAD module enrolment",
        "module": row["module"], "presentation": row["presentation"], "cutoff_day": 28,
        "weekly_recorded_clicks": row["weeks"],
        "observed_signals": {k: signals[k] for k in SIGNALS},
        "selected_estimate": estimate,
    }
