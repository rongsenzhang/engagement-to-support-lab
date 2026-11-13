# Public product comparison and independent reference boundary

Evidence checked **13 November 2026**. This matrix connects a precise public claim to our implementation, an unresolved question and a test. It is a functional diagnosis from documentation, not reverse engineering or a claim to reproduce Kortext's proprietary system. `Sxx` source IDs refer to the [company research register](company_research_v0.2.md#primary-source-register); `Pxx` sources are linked below. Every source in the matrix was accessed on the same review date.

## Capability-to-evidence matrix

| Capability | Exact factual claim supported by the public source, paraphrased | Our implementation and status | Unknown or unavailable | Associated experiment or decision |
|---|---|---|---|---|
| Engagement overview | Stream provides daily scores and student/staff dashboards [P01]. | Historical day-28 snapshot and a staff-oriented queue; no daily production feed or student login. | Score generation cadence, production data contracts and role rules. | Use a reproducible snapshot so comparisons use identical available information. |
| Multi-level views | Individual, module, course and cohort views are described [P01]. | Individual record inspection and five-module filtering. | Real institutional hierarchy and access model. | v0.3: test course-specific performance rather than relying on pooled results. |
| Activity history | Learning journey views include cohort-average and upper-quartile comparisons [P01]. | Four weekly activity totals per public record. No claimed reproduction of company peer normalisation. | Their reference population, aggregation and display rules. | Existing A/B comparison tests whether our defined short-term change adds information. |
| Changing engagement | Automated notifications identify engagement changes [P01]. | Inspectable recent activity and an offline review list. No live alerts or messages. | Alert thresholds, exceptions, notification timing and delivery rules. | Fixed-capacity ranking avoids inventing a proprietary alert threshold. |
| Data sources | The algorithm overview names attendance, assessment and VLE inputs [P02]. | OULAD activity and due/submitted assessment timestamps. No attendance; no assessment marks used without release timestamps. | Feed latency, extensions, missingness and internal features. | R1 explicitly excludes the assessment component where no eligible assessment is due. |
| Model customization | The overview describes machine learning, recalibration and institution-specific weightings [P02]. | Existing standardized logistic A/B/C models with documented calibration; new **R · Transparent reference** has fixed equal weights. | Company model family, coefficients, fitting data, calibration procedure and evaluation population. | Compare our methods on the same historical cohort; no company-accuracy comparison. |
| Engagement categories | Five categories are described [P02]. | Continuous R1 score in 0–100, explicitly not a probability. No invented company category boundaries. | Category definitions, cutoffs and their relation to withdrawal risk. | Test arithmetic and ranking; do not add unsupported risk bands. |
| Human support | Referrals, meeting notes and coordinated intervention records are described [S09]. | Tutor enquiry prompts and offline CSV export. No operational case management, referrals or effectiveness tracking. | Local staffing, workflow adoption and causal support effects. | Planned formative study evaluates interpretation; a future intervention study needs separate design. |
| Accessibility and workflow | Release 5.0 describes keyboard/screen-reader improvements and confidential notes [S04]. | Responsive research interface with semantic controls; no equivalence or certified-accessibility claim. No private notes. | Their conformance testing and authorization implementation. | Check our own keyboard/mobile behaviour when supported; retain actual verification limits. |
| Institutional scale | Release 5.1 describes editable group records, localisation and course hierarchy navigation [S05]. | English-only static demonstrator with simple module filtering. | Production scale, configuration and integration effort. | Scope v0.2 to a research workbench instead of simulating an enterprise rollout. |
| Institutional inquiry | Insights describes faculty/group trends; outcomes linkage is labelled planned [S07]. | Historical evaluation and aggregate error checks. | Data availability and evaluation for any planned product feature. | Keep observed outcome analysis distinct from a future live institutional report. |
| Structural context | The September insights article discusses timetable, assessment and teaching-related variation [S06]. | Assessment context is observed; full teaching calendars and individual circumstances are absent. | Whether our features add anything to their existing treatment of context. | v0.3: course-prior controls, within-course evaluation and held-out-course development experiments. |

