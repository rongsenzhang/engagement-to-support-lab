# R1 comparison: observed results and the next decision

13 November 2026. Generated data: [reference_results.json](../artifacts/v0.2/reference_results.json).
Specification: [protocol R1](protocol_v0.2.md), committed as
`95f95902be9c3905b5c04bf26d8481ec219d9cf9` before computing the new index.

## What was compared

The unchanged 2014J cohort contains 6,362 module enrolments and 966 later module
withdrawals (15.18%). Every method reviews exactly 637 enrolments at the 10%
setting. Descending full-precision scores and ascending aliases determine ties.
The original inactivity and A/B/C outputs remain byte-identical. No models were
refitted or selected using these new results.

| Method | Later withdrawals in list | Other records in list | Withdrawals missed | Precision | Recall | Average precision | ROC-AUC | Brier |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Inactivity | 121 | 516 | 845 | 19.00% | 12.53% | 0.17632 | 0.56726 | N/A |
| A · activity | 121 | 516 | 845 | 19.00% | 12.53% | 0.17758 | 0.57138 | 0.12833 |
| B · activity + trend | 117 | 520 | 849 | 18.37% | 12.11% | 0.17519 | 0.56684 | 0.12837 |
| C · activity + trend + assessment | 162 | 475 | 804 | 25.43% | 16.77% | 0.20797 | 0.57505 | 0.12690 |
| R · transparent reference | 157 | 480 | 809 | 24.65% | 16.25% | 0.19213 | 0.58340 | N/A |

R has no probability interpretation. Brier scores and probability calibration
are therefore not applicable to R or the inactivity rule. Precision is the share
of reviewed records with a later withdrawal; recall is the share of all later
withdrawals present in that list. Neither measures support effectiveness.

## What follows from these results

- C includes 41 more later withdrawals than A at the same workload. A and C
  differ in both trend and assessment features. The B-to-C comparison adds the
  assessment feature pair, including the no-due indicator; it is still a
  statistical comparison, not causal attribution to assessment behaviour.
- B does not improve on A here. Adding a plausible feature does not guarantee a
  better ranking, and this negative result remains visible.
- C includes five more later withdrawals than R and has higher average
  precision. R has higher ROC-AUC. There is no method that wins all metrics, no
  uncertainty analysis for the C/R difference, and no change of default model.
- C misses 804 of the 966 withdrawals, and 475 reviewed records did not later
  withdraw. A non-withdrawal selection does not prove support was unnecessary;
  a correct prediction does not establish who would benefit from support.
- Equal R weights, correlated activity components, and the switch from three
  components to two when no assessment is due are assumptions, not validated
  measurements of engagement. The denominator change can change cross-course
  rankings even without an individual behavioural change.

No number here represents students saved, a retention uplift or performance
relative to Kortext. The company model is unavailable and was not evaluated.
2014J outcomes were already observed in v0.1: this is exploratory follow-up on a
historical, single-institution cohort, not a new independent test. The original
C/A bootstrap does not provide uncertainty for this newly added R comparison.

## Cases selected before inspecting individual examples

The protocol chooses the lexicographically smallest alias in each set. The first
three use A/C global top-637 lists; the fourth uses the entire cohort. Sets may
overlap and do not constitute a representative sample.

| Category | Count | Displayed alias | What it illustrates |
|---|---:|---|---|
| Withdrawal included by C and omitted by A | 107 | S-001CF0EC7F | A changed ranking can include a later withdrawal. |
| Withdrawal omitted by both | 738 | S-00260680BA | Both review lists miss many later withdrawals. |
| C selection without later withdrawal | 475 | S-00CE74E95C | A high score is not a certain outcome or a support diagnosis. |
| No eligible assessment due at day 28 | 1,682 | S-0016341AAC | R uses two applicable components and exposes the changed denominator. |

The 107 C-only withdrawals are not a net gain of 107: A also includes withdrawals
that C misses. Net A/C difference at equal workload is 41. Outcomes define the
first three example sets; the fourth is defined solely by snapshot availability.

## Decision

Keep C as the original validation-selected default, keep R as an inspectable
reference, and retain the original experiment. Do not tune R weights to the
observed test results. v0.3 should investigate within-course performance,
training-only course priors and held-out-course development experiments before
claiming portable value from context. Those studies are not completed in v0.2.

The current business hypothesis is that an explicit comparison and its failures
help teams reason about review priorities. Its usefulness to actual tutors still
requires the planned formative study; no interviews or institution feedback have
been invented. See the [product diagnosis](product_comparison.md) for source-linked
KTP relevance and the [verification record](verification_v0.2.md) for executed checks.
