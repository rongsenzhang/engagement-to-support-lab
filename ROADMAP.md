# Roadmap: from public-reference baseline to a research-led demonstrator

Status: proposed next-version plan, 8 November 2026. The existing released application is our independent v0.1 prototype. It is not a reproduction of Kortext's proprietary algorithm and has not been validated against Kortext.

## What the recruitment brief actually asks

The advertised duties distinguish **diagnostic and competitor analysis of Stream 1.0** from **design and development of a research-led Stream 2.0 framework**. They do not ask the associate to invent Stream 1.0 from scratch. The project terminology must also be distinguished from public product release numbers: Kortext announced **stream 5.1 on 19 August 2026**. Our repository versions v0.1, v0.2 and so on refer only to this independent application project.

The present prototype already demonstrates part of the research-to-model pipeline: a literature-informed question, point-in-time features, controlled feature comparisons, validation, and a tutor-facing explanation. It does not yet provide a systematic diagnosis of the existing product or a validated proposal for a new company framework.

## Public-reference reproduction: scope and boundary

Build the most faithful **documented functional reference** that the available evidence and public data support. Maintain a source-linked comparison between company capabilities and our implementation. Do not describe an independently chosen rule, weight, threshold or model as Kortext's implementation.

| Publicly described capability | Reference-demo scope | What remains unknown or unavailable |
|---|---|---|
| Engagement summaries at student, module and cohort level | Reproduce navigation and summaries using public OULAD records | Production schemas, feed contracts, access hierarchy and current institutional data |
| Activity trajectories and change notifications | Implement explicitly specified activity histories and transparent change rules | Proprietary scoring, normalization, alert thresholds and exception logic |
| Multi-source, institution-sensitive analytics | Use the activity and assessment timestamps actually present; configuration is our design | Their feature engineering, learned parameters, training population and per-institution calibration |
| Human support, interactions and referrals | Demonstrate a clearly labelled simulated review journey; do not send messages | Live institutional services, staffing processes and intervention effectiveness |
| Data-informed product improvement | Compare published product claims with our testable research questions | Internal research roadmap, commercial priorities and verified customer complaints |

Kortext already describes alerts, assessment-related information, interventions, referrals and institutional customization. Those features alone are not our innovation. Public documentation does not disclose enough information to reproduce its proprietary model, verify parity, or make an accuracy comparison on a common population.

## Milestones and acceptance criteria

### v0.2 — documented baseline and diagnosis

Purpose: make clear what the existing commercial product does, what our reference implements, and why further research is justified.

Deliverables:
- `docs/product_comparison.md`: source, access date, exact factual claim, our status, uncertainty, and associated experiment for each relevant capability.
- `docs/protocol_v0.2.md`: immutable research question, comparison set, evaluation population, metrics and validation boundaries before new model selection.
- A homepage organized around one concrete question, the existing measured finding, and a case comparison; use descriptive product language rather than abstract promotional copy.
- A named public-reference baseline with our scoring specification, alongside the existing inactivity and logistic-regression baselines.

Acceptance:
- Every statement about Kortext has a public source or is marked unknown.
- No claim of proprietary replication, model superiority, prevented withdrawals or completed user research.
- Every visible reference score can be reconstructed from a versioned specification and test fixture.
- Existing v0.1 results remain reproducible and accessible without being silently replaced.

### v0.3 — test contextual value and robustness

Primary question: **Does assessment context add useful information within courses and across held-out courses, or does the pooled improvement mainly reflect differences between courses?**

Experiments:
1. Report A/C differences separately for every module, with denominators, prevalence, average precision, Brier score, and precision/recall at the same review capacity.
2. Add a course-prior baseline learned only from training data. For an unseen course use a documented global-prior fallback. This checks whether pooled ranking is largely explained by course differences.
3. On development data, run a prespecified leave-course-out study with student grouping, inner model selection and calibration separated from the outer evaluation. Report both pooled and per-course results; do not silently exclude unfavourable courses.
4. Add one controlled nonlinear comparator only after fixing the comparison protocol. Use the same available features and population, and disclose the search budget. Model complexity is a comparison question, not the intended innovation.
5. Add a small, explicitly simulated missing/late-event stress test. Examine how rankings and explanations change; distinguish a missing-data warning from evidence of disengagement. These simulations do not establish real data-feed reliability.

Failure-case interface:
- Baseline misses that C includes.
- Records both models miss.
- Records C ranks highly with no subsequent module withdrawal.
- Cases whose interpretation depends on unavailable context.

