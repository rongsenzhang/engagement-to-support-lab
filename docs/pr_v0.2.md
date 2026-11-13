# Prepared PR: Add a transparent reference comparison and sourced product diagnosis

Base `main`, head `research/v0.2-reference-diagnosis`. This file supplies the PR
description; the GitHub PR and its checks are the publication-status record.

Merge method: **Create a merge commit**. Do not squash or rebase this branch;
the generated manifest depends on preserving the protocol commit's identity.

## Problem and result

The first demo showed model results without a systematic product diagnosis or an
explicit public-reference score. This change adds a sourced Kortext/Jisc/Civitas
comparison and a fixed, inspectable R1 index, then reorganises the homepage around
the research question, equal-workload results and four deterministically selected
cases, including failures. Ref: #1.

R is a 0–100 index rather than a probability. Its per-record arithmetic,
no-assessment handling and CSV units are visible. Invalid reference artifacts
fall back to the original models. Original v0.1 predictions, model selection and
experiment files remain byte-identical.

## Evidence

The protocol was committed as `95f95902be9c3905b5c04bf26d8481ec219d9cf9` before
evaluating R. All methods use the same 6,362 historical enrolments and top-637
workload: R includes 157 later withdrawals, C 162 and A 121. C has higher AP and
top-list precision than R, while R has higher ROC-AUC. No new model was fitted,
tuned or selected. A manifest records protocol, source, input and output hashes.

Local checks: 34 Python tests and 11 Node simulated-DOM tests passed; deterministic
rebuild produced no artifact diff; JavaScript syntax, Python compilation and
offline packaging passed. CI now repeats these checks, with full Git history for
protocol verification, before the existing Pages deployment can proceed.

## Limits and next decision

The 2014J outcomes were already inspected; new comparisons are retrospective and
exploratory. R is independently specified and does not reproduce Kortext's
proprietary model. Counts do not demonstrate saved students or intervention
benefit. Within-/across-course validation remains v0.3 work and actual tutor
research remains prospective.

Real-browser review passed at desktop and mobile viewport widths, including
routes, case selection, R arithmetic, model/module filtering, outcome visibility
and a 97-row CSV download without hidden outcomes. Screenshots and scope are in
`docs/verification_v0.2.md`. This was not physical-device or screen-reader testing.
Inspect actual GitHub CI before merging; local checks do not establish deployment.
