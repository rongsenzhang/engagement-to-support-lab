# v0.2 protocol: a transparent reference and product diagnosis

Protocol R1, fixed 13 November 2026 before computing the new reference results.
This document is committed separately before evaluation. Subsequent corrections
must be recorded explicitly, rather than retroactively rewriting the protocol.

## Decision and research question

Can a fully specified, simple review index provide an inspectable comparator for
the existing activity and assessment-context models at the same review workload?
The business purpose is to demonstrate how public product evidence becomes an
auditable research question and a reproducible evaluation. This is an independent
reference, not Kortext's algorithm, an estimate of its accuracy, or a proposed
production replacement. The product diagnosis is documented separately.

The previous result prompts a further question: does assessment context help
within and across courses, or mainly encode course differences? That question
remains for v0.3. This release does not answer it by adding another pooled score.

## Frozen inputs and evaluation status

- Preserve v0.1 code and all existing artifacts, including `web/data.js`, without
  modifying their contents. Baseline release: `v0.1.0`, experiment commit
  `8324bae98803512329ecb407a07ad124108671d8`; development starts from repository
  commit `fe0fcaf91bddb552ddf92ec3b5c9d8a8c592f32f`.
- Read the committed `artifacts/test_features.csv` and `artifacts/demo_data.json`.
  Join by unique enrolment alias; require a one-to-one full match, matching
  outcomes, module identifiers and scoring inputs. Fail on invalid or missing
  required inputs rather than silently converting missing data to zero.
- Population: the existing 6,362 eligible module enrolments from 2014J, five
  modules, day-28 snapshot, including 966 later module withdrawals. The original
  split excludes students already present in earlier eligible splits.
- This cohort and its outcomes have already been inspected. All new comparisons
  and examples are **retrospective exploratory analyses**, not a fresh untouched
  test or a confirmatory preregistration. No new fitting, parameter search,
  calibration, model selection or change of default logistic model occurs.
- Presentation splits are not a strict historical calendar-time deployment
  replay. Public historical single-institution data do not establish current
  institutional performance or causal intervention benefit.

## Independent reference index R1

Use only these day-28 fields: `days_since_last`, `active_days_28`,
`overdue_fraction`, `no_due_assessment`. Define:

1. Recency component: `r = days_since_last / 28`.
2. Activity sparsity component: `s = 1 - active_days_28 / 28`.
3. Assessment component: `a = overdue_fraction`, only when an eligible assessment
   was due (`no_due_assessment == 0`). Otherwise this component is not applicable.
4. If an assessment was due, `R = 100 * (r + s + a) / 3`; otherwise
   `R = 100 * (r + s) / 2`.

All components lie in [0,1]. Validate finite values, integer day counts in [0,28],
binary applicability, fraction bounds and consistency with no assessment due.
The existing no-activity convention gives recency 28 when no VLE event is recorded
in days 1–28. No due assessment is a known applicability state, not proof of a
broken data feed. Missing required values are errors, not that state.

R lies in [0,100]; higher means higher review priority. It is **not a probability**
and has no fitted coefficients, calibrated risk bands or proprietary thresholds.
Equal weights and the day-window denominator are design choices fixed for
inspectability; they are not empirically optimal or drawn from Kortext's system.
Recency and sparsity overlap conceptually, and excluding assessment changes the
weights across records. Both are limitations to retain when interpreting results.
No behaviour trend, demographics, module identity, later event or outcome enters R.

## Comparators and reporting

Compare R with the unchanged inactivity rule and logistic models A (activity),
B (activity plus trend) and C (activity, trend and assessment context). Keep the
v0.1 model C selected on validation as the default; do not choose a winner from
these new test comparisons.

- Same enrolments and ordering rule for every method: descending score, then
  ascending alias to resolve ties deterministically. Retain full-precision scores.
- Primary descriptive comparison: top 10%, `ceil(6362 * .10) = 637` records.
  Report true positives, non-withdrawals in the list, missed withdrawals, precision
  and recall, with denominators and prevalence.
- Also report average precision, ROC-AUC and capacity curves at 5,10,15,20,30,40,50%.
  Preserve original probability-model Brier scores. R has **no Brier score or
  probability calibration curve**; do not divide it by 100 and treat it as risk.
- Report negative findings as well as apparent gains. There is no success
  threshold, hypothesis test or post-hoc weight tuning. Do not claim superiority
  to the company, saved students or a treatment effect.

## Inspectable examples

Using the unchanged A and C global top-637 lists, define four sets:

1. Later-withdrawal records included by C and omitted by A.
2. Later-withdrawal records omitted by both A and C.
3. Records included by C with no later module withdrawal.
4. Records with no eligible assessment due at the snapshot (entire cohort).

Select the lexicographically smallest alias in each nonempty set; disclose set
size, rule and later-outcome use. Sets can overlap. If empty, display unavailable.
These illustrate success, failure and unavailable context; they are not random
samples or representative estimates. The overview explicitly reveals historical
outcomes. The support queue keeps its existing optional reveal control.

## Reproducibility and acceptance

Write separate `artifacts/v0.2/` outputs and `web/reference-data.js`; never overwrite
v0.1 predictions. Record SHA-256 hashes of protocol, input tables/payload, relevant
code and generated outputs, plus baseline and protocol commit IDs. Avoid circular
hashes and timestamps that make identical input builds differ.

Tests cover known-score examples, zero-vs-missing input handling, no-assessment
renormalisation, range/consistency errors, label invariance, deterministic ties,
join failures, complete artifact agreement and frozen v0.1 preservation. The
browser must distinguish score units and show the calculation for each R record.
An unchanged build must reproduce committed v0.2 artifacts. CI also packages the
offline application and checks JavaScript syntax.

The release is complete when the sourced product diagnosis, executable reference,
honest comparison, case inspection and validation record are present. Qualitative
interviews, institutional integration and intervention evaluation remain planned.
