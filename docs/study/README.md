# v0.4 tutor practice and formative-study kit

**Status: software and materials prepared; participant recruitment and real sessions have not occurred.** The owner chose to prepare the system first and arrange volunteers later. Practice runs and automated tests are not participant evidence. There are no interview findings, observed themes or feedback-driven improvements to report yet.

## What is ready

- A local-only browser module with 50 deliberately invented learner records and four tasks.
- Practice and facilitated modes. Facilitated mode requires an anonymous participant code, broad role, adult/agreement confirmation and an agreed withdrawal deadline.
- Initial interpretation, a proposed next check, staged disclosure of hypothetical context, and a preserved revised interpretation.
- Manual selection of five from fifty records; approximate active-task timing, pauses, help requests, completion/skipping and separate observational notes.
- Export preview, JSON save/restore and task-level CSV. Records stay in memory unless deliberately downloaded; there is no upload, automatic browser storage or real student-contact action.
- A local count summary which excludes practice and unfinished sessions and refuses duplicate participant codes. It does not analyse free text or claim that a study has taken place.

The module is loaded by `web/study-data.js`, `web/study.js` and `web/study.css`. The main application owns navigation and calls `LAB_STUDY_UI.render(main)` for the trial view and `LAB_STUDY_UI.suspend()` when leaving it. The original public-data analysis remains a separate part of the demo.

## Materials and order of use

1. Read [participant information and agreement](participant_information.md). Arrange the actual dates, local contact route and any institutional permission before recruitment.
2. Follow the [Chinese facilitator script](facilitator_guide.md). Use **Practice** to rehearse; use **Facilitated** only with an actual consenting adult volunteer.
3. Capture neutral observations in the page or the blank [observation template](observation_template.csv). Do not put participant identities or real student details in either.
4. Export JSON before reloading or closing the page. The full record and drafts remain available while switching between lab pages, but not across a page reload unless restored from an export.
5. Place actual session exports in a local, access-controlled directory outside published web content, such as `private_study/sessions/`. The repository and source-package exclusions must cover `private_study/`; check this before storing real records. Keep recruitment/contact information separately.
6. Produce descriptive counts locally, then complete the [analysis and design-decision template](analysis_template.md) manually using actual observations and contrary examples.
7. Use the [adoption proposal](adoption_proposal.md) as a proposal for a future pilot, not a claim that integration or benefit has been established.

```sh
python src/study_summary.py --input-dir private_study/sessions --output private_study/summary.json
```

The summary reads only JSON files directly in the input directory. Keep one final export per session. Separate initial sessions and retests into different directories; reusing participant codes within one round is rejected rather than double-counted. No input produces zero participants and null timing averages. Stopped sessions are included with their unfinished tasks visibly counted; paused/unfinished sessions are excluded until finalised. Practice is always excluded.

The script counts facilitator-recorded data; software cannot verify that a person attended or consented. A checked box or an imported file is not independent proof of a real session. Confirm those facts in the actual study process.

## Task set and interpretation boundaries

Task set `synthetic-tutor-tasks-1` uses fictional `SYN-001`–`SYN-050` cases. The first pair has identical click totals but different trajectories. The third case discloses an extension only after an initial response has been saved. The fourth supplies an invented probability and invented non-withdrawal outcome. None of these numbers comes from a trained model or an observed student.

The 50-record capacity table is ordered by an illustrative index. It is not a probability, a validated ranking or an allocation of student support. The participant selects records for further checks; the tool never selects recipients of a real service.

Task times include note entry and are approximate active-interface time. Switching tasks or leaving the trial view pauses timing. JSON export captures a paused snapshot without pausing an ongoing task; restoring a file never resumes a timer automatically. Skipped tasks remain distinct from completed tasks. Ending early is permitted.

## What remains for the real study

Recruit 3–5 relevant adult volunteers, obtain actual agreement, run sessions, inspect de-identified observations and record uncertainty. Only then may the project report participant counts, themes or an evidence-driven interface change. If a change is proposed from software inspection rather than user feedback, label that source accurately. Preserve disagreement and failed interpretations rather than selecting only favourable comments.

Publish an anonymised synthesis and an actual before/after account only after this work has occurred and the agreed withdrawal deadline has passed. Do not publish raw JSON/CSV notes. The study cannot establish contemporary prediction accuracy, general institutional adoption or an effect of outreach on withdrawal.
