# Engagement-to-Support Lab — first working research prototype

[Live demo](https://rongsenzhang.github.io/engagement-to-support-lab/) · [Releases](https://github.com/rongsenzhang/engagement-to-support-lab/releases) · [Research roadmap](ROADMAP.md) · [Working practices and rollback](CONTRIBUTING.md) · [Change history](CHANGELOG.md)

The initial experiment is preserved as **v0.1.0**. New work is tracked through issues, branches, pull requests and versioned releases. The roadmap separates public product evidence, independently chosen baselines and proposed research; it is not a claim to reproduce Kortext's proprietary system.

An independent application project for Rongsen Zhang, developed with AI assistance. It explores the research-to-indicator and validation work described in the University of Stirling–Kortext KTP vacancy FAC02157. It is not a Kortext product or an integration with Stream, and does not implement the company's proprietary algorithm.

## Open the working demo

**Website:** https://rongsenzhang.github.io/engagement-to-support-lab/  
**Source repository:** https://github.com/rongsenzhang/engagement-to-support-lab

The hosted version works on phones, tablets and desktop browsers. Initial loading downloads the historical demonstration results; no login or API key is needed. Deployment instructions are in `docs/deployment.md`.

Open `web/index.html` directly in a modern browser. No installation, internet connection or API key is needed to explore the included real, precomputed test results. Alternatively, run `python3 run_demo.py` and visit the printed local address. The separately delivered `Engagement_Lab_v1.html` is a self-contained version of the same application.

The app has three views: Support queue, Model evidence, and Research & scope. Choose a module, a model and a review capacity; inspect a student record and its supporting observations. Later outcomes are hidden in the support view until explicitly revealed. They remain available in the retrospective evaluation view. Filters recalculate the selected cohort's ranking metrics; global validation results are labelled separately.

The browser does not train a model or score uploaded data. It explores real held-out predictions produced by the reproducible Python pipeline. There is no data upload, messaging, live institutional integration or external AI call.

## The research question

At day28, do personal activity changes and assessment-deadline context add useful predictive information beyond aggregate VLE activity for later module withdrawal? A, B and C use the same logistic-regression family; the changed feature sets can therefore be compared transparently. An inactivity rule is a separate comparator.

See `docs/protocol.md` for the prespecified population, features, split, model-selection rule, metrics and limitations. The source is the openly licensed OULAD dataset, not the applicant's students or Kortext customer records.

## Reproduce the analysis

Tested with Python3.9.6 on macOS arm64. The pinned scientific dependencies support Python3.9–3.12. Create a fresh environment rather than using a global environment.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python download_data.py
python src/pipeline.py
python -m pytest -q
python package_demo.py
```

Downloading needs an internet connection and approximately45 MB of transfer; extracted source data are approximately450 MB. Source CSVs are not duplicated in the delivery package. Their archive checksum is saved in `artifacts/metrics.json`. The feature stage uses DuckDB aggregation to avoid loading the full activity file into a pandas dataframe.

The first model run writes `artifacts/demo_data.json`, aggregate metrics, anonymous feature tables for every split, test predictions and `models.joblib`, then refreshes `web/data.js`. Only load the bundled model file from this trusted project; pickle/joblib is executable serialization.

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
- `docs/research_notes.md` and `docs/research.json`: literature, feature hypotheses and limits.
- `docs/criteria_evidence.md`: criteria mapping, including existing credentials and work still planned.
- `docs/independent_review.md`: independent methodology review.
- `docs/demo_script.md`: short demonstration narrative.
- `docs/decision_log.md`: actual scope and implementation choices.
- `docs/user_study_plan.md`: proposed teacher feedback study, not conducted research.
- `tests/test_pipeline.py`: executable verification.

## Data attribution and software

Kuzilek, J., Hlosta, M. and Zdrahal, Z. (2017). Open University Learning Analytics dataset. *Scientific Data*,4,170171. https://doi.org/10.1038/sdata.2017.171 . Dataset distribution: https://archive.ics.uci.edu/dataset/349/open+university+learning+analytics+dataset . Dataset licence: CC BY4.0 https://creativecommons.org/licenses/by/4.0/ . Derived displays and tables select five modules, exclude ineligible/repeated records, aggregate early behaviour and add independently computed model predictions. They are not original published OULAD prediction results.

The Python/HTML/CSS/JavaScript source in this project is provided under the MIT licence in `LICENSE`. Dataset and derived-data attribution remain governed by CC BY4.0. Third-party libraries retain their own licences. No Kortext logo or proprietary assets are used.
