# Three-minute recruiting demonstration

This preserves the **v0.1 demonstration narrative**. In v0.2 the app opens with
Research question: begin there, inspect the A/C/R comparison and one failure
case, then use the queue and evidence views below. Add the R metric trade-off and
observed-test limitation from [results_v0.2.md](results_v0.2.md). The next research
priority is within-/across-course validation before a portability claim; tutor
feedback remains planned.

Spoken script: approximately three minutes, allowing short pauses for navigation. Figures are from `artifacts/metrics.json`, generated on 8 November 2026. Recheck this script if the pipeline is rerun.

Before presenting: open the application; select **All held-out modules**, **C · Activity + trend + assessment**, and **10%** review capacity. Keep historical outcomes hidden initially. This document is a script; no recording is claimed.

## 0:00–0:30 — The question

*[Show Support queue.]*

“I built Engagement-to-Support Lab to explore how educational research can become testable indicators and useful tutor explanations. It is an independent application prototype inspired by this KTP's research objectives.

“The question is practical: when support time is limited, which students might warrant a closer look, and what evidence should a tutor examine before acting?”

## 0:30–1:05 — Research into usable signals

*[Open Research & scope, then return to the queue and inspect a student.]*

“Each evidence card connects a source to a computable signal, a hypothesis and a limitation. I compare recorded activity, changes relative to the student's previous week, and assessments already due.

“Here, a tutor can inspect the weekly pattern, submission records and model contributions. The suggested enquiry invites clarification. Missing activity could reflect learning elsewhere, while an apparent missed deadline could involve an extension. These traces do not measure motivation or mental health.”

## 1:05–2:05 — What the experiment actually found

*[Open Model evidence. Keep All modules and the 10% comparison.]*

“The experiment uses historical Open University data, with a snapshot at day 28. It predicts later withdrawal from that module among students still registered. Later outcomes are excluded from predictors, and no student crosses the training, validation and test splits.

“The held-out test contains 6,362 module-enrolment records, including 966 subsequent withdrawals. At the same 10% review capacity—637 records—the activity model includes 121 later withdrawals. Adding trend and assessment context includes 162. Precision increases from 19.0% to 25.4%, and recall from 12.5% to 16.8%.

“Trend alone did not improve the activity model in this test. That matters: I retained the result rather than assuming every research-inspired feature would help. The contextual model was selected using validation data, before inspecting test performance.”

## 2:05–2:35 — The limits change the recommendation

*[Point to the limitations and the comparison table.]*

“Performance remains modest. Of the 637 records selected by the contextual model, 475 did not later withdraw, while 804 withdrawals were outside that list. A flagged student might still benefit from support, but this dataset cannot tell us that.

“These are retrospective ranking results. They do not demonstrate prevented withdrawals or superiority to Kortext's system.”

## 2:35–3:00 — The next useful step

“My next step would be a small tutor usability study, followed by validation using appropriate contemporary institutional data. I would investigate missing calendar context, exceptions and the causes of model errors before considering a live pilot.

“The contribution I want to demonstrate is the complete reasoning process: interpreting research, engineering indicators, testing a hypothesis, explaining the evidence and knowing what still needs validation.”

## Numbers for questions

| Held-out result | Activity A | Trend B | Context C |
|---|---:|---:|---:|
| Average precision | 0.1776 | 0.1752 | 0.2080 |
| ROC AUC | 0.5714 | 0.5668 | 0.5750 |
| Brier score | 0.1283 | 0.1284 | 0.1269 |
| Later withdrawals within top 637 | 121 | 117 | 162 |

The test prevalence is 15.18%. C minus A average precision is 0.0304, with an exploratory student-bootstrap 95% interval of 0.0144–0.0505 from 200 resamples. This interval concerns this held-out population, not generalisation across universities. Do not describe the result as a causal effect.

The target is subsequent withdrawal after day 28 and on or before the recorded module end. It is **not** withdrawal within the next 28 days. The split is 2013B/2013J for training, 2014B for calibration/model selection, and 2014J for testing; seasonal differences remain a limitation.
