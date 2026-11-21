(function () {
  'use strict';
  const D = window.LAB_DATA;
  const main = document.getElementById('main');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const pct = (v, digits = 1) => v == null || !Number.isFinite(Number(v)) ? '—' : (Number(v) * 100).toFixed(digits) + '%';
  const dec = (v, digits = 3) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits);
  const num = v => n(v).toLocaleString('en-GB');
  const words = v => Array.isArray(v) ? v.join(' · ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
  const pretty = s => String(s).replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const safeUrl = u => /^https?:\/\//i.test(String(u)) ? String(u) : '#';
  if (!D || !Array.isArray(D.students) || !Array.isArray(D.models) || !D.models.length) {
    main.innerHTML = '<div class="panel"><div class="empty-state"><h2>Research results are not available.</h2><p>Run the Python pipeline to generate <code>web/data.js</code>, then reopen this page.</p></div></div>';
    return;
  }
  const meta = D.meta || {};
  // v0.1 payload remains immutable; v0.2 is a separately versioned overlay.
  const R = window.LAB_REFERENCE;
  const referenceById = new Map();
  let referenceReady = false;
  if (R && R.model?.id === 'reference' && R.model.kind === 'index' && Array.isArray(R.records) &&
      R.records.every(r => r && typeof r === 'object' && typeof r.id === 'string')) {
    for (const r of R.records) referenceById.set(r.id, r);
    referenceReady = R.records.length === D.students.length && referenceById.size === D.students.length &&
      D.students.every(s => {
        const r = referenceById.get(s.id);
        return r && typeof r.score === 'number' && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100 &&
          r.components && [r.components.recency, r.components.sparsity].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) &&
          (r.components.assessment === null || (typeof r.components.assessment === 'number' && Number.isFinite(r.components.assessment) && r.components.assessment >= 0 && r.components.assessment <= 1)) &&
          r.component_count === (r.components.assessment === null ? 2 : 3) &&
          Math.abs(r.score - 100 * (r.components.recency + r.components.sparsity + (r.components.assessment ?? 0)) / r.component_count) < 1e-8;
      });
  }
  const models = referenceReady ? [...D.models, R.model] : [...D.models];
  const students = D.students.map(s => ({...s, scores: {...s.scores,
    ...(referenceReady ? {reference: referenceById.get(s.id).score} : {})}}));
  const studentById = new Map(students.map(s => [s.id, s]));
  const identities = window.LAB_DEMO_IDENTITIES;
  const displayNames = identities?.namesForAliases(studentById.keys()) || new Map();
  const studentLabel = s => displayNames.get(s.id) || s.id;
  const courseLabel = code => identities?.courses[code] ? `${code} · ${identities.courses[code].title}` : `Module ${code}`;
  const rankByModel = new Map(models.map(m => [m.id, new Map(students.slice()
    .sort((a, b) => b.scores[m.id] - a.scores[m.id] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((s, i) => [s.id, i + 1]))]));
  const repoDocs = 'https://github.com/rongsenzhang/engagement-to-support-lab/blob/main/docs/';
  const defaultModel = models.some(m=>m.id===meta.default_model) ? meta.default_model : models[0].id;
  const state = { caseKind: null, view: 'overview', module: 'all', model: defaultModel, capacity: 10, selected: null, reveal: false, shown: 25 };
  const model = () => models.find(m=>m.id===state.model) || models[0];
  const selectedModel = models.find(m=>m.id===defaultModel) || models[0];
  const modules = [...new Set(students.map(s=>s.module))].sort();
  const score = s => n(s.scores && s.scores[state.model]);
  const ordered = () => students.filter(s=>state.module==='all'||s.module===state.module).slice().sort((a,b)=>score(b)-score(a)||String(a.id).localeCompare(String(b.id),'en'));
  const countFor = total => total ? Math.max(1,Math.ceil(total * state.capacity / 100)) : 0;
  const queueState = () => { const all=ordered(); return {all,k:countFor(all.length),queue:all.slice(0,countFor(all.length))}; };
  const announce = text => { document.getElementById('live-status').textContent=text; };
  document.getElementById('hero-cutoff').textContent = meta.cutoff_day || 28;
  if (meta.dataset_url) document.getElementById('dataset-link').href = safeUrl(meta.dataset_url);
  function currentView() { const hash=window.location.hash.slice(1); return ['overview','queue','evidence','robustness','trial','research'].includes(hash)?hash:'overview'; }
  function setView() {const nextView=currentView();if(state.view==='trial'&&nextView!=='trial')window.LAB_STUDY_UI?.suspend();state.view=nextView;document.querySelectorAll('[data-view]').forEach(a=>{const on=a.dataset.view===state.view;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});render();}
  function modelOptions() {return models.map(m=>`<option value="${esc(m.id)}" ${m.id===state.model?'selected':''}>${esc(m.label)}${m.id===defaultModel?' · selected':''}</option>`).join('');}
  function scoreText(s) {return model().kind==='index' ? dec(score(s),1)+' / 100' : model().kind==='rule' ? (n(s.signals?.no_activity)?'No record':num(score(s))+' d') : pct(score(s),0);}
  function modelDescription(m) {const descriptions={inactivity:'Rule benchmark · rank by time since last recorded activity',activity:'A · activity volume and recency',trend:'B · activity plus change over time',context:'C · activity, change and assessment context',reference:'R · fixed equal-weight review index; no fitted parameters'};return descriptions[m.id]||words(m.features);}
  function selectedLabel() {return state.module==='all'?'All held-out modules':courseLabel(state.module);}
  function metricsFor(all, queue) {const positives=all.reduce((a,s)=>a+n(s.outcome),0);const tp=queue.reduce((a,s)=>a+n(s.outcome),0);return {positives,tp,fp:queue.length-tp,precision:queue.length?tp/queue.length:null,recall:positives?tp/positives:null};}
  function referenceBreakdown(s) {
    if (!referenceReady || !referenceById.has(s.id)) return '<p class="fine-print">Reference data unavailable. No substitute score has been calculated.</p>';
    const r = referenceById.get(s.id), c = r.components;
    const rows = [
      ['Recency', `${num(s.signals.days_since_last)} / 28`, c.recency],
      ['Sparse activity', `1 − ${num(s.signals.active_days_28)} / 28`, c.sparsity],
      ['Due, unsubmitted', c.assessment === null ? 'No assessment due: excluded' : `${num(s.signals.overdue_count)} / ${num(s.signals.due_count)}`, c.assessment]
    ];
    const terms = [c.recency, c.sparsity, c.assessment].filter(v => v !== null);
    return `<div class="reference-breakdown"><table><caption>R1 calculation · higher index means earlier review</caption><thead><tr><th scope="col">Component</th><th scope="col">Calculation</th><th scope="col">Value</th></tr></thead><tbody>${rows.map(([label, calculation, value]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(calculation)}</td><td>${value === null ? 'N/A' : dec(value, 4)}</td></tr>`).join('')}</tbody></table><div class="formula-result">100 × (${terms.map(v => dec(v, 4)).join(' + ')}) / ${r.component_count} ≈ <strong>${dec(r.score, 2)}</strong></div><p class="fine-print">Equal weights across ${r.component_count} applicable components. Displayed terms are rounded; ranking uses full precision. When no assessment is due, R averages the two activity components. This is a modelling assumption, not evidence that no assessment exists or that a feed is missing.</p><p class="fine-print">R is an independently chosen benchmark, not Kortext’s scoring method and not a probability. No weights were fitted; raw scores cannot be compared with A/B/C probabilities. <a href="${repoDocs}protocol_v0.2.md" target="_blank" rel="noopener noreferrer">Read the scoring protocol ↗</a></p></div>`;
  }
  function capacityAtTen(m) { return (m.capacity || []).find(row => n(row.percent) === 10); }
  function comparisonCard(id) {
    const m = models.find(item => item.id === id);
    if (!m) return `<article class="comparison-card unavailable"><div class="small-label">R · TRANSPARENT REFERENCE</div><h3>Reference artifact unavailable</h3><p>The original results remain available. Generate and include the reference data to inspect this comparator.</p></article>`;
    const c = capacityAtTen(m);
    if (!c) return '<article class="comparison-card unavailable"><h3>Capacity results unavailable</h3></article>';
    const titles = {activity: 'Activity', context: 'Activity + trend + assessment', reference: 'Transparent reference'};
    const labels = {activity: 'A / ORIGINAL BASELINE', context: 'C / ORIGINAL SELECTED MODEL', reference: 'R / FIXED REFERENCE RULE'};
    return `<article class="comparison-card ${id === 'context' ? 'featured' : ''}"><div class="small-label">${labels[id]}</div><h3>${titles[id]}</h3><div class="finding-number">${num(c.tp)}<span> / ${num(c.k)}</span></div><p class="finding-caption">reviewed records with a later module withdrawal</p><dl class="comparison-stats"><div><dt>Precision</dt><dd>${pct(c.precision)}</dd></div><div><dt>Recall</dt><dd>${pct(c.recall)}</dd></div><div><dt>Average precision</dt><dd>${dec(m.metrics.average_precision, 3)}</dd></div></dl><p class="comparison-limit">${num(c.fp)} reviewed without later withdrawal. ${num(students.reduce((a, s) => a + n(s.outcome), 0) - c.tp)} later withdrawals outside this review list.</p></article>`;
  }
  function referenceTradeoff() {
    if (!referenceReady) return '';
    const c = models.find(m => m.id === 'context'), r = models.find(m => m.id === 'reference');
    const cr = capacityAtTen(c), rr = capacityAtTen(r);
    return `<p class="metric-tradeoff"><strong>The comparison depends on the metric.</strong> R includes ${num(rr.tp)} later withdrawals at this workload, versus ${num(cr.tp)} for C. Its ROC AUC is ${dec(r.metrics.roc_auc, 3)}, versus ${dec(c.metrics.roc_auc, 3)} for C; the broader ranking measure favours R here. C has higher average precision and top-10% precision in this cohort. These point estimates do not establish a generally superior model.</p>`;
  }
  function caseDetail(c) {
    const s = studentById.get(c.id);
    if (!s) return '<div class="panel-body"><p>No record is available in this case category.</p></div>';
    const k = Math.ceil(students.length * .1);
    const ids = ['activity', 'context', 'reference'].filter(id => rankByModel.has(id));
    return `<div class="panel-body case-detail" id="case-detail"><div class="detail-heading"><div><div class="small-label">${esc(c.label)}</div><h3>${esc(s.id)}</h3><p class="detail-meta">Module ${esc(s.module)} · ${esc(s.presentation)} · one module enrolment</p></div><span class="tag">Day ${meta.cutoff_day || 28}</span></div><p class="case-selection">${esc(c.description)} ${num(c.population_count)} records meet this rule; the first alias in alphabetical order is shown.</p><div class="case-columns"><section><h4>Evidence available at the snapshot</h4>${weeklyChart(s)}<ul class="evidence-list">${rawEvidence(s).map(t => `<li>${esc(t)}</li>`).join('')}</ul></section><section><h4>Same record, different rankings</h4><div class="case-ranks">${ids.map(id => {
      const m = models.find(item => item.id === id), rank = rankByModel.get(id).get(s.id);
      return `<div class="case-rank"><div><strong>${esc(m.label)}</strong><span>${id === 'reference' ? dec(s.scores[id], 1) + ' / 100 · index' : pct(s.scores[id]) + ' · probability estimate'}</span></div><div><strong>#${num(rank)}</strong><span>${rank <= k ? 'Inside' : 'Outside'} top ${num(k)}</span></div></div>`;
    }).join('')}</div><div class="detail-outcome"><strong>Later outcome: ${n(s.outcome) ? 'withdrew from this module' : 'no module withdrawal recorded'}</strong>Known retrospectively. ${c.kind==='no_due_assessment'?'This case was selected using assessment availability at day 28, independently of the later outcome.':'This outcome was used to select the illustrative case.'} Later outcomes never enter the day-28 features or scores.</div><div class="context-notice">A successful ranking is not proof that support would help; a false positive is not proof that support was unnecessary. The record cannot explain a person’s circumstances.</div></section></div>${referenceReady ? `<details class="details-panel"><summary>Reconstruct this record’s R index</summary><div class="panel-body">${referenceBreakdown(s)}</div></details>` : ''}</div>`;
  }
  function renderCases() {
    const cases = referenceReady && Array.isArray(R.cases) ? R.cases : [];
    if (!cases.length) return '<section class="provenance"><h3>Case comparisons are unavailable</h3><p>The original review queue is still available. The reference data supplies the deterministic case selections.</p></section>';
    const chosen = cases.find(c => c.kind === state.caseKind && c.id && studentById.has(c.id)) || cases.find(c => c.id && studentById.has(c.id));
    if (chosen) state.caseKind = chosen.kind;
    return `<section class="case-section" aria-labelledby="case-heading"><div class="section-heading"><div><div class="small-label">INSPECT THE DIFFERENCES</div><h2 id="case-heading">Four cases, including failures</h2><p>The first three categories compare C with A at the same top-10% workload. The no-assessment category covers the whole ${num(students.length)}-record cohort, regardless of review-list membership. Cases are retrospective illustrations, not representative samples.</p></div></div><div class="case-selector">${cases.map((c, i) => `<button type="button" class="case-button ${chosen?.kind === c.kind ? 'active' : ''}" data-case="${esc(c.kind)}" aria-pressed="${chosen?.kind === c.kind ? 'true' : 'false'}" aria-controls="case-detail" ${!c.id || !studentById.has(c.id) ? 'disabled' : ''}><span class="small-label">CASE ${String(i + 1).padStart(2, '0')}</span><strong>${esc(c.label)}</strong><span>${num(c.population_count)} matching records${!c.id ? ' · no example' : ''}</span></button>`).join('')}</div><div class="panel">${chosen ? caseDetail(chosen) : '<div class="panel-body">No case satisfies the fixed selection rules.</div>'}</div><p class="section-note">Selection rule: within each predefined category, choose the lexicographically smallest anonymised alias. Categories can overlap. These examples expose behaviour; their selection does not estimate how common that behaviour is beyond the stated cohort.</p></section>`;
  }
  function productDiagnosis() {
    return `<section class="diagnosis-panel" aria-labelledby="diagnosis-heading"><div><div class="small-label">PUBLIC PRODUCT EVIDENCE → OUR RESEARCH QUESTION</div><h3 id="diagnosis-heading">What this contributes to the KTP brief</h3><p>The <a href="https://iuk-ktp.org.uk/job/ktp-associate-data-scientist-engagement-analytics/" target="_blank" rel="noopener noreferrer">published role</a> connects diagnosis of Stream 1.0 with a research-led Stream 2.0 framework. This independent project practises that research-to-model process; our v0.4 is not a Stream release.</p></div><div class="diagnosis-grid"><div><span class="evidence-type">Public product fact</span><p>Kortext already describes engagement summaries, alerts, interventions and referrals. Those capabilities alone are not our proposed novelty.</p><a href="https://kortext.com/stream/features/" target="_blank" rel="noopener noreferrer">Kortext features ↗</a></div><div><span class="evidence-type hypothesis">Hypothesis to investigate</span><p>Does assessment context add useful information within a course, or does the pooled improvement mainly reflect differences between courses? The course-robustness analysis examines both module differences and held-out modules.</p><a href="#robustness">Inspect course robustness →</a></div><div><span class="evidence-type unknown">Unknown from public evidence</span><p>Proprietary weights, training data and institution-specific thresholds are unavailable. R is our explicit reference rule; no commercial-system parity or superiority has been established.</p><a href="${repoDocs}product_comparison.md" target="_blank" rel="noopener noreferrer">Source-linked product comparison ↗</a></div></div></section>`;
  }
  function cohortSnapshot() {
    const weeklyClicks = [0, 0, 0, 0];
    const weeklyActive = [0, 0, 0, 0];
    const courses = new Map(modules.map(code => [code, {total: 0, active: 0}]));
    let dueWithoutSubmission = 0;
    for (const enrolment of students) {
      const course = courses.get(enrolment.module);
      course.total++;
      if (enrolment.weeks[3] > 0) course.active++;
      if (enrolment.signals.overdue_count > 0) dueWithoutSubmission++;
      enrolment.weeks.forEach((clicks, week) => {
        weeklyClicks[week] += clicks;
        if (clicks > 0) weeklyActive[week]++;
      });
    }
    return {weeklyClicks, weeklyActive, courses, dueWithoutSubmission};
  }

  function weeklyOverviewPlot(values, ceiling, unit, mode) {
    const heights = values.map(value => 100 * value / ceiling);
    const points = heights.map((height, week) => `${week * 100 / 3},${100 - height}`).join(' ');
    const axisLabel = value => mode === 'active' ? value + '%' : num(value);
    const pointLabel = value => value.toFixed(1) + (mode === 'active' ? '%' : '');
    return `<figure class="ov-plot ov-plot-${mode}">
      <figcaption>${esc(unit)}</figcaption>
      <div class="ov-chart-body">
        <div class="ov-axis" aria-hidden="true">${[1, .75, .5, .25, 0].map(tick => `<span>${axisLabel(tick * ceiling)}</span>`).join('')}</div>
        <div class="ov-graph">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <polygon points="0,100 ${points} 100,100" class="ov-area"/>
            <polyline points="${points}" class="ov-line" vector-effect="non-scaling-stroke"/>
          </svg>
          ${heights.map((height, i) => `<span class="ov-point ov-point-${i}" style="left:${i * 100 / 3}%;bottom:${height}%" aria-hidden="true"><b>${pointLabel(values[i])}</b></span>`).join('')}
        </div>
        <div class="ov-weeks" aria-hidden="true"><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></div>
      </div>
      <ol class="sr-only">${values.map((v, i) => `<li>Week ${i + 1}: ${pointLabel(v)} ${esc(unit)}</li>`).join('')}</ol>
    </figure>`;
  }

  function cohortActivity(snapshot) {
    const means = snapshot.weeklyClicks.map(total => students.length ? total / students.length : 0);
    const active = snapshot.weeklyActive.map(count => students.length ? count * 100 / students.length : 0);
    const ceiling = Math.max(20, Math.ceil(Math.max(...means) / 20) * 20);
    return `<section class="ov-panel ov-chart" aria-labelledby="ov-activity-title">
      <div class="ov-panel-heading"><h3 id="ov-activity-title">Weekly activity</h3>
        <p>Learning-platform activity across all ${num(students.length)} enrolments.</p></div>
      <fieldset class="ov-series"><legend class="sr-only">Weekly activity measure</legend>
        <input type="radio" id="ov-series-clicks" name="ov-activity" checked><label for="ov-series-clicks">Average clicks</label>
        <input type="radio" id="ov-series-active" name="ov-activity"><label for="ov-series-active">Active enrolments</label>
        ${weeklyOverviewPlot(means, ceiling, 'Clicks per enrolment', 'clicks')}
        ${weeklyOverviewPlot(active, 100, 'Enrolments with recorded activity', 'active')}
      </fieldset>
    </section>`;
  }

  function cohortModules(courses) {
    const rows = [...courses].map(([code, stats]) => {
      const title = identities?.courses[code]?.title || 'Module ' + code;
      const share = stats.active / stats.total;
      return `<li><a href="#queue" data-overview-module="${esc(code)}" aria-label="Open ${esc(title)} review queue, module ${esc(code)}, ${pct(share, 0)} active in week 4">
        <span class="ov-module-title">${esc(title)}</span><span class="ov-module-percent">${pct(share, 0)}</span>
        <span class="ov-module-code">${esc(code)}</span><span class="ov-module-track" aria-hidden="true"><i style="width:${share * 100}%"></i></span>
        <span class="ov-module-arrow" aria-hidden="true">›</span></a></li>`;
    });
    return `<section class="ov-panel ov-modules" aria-labelledby="ov-modules-title">
      <div class="ov-panel-heading"><h3 id="ov-modules-title">Activity by module</h3><p>Enrolments with recorded clicks in week 4.</p></div>
      <ul>${rows.join('')}</ul><p class="ov-module-note">Course titles are illustrative.</p></section>`;
  }

  function renderOverview() {
    const snapshot = cohortSnapshot();
    const cutoff = meta.cutoff_day || 28;
    const intake = [...new Set(students.map(s => s.presentation))].join(', ');
    const cards = [
      ['Module enrolments', students.length, `Across ${num(modules.length)} modules`],
      ['Active in week 4', snapshot.weeklyActive[3], 'At least one recorded click'],
      ['Due work with no submission record', snapshot.dueWithoutSubmission, 'Enrolments with at least one such assessment'],
      ['Review queue', countFor(students.length), `Highest-ranked ${state.capacity}% of enrolments`]
    ];
    const historyOpen = main.querySelector?.('.ov-history')?.open;
    return `<section class="ov-dashboard" aria-labelledby="ov-title">
      <header class="ov-header"><div><h2 id="ov-title">Cohort overview</h2><p>OULAD · ${esc(intake)} cohort · Days 1–${num(cutoff)}</p></div>
        <a class="ov-queue-button" href="#queue" data-overview-module="all">Open review queue <span aria-hidden="true">→</span></a></header>
      <dl class="ov-stats">${cards.map(([title, value, text]) => `<div><dt>${title}</dt><dd>${num(value)}</dd><dd class="ov-stat-note">${text}</dd></div>`).join('')}</dl>
      <div class="ov-workspace">${cohortActivity(snapshot)}${cohortModules(snapshot.courses)}</div>
    </section><details class="ov-history"${historyOpen ? ' open' : ''}><summary>Historical model comparison and research cases</summary>
      <div class="ov-history-content">${historicalComparison()}</div></details>`;
  }

  function selectOverviewModule(event) {
    const link = event.target.closest('[data-overview-module]');
    if (!link) return false;
    const code = link.dataset.overviewModule;
    if (code !== 'all' && !modules.includes(code)) return false;
    state.module = code;
    state.selected = null;
    state.shown = 25;
    state.reveal = false;
    resetProfileView();
    return true;
  }

  function historicalComparison() {
    const a = capacityAtTen(models.find(m => m.id === 'activity'));
    const c = capacityAtTen(models.find(m => m.id === 'context'));
    const delta = c && a ? c.tp - a.tp : null;
    const positive = students.reduce((sum, s) => sum + n(s.outcome), 0);
    return `<div class="section-heading overview-heading"><div><div class="small-label">RESEARCH QUESTION 01</div><h2>What changes when activity indicators gain context?</h2><p>At day 28, compare a fixed review workload using activity alone, activity with trend and assessment features, and a fully specified reference rule.</p><p>These results come from the original historical experiment. The current app also includes <a href="#robustness">course robustness analyses</a> and <a href="#trial">synthetic tutor practice</a>.</p></div><span class="tag">HISTORICAL MODEL COMPARISON</span></div><div class="study-strip"><div><strong>${num(students.length)}</strong><span>module enrolments</span></div><div><strong>${num(positive)}</strong><span>later module withdrawals</span></div><div><strong>${num(Math.ceil(students.length * .1))}</strong><span>records reviewed per method</span></div><div><strong>2014J</strong><span>historical evaluation cohort</span></div></div><div class="finding-statement"><div class="small-label">OBSERVED IN THE ORIGINAL HISTORICAL EXPERIMENT</div><p>${delta === null ? 'Inspect the original model results below.' : `<strong>${num(Math.abs(delta))} ${delta >= 0 ? 'more' : 'fewer'} later withdrawals in the same-size review list</strong> with C than with A.`} A and C differ in both trend and assessment features. This is a ranking result; it does not show prevented withdrawals or prove which feature caused the difference.</p></div><div class="comparison-grid">${['activity', 'context', 'reference'].map(comparisonCard).join('')}</div>${referenceTradeoff()}<div class="overview-links"><a href="#evidence">Compare all ${models.length} methods and probability calibration <span aria-hidden="true">→</span></a><a href="#queue">Explore the review queue <span aria-hidden="true">→</span></a><a href="${repoDocs}protocol_v0.2.md" target="_blank" rel="noopener noreferrer">Inspect the frozen protocol ↗</a></div><div class="research-boundary"><strong>Exploratory, single-institution evidence.</strong> The 2014J outcomes were already inspected in the original experiment. R is added without tuning or replacing the original selected model. No contemporary institution, intervention benefit or tutor study has been validated.${!referenceReady ? ' The R artifact is missing or incompatible; it has been excluded rather than replaced with a default score.' : ''}</div><section class="research-next-entry"><div class="small-label">COURSE ROBUSTNESS</div><h3>Does context survive a change of course?</h3><p>Inspect results within each module, transfer to held-out modules, and changes caused by simulated late or missing records. B → C isolates the added assessment features; A → C adds trend and assessment together.</p><a href="#robustness">Open course robustness →</a></section>${renderCases()}${productDiagnosis()}<section class="next-question"><div><div class="small-label">SYNTHETIC TUTOR PRACTICE</div><h3>Can a tutor use the evidence carefully?</h3><p>Try four tasks with 50 fictional records: compare patterns, revisit missing context, choose five records and explain uncertainty. The system and study kit are ready; real participants and findings are still pending.</p></div><a class="quiet-button" href="#trial">Open tutor practice →</a></section>`;
  }
  function sparkline(weeks) {const vals=(weeks||[]).map(n);if(!vals.length)return '';const max=Math.max(1,...vals);const pts=vals.map((v,i)=>`${4+i*20},${22-v/max*18}`).join(' ');return `<svg class="sparkline" viewBox="0 0 68 26" role="img" aria-label="Weekly clicks, individually scaled: ${esc(vals.join(', '))}"><polyline points="${pts}" fill="none" stroke="#378b7b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${4+(vals.length-1)*20}" cy="${22-vals[vals.length-1]/max*18}" r="2.3" fill="#087e77"/></svg>`;}
  function weeklyChart(s) {const vals=(s.weeks||[]).map(n);const max=Math.max(1,...vals);const top=max>=100?Math.ceil(max/100)*100:max>=10?Math.ceil(max/10)*10:Math.ceil(max);const grid=(top===1?[0,1]:[0,.5,1]).map(t=>{const y=108-t*81;return `<line x1="34" y1="${y}" x2="320" y2="${y}" stroke="#e5ebe4"/><text x="26" y="${y+3}" fill="#73817f" text-anchor="end" font-size="9">${Math.round(t*top)}</text>`;}).join('');const bars=vals.map((v,i)=>{const h=v/top*81;return `<rect x="${53+i*68}" y="${108-h}" width="31" height="${Math.max(.8,h)}" rx="3" fill="${i===3?'#087e77':'#b9d5c5'}"><title>Week ${i+1}: ${num(v)} recorded clicks</title></rect><text x="${68.5+i*68}" y="${Math.max(17,102-h)}" fill="#36574e" text-anchor="middle" font-size="9">${num(v)}</text><text x="${68.5+i*68}" y="127" fill="#667a73" text-anchor="middle" font-size="9">W${i+1}</text>`;}).join('');return `<svg class="weekly-chart" viewBox="0 0 335 137" role="img" aria-label="Recorded VLE clicks in weeks one to four: ${esc(vals.join(', '))}">${grid}${bars}</svg>`;}
  function signalBadge(s) {const x=s.signals||{};if(n(x.no_activity))return '<span class="signal-badge attention">No VLE activity</span>';if(n(x.overdue_count)>0)return `<span class="signal-badge attention">${num(x.overdue_count)} due, unsubmitted</span>`;if(n(x.days_since_last)>=7)return `<span class="signal-badge attention">${num(x.days_since_last)} days inactive</span>`;if(n(x.activity_day_change)<0)return '<span class="signal-badge">Activity declined</span>';return '<span class="signal-badge">Review context</span>';}
  function rawEvidence(s) {const x=s.signals||{};const lines=[];if(n(x.no_activity))lines.push('No VLE activity is recorded in this observation window. This does not establish that no learning took place.');else lines.push(`${num(x.active_days_7)} active days in the latest week, compared with ${num(x.active_days_previous_7)} in the preceding week.`);if(!n(x.no_activity))lines.push(`The most recent recorded activity was ${num(x.days_since_last)} ${n(x.days_since_last)===1?'day':'days'} before the snapshot.`);if(n(x.due_count)>0)lines.push(`${num(x.overdue_count)} of ${num(x.due_count)} assessments due by day ${meta.cutoff_day||28} have no qualifying submission recorded by this date.`);else lines.push('No eligible assessment was due by this snapshot. This is not treated as a missed submission.');return lines;}
  function enquiry(s) {const x=s.signals||{};if(n(x.no_activity))return '“How have you been accessing the course materials? Is there anything making it difficult to get started, or activity the online record is missing?”';if(n(x.overdue_count)>0)return '“How are you getting on with the recent assessment? Is the submission record up to date, and would any clarification or support be useful?”';if(n(x.active_days_7)<n(x.active_days_previous_7))return '“I noticed a change in your recent online activity. Does that reflect your study plans this week, or is there something we could help with?”';return '“How is the course going for you? Does this record reflect how you are studying, and is there any support you would find useful?”';}
  function contributions(s) {
    if (model().kind === 'index') return referenceBreakdown(s);
    const terms = s.contributions?.[state.model] || [];
    if (!terms.length) return '<p class="fine-print">This benchmark orders records by the elapsed time since the last observed activity. It does not estimate a withdrawal probability.</p>';
    const strongest = [...terms.filter(t => n(t.contribution) > 0).slice(0, 3),
      ...terms.filter(t => n(t.contribution) < 0).sort((a, b) => a.contribution - b.contribution).slice(0, 2)];
    const remaining = terms.filter(t => !strongest.includes(t)).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    const scale = Math.max(.001, ...terms.map(t => Math.abs(t.contribution)));
    function rows(items) {
      return '<div class="contribution-list">' + items.map(t => {
        const value = n(t.contribution);
        const magnitude = Math.abs(value) < .005 && value !== 0 ? '&lt;0.01' : dec(Math.abs(value), 2);
        return `<div class="contribution-row ${value < 0 ? 'negative' : 'positive'}"><div>${esc(t.label || pretty(t.feature))}<div class="contribution-bar"><i style="width:${Math.abs(value) / scale * 100}%"></i></div></div><span>${value > 0 ? '+' : value < 0 ? '−' : ''}${magnitude}</span></div>`;
      }).join('') + '</div>';
    }
    return rows(strongest) + (remaining.length ? `<details class="more-model-terms"><summary>Show ${remaining.length} more model factors</summary>${rows(remaining)}</details>` : '') +
      '<p class="fine-print">Contributions to the model’s log-odds score: positive values raise the estimate; negative values lower it. These are model associations, not explanations of why a person withdraws.</p>';
  }
  function recordContextSection(recordId) {
    const evidence = window.LAB_RECORD_CONTEXT?.[recordId];
    if (!evidence) return '';
    const mix = Object.entries(evidence.clicks_by_activity);
    const total = mix.reduce((sum, [, value]) => sum + value, 0);
    const peak = evidence.peak_day === null ? 'No clicks recorded during days 1–28.'
      : `Day ${num(evidence.peak_day)} accounted for ${num(evidence.peak_day_clicks)} of ${num(total)} clicks.`;
    const mixList = mix.map(([label, clicks]) => `<li><span>${esc(label)}</span><strong>${num(clicks)}</strong></li>`).join('');
    const deadlines = evidence.assessments.map(a => {
      const name = a.kind === 'TMA' ? 'Tutor-marked assessment' : 'Computer-marked assessment';
      const status = a.status === 'banked credit' ? 'previous credit recorded'
        : a.status === 'submission recorded' ? `submission recorded on day ${num(a.submitted_day)}` : 'no submission recorded by day 28';
      return `<li>${name} due on day ${num(a.due_day)} · ${status}.</li>`;
    }).join('');
    return `<section class="detail-section record-context"><div class="detail-section-title"><h4>Activity and assessment detail</h4><span>Days 1–28</span></div>
      <p><strong>${num(evidence.resources_opened)} distinct course ${evidence.resources_opened === 1 ? 'resource' : 'resources'} accessed.</strong> ${peak}</p>
      ${mix.length ? `<details><summary>Clicks by activity type</summary><ul class="record-resource-mix">${mixList}</ul></details>` : ''}
      ${deadlines ? `<ul class="evidence-list">${deadlines}</ul>` : '<p>No tutor- or computer-marked assessment was due by day 28.</p>'}
      <p class="fine-print">These details help a tutor interpret the record. Clicks count interactions. Time spent studying and learning quality are unknown.</p></section>`;
  }
  const profileTabs = [
    ['journey', 'Learning journey'], ['resources', 'Resources'], ['score', 'Score details'], ['tools', 'AI & chat']
  ];
  const profileView = { tab: 'journey', mobile: false, returnY: 0 };
  function resetProfileView() {
    profileView.tab = 'journey';
    profileView.mobile = false;
    profileView.returnY = 0;
  }
  function activateProfileTab(key) {
    if (!profileTabs.some(([id]) => id === key)) return;
    profileView.tab = key;
    for (const [id] of profileTabs) {
      const active = id === key;
      const tab = document.getElementById('profile-tab-' + id);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById('profile-panel-' + id).hidden = !active;
    }
    document.getElementById('profile-tab-' + key).focus({preventScroll: true});
  }
  function journeyChart(s) {
    const values = (s.weeks || []).map(n);
    if (values.length !== 4) return '<p>Weekly activity data unavailable.</p>';
    const peak = Math.max(1, ...values);
    const interval = peak < 8 ? 1 : 10 ** Math.floor(Math.log10(peak / 2));
    const middle = Math.max(1, Math.ceil(peak / (2 * interval)) * interval);
    const ticks = [0, middle, middle * 2];
    const x = i => 48 + i * 126;
    const y = clicks => 121 - clicks / (middle * 2) * 95;
    const points = values.map((v, i) => x(i) + ',' + y(v)).join(' ');
    return `<svg class="journey-plot" viewBox="0 0 463 151" role="img" aria-label="Recorded VLE clicks in weeks one to four: ${esc(values.join(', '))}">
      ${ticks.map(tick => `<line x1="40" x2="439" y1="${y(tick)}" y2="${y(tick)}" class="journey-guide"/><text x="32" y="${y(tick)+3}" text-anchor="end">${num(tick)}</text>`).join('')}
      <polygon points="48,121 ${points} 426,121" class="journey-shade"/>
      <polyline points="${points}" class="journey-line"/>
      ${values.map((v,i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4.2" class="journey-point"><title>Week ${i+1}: ${num(v)} clicks</title></circle><text x="${x(i)}" y="${y(v)-9}" text-anchor="middle" class="journey-value">${num(v)}</text><text x="${x(i)}" y="144" text-anchor="middle">Week ${i+1}</text>`).join('')}
    </svg>`;
  }
  function detail(s) {
    if (!s) return '<p class="empty-state">No records match this selection.</p>';
    const x = s.signals || {};
    const rankLabel = model().kind === 'index' ? 'Transparent review index' : model().kind === 'rule'
      ? 'Elapsed time since observed activity' : 'Estimated subsequent module withdrawal risk';
    const initials = studentLabel(s).split(' ').map(word => word[0]).slice(0,2).join('');
    const panes = {
      journey: `<div class="profile-section-heading"><h4>Learning journey</h4><span>Recorded VLE clicks</span></div>
        ${journeyChart(s)}
        <dl class="profile-measures">
          <div><dt>Active days in week 4</dt><dd>${num(x.active_days_7)} <small>/ 7</small></dd></div>
          <div><dt>Days since last activity</dt><dd>${n(x.no_activity)?'—':num(x.days_since_last)}</dd></div>
          <div><dt>Due without submission</dt><dd>${num(x.overdue_count)} <small>/ ${num(x.due_count)}</small></dd></div>
        </dl>
        <div class="profile-section-heading"><h4>Observed evidence</h4></div>
        <ul class="evidence-list">${rawEvidence(s).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
        <p class="profile-footnote">Check offline study, access, extensions and course arrangements with the student. Clicks cannot measure motivation or wellbeing.</p>`,
      resources: recordContextSection(s.id) || '<p>Resource and assessment details are unavailable for this record.</p>',
      score: `<div class="profile-section-heading"><h4>What influences this estimate?</h4></div>
        ${contributions(s)}`,
      tools: `<div id="tutor-chat-slot"></div>
        <div class="profile-prompt"><h4>Conversation starter</h4><p>${esc(enquiry(s))}</p><small>Rule-based prompt for a tutor to review. No message is sent.</small></div>`
    };
    return `<div class="profile-heading">
      <button type="button" class="roster-return quiet-button" id="return-to-roster">← Back to students</button>
      <div class="profile-identity"><span class="profile-avatar" aria-hidden="true">${esc(initials)}</span>
        <div><h3 class="detail-id">${esc(studentLabel(s))}</h3><p>${esc(courseLabel(s.module))}</p></div>
      </div>
      <p class="profile-subline">Record ${esc(s.id)} · ${esc(s.presentation)}${identities?.courses[s.module] ? ` · <a href="${esc(identities.courses[s.module].url)}" target="_blank" rel="noopener noreferrer">Example course ↗</a>` : ''}</p>
      <div class="profile-score"><strong>${scoreText(s)}</strong><div>${esc(rankLabel)}<small>${esc(model().label)} · ${model().kind==='logistic'?'historical model estimate':'ranking score, not a probability'}</small></div></div>
    </div>
    <div class="profile-tabs" role="tablist" aria-label="Student profile">
      ${profileTabs.map(([id,label]) => `<button type="button" role="tab" id="profile-tab-${id}" aria-selected="${id===profileView.tab}" aria-controls="profile-panel-${id}" data-profile-tab="${id}" tabindex="${id===profileView.tab?0:-1}">${esc(label)}</button>`).join('')}
    </div>
    ${profileTabs.map(([id])=>`<section class="profile-pane" role="tabpanel" id="profile-panel-${id}" aria-labelledby="profile-tab-${id}" tabindex="0" ${profileView.tab===id?'':'hidden'}>${panes[id]}</section>`).join('')}
    ${state.reveal?`<div class="detail-outcome"><strong>Retrospective outcome: ${n(s.outcome)?'subsequently withdrew from this module':'no subsequent module withdrawal recorded'}</strong>This later outcome is used for evaluation only. It was not an input to the prediction.</div>`:''}`;
  }
  function queueRows(queue) {
    return queue.slice(0,state.shown).map((s,i)=>`<tr data-student="${esc(s.id)}" class="${state.selected===s.id?'selected':''}">
      <td class="roster-rank">${num(i+1)}</td>
      <td class="roster-student"><button type="button" class="student-link" data-student="${esc(s.id)}" aria-current="${s.id===state.selected?'true':'false'}" aria-label="Inspect ${esc(studentLabel(s))}, record ${esc(s.id)}, ${esc(courseLabel(s.module))}">${esc(studentLabel(s))}</button>
        <span class="cell-sub">${esc(courseLabel(s.module))}</span></td>
      <td class="roster-score"><strong>${scoreText(s)}</strong></td>
      <td class="roster-trend">${sparkline(s.weeks)}</td>
      <td class="roster-signal">${signalBadge(s)}</td>
      ${state.reveal?`<td><span class="outcome-badge ${n(s.outcome)?'withdrawn':''}">${n(s.outcome)?'Withdrew':'No withdrawal'}</span></td>`:''}</tr>`).join('');
  }
  function renderQueue() {
    const {all,k,queue} = queueState();
    if (!queue.some(s=>s.id===state.selected)) {
      state.selected = queue[0]?.id;
      resetProfileView();
    }
    const student = queue.find(s=>s.id===state.selected);
    const metrics = metricsFor(all,queue);
    const method = model().kind==='index'?'Ranked by the transparent R index, from 0 to 100; this is not a probability.':model().kind==='rule'?'Ranked by days since recorded activity.':'Ranked by estimated subsequent module withdrawal risk.';
    return `<div class="queue-view${profileView.mobile?' queue-show-profile':''}">
      <div class="queue-page-heading"><div><h2>Student review queue</h2><p>${num(k)} records to review from ${num(all.length)} eligible enrolments · Day ${meta.cutoff_day||28}</p></div><button class="quiet-button" id="export-queue">Export CSV <span aria-hidden="true">↓</span></button></div>
      <div class="queue-filters">
        <div class="control"><label for="module-select">Module</label><select id="module-select"><option value="all">All held-out modules</option>${modules.map(m=>`<option value="${esc(m)}" ${state.module===m?'selected':''}>${esc(courseLabel(m))}</option>`).join('')}</select></div>
        <div class="control"><label for="model-select">Indicator model</label><select id="model-select">${modelOptions()}</select></div>
        <div class="control queue-capacity"><div class="capacity-top"><label for="capacity-input">Review capacity</label><output id="capacity-output" for="capacity-input">${state.capacity}% · ${num(k)} records</output></div><input id="capacity-input" type="range" min="5" max="50" step="5" value="${state.capacity}" aria-valuetext="${state.capacity} percent, ${k} records"><div class="range-labels"><span>5%</span><span>50%</span></div></div>
      </div>
      <div class="queue-evaluation"><label for="reveal-outcomes"><input id="reveal-outcomes" type="checkbox" ${state.reveal?'checked':''}> Show later outcomes</label><span>Retrospective evaluation only</span></div>
      ${state.reveal?`<div class="retrospective-results"><div><div class="retrospective-title">Historical check · ${esc(selectedLabel())}</div><small>${num(metrics.positives)} later module withdrawals</small></div><div><strong>${pct(metrics.precision,1)}</strong><span>Precision</span></div><div><strong>${pct(metrics.recall,1)}</strong><span>Recall</span></div><div><strong>${num(metrics.fp)}</strong><span>Selected records without later withdrawal</span></div></div>`:''}
      <div class="queue-workspace workspace-grid">
        <section class="roster-card" aria-label="Student list">
          <div class="roster-heading panel-head"><h3>Students <span>${num(k)}</span></h3><p>${method}</p></div>
          <div class="roster-scroll" id="roster-scroll" role="region" aria-label="Ranked student records" tabindex="0"><table class="student-roster">
            <thead><tr><th class="roster-rank" scope="col">#</th><th scope="col">Student</th><th scope="col">${model().kind==='index'?'Index / 100':model().kind==='rule'?'Inactivity':'Estimate'}</th><th class="roster-trend" scope="col" title="Weekly clicks, scaled separately for each student">Activity</th><th class="roster-signal" scope="col">Signal</th>${state.reveal?'<th scope="col">Later outcome</th>':''}</tr></thead><tbody>${queueRows(queue)}</tbody>
          </table></div>
          <div class="roster-footer"><span>${num(Math.min(state.shown,queue.length))} of ${num(queue.length)} records</span>${state.shown<queue.length?'<button class="quiet-button" id="load-more">Show 25 more</button>':''}</div>
        </section>
        <section class="profile-card" id="student-profile" tabindex="-1" aria-label="Selected student record">${detail(student)}</section>
      </div>
      <details class="queue-data-note"><summary>About these records</summary>
        <p>Student names are fictional. Course titles are illustrative examples from the Open University. OULAD withholds the original names and course titles. The research snapshot covers the first 28 days. Sparklines show weekly activity on individual scales.</p>
        <p>The predicted outcome is withdrawal from one module after day 28. A score cannot establish a cause or predict who would benefit from an intervention.</p></details></div>`;
  }
  function calibrationChart(m) {const rows=(m.calibration||[]).filter(r=>r.mean_pred!=null&&r.observed!=null);if(m.kind!=='logistic'||!rows.length)return `<div class="chart-empty"><strong>Probability calibration: not applicable.</strong><span>${m.kind==='index'?'R is a 0–100 review index.':'Inactivity is a ranking score measured in days.'}<br>Neither score is a withdrawal probability. Select A, B or C to inspect probability calibration.</span></div>`;const x=v=>46+n(v)*280;const y=v=>219-n(v)*183;const grid=[0,.25,.5,.75,1].map(t=>`<line x1="46" y1="${y(t)}" x2="326" y2="${y(t)}" stroke="#e1e4ea"/><text x="37" y="${y(t)+3}" text-anchor="end" font-size="9" fill="#50596a">${pct(t,0)}</text><text x="${x(t)}" y="237" text-anchor="middle" font-size="9" fill="#50596a">${pct(t,0)}</text>`).join('');const points=rows.map(r=>`${x(r.mean_pred)},${y(r.observed)}`).join(' ');return `<svg class="calibration-chart" viewBox="0 0 365 267" role="img" aria-label="Calibration plot comparing predicted probability with observed withdrawal frequency">${grid}<line x1="46" y1="219" x2="326" y2="36" stroke="#9ba9a5" stroke-width="1.5" stroke-dasharray="4 4"/><polyline points="${points}" fill="none" stroke="#6841a2" stroke-width="2.5"/>${rows.map(r=>`<circle cx="${x(r.mean_pred)}" cy="${y(r.observed)}" r="4" fill="#6841a2" stroke="white" stroke-width="1.3"><title>Predicted ${pct(r.mean_pred)}, observed ${pct(r.observed)}; n=${num(r.n)}</title></circle>`).join('')}<text x="185" y="258" text-anchor="middle" font-size="10" fill="#50596a">Predicted probability</text><text x="15" y="128" text-anchor="middle" font-size="10" fill="#50596a" transform="rotate(-90 15 128)">Observed frequency</text></svg>`;}
  function capacityChart(m) {const rows=(m.capacity||[]).slice().sort((a,b)=>n(a.percent)-n(b.percent));if(!rows.length)return '<div class="chart-empty">No capacity analysis was exported.</div>';const x=v=>45+(n(v)-5)/45*282;const y=v=>218-n(v)*182;const grid=[0,.25,.5,.75,1].map(t=>`<line x1="45" y1="${y(t)}" x2="327" y2="${y(t)}" stroke="#e1e4ea"/><text x="36" y="${y(t)+3}" text-anchor="end" font-size="9" fill="#50596a">${pct(t,0)}</text>`).join('');const lines=[['precision','#6841a2'],['recall','#236d98']].map(([key,color])=>`<polyline points="${rows.map(r=>`${x(r.percent)},${y(r[key])}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>${rows.map(r=>`<circle cx="${x(r.percent)}" cy="${y(r[key])}" r="3.4" fill="${color}" stroke="white" stroke-width="1"><title>${r.percent}% reviewed, ${pretty(key)} ${pct(r[key])}; ${num(r.k)} records</title></circle>`).join('')}`).join('');return `<svg class="capacity-chart" viewBox="0 0 365 267" role="img" aria-label="Precision and recall across review capacity from 5 to 50 percent">${grid}${lines}${[5,10,20,30,40,50].map(t=>`<text x="${x(t)}" y="237" text-anchor="middle" font-size="9" fill="#50596a">${t}%</text>`).join('')}<text x="186" y="258" text-anchor="middle" font-size="10" fill="#50596a">Share of the whole test cohort reviewed</text></svg>`;}
  function splits() {return ['train','validation','test'].map(key=>{const s=meta.splits?.[key]||{};return `<div class="split-card ${key==='test'?'test':''}"><div class="split-name">${key==='train'?'Training':pretty(key)}</div><div class="split-number">${num(s.n)}</div><p>Eligible module records</p><p>${esc(words(s.presentations))}</p><p>${num(s.positives)} withdrawals · ${pct(s.prevalence,1)}</p></div>`;}).join('');}
  function checkEntries() {
    const c=D.checks||{};
    const items=[
      ['Finite predictor values',c.finite_features===true],
      ['Registered at snapshot',c.active_at_snapshot===true],
      ['No train/validation student overlap',c.student_overlap_train_validation===0],
      ['No train/test student overlap',c.student_overlap_train_test===0],
      ['No validation/test student overlap',c.student_overlap_validation_test===0],
      ['Demographics excluded from predictors',Array.isArray(c.sensitive_predictors)&&c.sensitive_predictors.length===0],
      ['Labels and future fields excluded',Array.isArray(c.label_or_future_predictors)&&c.label_or_future_predictors.length===0],
      ['Assessment scores excluded',c.score_columns_loaded===false],
      ['Unique test aliases',c.test_alias_unique===true]
    ];
    return items.map(([label,pass])=>`<span class="check-item"><span class="check-icon">${pass?'✓':'!'}</span>${esc(label)}</span>`).join('');
  }
  function uncertaintyNote() {
    const u=D.uncertainty;if(!u||!Array.isArray(u.ci95_percentile))return '';
    return `<section class="provenance"><h3>Uncertainty in the added-context comparison</h3><p>C minus A average precision: <strong>${dec(u.estimate,4)}</strong>. Exploratory student-bootstrap 95% interval: <strong>${dec(u.ci95_percentile[0],4)} to ${dec(u.ci95_percentile[1],4)}</strong>, from ${num(u.repetitions)} resamples.</p><p>${esc(u.note)} This comparison describes prediction; it does not measure the benefit of contacting a student.</p></section>`;
  }
  function auditTable() {const rows=Array.isArray(D.audit)?D.audit:[];if(!rows.length)return '<p class="fine-print">No subgroup rows met the export criteria.</p>';return `<div class="table-scroll" role="region" tabindex="0" aria-label="Subgroup error rates"><table class="audit-table"><thead><tr><th scope="col">Attribute / group</th><th scope="col">Records</th><th scope="col">Withdrawals</th><th scope="col">Recall</th><th scope="col">False-positive rate</th><th scope="col">Precision</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(pretty(r.attribute))} · ${esc(r.group)}</td><td>${num(r.n)}</td><td>${num(r.positives)}</td><td>${pct(r.recall)}</td><td>${pct(r.fpr)}</td><td>${pct(r.precision)}</td></tr>`).join('')}</tbody></table></div>`;}
  function renderEvidence() {const m=model();return `<section class="evidence-view"><div class="section-heading"><div><h2>Model evidence</h2><p>Compare methods on the 2014J cohort and inspect the estimates at different review capacities.</p></div></div>
    <section class="panel"><div class="panel-head"><div><h3>Model comparison</h3><p>Select a method to see its calibration and review capacity. The test cohort contains ${num(meta.splits?.test?.n||students.length)} records.</p></div><span class="tag">${pct(meta.splits?.test?.prevalence,1)} outcome prevalence</span></div><div class="table-scroll" role="region" tabindex="0" aria-label="Model comparison"><table class="model-table"><thead><tr><th scope="col">Model / indicator set</th><th scope="col" title="Average precision summarises precision and recall across thresholds. Higher is better.">Average precision ↑</th><th scope="col" title="Area under the ROC curve. Higher is better.">ROC AUC ↑</th><th scope="col" title="Mean squared probability error. Lower is better.">Brier score ↓</th><th scope="col">Precision @ 10%</th><th scope="col">Recall @ 10%</th></tr></thead><tbody>${models.map(item=>`<tr class="${item.id===state.model?'chosen':''}"><td><button class="model-picker" data-model="${esc(item.id)}" aria-label="Inspect ${esc(item.label)}"><span class="model-name">${esc(item.label)}</span>${item.id===defaultModel?'<span class="chosen-label">Default</span>':''}<div class="model-note">${esc(modelDescription(item))}</div></button></td><td>${dec(item.metrics?.average_precision)}</td><td>${dec(item.metrics?.roc_auc)}</td><td>${item.kind==='logistic'?dec(item.metrics?.brier):'<span title="Not a probability model">N/A</span>'}</td><td>${pct(item.metrics?.precision_at_10pct)}</td><td>${pct(item.metrics?.recall_at_10pct)}</td></tr>`).join('')}</tbody></table></div></section><section class="evidence-intro"><div><h3>Comparison design</h3><p>Models A, B and C use progressively richer indicators with the same modelling approach. Inactivity and the R index provide fixed-rule benchmarks. R was specified after the original test results were known. Its comparison is exploratory.</p></div><div class="selected-model"><small>Default model on validation data</small><strong>${esc(selectedModel.label)}</strong><small>Selected before inspection of the 2014J test cohort.</small></div></section>
    <p class="section-note">At 10% capacity, precision is the share of selected records with a later module withdrawal; recall is the share of all later withdrawals included in that list. These figures measure prediction, not prevented withdrawals or intervention benefit. The inactivity rule and R index have no Brier score or probability calibration because neither estimates a probability. Their raw scores use different units and should not be compared directly.</p>${uncertaintyNote()}<div class="two-column"><section class="panel chart-panel"><div class="panel-head"><div><h3>${m.kind==='logistic'?'Probability calibration':'Score interpretation'}</h3><p>${esc(m.label)} · held-out calibration</p></div></div><div class="panel-body">${m.kind==='logistic'?'<div class="chart-legend"><span class="legend-key"><i></i>Observed in probability bins</span><span class="legend-key"><i class="dashed"></i>Perfect calibration</span></div>':''}${calibrationChart(m)}<p class="fine-print">${m.kind==='logistic'?'Each point groups records with similar estimated probabilities. Points away from the diagonal indicate over- or under-estimation. Small bins are less stable.':'Ranking scores can be evaluated for prioritisation without treating them as probabilities. Brier score and probability calibration are not applicable.'}</p></div></section><section class="panel chart-panel"><div class="panel-head"><div><h3>Precision and recall by capacity</h3><p>${esc(m.label)} · fixed review capacity</p></div></div><div class="panel-body"><div class="chart-legend"><span class="legend-key"><i></i>Precision</span><span class="legend-key"><i class="blue"></i>Recall</span></div>${capacityChart(m)}<p class="fine-print">Reviewing more records usually covers more subsequent withdrawals, while changing the proportion of false alarms. Capacity is a workflow choice, not a treatment recommendation.</p></div></section></div><div class="validation-heading"><div><h3>Evaluation cohorts</h3><p>Train: 2013B+2013J; calibration and original A/B/C selection: 2014B; evaluation: 2014J. No student crosses these splits. The 2014J results are now known, so subsequent comparisons are exploratory. This is not a strict calendar-time deployment replay.</p></div></div><div class="split-grid">${splits()}</div><div class="checks-section"><h4>Automated data checks</h4><div class="checks-list">${checkEntries()||'See the reproducible pipeline checks in the project package.'}</div></div><details class="details-panel"><summary>Inspect aggregate subgroup error rates</summary><div class="panel-body"><p class="fine-print" style="margin-top:0;margin-bottom:12px">Fixed global top-10% list for <strong>${esc(selectedModel.label)}</strong>, regardless of the model currently selected above. Demographic fields are excluded from individual predictions and this interface’s student records. Rows with fewer than 100 records, 20 positives or 20 negatives are suppressed. Differences are descriptive; this is not a fairness certification.</p>${auditTable()}</div></details><details class="details-panel"><summary>What this prototype cannot establish</summary><div class="panel-body"><ul class="evidence-list">${(meta.limits||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul><p class="fine-print">No comparison with Kortext’s proprietary algorithm has been performed. Real deployment would require current institutional data, prospective checks and stakeholder review.</p></div></details></section>`;}
  function researchCard(r) {
    return `<article class="research-card">
      <div class="research-card-top"><h3>${esc(r.title || r.concept)}</h3><p>${esc(r.concept || '')}</p></div>
      <div class="research-card-body">
        <div class="research-field"><strong>Observable signals</strong><p>${esc(words(r.signals))}</p></div>
        <div class="research-field"><strong>Hypothesis to test</strong><p>${esc(r.hypothesis)}</p></div>
        <div class="context-notice"><strong>Interpretation limits</strong><p>${esc(words(r.limitations))}</p></div>
        ${r.url ? `<a class="source-link" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.source_title || 'Read the source')} ↗</a>` : ''}
        ${r.status ? `<p class="fine-print">${esc(r.status)}</p>` : ''}
      </div></article>`;
  }

  function renderResearch() {
    const research = Array.isArray(D.research) ? D.research : [];
    return `<section class="sources-view">
      <div class="section-heading"><div><h2>Sources &amp; scope</h2><p>Dataset, indicator definitions and limits of the historical evaluation.</p></div></div>
      <section class="provenance">
        <h3>${esc(meta.dataset || 'Open University Learning Analytics Dataset (OULAD)')}</h3>
        <p>These anonymised records describe individual enrolments in a module presentation during 2013–2014. The outcome is withdrawal from that module. A learner could continue at university.</p>
        <dl class="source-facts">
          <div><dt>Observation window</dt><dd>First ${num(meta.cutoff_day || 28)} days</dd></div>
          <div><dt>Test cohort</dt><dd>2014J</dd></div>
          <div><dt>Data licence</dt><dd>${esc(meta.license || 'CC BY 4.0')}</dd></div>
        </dl>
        <p><strong>Recorded outcome</strong> · ${esc(meta.target || 'subsequent module withdrawal among records still registered at day 28')}. Later outcomes are used only for retrospective evaluation. Demographic fields are used only in aggregate error analysis.</p>
        <a class="source-link" href="${esc(safeUrl(meta.dataset_url || 'https://archive.ics.uci.edu/dataset/349/open+university+learning+analytics+dataset'))}" target="_blank" rel="noopener noreferrer">Open dataset and licence ↗</a>
      </section>
      <section class="source-method"><h3>How the indicators were defined</h3><ol>
        <li><strong>Choose the behaviour.</strong> Platform records show activity. Motivation, belonging and wellbeing are unobserved.</li>
        <li><strong>Define the measure.</strong> Set the observation window, calculation and treatment of missing data before testing.</li>
        <li><strong>Evaluate the ranking.</strong> Compare indicator groups on a held-out cohort at a fixed tutor workload.</li>
      </ol></section>
      <div class="research-grid">${research.map(researchCard).join('') || '<div class="provenance"><h3>Indicator references</h3><p>Consult the project documentation for indicator definitions and supporting sources.</p></div>'}</div>
      <div class="scope-grid">
        <section class="scope-card"><h3>What the evidence covers</h3><ul>
          <li>Reproducible day-28 indicators and predictions from the public data.</li><li>Feature comparisons, probability calibration and retrospective review capacity.</li><li>A tutor review queue that links records to observed learning activity and suggested checks.</li>
        </ul></section>
        <section class="scope-card future"><h3>Open research questions</h3><ul>
          <li>Will these indicators transfer to current courses and other institutions?</li><li>Can tutors interpret the evidence and use it in their work?</li><li>Does supportive follow-up improve outcomes, and for whom?</li><li>How should extensions, offline study, access barriers and course calendars be represented?</li>
        </ul></section>
      </div>
      ${productDiagnosis()}
      <details class="details-panel source-archive"><summary>Research history and supporting documents</summary><div class="panel-body">
        <p>The v0.4 application brings together the original ${esc(meta.version || 'v0.1')} experiment, the v0.2 reference index, the v0.3 course analyses and v0.4 tutor practice. Earlier predictions and protocols are preserved for reproduction. The practice exercises use invented cases.</p>
        <p>The project evaluates historical rankings. Wellbeing, the effect of interventions and the performance of Kortext’s proprietary system are outside its scope.</p>
        <ul><li><a href="https://github.com/rongsenzhang/engagement-to-support-lab/releases/tag/v0.1.0" target="_blank" rel="noopener noreferrer">Original experiment archive ↗</a></li>
          <li><a href="${repoDocs}company_research_v0.2.md" target="_blank" rel="noopener noreferrer">Company and competitor research ↗</a></li>
          <li><a href="${repoDocs}product_comparison.md" target="_blank" rel="noopener noreferrer">Product evidence map ↗</a></li>
          <li><a href="${repoDocs}protocol_v0.3.md" target="_blank" rel="noopener noreferrer">Course-comparison protocol ↗</a></li>
          <li><a href="#robustness">Course robustness results</a></li></ul>
      </div></details></section>`;
  }
  function render() {
    if (state.view !== 'queue') window.LAB_TUTOR_CHAT?.close();
    if (state.view === 'trial') {
      if (window.LAB_STUDY_UI) window.LAB_STUDY_UI.render(main);
      else main.innerHTML='<div class="provenance"><h3>Tutor practice is unavailable.</h3><p>The synthetic study module has not loaded. Research results remain available.</p><a href="#overview">Return to the research question →</a></div>';
      return;
    }
    if (state.view === 'robustness') {
      if (window.LAB_ROBUSTNESS_UI) window.LAB_ROBUSTNESS_UI.render(main);
      else main.innerHTML='<div class="provenance"><h3>Course robustness is unavailable.</h3><p>The course-robustness module has not loaded. The preserved review queue remains available.</p><a href="#queue">Return to the review queue →</a></div>';
      return;
    }
    main.innerHTML=state.view==='overview'?renderOverview():state.view==='queue'?renderQueue():state.view==='evidence'?renderEvidence():renderResearch();
    if (state.view === 'queue') {
      window.LAB_TUTOR_CHAT?.mount(document.getElementById('tutor-chat-slot'), state.selected, state.model, model().label, displayNames.get(state.selected));
    }
  }
  function exportQueue() {const {queue}=queueState();const headers=['display_alias','module','presentation','snapshot_day','model','score_unit','ranking_score','active_days_latest_7','days_since_last_activity','assessments_due','due_without_submission'];if(state.reveal)headers.push('later_module_withdrawal');const rows=queue.map(s=>{const x=s.signals||{};const row=[s.id,s.module,s.presentation,meta.cutoff_day||28,model().label,model().kind==='index'?'index_0_to_100':model().kind==='rule'?'days':'probability',score(s),x.active_days_7,n(x.no_activity)?'No activity recorded':x.days_since_last,x.due_count,x.overdue_count];if(state.reveal)row.push(n(s.outcome));return row;});const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const csv=[headers,...rows].map(row=>row.map(quote).join(',')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`support_review_${state.module}_${state.model}_${state.capacity}pct${state.reveal?'_retrospective':''}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);announce(`Exported ${queue.length} review records${state.reveal?' with retrospective outcomes':''}.`);}
  function showStudentProfile(target) {
    const list = document.getElementById('roster-scroll');
    const offset = list?.scrollTop || 0;
    const useMobileView = window.matchMedia?.('(max-width: 860px)').matches === true;
    const documentOffset = window.scrollY;
    state.selected = target.dataset.student;
    profileView.tab = 'journey';
    profileView.mobile = useMobileView;
    profileView.returnY = documentOffset;
    render();
    const newList = document.getElementById('roster-scroll');
    if (newList) newList.scrollTop = offset;
    if (useMobileView) {
      const profile = document.getElementById('student-profile');
      profile.focus({preventScroll:true});
      profile.scrollIntoView?.({block:'start', behavior:'instant'});
    } else {
      window.scrollTo(0,documentOffset);
      main.querySelectorAll('button[data-student]').forEach(button => {
        if (button.dataset.student === state.selected) button.focus({preventScroll:true});
      });
    }
    announce(`Inspecting ${studentLabel(studentById.get(state.selected))}.`);
  }
  function returnToRoster() {
    profileView.mobile = false;
    render();
    const button = [...main.querySelectorAll('button[data-student]')].find(item => item.dataset.student===state.selected);
    window.scrollTo({top:profileView.returnY,behavior:'instant'});
    button?.focus({preventScroll:true});
  }
  // The existing roster shortcuts focus controls inside the AI tab. Reveal
  // that tab before their focus and scroll handlers run on the button.
  main.addEventListener('click', event => {
    if (!event.target.closest('.tutor-ai-shortcuts button')) return;
    profileView.mobile = true;
    profileView.returnY = window.scrollY;
    event.target.closest('.queue-view').classList.add('queue-show-profile');
    activateProfileTab('tools');
  }, true);
  main.addEventListener('keydown', event => {
    const tab = event.target.closest('[data-profile-tab]');
    if (!tab) return;
    const i = profileTabs.findIndex(([key]) => key === tab.dataset.profileTab);
    const adjacent = {ArrowLeft:(i+profileTabs.length-1)%profileTabs.length,ArrowRight:(i+1)%profileTabs.length,Home:0,End:profileTabs.length-1};
    if (!Object.hasOwn(adjacent,event.key)) return;
    event.preventDefault();
    activateProfileTab(profileTabs[adjacent[event.key]][0]);
  });
  main.addEventListener('input',event=>{if(event.target.id==='capacity-input'){const value=n(event.target.value);const total=ordered().length;document.getElementById('capacity-output').textContent=`${value}% · ${num(Math.max(1,Math.ceil(total*value/100)))} records`;event.target.setAttribute('aria-valuetext',`${value} percent`);}});
  main.addEventListener('change',event=>{const target=event.target;if(target.id==='model-select'){state.model=target.value;state.shown=25;render();document.getElementById('model-select')?.focus();announce(`Model changed to ${model().label}.`);}else if(target.id==='module-select'){state.module=target.value;state.shown=25;render();document.getElementById('module-select')?.focus();announce(`Showing ${selectedLabel()}.`);}else if(target.id==='capacity-input'){state.capacity=n(target.value);state.shown=25;render();document.getElementById('capacity-input')?.focus();announce(`Reviewing the highest-ranked ${state.capacity} percent.`);}else if(target.id==='reveal-outcomes'){state.reveal=target.checked;render();document.getElementById('reveal-outcomes')?.focus();announce(state.reveal?'Later outcomes are now visible for retrospective evaluation.':'Later outcomes are hidden.');}});
  main.addEventListener('click',event=>{if(selectOverviewModule(event))return;if(event.target.closest('[data-rob-open-queue]')){state.model=defaultModel;state.module='all';state.capacity=10;state.selected=null;state.reveal=false;state.shown=25;return;}const caseButton=event.target.closest('[data-case]');if(caseButton){state.caseKind=caseButton.dataset.case;render();document.querySelector(`[data-case="${state.caseKind}"]`)?.focus({preventScroll:true});announce('Case selected. The historical outcome and all-model ranks are shown in the case detail.');return;}const modelButton=event.target.closest('[data-model]');if(modelButton){state.model=modelButton.dataset.model;render();document.querySelector(`[data-model="${state.model}"]`)?.focus();announce(`Inspecting ${model().label}.`);return;}const profileTab=event.target.closest('[data-profile-tab]');if(profileTab){activateProfileTab(profileTab.dataset.profileTab);return;}if(event.target.closest('#return-to-roster')){returnToRoster();return;}const studentTarget=event.target.closest('[data-student]');if(studentTarget){showStudentProfile(studentTarget);return;}if(event.target.closest('#load-more')){
      const listOffset=document.getElementById('roster-scroll').scrollTop;
      const scroll=window.scrollY;
      state.shown+=25;
      render();
      document.getElementById('roster-scroll').scrollTop=listOffset;
      window.scrollTo(0,scroll);
      document.getElementById('load-more')?.focus({preventScroll:true});
    }else if(event.target.closest('#export-queue'))exportQueue();});
  window.addEventListener('hashchange',setView);
  setView();
})();
