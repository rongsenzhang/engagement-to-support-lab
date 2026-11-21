"""Rebuild the queue's day-28 contextual evidence from the public OULAD CSVs."""

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

import duckdb

from src.pipeline import alias
from src.chat_evidence import CONTEXT_JS_PREFIX, RESOURCE_LABELS

ROOT = Path(__file__).resolve().parent


def read_rows(raw, name):
    with (raw / name).open(encoding="utf-8", newline="") as stream:
        yield from csv.DictReader(stream)


def build_context(raw, records):
    wanted = {row["id"] for row in records}
    enrolments = {}
    for row in read_rows(raw, "studentRegistration.csv"):
        key = (row["code_module"], row["code_presentation"], int(row["id_student"]))
        record_id = alias(*key)
        if record_id in wanted:
            if key in enrolments:
                raise ValueError("Duplicate enrolment")
            enrolments[key] = record_id
    if len(enrolments) != len(wanted) or set(enrolments.values()) != wanted:
        raise ValueError("Raw enrolments do not match the frozen review cohort")

    context = {rid: {"resources_opened": 0, "clicks_by_activity": {},
                     "peak_day": None, "peak_day_clicks": 0, "assessments": []}
               for rid in sorted(wanted)}
    with duckdb.connect() as db:
        db.execute("CREATE TABLE cohort(module VARCHAR, presentation VARCHAR, student INTEGER, alias VARCHAR)")
        db.executemany("INSERT INTO cohort VALUES (?, ?, ?, ?)",
                       [(*key, rid) for key, rid in enrolments.items()])
        db.execute("""
            CREATE TEMP TABLE events AS
            SELECT c.alias, s.date AS day, s.id_site AS site, v.activity_type, s.sum_click AS clicks
            FROM read_csv_auto(?) s
            JOIN cohort c ON (s.code_module, s.code_presentation, s.id_student)
                           = (c.module, c.presentation, c.student)
            LEFT JOIN read_csv_auto(?) v USING (code_module, code_presentation, id_site)
            WHERE s.date BETWEEN 1 AND 28 AND s.sum_click > 0
        """, [str(raw / "studentVle.csv"), str(raw / "vle.csv")])
        for rid, count in db.execute("SELECT alias, count(DISTINCT site) FROM events GROUP BY alias").fetchall():
            context[rid]["resources_opened"] = count
        for rid, activity, clicks in db.execute("""
            SELECT alias, activity_type, sum(clicks) FROM events GROUP BY alias, activity_type
        """).fetchall():
            group = RESOURCE_LABELS.get(activity, "Other activities")
            by_type = context[rid]["clicks_by_activity"]
            by_type[group] = by_type.get(group, 0) + int(clicks)
        for rid, day, total in db.execute("""
            SELECT alias, day, sum(clicks) AS total FROM events GROUP BY alias, day
            QUALIFY row_number() OVER (PARTITION BY alias ORDER BY sum(clicks) DESC, day ASC) = 1
        """).fetchall():
            context[rid].update(peak_day=int(day), peak_day_clicks=int(total))

    schedules = defaultdict(list)
    for row in read_rows(raw, "assessments.csv"):
        if row["assessment_type"] in {"TMA", "CMA"} and row["date"] not in {"?", ""}:
            day = int(row["date"])
            if day <= 28:
                schedules[row["code_module"], row["code_presentation"]].append(
                    (day, row["id_assessment"], row["assessment_type"]))
    submissions = {}
    for row in read_rows(raw, "studentAssessment.csv"):
        if row["date_submitted"] in {"?", ""}:
            continue
        day = int(row["date_submitted"])
        key = (row["id_assessment"], int(row["id_student"]))
        if day <= 28 and (key not in submissions or day < submissions[key][0]):
            submissions[key] = (day, row["is_banked"] == "1")
    for (module, presentation, student), rid in enrolments.items():
        for due_day, assessment, kind in sorted(schedules[module, presentation]):
            item = {"kind": kind, "due_day": due_day, "status": "no submission recorded"}
            sub = submissions.get((assessment, student))
            if sub:
                if sub[1]:
                    item["status"] = "banked credit"
                else:
                    item.update(status="submission recorded", submitted_day=sub[0])
            context[rid]["assessments"].append(item)
    for row in records:
        x = context[row["id"]]
        signals = row["signals"]
        counts = x["clicks_by_activity"]
        x["clicks_by_activity"] = dict(sorted(counts.items(), key=lambda pair: (-pair[1], pair[0])))
        if (sum(counts.values()) != signals["clicks_28"] or
                len(x["assessments"]) != signals["due_count"] or
                sum(a["status"] == "no submission recorded" for a in x["assessments"]) != signals["overdue_count"]):
            raise ValueError(f"Context and published day-28 signals disagree for {row['id']}")
    return context


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=ROOT / "data" / "raw")
    opts = parser.parse_args()
    records = json.loads((ROOT / "artifacts/demo_data.json").read_text())["students"]
    context = build_context(opts.raw_dir, records)
    # One row per alias keeps updates reviewable. Both runtimes read this same payload.
    entries = [json.dumps(key) + ":" + json.dumps(value, separators=(",", ":"))
               for key, value in context.items()]
    target = ROOT / "web/record-context-data.js"
    target.write_text(CONTEXT_JS_PREFIX + "{\n" + ",\n".join(entries) + "\n};\n", encoding="utf-8")
    print(f"Published day-28 context for {len(entries):,} enrolments.")


if __name__ == "__main__":
    main()
