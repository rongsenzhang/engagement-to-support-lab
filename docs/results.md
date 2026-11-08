# Results — Engagement-to-Support Lab v0.1

Run date: 8 November 2026. Independent application prototype by Rongsen Zhang, developed with AI assistance. Results below are copied or calculated from the current `artifacts/metrics.json`, generated at 2026-11-08T11:20:02.720321+00:00.

## Main finding

Adding assessment context produced a modest improvement in this held-out historical cohort. Model C achieved average precision **0.2080**, compared with **0.1776** for activity-only Model A. Adding week-to-week trend features alone did not improve the result. Model C was selected using the validation block before test evaluation; it was not chosen by inspecting test performance.

At a fixed review capacity of 10%, Model C selected 637 module enrolments, of which 162 subsequently withdrew from the module. The inactivity rule and Model A each selected 121 subsequent withdrawals at the same capacity. This is **41 more observed subsequent withdrawals in the review list**, not evidence of prevented withdrawals or greater benefit from an intervention.

## Evaluation population

The prediction snapshot is course day 28. Students must be registered by that day and not already withdrawn. The outcome is a recorded withdrawal after day 28 and by the module end. The five modules are BBB, DDD, EEE, FFF and GGG. Records for a student appearing in an earlier split are removed from later splits.

| Split | Presentations | Enrolments | Unique students | Subsequent withdrawals | Prevalence |
|---|---|---:|---:|---:|---:|
| Training | 2013B, 2013J | 11,427 | 11,307 | 1,953 | 17.09% |
| Calibration / selection | 2014B | 4,769 | 4,768 | 794 | 16.65% |
| Held-out test | 2014J | 6,362 | 6,360 | 966 | 15.18% |

These are retrospective presentation holdouts. In particular, final 2013J outcomes may not have been available at day 28 of 2014B, so this is not a strict calendar-time deployment replay. Predictor features themselves use only information available at the individual day-28 snapshot.

## Held-out test comparison

All test metrics below use the same full population. AP, ROC-AUC, precision and recall are better when higher; Brier score is better when lower.

| Model | Average precision | ROC-AUC | Brier score | Precision at 10% | Recall at 10% | Later withdrawals in 637 reviews |
|---|---:|---:|---:|---:|---:|---:|
| Inactivity rule | 0.1763 | 0.5673 | — | 19.00% | 12.53% | 121 |
| A: Activity | 0.1776 | 0.5714 | 0.12833 | 19.00% | 12.53% | 121 |
| B: Activity + trend | 0.1752 | 0.5668 | 0.12837 | 18.37% | 12.11% | 117 |
| C: Activity + trend + assessment | 0.2080 | 0.5750 | 0.12690 | 25.43% | 16.77% | 162 |

The test withdrawal prevalence is 15.18%; a constant-score ranking has AP 0.1518. Model C's ROC-AUC of 0.5750 and recall of 16.77% at the selected capacity show limited discrimination. Of the 966 subsequent withdrawals, **804 are outside the top-10% review list**. Of the 637 selected records, 475 have no recorded subsequent module withdrawal. Those records are negative for this particular outcome; that does not establish that a support conversation would be unnecessary.

The inactivity rule ranks elapsed days, not withdrawal probabilities, so it has no Brier score or probability-calibration chart. Model A and the rule have identical top-10% counts here; this does not imply identical ranking at every capacity.

## Added context and uncertainty

The paired C-minus-A difference in test AP is **0.030390**. A student-cluster bootstrap with **200 resamples** gives a percentile 95% interval of **[0.014386, 0.050453]**. Student-level resampling keeps any multiple enrolments for the same student together. Seed: 20261108.

This interval describes resampling uncertainty within this particular held-out cohort. It does not include uncertainty from new institutions, changes in data collection, model retraining, or an actual intervention. Two hundred resamples provide a lightweight exploratory interval, not a precision claim about transportability.

## Model choice and calibration

| Candidate | Validation average precision | Validation Brier score |
|---|---:|---:|
| A | 0.1744 | 0.13861 |
| B | 0.1741 | 0.13861 |
| C | 0.2452 | 0.13469 |

Platt calibration is fitted on validation data, and the same validation block is used for candidate selection. These validation figures are development diagnostics, not an independent calibration assessment. Test calibration is displayed separately with the sample count in each bin.

For Model C, the test bin with 173 records has a mean predicted probability of 20.65% and an observed withdrawal rate of 12.72%, illustrating that calibration is imperfect. The highest nonempty bin contains only one record and should not support general conclusions. The model does not support a claim of highly accurate individual forecasts.

## Verification and reproducibility

- The current environment uses NumPy **1.26.4**, Python **3.9.6**, scikit-learn **1.6.1**, pandas **2.3.3** and DuckDB **1.4.5**; pinned dependencies are in `requirements.txt`.
- An earlier run with NumPy 2.0.2 on this macOS environment emitted BLAS/matrix-operation warnings despite finite inputs and outputs. After investigating finite values and explanation reconstruction, the environment was changed to NumPy 1.26.4 and the unchanged experiment was rerun cleanly. This was an environment correction, not model or threshold tuning.
- **15 automated tests passed**. The final root verification used pytest and completed in **1.76 seconds** on this machine; elapsed time is environment-specific.
- Tests cover future-data mutation invariance, snapshot eligibility, student isolation, predictor exclusions, ranking ties, capacity calculations, probability reconstruction and exported payload consistency. See `docs/independent_review.md` and `tests/test_pipeline.py`.
- Source archive SHA-256: `f2ed1902616c1fe8d2824d872c0b7d2d72be435bf0124d077044fe4be2c6d3e4`.

## Practical conclusion

The prototype supplies evidence for further investigation of assessment context and demonstrates an auditable path from a behavioural hypothesis to features, validation and a human review queue. These historical results establish neither production efficacy nor improvement over Kortext. No institutional pilot, causal evaluation, user study or comparison with Kortext models has been conducted.
