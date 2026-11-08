# Research notes and indicator rationale

Research reviewed on 8 November 2026. These notes support an independent application prototype for the University of Stirling / Kortext KTP role. They do not describe an official Kortext system or a verified gap in its product.

The machine-readable evidence cards are in `research.json`. Feature definitions and evaluation outputs must agree with `data_contract.md` and the implemented pipeline. A citation motivates a question; it does not validate our feature or its proposed effect.

## Sources inspected

**1. Nguyen, Q., Huptych, M. and Rienties, B. (2018).** *Linking students' timing of engagement to learning design and academic performance*. LAK '18. DOI: [10.1145/3170358.3170398](https://doi.org/10.1145/3170358.3170398). [Full text, Open University repository](https://oro.open.ac.uk/53939/1/p141-nguyen.pdf).

Inspected the study design, discussion and limitations, especially sections 4-5. The study connects learning schedules and observed study timing. Its analysis is limited to one module and course completers; off-platform activity is unobserved. This supports investigating time and task context, while leaving our withdrawal features to be tested independently.

**2. Flanagan, B., Majumdar, R. and Ogata, H. (2022).** *Early-warning prediction of student performance and engagement in open book assessment by reading behavior analysis*. International Journal of Educational Technology in Higher Education, 19, 41. DOI: [10.1186/s41239-022-00348-4](https://doi.org/10.1186/s41239-022-00348-4). [Publisher full text](https://link.springer.com/article/10.1186/s41239-022-00348-4).

Inspected the method, learning setting, discussion and limitations. This is a retrospective study of digital reading around an open-book assessment. It distinguishes engagement and attainment and discusses misclassification when learning occurs outside the observed platform. Our inactivity rule is a deliberately simple benchmark, not a replication of this model.

**3. Fredricks, J. A., Blumenfeld, P. C. and Paris, A. H. (2004).** *School Engagement: Potential of the Concept, State of the Evidence*. Review of Educational Research, 74(1), 59-109. DOI: [10.3102/00346543074001059](https://doi.org/10.3102/00346543074001059). [Full-text copy inspected](https://inquirylearningcenter.org/wp-content/uploads/2015/08/Fredricks2004-engagemt.pdf).

This is a conceptual research review, not a new OULAD experiment. Inspected the definitions and measurement discussion. The distinction between behavioural, emotional and cognitive engagement defines our measurement boundary: recorded activity is not a complete measure of engagement. We do not infer motivation, belonging, anxiety or mental health from these logs.

**4. Kuzilek, J., Hlosta, M. and Zdrahal, Z. (2017).** *Open University Learning Analytics dataset*. Scientific Data, 4, 170171. DOI: [10.1038/sdata.2017.171](https://doi.org/10.1038/sdata.2017.171). [Full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC5704676/). [Dataset and CC BY 4.0 licence](https://archive.ics.uci.edu/dataset/349/open+university+learning+analytics+dataset).

Inspected the selection, anonymisation and table definitions. The data include module presentations, dated activity, assessment deadlines and submissions, and registration/withdrawal dates. The paper recommends considering February and October presentations separately. Cite the creators and identify our transformations when distributing derived data.

**5. Kortext (20 November 2024).** *Your questions answered: Keele's engagement insights*. [Official case account](https://kortext.com/stream/blog/retention/keele-engagement-insights/).

Inspected the questions about evaluation and consistent mentoring. Keele's example makes course scheduling a relevant business consideration. It does not provide a causal estimate, prove a product deficiency, or validate an OULAD calendar feature. The prototype includes only the assessment context available in its data.

## Our testable designs

All windows end at the day-28 snapshot. The exact target and split are recorded in generated metadata. Values after the snapshot must never enter the feature table.

| Indicator group | Computation/design | Question to test | Boundary |
|---|---|---|---|
| Activity | Sum observed clicks and count days with activity through the cutoff; also inspect the most recent week | Is cumulative/recent activity useful against the inactivity comparator? | Activity is neither time on task nor comprehension |
| Recency | Days since the last recorded event, with an explicit no-observed-activity flag | Does a transparent inactivity ordering identify useful candidates for human review? | Missing traces cannot distinguish every reason for silence |
| Personal change | Compare days 22-28 with days 15-21; use a smoothed log click ratio and change in active days | Does personal change add information to the activity model? | The windows and smoothing are our modelling choices |
| Assessment context | Count assessments due by the cutoff and submissions known by the cutoff; preserve the no-due case | Does task context add information to the trend model? | Published deadlines do not capture individual extensions |
| Course calendar | Show available weekly activity and assessment context; do not synthesize teaching dates | Could verified breaks and teaching arrangements explain additional variation in a later study? | Full calendar context is a planned extension |

Use the same logistic model family, population and evaluation procedure for the activity, trend and context variants. This makes the feature-group comparison interpretable. Improvement is an empirical result, not an assumption. Model selection uses validation data; the held-out test is reserved for reporting. A negative or negligible result remains useful evidence about the proposed indicators.

Compare models at the same contact capacity. Report precision and recall at that capacity, average precision, calibration and Brier score where applicable. A raw inactivity score is a count of days and has no probability calibration. Reported values come from the executed pipeline only.

## Interpretation and human use

The queue suggests whom a tutor might review. An explanation links the recommendation to observed activity and task records. It cannot establish the reason for a change or the effect of contacting a student. Appropriate prompts invite clarification about study progress, alternative learning activity and assessment arrangements.

No assessment mark is used when its release time is unknown. Later module withdrawal and final results are evaluation information only. A module withdrawal must not be presented as a confirmed departure from university. Subgroup checks describe error patterns; excluding demographic predictors does not prove fairness.

## Proposed qualitative follow-up — not conducted

These are study materials for a possible follow-up, not evidence that interviews or a mixed-method evaluation have taken place. With suitable institutional permission and participant agreement, invite tutors and learning-analytics staff to inspect a small set of anonymous cases. Record the task, observation, interpretation and design response separately.

Suggested prompts:

1. What information would you check before deciding whether to contact this student?
2. Which explanation is useful, unclear or potentially misleading?
3. Could the course timetable, an extension or learning elsewhere explain this pattern?
4. What would you ask the student, and what should the system avoid assuming?
5. How would this queue fit your available time and existing support process?

Proposed tasks: interpret a changing trajectory; identify a missing-context case; choose a contact list within a stated capacity; explain one false alert after revealing the historical outcome. A simple analysis template can record case ID, participant role, observed difficulty, provisional theme, contrary evidence and proposed change. Combine those observations with quantitative error analysis only after the study has actually been conducted.

Open questions include whether the explanations support sound decisions, which context is missing, and which workflow changes would be acceptable. Actual intervention benefit requires a separate prospective evaluation; a retrospective prediction result cannot supply it.
