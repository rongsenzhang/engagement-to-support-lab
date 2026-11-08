# Verification record

Date: 8 November 2026. These checks establish a runnable research prototype and internal consistency, not educational effectiveness or production readiness.

## Analysis

The full pipeline completed on the real OULAD source CSVs with NumPy 1.26.4. The final run produced 11,427 training, 4,769 validation and 6,362 held-out module records. All scores and feature values are finite. The selected model, metrics and source archive checksum are preserved in `artifacts/metrics.json`.

`python -m pytest -q` completed with **15 passed**. Tests cover eligibility and time boundaries, mutation of future information, absence of cross-split student overlap, model predictor restrictions, deterministic rankings, capacity arithmetic, Brier scores, probability reconstruction, calibration bins, subgroup audit and browser payload consistency.

## Browser walkthrough

Verified in the ChatGPT in-app browser using the local HTTP preview:

- All three views render: Support queue, Model evidence, Research & scope.
- Default model is C and default review capacity is 10%; later outcomes start hidden.
- Selecting BBB and 15% capacity recalculates to 1,691 eligible records and 254 reviews. Revealing outcomes shows context-model precision 17.3%, recall 20.4% and 210 selected non-withdrawals.
- Switching to the inactivity rule changes the score to elapsed days or “No record”, and removes probability interpretation.
- Selecting a different row updates the focused record, weekly activity, observations and enquiry prompt.
- The model comparison matches stored held-out metrics; selecting C displays its calibration and capacity charts.
- Aggregate subgroup results and limitations expand; research cards display source links and interpretation boundaries.
- Narrow and 1,280-pixel desktop layouts were inspected. The queue adapts its columns and places the selected record below it on narrow screens.
- No browser console errors or warnings were recorded during this walkthrough.
- CSV export completed from the BBB / C / 15% retrospective view. Its 254 rows, alias order and full-precision scores exactly match the stored predictions; 44 rows have later withdrawal outcomes. The UTF-8 byte-order mark supports spreadsheet opening.

During review, the check labelled `score_columns_loaded=false` was identified as a successful exclusion rather than an error. Its display label was corrected accordingly. The zero-activity chart's duplicate rounded tick was also corrected.

The final browser pass confirmed the corrected check labels, zero-activity axis and C-minus-A bootstrap interval, with no console errors or warnings. The standalone HTML embeds the exact browser-tested JavaScript and CSS, with no external script or stylesheet requests. Direct `file://` opening could not be checked in the in-app browser because that browser blocks local-file URLs; the tested interface used the standard local HTTP preview. Open the delivered HTML in a normal desktop browser for the offline version.

The downloadable app contains precomputed held-out results. Changing a filter does not retrain the model. Revealing outcomes is a presentation control, not a security boundary. Real interviews, institutional validation, uploaded-data scoring and prospective intervention evaluation remain outside this release.
