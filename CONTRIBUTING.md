# Working on this research prototype

GitHub is the canonical home for this project's code, public evidence, decisions and release history. Local checkouts are working copies. The project is independent of Kortext; repository versions do not represent Stream product versions.

## One question per change

1. Open an issue stating the business question, evidence, proposed experiment and acceptance criteria. Keep unverified company gaps explicitly labelled as hypotheses.
2. Branch from current `main`, for example `research/course-robustness` or `ui/failure-cases`. Never replace a released experiment silently.
3. Commit the protocol before model selection. Record data checksum, feature configuration, seed, environment, split, code revision and generated metrics. The v0.1 test results have already been observed; label follow-up analyses accordingly.
4. Open a pull request with the final problem, changed behaviour, actual checks and limitations. Include the issue link and screenshots when the interface changes. AI assistance must be described accurately.
5. Let the **Verify research prototype** checks pass. Review both positive and negative findings. Merge through GitHub when the requested work is complete.
6. `main` is the public-demo branch. The Pages workflow verifies the code and artifacts before deployment. Create a new release tag after checking a meaningful milestone and update `CHANGELOG.md`.

For v0.2, choose **Create a merge commit** when merging its PR. Do not squash or
rebase this branch: the manifest records the separately committed protocol, and
regeneration resolves that commit from Git history. Rewriting its identity would
change provenance and cause the post-merge artifact check to fail. Keep the
protocol commit and subsequent implementation commits intact. This constraint is
documented here; repository merge settings do not currently enforce it.

This is the team's operating convention. Branch protection is not currently configured; a pull request requirement is not technically enforced. Reusable CI and deployment checks are versioned in `.github/workflows/`.

## Pull request description

Use this short structure, adding only details relevant to the change:

```markdown
## Problem and result
Explain the concrete question and resulting behaviour. Link the issue.

## Evidence
State the actual experiment/checks, data and protocol revision, results and failure cases.

## Limits and next decision
Distinguish public product facts, modelling assumptions, exploratory findings and untested claims.
```

## Checks from a clean checkout

```sh
python -m pip install -r requirements.txt
python -m pytest -q
node --check web/app.js
node --check web/data.js
python package_demo.py
```

The existing tests use synthetic boundary fixtures and the committed public artifacts, so they do not require the raw OULAD download or retraining. This verifies software/data consistency; it does not rerun the original experiment or establish predictive effectiveness. To reproduce that experiment, follow the full instructions in `README.md`.

## Revert an update

For a merged pull request, use GitHub's **Revert** action and merge the resulting revert PR after checks pass. GitHub may require a manual revert when conflicts exist. A revert creates a new commit retaining the original history; do not force-push or move an existing release tag.

For a larger return to a known version, create a separate rollback branch and restore the intended tracked paths from the release tag, then open and verify a PR. Review code, artifacts and workflow changes together. Use `v0.1.0` as the initial baseline. A tag or release page alone does not change the live website: the rollback must reach `main` and the Pages deployment must succeed.

This project has no live database or external institutional integration. If those are added later, reverting code alone will not reverse data migrations, sent messages or external actions; they will need their own recovery design.

## What belongs in the public repository

- Source, tests, research protocols, decision records, issue/PR history, aggregate results and appropriately attributed public-data artifacts.
- Licensed raw datasets can remain at their original source with download instructions and checksums. Keep large repeated run outputs as release assets when needed, with a small tracked manifest.
- Never commit credentials, private student records, participant identities or confidential interview notes. Publish only appropriately de-identified research synthesis.

GitHub Actions shows test and deployment history. It does not currently monitor a live model for data drift, institutional outcomes or intervention benefit.
