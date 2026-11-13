# Evidence against the supplied selection criteria

University of Stirling / Kortext KTP application. Criterion wording below is taken from the user's supplied list. This document separates the prototype's evidence from qualifications and previous professional experience. A feature counts as delivered only after it works in the packaged application and its generated evidence has been checked.

## Essential criteria

| Supplied criterion | Evidence this prototype is designed to provide | Evidence to add from the applicant's real record | Limit on the claim |
|---|---|---|---|
| Masters (or equivalent) or bachelor's degree in a quantitative subject (mathematics, statistics, computer science, data science) | A technical project provides supporting context, but does not establish a qualification | CV and certificates for the actual Computational Finance qualifications; explain quantitative content such as mathematical modelling and algorithms | The employer decides whether the subject meets its equivalence requirement; do not rename the degree |
| An ability/aptitude to develop algorithms and use tools and software relating to data science | Reproducible preprocessing, interpretable rule, logistic feature-group comparisons, validation, and a functioning application | Quantitative research and the verified Iceni AKT development example | Describe the implemented techniques and actual outputs; do not claim unbuilt deployment or model performance |
| An ability to interpret and analyse data, draw conclusions and make recommendations | Research cards, time-aware features, held-out results, capacity trade-offs, individual explanations and bounded recommendations | A real example of interpreting analysis for a stakeholder | Distinguish association, prediction and causal effect; discuss negative results as well as improvements |
| Strong interpersonal skills with an ability to communicate and relate to a variety of professionals at different levels | Audience-conscious interface and a proposed feedback process | Concrete examples from real Iceni collaboration, academic colleagues and teaching: who was involved, what was discussed, what the applicant did and what changed | A solo demo does not prove multi-level stakeholder collaboration; no invented users or interviews |
| Ability to explain complex concepts to technical and non-technical audiences | Tutor-facing explanations alongside model evidence, source notes and reproducible code | Teaching, FHEA evidence and a real example of explaining a commercial tool to a non-specialist | The applicant should be able to explain the model, data cutoff and limitations independently |
| Evidence of commitment to new skill development and continuous learning | Documented sources, feature hypotheses, implemented changes and a short learning/decision log | Verified professional development, FHEA and specific examples of learning a relevant method | Reading a source alone is limited evidence; show how learning changed a design or interpretation |
| Demonstrable ability to self-manage complex tasks and deadlines | A bounded scope, interfaces between work components, task completion records, reproducible checks and an honest remaining-work list | A real delivery example from AKT, research or module coordination, with its actual constraints and outcomes | Do not backfill fictitious dates, milestones or independent work; an AI-assisted prototype should be described accurately |

## Desirable criteria

| Supplied criterion | Appropriate evidence | What remains outside this prototype |
|---|---|---|
| A PhD in a highly quantitative discipline (mathematics, statistics, computer science, data science) | Actual PhD title, certificate and CV; explain the quantitative methods in the applicant's Computational Finance research and any verified publications | The demo cannot replace credential evidence or determine the employer's subject-equivalence judgement |
| Experience of using a wide range of research methodologies (including qualitative approaches) in developing research projects | The prototype can demonstrate literature-informed hypotheses, secondary-data analysis, predictive modelling, comparison and error analysis; cite any genuinely completed qualitative research separately | The interview and usability materials in `research_notes.md` are planned research only. Teaching reflection or a proposed interview guide is not proof of completed qualitative or mixed-method research |
| Experience of project management | A concise project brief, milestones, decisions, dependency and risk records; supplement with a verified example from the Iceni AKT or another actual project | Completion of a small prototype provides limited evidence of managing external stakeholders, budgets or a long-running project |

## Minimum reviewable evidence package

The v0.2 implementation makes several claims more concrete:

| Criterion | Inspectable v0.2 evidence | What the applicant should explain personally |
|---|---|---|
| Algorithms and tools | `src/reference.py`, fixed formula, input validation, preserved logistic models and executable tests | Why a reference index is useful, why its weights are assumptions, and why it is not a probability |
| Analysis and recommendations | `docs/results_v0.2.md`, metric trade-offs, fixed workload and explicit next research decision | Why higher ROC-AUC and higher top-list precision can favour different methods; why neither proves retention benefit |
| Technical/non-technical explanation | Four case comparisons and per-record R reconstruction | Explain one missed withdrawal and one non-withdrawal selection without attributing unobserved motives |
| Continuous learning | Official-source diagnosis replacing earlier incomplete job evidence; recognition that commercial products already offer context and interventions | Which new evidence changed the proposed contribution and why |
| Self-management/project management | A protocol commit before evaluation, separate experiment artifacts, tests and a feature branch preserving the released baseline | Distinguish local preparation, actual GitHub publication and future studies; describe AI assistance accurately |

These artifacts support the application, but are not evidence of completed stakeholder interviews, external product validation or independent unaided implementation. Pair them with genuine teaching and commercial knowledge-transfer examples.

1. **Working application and reproducible code.** The support queue, feature comparisons and research cards connect a business question to inspectable technical work.
2. **Short technical/business report.** Explain the target, cutoff, split, actual results, model choice, misleading cases and next validation step. Include source attribution and the public-data limitations.
3. **Brief demonstration.** Explain one case in tutor language, then show the technical evidence. A recording is a deliverable only if it has actually been made.
4. **Application narrative and this mapping.** Use the CV and genuine collaboration examples for qualifications, interpersonal skills, continuous learning and project management.

## Verification before making application claims

- Check that the packaged app opens and its interactions match the generated data.
- Check that published metrics come from the stored test results and that the selected default used validation data only.
- Check that documentation and feature names match the final implementation.
- Check that every claim about the applicant is supported by the current CV or a confirmed real example.
- Keep prospective interviews, customer feedback, Stream integration and intervention evaluation explicitly labelled as future work.

The strongest defensible presentation is an independent research-to-prototype exercise: it translates educational literature into explicit behavioural hypotheses, tests them on historical public data, and makes the consequences understandable to a tutor. It does not establish that the approach improves Kortext's existing system or prevents withdrawal.
