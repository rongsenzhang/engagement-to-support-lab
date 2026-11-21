import csv
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from build_record_context import build_context
from src.chat_evidence import _record_context, get_evidence
from src.pipeline import alias


def write_csv(folder, name, columns, rows):
    with (folder / name).open("w", newline="") as out:
        writer = csv.writer(out)
        writer.writerow(columns.split())
        writer.writerows(rows)


def test_all_published_evidence_matches_existing_records():
    root = Path(__file__).resolve().parents[1]
    records = json.loads((root / "artifacts/demo_data.json").read_text())["students"]
    context = _record_context()
    assert set(context) == {r["id"] for r in records}
    for record in records:
        item = context[record["id"]]
        signals = record["signals"]
        assert sum(item["clicks_by_activity"].values()) == signals["clicks_28"]
        assert (item["peak_day"] is None) == (signals["clicks_28"] == 0)
        assert item["peak_day_clicks"] <= signals["clicks_28"]
        assert len(item["assessments"]) == signals["due_count"]
        assert sum(a["status"] == "no submission recorded" for a in item["assessments"]) == signals["overdue_count"]
    selected = get_evidence("S-E3772FEB3C", "context")["engagement_context"]
    assert selected["resources_opened"] == 32
    assert selected["peak_day"] == 28 and selected["peak_day_clicks"] == 177
    assert selected["assessments"] == [{"kind":"TMA", "due_day":24, "status":"no submission recorded"}]


def test_raw_overlay_respects_time_windows_credit_and_resource_joins():
    with TemporaryDirectory() as directory:
        raw = Path(directory)
        m, p = "FFF", "2014J"
        write_csv(raw, "studentRegistration.csv", "code_module code_presentation id_student", [
            [m, p, 1], [m, p, 2], [m, "2013J", 1],
        ])
        write_csv(raw, "vle.csv", "code_module code_presentation id_site activity_type", [
            [m, p, 44, "forumng"], [m, p, 45, "quiz"], [m, "2013J", 44, "homepage"],
        ])
        write_csv(raw, "studentVle.csv", "code_module code_presentation id_student id_site date sum_click", [
            [m, p, 1, 44, 0, 100], [m, p, 1, 44, 1, 3], [m, p, 1, 45, 28, 3],
            [m, p, 1, 45, 29, 100], [m, "2013J", 1, 44, 2, 50], [m, p, 2, 44, 4, 0],
        ])
        write_csv(raw, "assessments.csv", "code_module code_presentation id_assessment assessment_type date", [
            [m, p, 91, "TMA", 17], [m, p, 92, "CMA", 28], [m, p, 93, "CMA", 29],
            [m, p, 94, "Exam", 10], [m, p, 95, "TMA", "?"],
        ])
        write_csv(raw, "studentAssessment.csv", "id_student id_assessment date_submitted is_banked score", [
            [1, 91, 29, 0, 95], [1, 92, -1, 1, 98], [1, 93, 11, 0, 82], [2, 91, 18, 0, 85],
        ])
        a, b = alias(m, p, 1), alias(m, p, 2)
        payload = build_context(raw, [
            {"id": a, "signals": {"clicks_28": 6, "due_count": 2, "overdue_count": 1}},
            {"id": b, "signals": {"clicks_28": 0, "due_count": 2, "overdue_count": 1}},
        ])
        assert payload[a]["clicks_by_activity"] == {"Forums": 3, "Quizzes": 3}
        assert payload[a]["resources_opened"] == 2 and payload[a]["peak_day"] == 1
        assert payload[a]["assessments"] == [
            {"kind":"TMA", "due_day":17, "status":"no submission recorded"},
            {"kind":"CMA", "due_day":28, "status":"banked credit"},
        ]
        assert payload[b]["resources_opened"] == 0 and payload[b]["peak_day"] is None
        assert payload[b]["assessments"][0]["submitted_day"] == 18
