# Implementation decision log

Date: 8 November 2026. This records the choices actually implemented in version 0.1. The experiment protocol is in `docs/protocol.md`; results are in `docs/results.md`.

## Scope and evidence

| Decision | Implemented choice | Reason and consequence |
|---|---|---|
| Demonstration purpose | An independent research-to-model prototype for a human student-support review queue. | Public descriptions show that Kortext and comparator products already offer dashboards, risk indicators and intervention workflows. The application demonstrates reasoning, evaluation and usable explanations; it does not claim a missing proprietary feature or superiority to a commercial product. |
| Dataset | Public OULAD records from 2013–2014, with attribution and the source archive checksum. | Supports reproducible analysis without obtaining private student records. It does not represent current Kortext customers or current university practice. |
| Population | Modules BBB, DDD, EEE, FFF and GGG; enrolments registered by day 28 and still registered then. | These modules occur in the development, validation and test blocks. Eligibility exclusions are counted sequentially and reported. Missing registration dates and withdrawals after the stated course end are excluded. |
| Target | Module withdrawal after day 28 and by the recorded module end. | This is an observable outcome with a defined boundary. It is not equivalent to leaving university, psychological disengagement, mental-health need or preventable withdrawal. |
| Activity window | Positive recorded click events from course days 1–28 inclusive; four weekly totals use days 1–7, 8–14, 15–21 and 22–28. | Establishes a consistent snapshot. Day 0 and pre-course activity are outside this version. No observed click activity produces a separate indicator and an elapsed-days value of 28. |
| Assessment context | TMA/CMA deadlines on/before day 28; submissions count only when timestamped on/before day 28. Missing deadlines are not invented. | A future submission cannot retrospectively remove a missed-submission signal. Banked credit obeys the same timestamp condition; original banked records are dated −1. Individual extensions and grading-release times are unavailable. Marks are excluded entirely. |
| Research grounding | Six evidence cards distinguish cited research or practice reports from the prototype's own feature hypotheses. | A paper motivating attention to timing does not validate this exact seven-day feature, and a vendor case study does not establish causality. These limitations are visible alongside the hypotheses. |

## Modelling and evaluation

| Decision | Implemented choice | Reason and consequence |
|---|---|---|
| Split | Train on 2013B/2013J, calibrate and select on 2014B, report test results on 2014J. Keep a student's eligible enrolments only in the earliest available block. | Prevents the same student from appearing across splits, while retaining multiple enrolments within a block. This changes the evaluation population. It is a retrospective presentation holdout: 2013J outcome availability may overlap 2014B, so it is not a strict calendar-time deployment replay. |
| Baseline | Rank by days since last recorded VLE activity. | Supplies a transparent comparator. The score is elapsed days, never a probability. |
| Candidate models | Three StandardScaler + logistic-regression pipelines: A activity; B adds recent personal trend; C adds deadline context. Fixed `C=1`, `max_iter=2000`, `random_state=42`, no class weighting. | Keeping the model family and parameters fixed makes feature-group comparisons easier to interpret. There was no search for a test-set-winning architecture. The negative result for trend features is retained. |
| Predictors | Explicit feature allowlists exclude identifiers, demographics, withdrawal dates, final results, future activity and assessment scores. | Keeps outcome information separate from predictors and reduces unnecessary data use. Omitting direct demographic fields does not remove possible demographic proxies. |
| Calibration and selection | Fit Platt calibration on validation logits. Choose A/B/C by validation average precision, with lower Brier score as a tie-breaker. | Model C is the default by that rule. Validation calibration figures are development diagnostics because the same block fits calibration; test figures provide the held-out assessment. No model or threshold was tuned using test results. |
| Explanations | Export each feature's additive contribution in calibrated log-odds, centred on training-feature means, with a separate intercept. | Terms reconstruct each displayed probability. They explain the fitted model's associations, not causal effects or an instruction to increase clicks. |
| Capacity | Default global top 10%, rounded up; display alternatives from 5% to 50%. Break score ties by the displayed alias in ascending order. | Ensures equal workload comparisons and matching Python/browser selections. The chosen capacity is an illustrative constraint, not an empirically optimal support policy. |
| Metrics | Average precision, ROC-AUC, precision/recall at capacity, probability Brier score and calibration bins with sample counts. | Avoids relying on raw classification accuracy in an imbalanced population. The rule has no probability metrics. |
| Uncertainty | Paired student-cluster bootstrap for C-minus-A test AP, 200 resamples and seed 20261108. | Preserves within-student enrolment dependence. The interval is exploratory and conditional on this cohort; it does not measure uncertainty across institutions or intervention effects. |
| Subgroup audit | Aggregate gender, age-band and disability errors at the fixed global top-10% list; suppress groups with fewer than 100 records, 20 positives or 20 negatives. | Makes outcome disparities inspectable without adding sensitive fields to individual browser records. This is a diagnostic, not a fairness certification. |

## Interface, checks and environment

The offline browser interface has Support queue, Model evidence, and Research & scope views. Later outcomes are hidden until the user requests the retrospective reveal. This supports an honest walkthrough; it is not an access-control mechanism because the downloadable static payload contains the retrospective outcomes. Individual displays use aliases, with no source student identifier or demographic fields.

Suggested enquiries describe recorded evidence and invite a human conversation. There is no automated student-contact action. The interface labels the historical dataset, snapshot, independent-prototype status and outcome scope. Any module-filtered counts must remain distinguishable from full-cohort statistics.

Fifteen automated tests passed. They independently exercise future-event and future-submission mutation invariance, cutoff and eligibility boundaries, banked records, split isolation, feature exclusions, tie-breaking, capacity metrics, probability reconstruction, calibration coverage, subgroup arithmetic and payload equivalence. The root's final pytest verification reported **15 passed in 1.76 seconds**. This is an implementation check, not evidence of clinical, educational or commercial efficacy.

The initial NumPy 2.0.2 environment emitted BLAS/matrix-operation runtime warnings despite finite inputs and outputs. Finite-value checks and the probability/explanation reconstruction were investigated; the dependencies were then pinned to **NumPy 1.26.4**, and the same experiment was rerun cleanly. The model specification, feature definitions, split, selection rule and workload thresholds were not changed in response to test performance. This was a numerical-environment correction, not model tuning.

The current results remain modest. Assessment context improved the held-out ranking relative to the activity-only comparator, while trend features alone did not. No production deployment, user interviews, prospective intervention study, comparison against Kortext's algorithm or claim of prevented withdrawals has been made.
