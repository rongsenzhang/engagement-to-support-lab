# Engagement-to-Support Lab — v0.4

[Open the live demo](https://rongsenzhang.github.io/engagement-to-support-lab/) · [中文使用说明](docs/project_guide_zh.md) · [Study kit](docs/study/README.md) · [Research roadmap](ROADMAP.md) · [Change history](CHANGELOG.md)

A research demonstrator for inspecting learning indicators, comparing review
lists, testing course differences and practising careful tutor interpretation.
The current application combines historical OULAD analysis with a separate
synthetic tutor-practice workflow.

**Published application: v0.4.** It reached `main` through [PR #10](https://github.com/rongsenzhang/engagement-to-support-lab/pull/10)
on 15 November 2026, and its [Pages deployment succeeded](https://github.com/rongsenzhang/engagement-to-support-lab/actions/runs/43769188941).
The system and study materials are ready. Actual volunteers, observations and
participant findings are still pending, as agreed with the project owner.

Developed for Rongsen Zhang with AI assistance as an independent project aligned
with the University of Stirling–Kortext KTP research objectives. It is not a
Kortext product, a Stream integration or a reproduction of its proprietary model.

## What you can do now

| View | Purpose |
|---|---|
| Research question | Compare the historical activity model, contextual model and transparent reference rule at the same review workload; inspect successes and failures. |
| Review queue | Inspect a record, compare models and export the review list. In local chat mode, ask follow-up questions about the selected record's day-28 evidence. |
| Model evidence | Compare ranking, probability error, calibration and capacity trade-offs, with evaluation boundaries and aggregate error checks. |
| Course robustness | Inspect within-course results, held-out courses, a course-prior baseline, a controlled nonlinear comparator and simulated late/missing records. |
| Tutor practice | Work through four tasks using 50 fictional cases; save initial and revised judgements, select five records, pause tasks and export/restore a session. |
| Sources & scope | Read the research rationale, public product diagnosis, data attribution and limits on interpretation. |

The browser uses precomputed research results and invented practice cases.
The four tutor-practice tasks and session exports run locally in the browser.

## Open or run the app

Use the [live demo](https://rongsenzhang.github.io/engagement-to-support-lab/)
without installation, login or an API key. To run a local checkout:

```sh
python3 run_demo.py
```

The command opens the local page. You can also open `web/index.html` directly.
Existing analysis is included; downloading raw OULAD data or retraining is not
required to use the app.

```sh
python3 package_demo.py
```

This creates `dist/Engagement_Lab_v0.4.html` and
`dist/Engagement_Lab_v0.4_Source.zip`. The HTML includes the application assets
for offline use. A downloaded file is a fixed copy and does not update itself.

**GitHub Releases is a separate archive:** it currently contains the historical
[v0.1.0 release](https://github.com/rongsenzhang/engagement-to-support-lab/releases/tag/v0.1.0),
not a v0.4 release download. Use the live demo or build the current checkout for
v0.4. Publishing the website does not automatically create a release tag or ZIP.

### Ask about a review-queue record

On macOS you can double-click `start_tutor_chat.command` in Finder. From a terminal on any supported platform, run this command in the project directory:

```sh
python3 run_demo.py --chat
```

Paste your existing OpenAI API key at the **hidden terminal prompt** and press
Enter. The server keeps it in memory for that run. If your terminal already
has `OPENAI_API_KEY` set, the server uses that value. Close the session with
Ctrl+C. Keep keys out of chat messages, source files and shell commands.

Open **Review queue**, select a record and ask, for example, “Which facts here
support checking the submission record, and what would a late data feed change?”
Read the answer as it streams in, then ask a follow-up. Each question uses your OpenAI API credits.
The local server sends the question, recent conversation and selected public
day-28 evidence to OpenAI. Keep personal student details and private study notes
out of questions. The evidence includes only information available at the
snapshot, even if you reveal the later outcome on the page.

GitHub Pages and the standalone HTML provide the static review queue. Chat runs
in the local server and needs internet access. The default model is
`gpt-4.1-mini`; set `OPENAI_MODEL` in the launching environment to select a
different Responses API text model with streaming support.

## What the completed analysis found

The latest analysis asks whether assessment context helps within and across
courses, and how delayed records affect a review list.

- Adding assessment features to activity and trend (B → C) improves ranking in
  BBB, DDD and FFF, but worsens it in EEE and GGG. Pooled improvement is not proof
  of a benefit in every course. EEE/GGG have no eligible assessment due by day 28.
- Five development leave-course-out experiments keep students apart and separate
  fitting, selection and calibration. The nonlinear comparator has higher mean
  average precision than C (0.21459 versus 0.20233), but worse mean Brier error
  (0.13186 versus 0.12999), and does not win every course.
- Withholding 60 recent submission records replaces 54 positions in C's
  637-record list. A score change caused by a delayed record does not establish
  a change in learning. These are simulations, not measured feed reliability.
- C remains the original queue default. Negative findings and metric trade-offs
  are retained; no new result automatically replaces the chosen model.

See the [full findings](docs/results_v0.3.md),
[fixed comparison protocol](docs/protocol_v0.3.md) and
[analysis verification](docs/verification_v0.3.md). B → C isolates added
assessment context; A → C adds both trend and assessment.

These are exploratory historical OULAD results. The outcome is later withdrawal
from one module, not leaving university or a measured need for support. They do
not establish prevented withdrawals, current institutional accuracy or superiority
to a commercial system.

## Use the tutor-practice and study kit

Start with **Tutor practice → Practice**. The four tasks cover activity patterns,
an apparently missing submission followed by hypothetical context, manual
selection of five from fifty cases, and an illustrative prediction error.
All cases, scores and outcomes in these tasks are invented.

Save the initial judgement before revealing context; record revisions separately.
Switching lab views pauses timing and retains notes. **Export JSON before
reloading or closing the tab.** JSON preserves the complete record for restoration;
CSV supports manual analysis. Practice is always excluded from participant counts.

For actual consenting adult volunteers, follow the
[participant information](docs/study/participant_information.md) and
[Chinese facilitator guide](docs/study/facilitator_guide.md). The kit also includes
an [observation template](docs/study/observation_template.csv),
[analysis template](docs/study/analysis_template.md) and
[future adoption proposal](docs/study/adoption_proposal.md).
Keep actual session records in ignored `private_study/sessions/`, outside `web/`
and public PRs. To generate descriptive counts locally:

```sh
python3 src/study_summary.py --input-dir private_study/sessions --output private_study/summary.json
```

An empty directory reports zero participants. Practice and unfinished sessions
are excluded; final stopped sessions are distinguished from completed ones.
The tool does not infer themes, verify attendance or create participant findings.
Recruitment, actual sessions, synthesis and feedback-driven design changes remain
future work. See the [study plan](docs/user_study_plan.md).

## Verification and continuing development

The v0.4 implementation passed **58 Python tests and 39 JavaScript tests**, plus
syntax and packaging checks. Actual browser checks covered all four practice
tasks, downloads, restoration, pause/return behaviour and desktop/mobile widths.
See [verification and screenshots](docs/verification_v0.4.md). These checks do not
constitute a completed user study or certified accessibility audit.

For development, create a project environment with the pinned dependencies.
The analysis was tested locally with Python 3.9.6; CI uses Python 3.11 and Node 24.
The scientific requirements support Python 3.9–3.12. The browser itself does not
need Node or those dependencies.

```sh
git clone https://github.com/rongsenzhang/engagement-to-support-lab.git
cd engagement-to-support-lab
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pytest -q tests
node --test tests/test_*.cjs
python package_demo.py
```

New delivery PRs should target `main`. If work depends on another branch, the
implementer resolves that dependency and verifies the target before requesting
merge. Preserve separate protocol commits with **Create a merge commit** and use
normal revert PRs for rollback. See [working practices](CONTRIBUTING.md) and the
[Chinese guide](docs/project_guide_zh.md). Optional maintenance PR #5 is not part
of the current app; automatic new-version refresh notices are not yet deployed.

## Earlier versions and research provenance

**The application version and the origin of an experiment are different.**
v0.4 includes earlier measured results as well as the newer analyses and study
workflow. A reference to v0.1 or v0.2 in a protocol or results file identifies when
that evidence was produced; it does not mean the running application is old.
The original results are not relabelled as newly generated v0.4 experiments.

| Stage | Evidence retained in the current app |
|---|---|
| v0.1 | Original day-28 features, inactivity rule, logistic A/B/C comparison, calibration, capacity and subgroup checks. [Original findings](docs/results.md) |
| v0.2 | Public product diagnosis, transparent R1 reference rule and deterministic failure cases. [Reference findings](docs/results_v0.2.md) |
| v0.3 | Per-course and held-out-course comparisons, nonlinear comparator and data-availability stress analysis. [Course findings](docs/results_v0.3.md) |
| v0.4 | Synthetic tutor workflow and study materials; actual participant research pending. [Study kit](docs/study/README.md) |

The historical comparison uses 6,362 enrolments and 637-record review lists.
A includes 121 later module withdrawals, C 162 and R 157. These are prediction
counts, not students saved. R has higher ROC AUC than C, while C has higher AP and
top-list precision; neither result establishes a universal winner.

R1 is `100 × mean(days_since_last/28, 1-active_days_28/28,
overdue_fraction when an assessment was due)`. With no assessment due, it averages
only the two activity components. The fixed equal weights are an independent
modelling choice; R is not a probability or Kortext's formula. See its
[protocol](docs/protocol_v0.2.md) and the
[source-linked product comparison](docs/product_comparison.md).

### Optional: reproduce the retained analyses

To rebuild the reference overlay from committed outputs:

```sh
python build_reference.py
```

This requires a Git checkout with full history to resolve the original protocol
commit. A source ZIP can run the app and tests but lacks that history. The builder
writes `artifacts/v0.2/` and `web/reference-data.js`; no raw download or retraining
is needed. CI checks the preserved outputs and reference regeneration.

To reproduce course robustness with the scientific environment above:

```sh
# Only needed if the seven original OULAD CSVs are not already available locally.
python download_data.py
python build_robustness.py --raw-dir data/raw
```

An existing directory can be supplied through `--raw-dir`; it is read, not
modified. Outputs go to `artifacts/v0.3/` and `web/robustness-data.js`. The original
experiment is not overwritten. Only development blocks choose the nonlinear
comparator; the already inspected 2014J comparison remains exploratory.

To reproduce the initial model fitting, use a **separate checkout of `v0.1.0`**
and follow its README (`download_data.py`, then `src/pipeline.py`). The original
archive is about 45 MB and extracts to about 450 MB. Rerunning that pipeline in
the current checkout changes preserved artifacts and is rejected by the reference
builder. Load only the repository's trusted model files; joblib can execute code.

## Supporting documents

- [Current five-minute demonstration](docs/demo_script_v0.4.md)
- [Research and feature rationale](docs/research_notes.md)
- [Implementation decisions](docs/decision_log.md)
- [Application criteria and evidence boundaries](docs/criteria_evidence.md)
- [Independent methodology review](docs/independent_review.md)
- [Company and competitor source register](docs/company_research_v0.2.md)

## Data attribution and software

Kuzilek, J., Hlosta, M. and Zdrahal, Z. (2017). Open University Learning Analytics
dataset. *Scientific Data*, 4, 170171. [Paper](https://doi.org/10.1038/sdata.2017.171) ·
[Dataset](https://archive.ics.uci.edu/dataset/349/open+university+learning+analytics+dataset) ·
[CC BY 4.0 licence](https://creativecommons.org/licenses/by/4.0/).
Derived displays select five modules, apply eligibility/split rules, aggregate
early behaviour and add independently computed predictions. They are not original
published OULAD prediction results. Synthetic study cases are invented separately.

Source code is provided under the [MIT licence](LICENSE). Dataset attribution
remains governed by CC BY 4.0; third-party libraries retain their licences. No
Kortext logo or proprietary assets are used. There is no live institutional
integration, causal support-effect claim or completed participant study.