Acceptance:
- Metrics are generated by the executable pipeline and match the browser display.
- Future-data mutation and student-isolation tests still pass.
- Improvements and negative results are both reported; an inconclusive result can complete the milestone.
- Example selection has an explicit rule rather than hand-picking only successful cases.
- Model comparisons use the same integer review workload and deterministic tie-breaking.
- Findings state the unit as module enrolment and distinguish prediction from support benefit.

### v0.4 — user understanding and research-to-product evidence

Purpose: test whether the explanation helps a tutor understand evidence, recognize uncertainty and choose an appropriate next check.

Deliverables:
- Prepare the synthetic tasks already outlined in `docs/user_study_plan.md`.
- Conduct a small formative study with 3–5 consenting adult volunteers with relevant experience, when recruitment and any institutional permission are available.
- Record de-identified observations, provisional themes, contrary examples and actual design changes. Keep participant identities and raw confidential notes out of the public repository.
- Publish an anonymised synthesis and a short before/after demonstration only after sessions have occurred.
- Produce a concise adoption proposal: target users, data requirements, integration boundary, ongoing validation and success criteria for a future pilot.

Acceptance:
- Planned activities remain labelled planned until completed.
- Report counts and specific misunderstandings, not claims of population-wide effectiveness from a tiny convenience sample.
- Show at least one evidence-driven design change and unresolved disagreement if present.
- The demonstrator does not make real student decisions or send support messages.

## Validation after the v0.1 test has been inspected

The 2014J test results are now known. New analyses prompted by those results are **exploratory**. Retaining the original split does not make later model selection independent.

- Preserve the v0.1 protocol, outputs and release tag.
- Freeze the next comparison protocol before running new selection.
- Prefer development-block experiments for new feature and model decisions, with student-disjoint splits and separate calibration/selection where feasible.
- Report continued use of 2014J as retrospective exploratory comparison, not a fresh untouched test.
- A confirmatory generalisation claim needs a genuinely uninspected suitable cohort or external institution data and a precommitted protocol. Neither is currently available.
- OULAD presentation holdouts are not automatically a strict calendar-time deployment replay; final outcomes from an earlier presentation may not have been known at a later snapshot.

## How the earlier three priorities fit

Per-course validation, failure-case analysis and tutor feedback are the core of **validation and stakeholder alignment**. They are valuable but do not by themselves cover the entire KTP role. The added v0.2 product diagnosis, documented baseline, research protocol and v0.4 adoption proposal connect those activities to the broader research-to-product objective.

The most convincing applicant evidence is a traceable chain: public business evidence → explicit research hypothesis → controlled experiment → interpretation of failures → user feedback → documented product decision. Existing teaching and commercial knowledge-transfer experience should explain those decisions; the prototype cannot replace evidence of qualifications or real stakeholder collaboration.

## GitHub operating model

Use GitHub as the canonical home for source, protocols, aggregate/public artifacts, decisions, issues, pull requests, tests and versioned releases. Use tagged releases for stable demonstrations and feature branches for experiments. A pull request should link the question, summarize the final behavior, show actual validation and state material limitations.

Use ordinary revert commits to undo accepted changes without rewriting shared history. Redeploy the reverted main branch through the same workflow. Record which code revision, configuration, data checksum and generated metrics belong to each experiment. Large raw datasets can remain externally hosted with licensed download instructions and checksums; confidential participant or institutional data must not be uploaded to a public repository.

GitHub Actions records implementation and deployment checks. It does not by itself monitor real-world model drift, student outcomes or business impact; those require a future authorized data integration and separately defined monitoring.

## Public sources supporting the comparison

- Kortext features: https://kortext.com/stream/features/
- Kortext algorithm overview: https://kortext.com/stream/wp-content/uploads/2024/12/Stream-How-StREAM-by-Kortext-codified-engagement-A4-AW-HR.pdf
- Keele engagement insights, 20 November 2024: https://kortext.com/stream/blog/retention/keele-engagement-insights/
- End-to-end interventions, 28 April 2026: https://kortext.com/stream/blog/end-to-end-interventions-streams-real-superpower/
- Stream 5.1, 19 August 2026: https://kortext.com/stream/blog/kortext-stream-5-1-helping-student-support-teams-act-faster-and-work-smarter/
- Recruitment page supplied by the applicant: https://emea3.recruitmentplatform.com/tlk/pages/fo/advert/details.jsp?nPostingTargetId=4536&id=QUUFK026203F3VBQB7V79V7NE&LG=UK&languageSelect=UK

Product sources were checked on 8 November 2026. Direct retrieval of the recruitment page was unavailable during the latest review; the distinction between diagnostic analysis of Stream 1.0 and design of Stream 2.0 is also present in the publicly indexed recruitment text. The company's advertised benefits are not independent causal evidence and are not a benchmark for this prototype.
