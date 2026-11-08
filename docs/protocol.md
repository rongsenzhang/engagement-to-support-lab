# Experiment protocol v0.1 — fixed before first model fit

Date: 8 November 2026. Independent application prototype by Rongsen Zhang, developed with AI assistance. No affiliation with Kortext. No user study has yet been conducted.

## Question
Do personal activity changes and assessment-deadline context add useful information beyond aggregate activity for ranking later module withdrawals at a fixed support capacity?

## Population and target
OULAD modules BBB, DDD, EEE, FFF and GGG, selected because each occurs in all temporal development/calibration/test blocks. Snapshot: course day28. Retain registrations known by then and not withdrawn by then. Exclude unknown registration dates and withdrawals after recorded course end. Label: subsequent module withdrawal by module end. This is not a label for mental health or overall university dropout.

## Features available at the snapshot
- A: log1p clicks, active days, recency and no-recorded-activity indicator, from days1–28.
- B: A plus log ratio of clicks in days22–28 versus15–21 and change in active days over the same windows.
- C: B plus fraction of TMA/CMA assessments due by day28 without a recorded submission by day28, and no-assessment-due indicator.
- Banked credit is satisfied only if its record is dated on/before day28 (the original banked records are dated -1). Grades are excluded because their publication timestamps are unknown.
- No demographics, final_result, future clicks, future submissions, withdrawal dates or student identifiers enter model features.

## Split, model and selection
Train on 2013B+2013J; calibrate and select on 2014B; test once on 2014J. A student's eligible records occur only in their earliest available split. This intentionally evaluates later students unseen during development, not the original unfiltered population. B and J populations may differ; no exact calendar deployment replay is claimed.

All three feature sets use StandardScaler fitted on training only and LogisticRegression(C=1,max_iter=2000,random_state=42), with no class weighting. Fit Platt calibration on the validation block only. Select default among A/B/C by validation average precision, tie-break lower Brier. Calibration fit metrics on the validation block are development diagnostics, not unbiased evaluation. No test-set tuning. Rule comparator ranks by days since last activity, with alias ID as deterministic tie-break. Rule score is not a probability.

## Outcomes of the experiment
Report precision and recall at the same top10% workload (ceil(N*0.1)), average precision, ROC-AUC and Brier. Also display capacities5–50%. Always distinguish the full test cohort from a user-selected module. Report a paired student-cluster bootstrap95% interval (200 replicates, fixed seed20261108) for C-minus-A average precision. Do not treat confidence within one cohort as evidence of cross-institution transportability.

Audit subgroup errors at the GLOBAL top10% threshold using gender, age band and disability in aggregate only; suppress n<100, positive<20 or negative<20. Omitting demographics from predictors is not proof of fairness.

## Interpretation
No promised improvement. Keep negative results and simple models. The dashboard is a retrospective demonstration with later outcomes hidden by default. Signals invite human enquiries; they do not diagnose motivation, belonging or causes of withdrawal. Outreach effectiveness requires an additional prospective study.
