"""Independent checks of the day-28 research prototype.

Run after building the artifacts with:
    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import math
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src import pipeline  # noqa: E402

MODEL_IDS = {"inactivity", "activity", "trend", "context"}
SENSITIVE_FIELDS = {"gender", "disability", "age_band", "imd_band", "region"}
LABEL_FIELDS = {"final_result", "date_unregistration", "outcome", "target", "label"}


def ranked(records, model_id):
    return sorted(records, key=lambda row: (-row["scores"][model_id], row["id"]))


class PointInTimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raw = Path(self.tmp.name)
        self.write("courses.csv", [
            {"code_module": module, "code_presentation": "2013B", "module_presentation_length": 100}
            for module in ("BBB", "DDD")
        ])
        information = []
        registration = []
        statuses = {1: (-5, 60), 2: (-3, None), 3: (-3, 28), 4: (29, None),
                    5: (None, None), 6: (-3, 101), 7: (-3, 27), 8: (-3, None),
                    9: (-3, 29), 10: (-5, None), 11: (-3, 100), 12: (28, None)}
        for student, (registered, withdrawn) in statuses.items():
            keys = {"id_student": student, "code_module": "DDD" if student == 10 else "BBB", "code_presentation": "2013B"}
            information.append({**keys, "gender": "F", "region": "London Region", "highest_education": "A Level or Equivalent",
                                "imd_band": "10-20", "age_band": "0-35", "num_of_prev_attempts": 0,
                                "studied_credits": 60, "disability": "N", "final_result": "Pass"})
            registration.append({**keys, "date_registration": registered, "date_unregistration": withdrawn})
        self.write("studentInfo.csv", information)
        self.write("studentRegistration.csv", registration)
        activity = []
        for student, date, clicks in [(1, -1, 999), (1, 0, 1000), (1, 1, 2), (1, 14, 3),
                                      (1, 15, 5), (1, 21, 7), (1, 22, 11), (1, 28, 13),
                                      (1, 29, 10000), (2, 35, 50), (8, 7, 1), (9, 20, 2)]:
            activity.append({"code_module": "BBB", "code_presentation": "2013B", "id_student": student,
                             "id_site": 123, "date": date, "sum_click": clicks})
        self.write("studentVle.csv", activity)
        self.write("assessments.csv", [
            {"code_module": "BBB", "code_presentation": "2013B", "id_assessment": assessment,
             "assessment_type": kind, "date": date, "weight": 10}
            for assessment, kind, date in [(100, "TMA", 10), (101, "CMA", 28),
                                           (102, "TMA", 29), (103, "Exam", None), (104, "TMA", None)]
        ])
        self.write("studentAssessment.csv", [
            {"id_assessment": assessment, "id_student": student, "date_submitted": date,
             "is_banked": banked, "score": 80}
            for student, assessment, date, banked in [(1, 100, 20, 0), (1, 101, 29, 0),
                                                      (1, 102, 27, 0), (8, 100, -1, 1),
                                                      (8, 101, -1, 1), (9, 100, 29, 1),
                                                      (2, 100, 30, 0), (11, 100, 28, 0)]
        ])

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, filename, rows):
        pd.DataFrame(rows).to_csv(self.raw / filename, index=False)

    def build(self):
        return pipeline.build_features(self.raw, cutoff=28, modules=["BBB", "DDD"])

    def test_eligibility_and_withdrawal_boundaries(self):
        df = self.build()
        self.assertEqual(set(df.id_student), {1, 2, 8, 9, 10, 11, 12})
        outcomes = df.set_index("id_student").outcome.to_dict()
        self.assertEqual(outcomes, {1: 1, 2: 0, 8: 0, 9: 1, 10: 0, 11: 1, 12: 0})
        counts = df.attrs["exclusions"]
        self.assertEqual(counts["missing_registration_date"], 1)
        self.assertEqual(counts["registered_after_snapshot"], 1)
        self.assertEqual(counts["withdrawn_by_snapshot"], 2)
        self.assertEqual(counts["withdrawal_after_course_end"], 1)

    def test_exact_activity_window_and_deadline_context(self):
        df = self.build().set_index("id_student")
        one = df.loc[1]
        self.assertEqual(one.clicks_28, 41)
        self.assertEqual(one.active_days_28, 6)
        self.assertEqual(one.days_since_last, 0)
        self.assertEqual(one.clicks_7, 24)
        self.assertEqual(one.clicks_previous_7, 12)
        self.assertEqual([one[f"week_{i}"] for i in range(1, 5)], [2, 3, 12, 24])
        self.assertAlmostEqual(one.log_activity_ratio, math.log1p(24) - math.log1p(12))
        self.assertEqual(one.due_count, 2)
        self.assertEqual(one.submitted_count, 1)
        self.assertEqual(one.overdue_fraction, .5)
        self.assertEqual(df.loc[2, "no_activity"], 1)
        self.assertEqual(df.loc[2, "days_since_last"], 28)
        self.assertEqual(df.loc[8, "overdue_count"], 0)  # Banked at day -1 is known.
        self.assertEqual(df.loc[9, "overdue_count"], 2)  # A future banked record is unknown.
        self.assertEqual(df.loc[10, "no_due_assessment"], 1)
        self.assertEqual(df.loc[10, "overdue_fraction"], 0)

    def test_future_events_marks_and_final_results_cannot_change_features(self):
        before = self.build()
        vle = pd.read_csv(self.raw / "studentVle.csv")
        vle.loc[vle.date > 28, "sum_click"] = 999999999
        vle.loc[vle.date > 28, "date"] = 90
        pd.concat([vle, pd.DataFrame([{"code_module": "DDD", "code_presentation": "2013B", "id_student": 10,
                                      "id_site": 999, "date": 29, "sum_click": 500000}])]).to_csv(self.raw / "studentVle.csv", index=False)
        subs = pd.read_csv(self.raw / "studentAssessment.csv")
        subs.loc[subs.date_submitted > 28, "date_submitted"] = 99
        subs.loc[subs.date_submitted > 28, "is_banked"] = 1
        subs["score"] = 0
        subs.to_csv(self.raw / "studentAssessment.csv", index=False)
        info = pd.read_csv(self.raw / "studentInfo.csv")
        info["final_result"] = "Withdrawn"
        info.to_csv(self.raw / "studentInfo.csv", index=False)
        after = self.build()
        columns = ["id", "outcome"] + pipeline.FEATURE_GROUPS["context"] + [f"week_{i}" for i in range(1, 5)]
        pd.testing.assert_frame_equal(before[columns], after[columns])

    def test_student_ids_do_not_cross_temporal_blocks(self):
        rows = [(1, "2013B"), (1, "2013J"), (1, "2014B"), (1, "2014J"),
                (2, "2014B"), (2, "2014J"), (3, "2014J")]
        frame = pd.DataFrame([{"id_student": student, "code_presentation": presentation,
                               "id": f"S-{index:02d}"} for index, (student, presentation) in enumerate(rows)])
        splits, removed = pipeline.split_data(frame)
        self.assertEqual(removed, {"train": 0, "validation": 1, "test": 2})
        self.assertEqual(set(splits["train"].id_student), {1})
        self.assertEqual(set(splits["validation"].id_student), {2})
        self.assertEqual(set(splits["test"].id_student), {3})
        self.assertEqual(len(splits["train"]), 2)  # Within-training enrolments are allowed.

    def test_predictor_allowlist_excludes_labels_future_and_sensitive_fields(self):
        forbidden = SENSITIVE_FIELDS | LABEL_FIELDS | {"score", "date_submitted", "id_student", "id"}
        for features in pipeline.FEATURE_GROUPS.values():
            self.assertFalse(set(features) & forbidden)
        self.assertTrue(set(pipeline.FEATURE_GROUPS["activity"]) < set(pipeline.FEATURE_GROUPS["trend"]))
        self.assertTrue(set(pipeline.FEATURE_GROUPS["trend"]) < set(pipeline.FEATURE_GROUPS["context"]))

    def test_rank_ties_use_alias_and_capacity_rounds_up(self):
        scores = np.array([.5, .8, .8, .5, .1])
        ids = np.array(["S-D", "S-C", "S-A", "S-B", "S-E"])
        self.assertEqual(pipeline.top_indices(scores, ids, .4).tolist(), [2, 1])
        result = pipeline.capacity_metrics(np.array([1, 0, 1, 0, 0]), scores, ids, 30)
        self.assertEqual(result["k"], 2)
        self.assertEqual(result["tp"], 1)
        self.assertEqual(result["precision"], .5)
        self.assertEqual(result["recall"], .5)


class ArtifactContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = ROOT / "artifacts" / "demo_data.json"
        if not path.exists():
            raise AssertionError("Build artifacts/demo_data.json before running the final checks")
        cls.data = json.loads(path.read_text())
        cls.records = cls.data["students"]
        cls.models = {model["id"]: model for model in cls.data["models"]}

    def test_contract_is_complete_and_population_is_not_sampled(self):
        self.assertTrue({"meta", "models", "students", "audit", "research", "checks"} <= self.data.keys())
        self.assertEqual(set(self.models), MODEL_IDS)
        self.assertEqual(self.data["meta"]["cutoff_day"], 28)
        self.assertIn(self.data["meta"]["default_model"], MODEL_IDS - {"inactivity"})
        self.assertEqual(len(self.records), self.data["meta"]["splits"]["test"]["n"])
        self.assertEqual(sum(row["outcome"] for row in self.records), self.data["meta"]["splits"]["test"]["positives"])
        self.assertEqual(len({row["id"] for row in self.records}), len(self.records))
        self.assertTrue(all(row["presentation"] == "2014J" for row in self.records))

    def test_scores_are_finite_and_rule_keeps_its_units(self):
        for row in self.records:
            self.assertEqual(set(row["scores"]), MODEL_IDS)
            self.assertIn(row["outcome"], (0, 1))
            self.assertEqual(row["scores"]["inactivity"], row["signals"]["days_since_last"])
            self.assertTrue(all(math.isfinite(score) for score in row["scores"].values()))
            for model_id in MODEL_IDS - {"inactivity"}:
                self.assertGreaterEqual(row["scores"][model_id], 0.0)
                self.assertLessEqual(row["scores"][model_id], 1.0)
        self.assertIsNone(self.models["inactivity"]["metrics"]["brier"])

    def test_capacity_counts_and_metrics_match_visible_records(self):
        n = len(self.records)
        positives = sum(row["outcome"] for row in self.records)
        for model_id, model in self.models.items():
            ordered = ranked(self.records, model_id)
            capacities = model["capacity"]
            self.assertEqual({row["percent"] for row in capacities}, {5, 10, 15, 20, 30, 40, 50})
            for capacity in capacities:
                k = capacity["k"]
                self.assertTrue(1 <= k <= n)
                # Do not silently accept a capacity percentage selecting a different population.
                self.assertLessEqual(abs(k - n * capacity["percent"] / 100), 1.0)
                tp = sum(row["outcome"] for row in ordered[:k])
                self.assertEqual(capacity["tp"], tp)
                self.assertEqual(capacity["fp"], k - tp)
                self.assertAlmostEqual(capacity["precision"], tp / k, places=7)
                self.assertAlmostEqual(capacity["recall"], tp / positives, places=7)
            ten = next(row for row in capacities if row["percent"] == 10)
            self.assertAlmostEqual(model["metrics"]["precision_at_10pct"], ten["precision"], places=7)
            self.assertAlmostEqual(model["metrics"]["recall_at_10pct"], ten["recall"], places=7)

    def test_brier_scores_are_reproducible_from_payload(self):
        for model_id in MODEL_IDS - {"inactivity"}:
            expected = sum((row["scores"][model_id] - row["outcome"]) ** 2 for row in self.records) / len(self.records)
            self.assertAlmostEqual(self.models[model_id]["metrics"]["brier"], expected, places=7)

    def test_explanations_reconstruct_calibrated_probability(self):
        for model_id in MODEL_IDS - {"inactivity"}:
            model = self.models[model_id]
            for row in self.records:
                terms = row["contributions"][model_id]
                self.assertEqual({term["feature"] for term in terms}, set(model["features"]))
                self.assertEqual([term["contribution"] for term in terms],
                                 sorted((term["contribution"] for term in terms), reverse=True))
                logit = model["intercept"] + sum(term["contribution"] for term in terms)
                if logit >= 0:
                    probability = 1 / (1 + math.exp(-logit))
                else:
                    exp_logit = math.exp(logit)
                    probability = exp_logit / (1 + exp_logit)
                self.assertAlmostEqual(probability, row["scores"][model_id], places=9)

    def test_calibration_bins_cover_the_entire_test_population(self):
        for model_id in MODEL_IDS - {"inactivity"}:
            bins = self.models[model_id]["calibration"]
            self.assertEqual(sum(row["n"] for row in bins), len(self.records))
            for row in bins:
                self.assertGreater(row["n"], 0)
                self.assertTrue(0 <= row["mean_pred"] <= 1)
                self.assertTrue(0 <= row["observed"] <= 1)

    def test_sensitive_and_label_data_are_not_predictors(self):
        for model_id, model in self.models.items():
            features = set(model["features"])
            self.assertFalse(features & SENSITIVE_FIELDS)
            self.assertFalse(features & LABEL_FIELDS)
        for row in self.records:
            self.assertFalse(SENSITIVE_FIELDS & row.keys())
            self.assertNotIn("id_student", row)
            self.assertNotIn("date_unregistration", row)
            self.assertNotIn("final_result", row)
            self.assertFalse(SENSITIVE_FIELDS & row["signals"].keys())
            self.assertFalse(LABEL_FIELDS & row["signals"].keys())

    def test_subgroup_audit_is_suppressed_and_arithmetically_consistent(self):
        for row in self.data["audit"]:
            self.assertGreaterEqual(row["n"], 100)
            self.assertGreaterEqual(row["positives"], 20)
            self.assertGreaterEqual(row["n"] - row["positives"], 20)
            self.assertEqual(row["tp"] + row["fn"], row["positives"])
            self.assertEqual(row["tp"] + row["fp"], row["flagged"])
            self.assertAlmostEqual(row["recall"], row["tp"] / row["positives"], places=7)
            self.assertAlmostEqual(row["fpr"], row["fp"] / (row["n"] - row["positives"]), places=7)
            if row["flagged"]:
                self.assertAlmostEqual(row["precision"], row["tp"] / row["flagged"], places=7)

    def test_browser_payload_matches_audited_json(self):
        script = (ROOT / "web" / "data.js").read_text()
        prefix = "window.LAB_DATA"
        self.assertTrue(script.lstrip().startswith(prefix))
        payload = script.split("=", 1)[1].strip().removesuffix(";")
        self.assertEqual(json.loads(payload), self.data)


if __name__ == "__main__":
    unittest.main()
