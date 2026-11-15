# Proposal for a future tutor-support pilot

**Status: proposal only. No institutional integration, pilot deployment, real user study or support-effectiveness claim is made.** The current deliverable is an independent demonstrator, public historical analysis and synthetic practice environment.

## Users and practical purpose

The first proposed users are tutors and student-support staff who already have a defined responsibility for an assigned cohort. Their task is to decide what information needs checking before a human conversation. A learning-analytics or institutional research partner would own data definitions, validation and monitoring. The interface would support that process; it would not allocate services or issue decisions automatically.

The demonstrator supports a concrete conversation: “This record changed, the assessment context is incomplete, and the prediction has known errors; what should be checked next?” Existing commercial engagement tools already provide dashboards, alerts and interventions. The proposal's evidence contribution is the transparent comparison, per-course limitations and observed user understanding, once those observations are actually collected.

## Data needed before any pilot

| Input | Needed definition and practical acceptance check |
|---|---|
| Enrolment scope | Course/presentation identifiers, registration changes and authorised staff/cohort membership; no cross-cohort browsing by default |
| Activity events | Event timestamp, ingestion timestamp, meaning and source availability; distinguish a zero from a failed or delayed feed |
| Assessment expectations | Applicable deadline, approved extension and assignment applicability; do not treat every missing submission as overdue |
| Submission records | Event and ingestion dates, correction process and known transfer delays; verify point-in-time availability |
| Local teaching context | Scheduled breaks, placements and expected offline learning; agree what the data can actually describe |
| Outcome for evaluation | A locally agreed, time-bounded event distinct from a support decision; assess label completeness and delays |
| Review process | Human owner, review capacity, escalation rules, case-note location and how incorrect records are corrected |

No institutional input currently enters the prototype. A pilot would need a documented data contract, an authorised integration and a review of the institution's own requirements before any real records were processed. Existing OULAD results cannot supply current local calibration or prove generalisability.

## Integration boundary

Use a restricted institutional environment for any later pilot. An ingestion/validation service should report availability and delays before a scoring service produces a versioned result. The tutor interface should retrieve only the authorised cohort and show observed facts, known missing context, score meaning and an explicit human review action. Institutional case notes and messaging should remain in the institution's approved systems through a separately authorised integration.

The present static demo does none of this. It contains public-data examples and a separate synthetic study module, without login, access control, live updates, external messages or personal-data storage. It is not suitable for adding real student files by simply replacing the bundled JavaScript data.

## Staged validation and decision gates

| Stage | Evidence needed | Decision criterion before moving on |
|---|---|---|
| Formative understanding, 3–5 adults | Actual task observations, neutral interview notes, skipped tasks and contrary examples | Document and address consequential misinterpretations; keep any unresolved misunderstanding visible. This stage supplies design input, not population-wide validation |
| Data feasibility in an authorised environment | Point-in-time reconstruction, identifier coverage, source delays and applicability checks on a suitable local sample | Data owner confirms that required fields mean what the analysis assumes; unknown or stale feeds are visibly withheld from decision use rather than treated as disengagement |
| Silent prospective evaluation | Prespecified population, student-disjoint evaluation, per-course performance/calibration, capacity metrics and subgroup uncertainty | Compare against a simple locally learned prior and the current process; report negative results and do not choose deployment thresholds retrospectively from the evaluation outcomes |
| Limited human review pilot | Agreed cohort, trained staff, recorded review time, corrections, misunderstandings, workload and participant/student feedback | Evidence supports usable interpretation and feasible workload; pause if a consequential misunderstanding or feed defect remains unresolved |
| Separate intervention-effect study, if justified | A suitable ethical and methodological design for the local setting, outcomes and confounding | Do not infer support benefit from ranking metrics or from changes observed after outreach alone |

The operational targets for a future pilot must be agreed with its data owner and tutors before evaluation. Useful candidates include counts of stale records caught before review, unsupported interpretations corrected, time spent checking context, unresolved cases and whether staff can distinguish ranking, probability and intervention benefit. This proposal does not invent numerical performance targets without local evidence.

## Ownership, review and stop conditions

The institutional data owner should own schema changes and feed quality; a research lead should own the evaluation protocol and interpretation; the tutor/support team should own the actual review process. The future system needs a named route for correcting mistaken data and documenting overrides. Review per-course calibration and workload when cohorts, calendars, data feeds or policy change.

Pause the relevant output when required sources are unavailable, course applicability is unknown, access boundaries fail or staff misinterpret an indicator in a way that could affect an actual decision. Record the defect and correction rather than silently replacing missing information with zero. A pilot also needs an agreed rollback and manual-workflow fallback appropriate to its integration.

## Evidence still needed

Actual tutor observations and feedback, current local data, external-course/institution evaluation, prospective validation and any intervention-effect evidence remain unavailable. The project can demonstrate how to investigate these questions and prepare the software/materials; it cannot substitute simulated interactions for that evidence.
