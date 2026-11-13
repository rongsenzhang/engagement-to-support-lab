# Engagement-to-Support Lab — v0.2 research preview

[Live demo](https://rongsenzhang.github.io/engagement-to-support-lab/) · [Releases](https://github.com/rongsenzhang/engagement-to-support-lab/releases) · [Research roadmap](ROADMAP.md) · [Working practices and rollback](CONTRIBUTING.md) · [Change history](CHANGELOG.md)

The initial experiment is preserved as **v0.1.0**. v0.2 adds a source-linked product diagnosis, a transparent reference index and inspectable comparisons without replacing any v0.1 predictions. The roadmap separates public product evidence, independently chosen baselines and proposed research; it is not a claim to reproduce Kortext's proprietary system. The live URL follows deployed `main`; a local or feature-branch preview is not automatically the published version.

An independent application project for Rongsen Zhang, developed with AI assistance. It explores the research-to-indicator and validation work described in the University of Stirling–Kortext KTP vacancy FAC02157. It is not a Kortext product or an integration with Stream, and does not implement the company's proprietary algorithm.

## Open the working demo

**Website:** https://rongsenzhang.github.io/engagement-to-support-lab/  
**Source repository:** https://github.com/rongsenzhang/engagement-to-support-lab

The existing published v0.1 baseline was checked in desktop and mobile browsers. v0.2 includes responsive layouts, but real-browser/mobile verification is pending; see `docs/verification_v0.2.md`. Initial loading downloads the historical demonstration results; no login or API key is needed. Deployment instructions are in `docs/deployment.md`.

Open `web/index.html` directly in a modern browser. No installation, internet connection or API key is needed to explore the included real, precomputed results. Alternatively, run `python3 run_demo.py` and visit the printed local address. `python package_demo.py` creates the self-contained `dist/Engagement_Lab_v0.2.html` and source ZIP.

The app opens with the research question, equal-workload results and four deterministic cases, including failures. The other views remain Support queue, Model evidence, and Research & scope. Choose a module, model and review capacity; inspect a record and its observations. R's calculation is exposed component by component. Historical outcomes are visible in the research overview, and hidden in the support queue until explicitly revealed. Filters recalculate the selected cohort's ranking metrics; global results are labelled separately.

The browser explores precomputed predictions and the separately generated R1 index. It does not train a model or score uploaded data. There is no data upload, messaging, live institutional integration or external AI call.

## What v0.2 establishes

The [official KTP brief](https://iuk-ktp.org.uk/job/ktp-associate-data-scientist-engagement-analytics/) calls for product diagnosis, research-led indicators, modelling, validation and stakeholder alignment. Our [product comparison](docs/product_comparison.md) and [company research](docs/company_research_v0.2.md) distinguish public capabilities, implementation boundaries and hypotheses. Kortext already describes context, interventions and institutional analytics; these are not inventions claimed by this project.

R1 is `100 × mean(days_since_last/28, 1-active_days_28/28, overdue_fraction when an assessment was due)`. It uses fixed equal weights and no fitting. With no assessment due, the two activity components are averaged. It is a review index, **not a probability or Kortext's formula**. Missing required values stop generation.

On the same 6,362 historical enrolments and 637-record review lists:

| Method | Later withdrawals in list | Precision | Recall | Average precision | ROC-AUC |
|---|---:|---:|---:|---:|---:|
| A · activity | 121 | 19.00% | 12.53% | 0.17758 | 0.57138 |
| C · activity + trend + assessment | 162 | 25.43% | 16.77% | 0.20797 | 0.57505 |
| R · transparent reference | 157 | 24.65% | 16.25% | 0.19213 | 0.58340 |

C has higher AP and more later withdrawals in this fixed-size list than R; R has higher ROC-AUC. There is no universal winner or demonstrated significance for C versus R. C's list still misses 804 of 966 later withdrawals. These counts are **not students saved**. The 2014J outcomes were already inspected in v0.1, so new comparisons are exploratory. Full results, including inactivity and B, are in [results_v0.2.md](docs/results_v0.2.md).

## The research question

At day28, do personal activity changes and assessment-deadline context add useful predictive information beyond aggregate VLE activity for later module withdrawal? A, B and C use the same logistic-regression family; the changed feature sets can therefore be compared transparently. An inactivity rule is a separate comparator.

See `docs/protocol.md` for the prespecified population, features, split, model-selection rule, metrics and limitations. The source is the openly licensed OULAD dataset, not the applicant's students or Kortext customer records.

## Reproduce v0.2 from the frozen experiment

Tested with Python3.9.6 on macOS arm64. The pinned scientific dependencies support Python3.9–3.12. Create a fresh environment rather than using a global environment.

```bash
git clone https://github.com/rongsenzhang/engagement-to-support-lab.git
cd engagement-to-support-lab
# Check out the branch or release you intend to reproduce.
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python build_reference.py
python -m pytest -q
node --test tests/test_web.cjs
python package_demo.py
```

Rebuilding R requires a **Git checkout with history** so the separately committed protocol can be verified. If you used a shallow clone, fetch the full history first. A downloaded source ZIP can run the webpage and tests, but has no Git provenance for the rebuild command. Node 24 is used by CI; the browser has no Node dependency.

No raw-data download or retraining is needed for v0.2. The generator verifies the ten frozen v0.1 files, writes only `artifacts/v0.2/` and `web/reference-data.js`, and records protocol/code/input/output hashes in a manifest. Repeating it with unchanged inputs reproduces the outputs. CI checks tests, regeneration, JavaScript syntax, simulated-DOM interactions and standalone packaging. Simulated-DOM checks do not establish browser layout or accessibility conformance.

To reproduce the original model experiment, use a **separate checkout of `v0.1.0`** and follow that release's README (`download_data.py`, then `src/pipeline.py`). The raw archive transfers about 45 MB and extracts to about 450 MB. Re-running v0.1 in the v0.2 working tree changes frozen artifacts and is intentionally rejected by the R builder. The original archive checksum is in `artifacts/metrics.json`. Only load trusted joblib files; that serialization can execute code.

## What was implemented

- Day28 eligibility and point-in-time features, with future events excluded.
- Three feature ablations with training-only scaling and validation-only probability calibration.
- Historical cohort split with no student crossing train, validation and test.
- Held-out precision/recall at fixed workloads, average precision, ROC-AUC, Brier score, calibration bins and paired bootstrap comparison.
- Aggregate subgroup error checks, with demographic fields excluded from individual browser records and model predictors.
- Interactive review queue, individual trajectories, additive model explanations and six sourced research cards.
- Automated tests of data boundaries, eligibility, ranking, exports and evaluation arithmetic.

## What has not been demonstrated

This is historical, single-institution, distance-learning evidence. The outcome is withdrawal from a module, not leaving university. No contemporary client validation, intervention effect, teacher interviews, live feed-quality monitoring or production deployment has been performed. Activity is an observed proxy, not a diagnosis of motivation, belonging or mental health. Model contributions are associations, not causal explanations. Data missing from a trace is not evidence that no learning occurred.

## Files and evidence

- `docs/results.md`: actual experimental findings and cautions.
- `docs/results_v0.2.md`: reference comparison, metric trade-offs and next decision.
- `docs/protocol_v0.2.md`: separately committed R1 specification, population and case rules.
- `docs/product_comparison.md` and `docs/company_research_v0.2.md`: sourced product diagnosis.
- `artifacts/v0.2/manifest.json`: frozen baseline, protocol, input and output provenance.
- `docs/research_notes.md` and `docs/research.json`: literature, feature hypotheses and limits.
- `docs/criteria_evidence.md`: criteria mapping, including existing credentials and work still planned.
- `docs/independent_review.md`: independent methodology review.
- `docs/demo_script.md`: short demonstration narrative.
- `docs/decision_log.md`: actual scope and implementation choices.
- `docs/user_study_plan.md`: proposed teacher feedback study, not conducted research.
- `tests/test_pipeline.py`, `tests/test_reference.py`, `tests/test_web.cjs`: executable verification, including explicitly simulated browser interactions.

## Data attribution and software

Kuzilek, J., Hlosta, M. and Zdrahal, Z. (2017). Open University Learning Analytics dataset. *Scientific Data*,4,170171. https://doi.org/10.1038/sdata.2017.171 . Dataset distribution: https://archive.ics.uci.edu/dataset/349/open+university+learning+analytics+dataset . Dataset licence: CC BY4.0 https://creativecommons.org/licenses/by/4.0/ . Derived displays and tables select five modules, exclude ineligible/repeated records, aggregate early behaviour and add independently computed model predictions. They are not original published OULAD prediction results.

The Python/HTML/CSS/JavaScript source in this project is provided under the MIT licence in `LICENSE`. Dataset and derived-data attribution remain governed by CC BY4.0. Third-party libraries retain their own licences. No Kortext logo or proprietary assets are used.
