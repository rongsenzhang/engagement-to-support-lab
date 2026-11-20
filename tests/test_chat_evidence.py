import unittest
from unittest.mock import patch

from src.chat_evidence import SIGNALS, get_evidence


class RecordChatEvidenceTests(unittest.TestCase):
    def test_each_queue_method_keeps_its_original_units(self):
        record = "S-00041F76FE"
        context = get_evidence(record, "context")
        self.assertAlmostEqual(context["selected_estimate"]["value"], 0.15413719766716852)
        self.assertEqual(context["weekly_recorded_clicks"], [81, 29, 59, 10])
        self.assertEqual(get_evidence(record, "inactivity")["selected_estimate"]["value"], 2)
        self.assertAlmostEqual(get_evidence(record, "reference")["selected_estimate"]["value"], 15.476190476)
        for model in ("activity", "trend", "context"):
            self.assertTrue(get_evidence(record, model)["selected_estimate"]["contributions"])
        with self.assertRaises(ValueError):
            get_evidence(record, "outcome")
        with self.assertRaises(ValueError):
            get_evidence("../another-record", "context")

    def test_future_and_private_fields_do_not_pass_through(self):
        signals = dict.fromkeys(SIGNALS, 0)
        signals["new_sensitive_column"] = "PRIVATE"
        row = dict(module="BBB", presentation="2014J", weeks=[0]*4, signals=signals,
                   scores={"context": 0.1}, outcome="PRIVATE", notes="PRIVATE",
                   contributions={"context": [dict(label="example", contribution=0, later_grade="PRIVATE")]})
        with patch("src.chat_evidence._tables", return_value=({"alias": row}, {"context": "C"}, {})):
            self.assertNotIn("PRIVATE", str(get_evidence("alias", "context")))
