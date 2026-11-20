# Changelog

Versions identify this independent research prototype, not Kortext Stream releases.

## Unreleased

- Added optional local tutor chat to the review queue. A tutor can discuss the
  selected record's day-28 evidence using a personal OpenAI API key entered at
  startup. Replies stream into the record view and support follow-up questions.

## v0.4 — merged and deployed, 2026-11-15 (not tagged)

- Published through [PR #10](https://github.com/rongsenzhang/engagement-to-support-lab/pull/10) at main commit `9f759ce6940534455a90d88fc778eae4557be7b1`; [Pages run 43769188941](https://github.com/rongsenzhang/engagement-to-support-lab/actions/runs/43769188941) succeeded. PR #9 first merged the implementation into the research branch; PR #10 completed its delivery to main. No v0.4 release tag or GitHub Release download has been created.
- Added 50 explicitly synthetic learner cases and four tutor-practice tasks.
- Added optional facilitated sessions with anonymous codes, actual consent
  confirmation, initial/revised responses, five-of-fifty selection, approximate
  active time, separate notes, pause/skip and early-stop controls.
- Added local JSON/CSV export, validated restore and a private summary tool which
  excludes practice and unfinished sessions and rejects duplicate participants.
- Prepared participant information, Chinese facilitator script, blank observation
  and analysis templates, and a future adoption proposal. Real participants and
  user findings are pending, as requested by the owner.
- Integrated the trial as a separate route while retaining v0.1–v0.3 research.
  Study records are excluded from Git and source packages.


## v0.3 course robustness — merged and deployed, 2026-11-15 (not tagged)

- [PR #8](https://github.com/rongsenzhang/engagement-to-support-lab/pull/8) merged at main commit `218e5ecdd55a5abaa38d6bc947411a3843dc9404`; [Pages run 43768353345](https://github.com/rongsenzhang/engagement-to-support-lab/actions/runs/43768353345) succeeded.

- Add per-module historical comparisons and a fit-only course-prior baseline, with explicit B→C assessment and A→C trend-plus-assessment contrasts.
- Fix the protocol before fitting; add student-disjoint development leave-module-out evaluation, separate calibration and one bounded nonlinear comparator.
- Simulate late activity, late submissions and missing activity feeds while holding day-28 population/outcomes fixed; expose ranking and explanation changes with data-quality warnings.
- Add the interactive Course robustness view, result exports and an offline package containing the separate analysis payload.
- Preserve v0.1/v0.2 results and the default historical C queue. This milestone does not require optional deployment-maintenance PR #5.

## v0.2 research preview — merged and deployed, 2026-11-13 (not tagged)

- Add a primary-source company and competitor diagnosis, with a capability matrix separating known facts, our implementation and unknown proprietary details.
- Commit the R1 protocol before evaluation; add a deterministic, equally weighted reference index and separate reproducible artifacts. Preserve ten original experiment files with SHA-256 checks.
- Reorganise the homepage around the question, A/C/R comparison and four prespecified examples, including failures. Keep the original queue, models and evidence views.
- Expose reference arithmetic and applicability, use index units rather than probability, and export explicit CSV score units. Invalid reference overlays fall back to original results.
- Compare the same 637-record workload: R includes 157 later withdrawals, C 162 and A 121. R has higher ROC-AUC than C; no universal winner or causal benefit is claimed.
- Extend CI to rebuild the overlay, verify provenance and run simulated-DOM interaction checks; include R data in offline packaging.
- Complete an independent arithmetic/code review and real-browser desktop/mobile-width smoke checks, with screenshots and a downloaded-CSV outcome-visibility check. PR #3 merged at `c648e192fa9dd629cb70ff4fb61c11296e506ca1`; Pages run `43432542957` succeeded. No v0.2 release tag was created.

## Maintenance — 2026-11-08

- Establish a source-linked research roadmap, GitHub contribution/rollback guidance, and reusable automated verification before Pages deployment.
- Preserve the first experiment; no model, metric, data population or interface changes are part of this maintenance update.
- Established the sequence of product diagnosis, reference comparison, cross-course validation and actual tutor research.

## v0.1.0 — 2026-11-08

Initial research preview at commit `8324bae98803512329ecb407a07ad124108671d8`.

- Released the responsive support queue, model evidence and research rationale views on GitHub Pages.
- Included a reproducible Python pipeline, inactivity comparator, three logistic feature comparisons, validation calibration and public OULAD-derived artifacts.
- Verified 15 automated tests and all 34 published file hashes.
- Recorded the modest context-model improvement and its limits: 162 later module withdrawals in 637 selected records, versus 121 for the activity model; no claim of improved student retention or superiority over Kortext.
- Public historical data only; no live institutional integration, new-data scoring API, completed tutor study or proprietary algorithm reproduction.
