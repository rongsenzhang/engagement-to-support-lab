# Independent methodological review

Review date: 8 November 2026. This was a separate AI-assisted implementation review within the development process, not external peer review or independent institutional validation. It concerns the application prototype, not Kortext's production system.

## Intended decision and population

The prototype ranks registered module enrolments for a human support review at day 28. Its retrospective target is a recorded withdrawal from that module after day 28 and by the module's scheduled end. This is distinct from university dropout, a diagnosis of disengagement, and the benefit a student would obtain from outreach. The unit of analysis is a student–module–presentation record.

The intended temporal blocks are 2013B/2013J for training, 2014B for validation, and 2014J for testing, limited to BBB, DDD, EEE, FFF and GGG. Removing later records for student IDs seen in an earlier block prevents person overlap across splits. That restriction changes the evaluation population and must be reported; the resulting test population does not represent all OULAD enrolments.

## Leakage checks and interpretation

- Predictor inputs must be available by day 28. Altering click events or submissions after that day must leave all features unchanged.
- Withdrawal dates and final results may determine eligibility and retrospective outcomes, but must never enter predictor matrices. Sensitive attributes are restricted to the aggregate audit.
- Assessment deadlines are useful context. Missing dates must not be invented. Marks are excluded because OULAD does not supply the time at which each mark became visible.
- Banked credit is a special case: raw-data inspection found 1,909 banked records, all with `date_submitted=-1`. The code should nevertheless require the observed submission date to be at or before the cutoff, rather than treating every possible future banked record as known in advance.
- Raw-data inspection found 45 missing registration dates and one recorded withdrawal after the presentation's stated end, in FFF 2013J. Eligibility and target handling for these records must be explicit and counted.
- Days with no click record are interpreted as no recorded VLE activity, not proof of no study. The implemented activity window is course days **1–28 inclusive**. Day 0, pre-course activity, offline work, attendance and unrecorded support are outside this prototype's behavioural view.

## Validation and capacity

Candidate models differ by added activity, trend and assessment-context feature groups. Model fitting uses the training block. Calibration and model choice use validation data only. The test block is reserved for retrospective reporting; changes made in response to its results would turn it into development data.

Capacity metrics answer how many subsequent withdrawals occur among a fixed top-ranked review list. They do not estimate preventable withdrawals, treatment benefit or an optimal intervention. Ranking ties must be broken identically in Python and the browser. A count or percentage must resolve to the same integer selection in both implementations.

Average precision assesses ranking under class imbalance. Brier score and calibration bins assess probability quality. The inactivity rule produces elapsed days, so it has no probability calibration or Brier score. Positive coefficients and per-record contributions represent model associations, not causes or direct instructions for changing student behaviour.

## Remaining limitations

1. OULAD is historical, from one distance-learning institution, and provides a narrow operational definition of withdrawal. Results do not establish performance in Kortext customers, current cohorts, campus programmes or international-student settings.
2. Course start periods and students differ across temporal blocks. Performance shifts may reflect seasonality, course design and population shift as well as model quality. In particular, the final outcomes of the 2013J presentations may not yet have been available at day 28 of the 2014B presentations. This is a retrospective holdout by presentation, not a strict calendar-time replay of model training and deployment. Features themselves are restricted to each enrolment's day-28 snapshot.
3. Using observable activity avoids direct demographic predictors but does not remove demographic proxies. Aggregate error checks are diagnostic, not a fairness guarantee; small groups are suppressed.
4. Explanations are of the fitted model and observed data. They do not reveal personal circumstances, motivation or mental health. A human enquiry should invite context and correction.
5. No intervention assignment or untreated comparison is available. Any future impact study would need a prospective design and a separately justified evaluation of support outcomes.

## Verification record

The executable tests in `tests/test_pipeline.py` assess the implemented data boundary, split isolation, predictor allowlist, ranking/metric consistency and payload contract. Test results and any unresolved implementation findings are recorded here after execution.

The implementation explicitly excludes and counts missing registration dates, registrations after the snapshot, withdrawals on/before the snapshot and withdrawals after the scheduled course end. Missing assessment deadlines are not invented; future and banked future submission records cannot satisfy the observed submission indicator.

Executed against the generated artifacts with `.venv/bin/python -m unittest discover -s tests -v`. The checks cover:

- Exact day-28 eligibility and outcome boundaries, including the scheduled last course day.
- Exact click windows and weekly aggregates; due assessments and banked-credit handling.
- Invariance under changes to future clicks, future submissions, assessment marks and final-result fields.
- Student isolation across temporal blocks and predictor allowlist exclusions.
- Deterministic tie-breaking and consistent capacity rounding.
- Complete held-out population and finite scores; rule scores retain their day units.
- Capacity metrics and Brier scores recomputed from the browser's records.
- Calibrated probability reconstruction from additive explanation terms.
- Calibration-bin population coverage, subgroup suppression/arithmetic and browser/JSON equivalence.

Status: **15 tests passed** on 8 November 2026. These tests validate implementation boundaries and internal consistency; they do not remove the methodological limitations above or certify production readiness.
