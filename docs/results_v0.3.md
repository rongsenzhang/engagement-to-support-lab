# v0.3 — Course context and robustness

Executed 15 November 2026. This is exploratory analysis of historical OULAD
module enrolments, not an external validation or a support-effectiveness study.
The [protocol](protocol_v0.3.md) was committed as
`c3172732fa333352c270e0214526e2da22c09863` before the new evaluation.
The original models and 2014J predictions remain unchanged.

## What the experiment answers

Adding assessment context helps some courses and harms ranking in others. The
pooled gain is therefore insufficient evidence for a generally useful assessment
signal. The nonlinear comparator improves mean AP across held-out courses, but
does not win every course or every metric. Simulated late submissions can also
change a review list substantially without any change in actual learning.

**B → C** is the primary feature comparison: both use activity and trend, while C
adds assessment context. **A → C** adds both trend and assessment; it cannot
isolate assessment alone. AP is average precision (higher is better); Brier
measures probability error (lower is better). These are point estimates, with no
new significance test or confidence interval in this milestone.

## Preserved 2014J predictions: course differences

The full historical population contains 6,362 enrolments and 966 later module
withdrawals. At one global top-10% workload of 637 records, B selects 117 later
withdrawals, C selects 162, R selects 157, and the training-only course prior
selects 128. C's AP is 0.20797 versus B's 0.17519 and the prior's 0.17310.

| Module | Enrolments | Withdrawals | Top-10% k | B AP | C AP | C − B AP | Selected withdrawals B → C |
|---|---:|---:|---:|---:|---:|---:|---:|
| BBB | 1,691 | 216 | 170 | 0.15288 | 0.15721 | +0.00433 | 31 → 34 |
| DDD | 1,293 | 251 | 130 | 0.25383 | 0.29903 | +0.04520 | 38 → 46 |
| EEE | 970 | 123 | 97 | 0.18689 | 0.15007 | −0.03682 | 21 → 9 |
| FFF | 1,696 | 284 | 170 | 0.20760 | 0.25348 | +0.04587 | 29 → 63 |
| GGG | 712 | 92 | 72 | 0.16569 | 0.12365 | −0.04205 | 15 → 8 |

Each course list is ranked independently. Their rounded workloads total 639;
they are not subsets of the global list of 637. Complete prevalence, A/C, R,
inactivity, prior, ROC AUC, Brier, and 5/10/20% workload results are in the
[generated report](../artifacts/v0.3/report.json) and
[metric table](../artifacts/v0.3/metrics.csv).

**Post-result descriptive diagnostic:** EEE's 970 and GGG's 712 records have no
eligible assessment due by day 28. All 4,680 records in the other three modules
have at least one. This is known applicability, not a missing submission feed.
The added features are constant within EEE/GGG, but C can still change their
ranking because the original fitted models learned different coefficients for
their shared activity/trend features. These results do not demonstrate an
individual assessment signal in courses with no assessment due. This diagnostic
was added after examining the results; it changed no model, split or metric.

The course prior uses only original training outcomes, with Laplace smoothing.
It does not account for all of C's pooled ranking performance, but this alone
does not identify a causal mechanism or eliminate course-specific confounding.

## Development leave-course-out experiment

The development population contains 16,196 enrolments from 16,075 students.
Each outer course is held out in full; overlapping students are purged from
other courses. The remaining students are split into fitting and independent
calibration groups. N uses the same eight inputs as C, with exactly three tree
sizes (7/15/31 leaves) selected over four inner held-out courses. All 60 inner
candidate fits are retained; outer outcomes do not choose the model.

| Outer module | A AP | B AP | C AP | N AP | N selected leaves |
|---|---:|---:|---:|---:|---:|
| BBB | 0.16291 | 0.16285 | 0.19029 | 0.19899 | 7 |
| DDD | 0.30468 | 0.29342 | 0.34858 | 0.34868 | 15 |
| EEE | 0.19599 | 0.18812 | 0.16870 | 0.20815 | 7 |
| FFF | 0.22036 | 0.21157 | 0.25180 | 0.25126 | 15 |
| GGG | 0.07684 | 0.09414 | 0.05225 | 0.06590 | 7 |

| Equal-weight course mean | AP | ROC AUC | Brier | Precision at 10% | Recall at 10% |
|---|---:|---:|---:|---:|---:|
| A | 0.19216 | 0.58476 | 0.13502 | 20.89% | 13.55% |
| B | 0.19002 | 0.57509 | 0.13542 | 20.92% | 14.70% |
| C | 0.20233 | 0.56043 | 0.12999 | 26.49% | 16.01% |
| N | 0.21459 | 0.58905 | 0.13186 | 27.98% | 17.32% |
| Training-only prior | 0.15351 | 0.50000 | 0.13182 | 16.34% | 10.35% |

N has higher mean AP than C, but worse mean Brier. C slightly exceeds N on FFF;
B exceeds both on GGG. C's AP on GGG is below the constant-prior baseline.
Unseen courses use the global fitting prior, not their own outcome rate. Pooled
outer predictions are supplied as a secondary summary: they combine five fitted
models, not one model serving one common population.

No new N predictions are produced on the already inspected 2014J population.
Student-disjoint partitions do not turn these historical presentations into a
strict calendar-time deployment replay or establish transfer to other institutions.

## Simulated data availability

The population, day-28 deadline boundary, outcomes and original A/B/C models are
fixed. Events are withheld and all dependent inputs are recomputed. This is a
stress experiment with deliberately naive scoring, not a missing-data policy.

| Simulation | Affected enrolments | Changed inputs | C list replacements / 637 | C maximum probability change | C maximum rank movement |
|---|---:|---:|---:|---:|---:|
| Activity events on days 26–28 arrive late | 3,569 | 3,569 | 21 | 3.95 percentage points | 3,223 |
| Submission events on days 26–28 arrive late | 60 | 60 | 54 | 18.22 percentage points | 4,142 |
| Whole activity window unavailable for seeded 10% | 637 | 615 | 23 | 4.31 percentage points | 3,046 |

Twenty-two records in the last scenario already had no recorded activity, so
their inputs did not change. Rank displacement can affect records outside the
masked set. Replacements count positions entering the list, not entries plus
exits. A/B are unchanged by the submission mask because neither uses submission
features. Their activity-mask results remain available alongside C.

Some impaired-input outcome metrics improve accidentally (C selects 176 later
withdrawals under submission delay versus 162 originally). This does not mean
missing data is beneficial or safe. The correct interpretation is that an
availability change can alter scores without a corresponding learning change.

The interface shows before/after signals and every C feature contribution for
up to three affected records with greatest absolute C rank movement. Selection
uses no later outcome. Every case is labelled as simulated impairment.

## Product decision and next step

Retain C as the original review-queue default; do not replace it automatically
with N or label any model generally superior. Expose course denominators,
assessment applicability, ranking failures and uncertainty. Before interpreting
an apparently missing submission, check the deadline and data-feed status.

v0.4 will test whether people can use these distinctions in synthetic review
tasks. Software and materials can be completed now; the owner will arrange
participants later. No tutor feedback, reduced withdrawal, present-day
institutional accuracy, or comparison against a proprietary Kortext model is
claimed.

## Reproduce and inspect

Run `python build_robustness.py --raw-dir /path/to/OULAD/csvs` in the pinned
environment after obtaining the seven source CSVs as described in the README.
The run produces separate historical, development and stress predictions,
partition membership, metric tables, a report and the browser payload. Raw
student identifiers and demographic columns are not exported. A public alias
groups enrolments for checking partition separation.

See [verification](verification_v0.3.md) for actual implementation checks.
