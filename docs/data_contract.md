# Front-end data contracts

The original Python pipeline writes `artifacts/demo_data.json` and `web/data.js`
(assignment `window.LAB_DATA = {...};`). This v0.1 payload is retained unchanged.
Later analyses use separate payloads, never silently replace its model scores.
`package_demo.py` embeds the local scripts/styles for a standalone HTML deliverable.
No CDN or network is required. UI language is English for the recruiting audience.

## Original historical results: LAB_DATA

Top-level keys:
- `meta`: title, version, generated_at, cutoff_day=28, target, dataset, license, dataset_url, split_description, splits (train/validation/test objects with n, positives, prevalence, presentations), exclusions, limits (string list), default_model (chosen ONLY on validation), feature_groups, reproducibility.
- `models`: list of objects `{id, label, kind, features, metrics, calibration, capacity, coefficients}`. IDs `inactivity`, `activity`, `trend`, `context`. `kind`: `rule` or `logistic`. metrics: average_precision, roc_auc, brier (null for rule), precision_at_10pct, recall_at_10pct. calibration rows `{mean_pred, observed, n}`. capacity rows `{percent,k,precision,recall,tp,fp}` for percent 5,10,15,20,30,40,50. coefficients rows `{feature, label, coefficient}`. Metrics are held-out retrospective TEST results, not live forecasts or treatment effects.
- `students`: full held-out test records (not sampled) with `{id,module,presentation,outcome,scores,signals,weeks,contributions}`. id is a display alias; outcome 0/1 means subsequently withdrew from this MODULE (not university dropout). scores maps model IDs to scores (rule raw inactivity days; others probability). signals has clicks_28, active_days_28, clicks_7, active_days_7, clicks_previous_7, active_days_previous_7, days_since_last, no_activity, log_activity_ratio, activity_day_change, due_count, overdue_count, submitted_count, overdue_fraction, no_due_assessment. weeks has four click totals days 1-7,8-14,15-21,22-28. contributions maps logistic IDs to arrays `{feature,label,value,contribution}` sorted by contribution descending, in calibrated log-odds units. These are associations, not causes.
- `audit`: aggregate subgroup error rows `{attribute,group,n,positives,flagged,tp,fp,fn,recall,fpr,precision}` at the fixed GLOBAL top10% list for the selected model; no sensitive fields in student payload. Small groups (n<100 or positives<20 or negatives<20) suppressed. No fairness guarantee.
- `research`: list `{id,title,concept,signals,hypothesis,limitations,source_title,url,status}`. It is supplied from docs/research.json.
- `checks`: object from automated data assertions.

The original queue, Model evidence and Sources & scope views remain available.
v0.2 added Research question and its four deterministic historical examples;
v0.3 adds Course robustness. Course/model/capacity controls use deterministic
score-descending, alias-ascending ranking. Inactivity scores are days; R is a
non-probability index; A/B/C are historical probability estimates. Later outcomes
are hidden in the queue until explicitly revealed. Historical analysis pages
necessarily use the already-observed outcomes and are labelled accordingly.

Show full/filtered population sizes and actual selected counts. Distinguish module
capacity allocation from the global list. Never claim prevented withdrawals,
causal impact, mental-health diagnosis or superiority to a proprietary product.
Suggested enquiries are for human consideration; no contact is sent. Keep keyboard
controls, responsive layouts and visible limitations.

## Transparent reference: LAB_REFERENCE

`web/reference-data.js` carries the v0.2 R1 specification, per-record component
arithmetic and score, capacity results and example-selection rules. It joins the
original records by enrolment alias. Invalid/missing overlays leave the original
application usable and show an unavailable state. R has no Brier score, probability
calibration or learned weights. See [protocol_v0.2.md](protocol_v0.2.md).

## Course robustness: LAB_ROBUSTNESS

`web/robustness-data.js` contains the separately generated v0.3 report. It separates
historical per-module comparisons, development leave-module-out results, and
simulated input delays/missing events. The browser displays these precomputed
results; it does not train models, upload records or claim fresh predictions.
The current source of field definitions is `src/robustness.py` and its companion
`web/robustness.js`; the scientific specification is [protocol_v0.3.md](protocol_v0.3.md).

Every result identifies its population, denominator, class prevalence, method and
integer review capacity. B→C measures the assessment-feature increment; A→C also
adds trend. Undefined values remain null, not zero. Development outer predictions
come from separate fitted models; their pooled metrics are secondary to per-module
and macro results. Stress cases identify simulated impairments and preserve
original versus perturbed evidence, scores and explanations.


## `LAB_STUDY_CASES` and local session exports — v0.4

`web/study-data.js` provides 50 explicitly fictional `SYN-*` records and four
fixed tasks. No record, index, probability or outcome is derived from an OULAD
student or model. `web/study.js` owns in-memory task/session state, schema-checked
JSON restore and formula-safe CSV export. It never writes to the public research
payload or automatically persists/sends notes.

Exports distinguish practice/facilitated mode, participant code, broad role,
agreement and withdrawal deadline, session/task statuses, active time, assistance,
initial/revised response, manual case selection, observations and debrief. The
schema is validated in both the browser and `src/study_summary.py`. Session files
are private working records, not public research artifacts. Practice and
unfinished sessions cannot become participant counts in the summary. Actual
attendance and agreement must still be confirmed outside software.


## Review-queue context at day 28

`web/record-context-data.js` adds a separate record per published enrolment alias.
Rebuild it with `python build_record_context.py --raw-dir data/raw` in the
scientific Python environment. Normal app use and cloud deployment read the
committed overlay. Counts cover positive VLE clicks on course days 1–28.
Distinct resources count site IDs within a module presentation. The peak date
is the earliest tied day with the most clicks. Forum clicks include access to
the forum; the data do not identify what the learner read or wrote.

Assessment detail follows the original TMA/CMA expectation rule. Only deadlines
and recorded submissions visible by day 28 are shown. Banked credit is labelled
separately. The rebuild reconciles every row with its frozen click total, number
due and number without a recorded submission. The new descriptions contextualise
the historical predictions. They are not extra fitted coefficients.
The student names and catalogue course titles on screen are demonstration labels.