## What the transparent reference actually reproduces

R1 reproduces a **general, publicly described pattern**: combine observable educational activity into an inspectable review signal. Its arithmetic is our independently chosen implementation, not a recovered Stream formula. It does not reproduce Stream's engagement construct, learned model, score scale, daily aggregation, categories or institution-specific settings.

The normative specification is [protocol R1](protocol_v0.2.md), committed before the new evaluation. The engine is [src/reference.py](../src/reference.py), invoked by [build_reference.py](../build_reference.py). For a valid day-28 record:

- `recency = days_since_last / 28`
- `sparsity = 1 - active_days_28 / 28`
- `assessment = overdue_fraction`, applicable only when an eligible assessment was due.
- `R = 100 × mean(applicable components)`.

The no-assessment case averages two components, not three with a fabricated zero. Invalid or missing required values must fail validation. Equal weights, component overlap and the changed denominator are disclosed modelling choices. R1 is a priority index, so it has no probability calibration or Brier score.

New outputs live in [artifacts/v0.2](../artifacts/v0.2/) and [web/reference-data.js](../web/reference-data.js). The original v0.1 predictions, metrics and browser data remain unchanged; [v0.1.0](https://github.com/rongsenzhang/engagement-to-support-lab/releases/tag/v0.1.0) remains the historical baseline. Tests and the manifest connect the specification, fixed inputs and derived scores. These links describe the v0.2 release contract; the build and verification records establish delivery.

## The specific business hypothesis

**Hypothesis, not a customer-confirmed pain point:** staff and product teams may benefit from seeing how different definitions of review priority change a fixed-size list, where those definitions fail, and what contextual evidence needs checking before action.

The experiment can answer whether R1, inactivity and the frozen logistic models rank the already-observed OULAD cohort differently at equal workload. It cannot determine which definition Kortext should deploy, whether a student needs support, or whether an intervention prevents withdrawal. R1 is useful even if its predictive performance is worse: the result exposes a design assumption rather than justifying hidden tuning.

The KTP relevance is the traceable sequence **product evidence → explicit hypothesis → specification → executable comparison → limitations → next decision**. This demonstrates research-to-model judgement. The contribution is not an assertion that scoring, explanations or dashboards are absent from commercial products. [Jisc and Civitas also describe such capabilities](company_research_v0.2.md#competitive-context-what-is-already-normal-in-this-category).

## Claims we can and cannot make

| Defensible wording | Unsupported wording |
|---|---|
| “An independent public-data research prototype aligned with the advertised KTP questions.” | “A reproduction of Stream 1.0” or “Kortext Stream 2.0.” |
| “A specified, tested reference index compared at the same review workload.” | “Kortext's weighting formula” or “a validated engagement measure.” |
| “Additional historical withdrawals appeared in a review list.” | “Students saved,” “retention uplift,” or “proven support effectiveness.” |
| “Course effects and unobserved context require further study.” | “Kortext cannot handle course context.” |
| “The company's material reports performance claims.” | “Their marketing accuracy can be compared directly with our precision.” |

The algorithm PDF reports headline accuracy and withdrawal-reduction claims [P02]. Their population, target, study design and operating point are not a common benchmark with our OULAD top-capacity results. Neither those headlines nor our retrospective associations establish a causal treatment effect.

## Additional primary sources

- **P01:** [Kortext stream features](https://kortext.com/stream/features/), undated, accessed 2026-11-13. Public feature descriptions, not a complete technical specification.
- **P02:** [The power of StREAM's engagement algorithm](https://kortext.com/stream/wp-content/uploads/2024/12/Stream-How-StREAM-by-Kortext-codified-engagement-A4-AW-HR.pdf), one-page official overview, accessed 2026-11-13. The URL contains `2024/12`; no publication date is inferred beyond that path. The document is a high-level vendor account, not source code or a fully specified evaluation.

For company background, current releases, official recruitment duties and competitor sources, see [company_research_v0.2.md](company_research_v0.2.md).
