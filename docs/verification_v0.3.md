# v0.3 verification

Executed locally on 15 November 2026. This records software checks, not evidence
of educational effectiveness. Real participant research has not occurred.

## Analysis and automated checks

- Full OULAD robustness pipeline executed successfully in about 7 seconds using
  the existing local raw CSVs and pinned scientific environment.
- Python: **43 tests passed**. Existing future-event boundaries, reference-model
  checks and student isolation remain covered; nine new tests cover the new
  partition, comparator, simulation and report contracts.
- JavaScript: **19 tests passed** (11 existing, eight robustness UI tests).
- Independently recalculated AP (including score ties), Brier and all 5/10/20%
  capacity counts/precision/recall from exported predictions for six historical
  populations, five outer courses and pooled outer predictions. Values match the
  generated report.
- Independently checked exported student-group membership: fitting, calibration
  and outer evaluation are disjoint in all five folds.
- The added post-result assessment-applicability counts change no previously
  generated prediction or metric. The diagnosis is labelled descriptive.

## Real browser checks

The actual local page was opened in the in-app browser, not only a simulated DOM.
Verified course selection (EEE), the no-assessment-due note, held-out macro and
GGG results, submission-delay selection, C-only filtering, list turnover and
expanded before/after input evidence. Negative differences and missing-data
warnings are visible. No browser JavaScript errors were recorded.

Desktop width 1280 and mobile width 390 both had document width equal to the
viewport. Wide result tables scroll within their own containers. Screenshots
were saved locally for the PR review. Original queue/evidence functionality
continues to be covered by the existing regression suite.

## Delivery boundary

The standalone package includes the new styles, analysis payload and scripts.
Packaging succeeded; browser script syntax checks also passed. The browser tool
blocks local file URLs, so direct double-click launch of the packaged HTML was
not browser-verified here; the same source application was exercised over local
HTTP as described above.

New research work is based on main v0.2 and does not depend on maintenance PR #5.
The feature branch and PR preserve the separate protocol commit. Publication is
complete only after merge to main and successful Pages deployment; this file
does not claim that a local run has updated the public website.
