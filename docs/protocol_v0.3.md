# v0.3 protocol: course context and robustness

Fixed on 15 November 2026, committed before new fitting, model selection or
evaluation. Later corrections must be recorded explicitly. This is an exploratory
extension of the already observed OULAD experiment, not a new confirmatory study.

## Question and scope

Does assessment information improve ranking within modules and on a held-out
module, or does the pooled result mostly reflect module differences? Compare
**B → C** to isolate the additional assessment features: B already includes trend.
Also retain **A → C**, which adds both trend and assessment. Neither contrast
establishes a causal effect of assessment, teacher outreach or student support.

Retain the v0.1/v0.2 code and results. Add separate v0.3 outputs and a browser
analysis page. The original selected model C remains the historical queue default.
This milestone does not depend on the optional deployment-maintenance PR #5.

## Data, units and evaluation populations

- Unit: an eligible module enrolment at day 28, using the original five modules
  BBB, DDD, EEE, FFF and GGG, original feature definitions and original split.
- Historical 2014J: the original 6,362 enrolments and published A/B/C/inactivity/R
  scores. Describe module results and add a training-only module-prior baseline.
  These outcomes have been inspected; they never choose new parameters.
- Development: concatenate the original train and validation tables (2013B/J and
  2014B), 16,196 enrolments belonging to 16,075 students. These blocks also have
  prior exploratory exposure; they are not presented as untouched external data.
- Reconstruct student grouping from the original `studentInfo.csv` and existing
  enrolment alias function. One student may have multiple aliases. Use the actual
  student grouping in memory, with no source identifiers or demographic predictors
  in new public artifacts. Validate the joins and split membership by content.
- Keep eligibility and labels fixed under all stress simulations. No post-day-28
  signal, assessment grade or outcome is a model predictor. Presentation splits
  do not establish a strict historical deployment replay.

## Baselines and fixed comparisons

**A/B/C:** StandardScaler fitted only on the fitting partition, then logistic
regression with C=1, max_iter=2000, random_state=20261115. Use the original 4/6/8
feature sets. No parameter search for these three models.

**Module prior:** fit-only Laplace-smoothed withdrawal rate `(positives+1)/(n+2)`
for each module. An unseen module uses the fit-only global rate. No test labels
or calibration labels determine these rates. In an outer held-out module the
prior is necessarily constant; report that limitation rather than inventing
individual variation. For the historical comparison fit the prior on 2013B/J only.

**N, one nonlinear comparator:** HistGradientBoostingClassifier using C's same
eight features. Search exactly max_leaf_nodes={7,15,31}; keep learning_rate=.05,
max_iter=100, min_samples_leaf=30, l2_regularization=1, early_stopping=False and
random_state=20261115 fixed. There is no additional search after seeing results.
N is a controlled complexity comparison, not the intended product innovation.

## Development leave-module-out evaluation

Use modules in alphabetical order for five outer folds. For each outer module:

1. Reserve all its development records as outer evaluation. Remove any of those
   students' records from the other modules before fitting or splitting.
2. Reserve approximately 20% of the remaining student groups for calibration via
   GroupShuffleSplit(n_splits=1, test_size=.2, random_state=20261115+outer_index).
   The split uses student groups, not enrolment aliases or outcomes.
3. On the remaining approximately 80%, use each of the four modules as an inner
   selection fold. Purge its students from inner training as well. For each N
   candidate, fit on the inner-training modules and score the inner held-out module.
4. Select N by the unweighted mean of the four inner average-precision scores;
   exact ties favour fewer leaves. This is 5 × 4 × 3 = 60 candidate fits. A/B/C
   have fixed parameters and therefore do not need an inner search.
5. Fit A/B/C and the selected N on the full 80% fitting partition. Separately fit
   one Platt calibrator per model on the reserved 20%, using its raw decision score
   and LogisticRegression(C=1e6, max_iter=2000, random_state=20261115).
6. Evaluate each method once on the outer module. Never refit, recalibrate or tune
   using outer outcomes. Report fitting/calibration/evaluation sizes, class counts,
   purged counts, inner scores, selected settings and student-isolation checks.

All five outer modules remain in the report, including unfavourable results. Stop
with an explicit diagnostic if a required fitting/calibration partition lacks
both classes. Do not silently choose another seed or omit a difficult course.
An undefined evaluation metric is null with a stated reason.

Report per-module results and equal-weight macro summaries first. Pooled outer
predictions are a secondary description: they combine different fitted models
and are not the predictions of one model trained on the complete population.

## Metrics and workload

For every evaluated population show n, positive count and prevalence, average
precision, ROC-AUC and Brier score for probability models. R has no probability
interpretation or Brier score. Show capacities at 5%, 10% and 20%, with
`k=ceil(n*percent/100)` and descending full-precision score / ascending alias ties.
Within each population every model uses the same integer k. Report TP, FP, FN,
precision and recall, not just a score or ranking chart.

The primary workload is 10%. A global top-10% list and separate module top-10%
lists are distinct allocations; disclose the actual k and rounding difference.
Report B→C and A→C deltas, including negative differences. Do not infer statistical
significance or broad institutional superiority from these point estimates.

## Fixed simulated data-quality experiments

Use the historical day-28 population and frozen A/B/C models. Read raw events to
recompute the affected inputs, without retraining or changing the cohort/outcomes:

1. **Activity delay:** hide positive VLE events dated 26–28 inclusive; retain the
   day-28 observation window, eligibility and assessment expectations.
2. **Submission delay:** hide submission events dated 26–28 inclusive; assessments
   due by day 28 remain due. Earlier/banked submission handling follows v0.1.
3. **Activity feed missing:** select exactly ceil(.10*n) enrolments from alias-sorted
   historical records using NumPy default_rng(20261115), without replacement. Hide
   all their VLE events in days 1–28; keep their assessment evidence unchanged.

Recompute all dependent activity/trend or assessment features consistently. The
naive score response shows what can happen if missing events are treated as absent
activity; it is not a recommended missing-data policy. Explicitly flag the known
simulated impairment and advise verifying the feed before interpreting a ranking.
Do not silently classify unknown information as disengagement or no assessment due.

Report affected counts, original/stressed metrics at the same workload, overlap
and list turnover, rank and probability changes. For C, expose the before/after
feature contributions for up to three affected records with the greatest absolute
rank movement (ties by alias); retain original and simulated signal values.
Do not choose stress examples by a favourable later outcome. If no input actually
changes, report that result. These simulated timestamp masks do not establish
observed transmission delays or real feed reliability.

## Software acceptance and reporting

- A runnable generation command writes `artifacts/v0.3/` and a separate browser
  payload; the static browser runs without Python, API keys or model training.
- Tests cover student isolation, untouched outer labels during selection, prior
  fallback, same-k tie rules, fixed day-28 stress population, feature consistency,
  missing-data notices and correspondence between generated tables and the page.
- Keep existing future-event boundary tests. Use appropriate functional checks;
  no new file-hash infrastructure is part of this milestone.
- Document actual results, limitations, failures and the resulting next decision.
  Publish through a branch/PR, with the protocol commit retained in history.

Method references: [grouped cross-validation](https://scikit-learn.org/1.6/modules/cross_validation.html)
and [histogram gradient boosting](https://scikit-learn.org/1.6/modules/generated/sklearn.ensemble.HistGradientBoostingClassifier.html),
scikit-learn 1.6.1 (the installed project version).
