# v0.4 system and study-kit verification

Executed 15 November 2026. **System/materials ready; real participants and study
findings pending.** All browser entries described below were engineering
practice, not volunteer sessions.

## Automated checks

- **58 Python tests passed:** 43 preserved analysis checks and 15 local study
  summary checks.
- **39 JavaScript tests passed:** preserved application/robustness checks, 19
  study tests and a main-router pause/return integration check.
- All browser scripts passed syntax checks; Python sources compiled.
- Study checks cover consent metadata, manual five-record capacity, initial
  judgement before context disclosure, separate revision, pause/resume, skip,
  early stop, JSON restoration, size/schema constraints, HTML escaping and CSV
  formula protection. Summary checks exclude practice/unfinished sessions and
  reject duplicate participants and invalid final records.

Independent code review found and corrected three concrete faults: inconsistent
synthetic recency/weekly activity; event-log saturation that could interrupt
pausing or make exported records unrestorable; and incomplete saved initial
judgements accepted on import. Regression tests reproduce those paths. The event
history now stops at 500 entries with an explicit truncation flag; current task
status, responses, timing and help totals continue to be saved. Summary output
distinguishes completed, skipped and paused durations.

Browser inspection also found that separate per-case chart scales could make 50
and 110 clicks look equally tall. Cases in one task now use a shared scale,
visibly stated and tested. These fixes arose from engineering inspection, not
participant feedback.

## Actual browser walkthrough

Using the integrated app served locally:

1. Opened the six-view navigation and the practice setup. A facilitated session
   with missing required information was refused; no real agreement was asserted.
2. Completed all four tasks in Practice mode. Saved responses, disclosed the
   hypothetical extension only after the initial judgement, recorded a revision,
   selected five cases and verified that a sixth is refused, and completed the
   probability/error explanation.
3. Left and returned to the trial route: the task was paused and notes remained.
4. Finished the session; downloaded actual JSON and CSV files. The JSON and four
   CSV rows identify practice and completed tasks. No network upload occurred.
5. Rejected malformed pasted JSON, then restored the full exported practice
   record. The restored UI showed all four tasks completed.
6. Ran the actual browser JSON through the Python summary: **participant_count =
   0; practice_sessions_excluded = 1**. This is a software check only.
7. Inspected desktop 1280 × 720 and mobile 390 × 844 layouts. The document does
   not overflow either width; the 620px capacity table scrolls within a 314px
   container on mobile. No browser JavaScript errors were recorded.
8. Reloaded the final chart correction and observed the shared-scale bars (50
   clicks shorter than 110). Reset the engineering session and left the practice
   entry ready for use.

Screenshots: [desktop](screenshots/v0.4-desktop.png),
[task](screenshots/v0.4-tasks.png), [mobile](screenshots/v0.4-mobile.png).
This is responsive browser checking, not a physical-device, full assistive-
technology or certified accessibility audit.

## Package and publication

`python package_demo.py` builds `Engagement_Lab_v0.4.html` and a source ZIP,
including the study scripts/styles. `private_study/` is excluded from both Git
and the source archive. The generated HTML has no external application script
or stylesheet references. The browser tool blocks file URLs, so direct
double-click opening was not browser-tested; the same source application was
exercised through local HTTP.

v0.4 follows the v0.3 research branch; its PR is separately reviewable. Neither
feature branch depends on maintenance PR #5. A pushed branch is not a public
Pages deployment. Merge v0.3 first, then confirm v0.4 targets main, merge it and
wait for successful Pages deployment before describing the public demo as v0.4.

The study kit is complete for preparation, but human recruitment, actual
agreement, observations, synthesis and feedback-driven revisions remain future
work. No volunteer counts or findings have been fabricated.
