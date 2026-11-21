/* Displays versioned experiment results; no fitting or stress simulation runs here. */
(function () {
  'use strict';
  const state = { section: 'historical', module: 'ALL', capacity: 10, models: { historical: 'all', development: 'all', stress: 'all' }, fold: 'macro', scenario: null, caseId: null };
  const docs = 'https://github.com/rongsenzhang/engagement-to-support-lab/blob/main/docs/';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const num = value => finite(value) ? value.toLocaleString('en-GB') : '—';
  const dec = (value, places = 3) => finite(value) ? value.toFixed(places) : '—';
  const pct = value => finite(value) ? (100 * value).toFixed(1) + '%' : '—';
  const signed = (value, places = 3) => finite(value) ? (value > 0 ? '+' : '') + value.toFixed(places) : '—';
  const list = value => Array.isArray(value) ? value : [];
  const probability = model => !['reference', 'inactivity'].includes(model.id);
  const capacity = (model, percent) => list(model?.capacities).find(row => row.percent === percent);
  const announce = text => { const node = document.getElementById('live-status'); if (node) node.textContent = text; };
  let exportRows = [], exportName = 'robustness';

  function select(id, label, values, chosen, disabled = false) {
    return `<div class="control"><label for="${id}">${esc(label)}</label><select id="${id}" ${disabled ? 'disabled' : ''}>${values.map(([value, text]) => `<option value="${esc(value)}" ${String(value) === String(chosen) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></div>`;
  }
  function modelControl(models) {
    if (state.models[state.section] !== 'all' && !models.some(m => m.id === state.models[state.section])) state.models[state.section] = 'all';
    return select('rob-model', 'Show methods', [['all', 'All methods'], ...models.map(m => [m.id, m.label])], state.models[state.section]);
  }
  const capacityControl = (fixed = false) => select('rob-capacity', 'Review capacity', [5, 10, 20].map(n => [n, `${n}% of this population`]), fixed ? 10 : state.capacity, fixed);
  function empty(text) { return `<div class="provenance"><h3>Analysis unavailable</h3><p>${esc(text)}</p><p>No substitute results have been calculated.</p></div>`; }
  function populationStrip(pop, label) {
    return `<div class="rob-population"><div><strong>${num(pop.n)}</strong><span>module enrolments</span></div><div><strong>${num(pop.positives)}</strong><span>later withdrawals</span></div><div><strong>${pct(pop.prevalence)}</strong><span>outcome prevalence</span></div><div><strong>${esc(label)}</strong><span>evaluation population</span></div></div>`;
  }
  function assessmentNote(pop) {
    const applicability = pop.assessment_applicability;
    if (!applicability || !finite(applicability.with_due)) return '';
    return `<p class="research-boundary"><strong>Eligible assessment due by day 28: ${num(applicability.with_due)} / ${num(pop.n)}.</strong>${applicability.with_due === 0 ? ' No assessment due is a known applicability state, not a missing feed. Where these added features are constant, C can still reorder records because the original models learned different coefficients for their shared features.' : ''}</p>`;
  }
  function modelRows(models, pop, percent, scope) {
    return models.filter(m => state.models[state.section] === 'all' || m.id === state.models[state.section]).map(m => {
      const c = capacity(m, percent) || {};
      return { population: scope, model: m.label, model_id: m.id, n: pop.n ?? null, positives: pop.positives ?? null,
        prevalence: pop.prevalence ?? null, average_precision: m.average_precision ?? null, roc_auc: m.roc_auc ?? null,
        brier: probability(m) ? m.brier ?? null : null, capacity_percent: percent, k: c.k ?? null,
        tp: c.tp ?? null, fp: c.fp ?? null, fn: c.fn ?? null,
        precision: c.precision ?? m.precision_at_10 ?? null, recall: c.recall ?? m.recall_at_10 ?? null };
    });
  }
  function metricTable(rows, caption, macro = false) {
    exportRows = rows;
    const columns = macro
      ? [['model', 'Method'], ['average_precision', 'AP ↑'], ['roc_auc', 'ROC AUC ↑'], ['brier', 'Brier ↓'], ['precision', 'Precision @ 10%'], ['recall', 'Recall @ 10%']]
      : [['model', 'Method'], ['n', 'n'], ['positives', 'Withdrawals'], ['prevalence', 'Prevalence'], ['average_precision', 'AP ↑'], ['roc_auc', 'ROC AUC ↑'], ['brier', 'Brier ↓'], ['k', 'k'], ['tp', 'TP'], ['fp', 'FP'], ['fn', 'FN'], ['precision', 'Precision'], ['recall', 'Recall']];
    function cell(row, key) {
      if (key === 'model') return `<strong>${esc(row.model)}</strong>`;
      if (key === 'brier' && ['reference', 'inactivity'].includes(row.model_id)) return '<span title="A ranking score, not a probability">N/A</span>';
      if (['prevalence', 'precision', 'recall'].includes(key)) return pct(row[key]);
      if (key === 'average_precision') return `${dec(row[key])}<span class="rob-ap-bar" aria-hidden="true"><i style="width:${finite(row[key]) ? Math.min(100, Math.max(0, row[key] * 100)) : 0}%"></i></span>`;
      return ['roc_auc', 'brier'].includes(key) ? dec(row[key]) : num(row[key]);
    }
    return `<div class="panel rob-table-panel"><div class="panel-head"><div><h3>${esc(caption)}</h3><p>AP = average precision. TP = selected withdrawal; FP = selected without withdrawal; FN = withdrawal outside the list.</p></div><button type="button" class="quiet-button" id="rob-export">Export metric table ↓</button></div><div class="rob-table-scroll" tabindex="0" role="region" aria-label="${esc(caption)}; horizontally scrollable"><table class="rob-table"><caption>${esc(caption)}. All counts refer to module enrolments.</caption><thead><tr>${columns.map(([, label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr data-rob-model="${esc(row.model_id)}">${columns.map(([key], i) => `<${i ? 'td' : 'th scope="row"'}>${cell(row, key)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }
  function differences(models, percent, macro = false) {
    const c = models.find(m => m.id === 'context');
    return `<div class="rob-contrasts">${[['trend', 'B → C', 'Adds assessment features to activity and trend.'], ['activity', 'A → C', 'Adds both trend and assessment features.']].map(([id, title, note]) => {
      const base = models.find(m => m.id === id);
      if (!base || !c) return '';
      const capC = capacity(c, percent), capB = capacity(base, percent);
      const difference = (x, y) => finite(x) && finite(y) ? x - y : null;
      const ap = difference(c.average_precision, base.average_precision);
      const precision = difference(macro ? c.precision_at_10 : capC?.precision, macro ? base.precision_at_10 : capB?.precision);
      const tp = difference(capC?.tp, capB?.tp);
      return `<section class="rob-contrast"><h4>${title}</h4><p>${note}</p><dl><div><dt>AP difference</dt><dd>${signed(ap)}</dd></div><div><dt>Precision difference</dt><dd>${finite(precision) ? signed(100 * precision, 1) + ' pp' : '—'}</dd></div>${macro ? '' : `<div><dt>Selected withdrawals</dt><dd>${signed(tp, 0)}</dd></div>`}</dl></section>`;
    }).join('')}</div><p class="section-note">Differences are C minus the comparator, including negative values. These point estimates do not establish statistical significance, causation or a generally superior model.</p>`;
  }
  function historical(data) {
    const populations = list(data.historical?.populations);
    const pop = populations.find(p => p.module === state.module) || populations[0];
    if (!pop || !Array.isArray(pop.models)) return empty('The historical module results are missing.');
    state.module = pop.module;
    exportName = `historical_${pop.module}_${state.capacity}pct`;
    const allocation = data.historical.allocation || {};
    const scope = pop.module === 'ALL' ? 'All modules · global ranking' : `Module ${pop.module} · within-module ranking`;
    return `<div class="rob-intro"><h3>Historical results by module</h3><p>Inspect the preserved 2014J predictions and a training-only module-prior baseline. These historical outcomes were already observed; this is retrospective analysis.</p></div><div class="rob-controls">${select('rob-module', 'Evaluation population', populations.map(p => [p.module, p.module === 'ALL' ? 'All modules (global list)' : `Module ${p.module}`]), state.module)}${capacityControl()}${modelControl(pop.models)}</div>${populationStrip(pop, pop.module === 'ALL' ? '2014J · pooled' : '2014J · ' + pop.module)}${assessmentNote(pop)}${metricTable(modelRows(pop.models, pop, state.capacity, scope), `${scope} · top ${state.capacity}%`)}<p class="rob-explanation">Every method in this table uses the same integer workload: <strong>${num(capacity(pop.models[0], state.capacity)?.k)} records</strong>. R is a 0–100 index and inactivity is measured in days; neither has a Brier score. AP bars use a common 0–1 scale; read AP alongside prevalence.</p>${differences(pop.models, state.capacity)}<div class="research-boundary"><strong>Two different workload allocations.</strong> At 10%, one global list contains ${num(allocation.global_k)} records. Taking the top 10% separately in every module selects ${num(allocation.module_k_sum)} records in total, including rounding. A module filter here ranks that module on its own; it is not a slice of the global queue.</div><div class="rob-links"><a href="#queue" data-rob-open-queue="true">Open the original C review queue →</a><a href="${docs}protocol_v0.3.md" target="_blank" rel="noopener noreferrer">Read the fixed comparison protocol ↗</a></div><details class="details-panel"><summary>What the module-prior comparator tests</summary><div class="panel-body"><p class="rob-explanation">For the historical comparison, rates are learned only from 2013B/J using (withdrawals + 1) / (enrolments + 2). An unseen module uses that training population’s global rate. Within one module, all records receive the same prior; alias order breaks ties. It supplies no individual behavioural information.</p></div></details>`;
  }
  function partition(part, label) {
    return `<div><strong>${esc(label)}</strong><span>${num(part?.n)} enrolments · ${num(part?.students)} students · ${num(part?.positives)} withdrawals</span></div>`;
  }
  function foldDetails(fold) {
    const selection = fold.selection || {};
    return `<details class="details-panel rob-fold-detail"><summary>Module ${esc(fold.module)}: fitting, selection, calibration and evaluation</summary><div class="panel-body"><div class="rob-partitions">${partition(fold.fit, 'Fit after splitting')}${partition(fold.calibration, 'Reserved calibration')}${partition(fold.evaluation, 'Outer evaluation')}</div><p class="rob-explanation">Purged before fitting: ${num(fold.purged_n)} enrolments. N selected maximum leaves: ${num(selection.selected_max_leaf_nodes)}. A/B/C have fixed parameters. N uses the mean inner-fold AP; exact ties favour fewer leaves.</p><div class="rob-isolation">${Object.entries(fold.isolation || {}).map(([name, count]) => `<span>${esc(name.replace(/_/g, ' '))}: <strong>${esc(typeof count === 'boolean' ? String(count) : num(count))}</strong></span>`).join('')}</div><div class="rob-table-scroll" tabindex="0" role="region" aria-label="Inner model selection results"><table class="rob-table"><caption>N selection: candidate scores on inner held-out modules, before outer evaluation</caption><thead><tr><th>Maximum leaves</th><th>Mean inner AP</th><th>Inner held-out module</th><th>AP</th><th>Fitting n</th><th>Selection n</th><th>Purged n</th></tr></thead><tbody>${list(selection.candidates).flatMap(candidate => list(candidate.inner).map(inner => `<tr><td>${num(candidate.max_leaf_nodes)}</td><td>${dec(candidate.mean_ap)}</td><td>${esc(inner.module)}</td><td>${dec(inner.average_precision)}</td><td>${num(inner.fit_n)}</td><td>${num(inner.selection_n)}</td><td>${num(inner.purged_n)}</td></tr>`)).join('')}</tbody></table></div></div></details>`;
  }
  function development(data) {
    const dev = data.development;
    if (!dev || !Array.isArray(dev.folds) || !dev.folds.length) return empty('The development leave-module-out results are missing.');
    const choices = [['macro', 'Equal-weight mean across modules'], ['pooled', 'Pooled outer predictions (secondary)'], ...dev.folds.map(f => [f.module, 'Outer module ' + f.module])];
    if (!choices.some(([value]) => value === state.fold)) state.fold = 'macro';
    const macro = state.fold === 'macro';
    const fold = dev.folds.find(f => f.module === state.fold);
    const pop = macro ? {} : state.fold === 'pooled' ? (dev.pooled || {}) : (fold?.evaluation || {});
    const models = macro ? list(dev.macro) : state.fold === 'pooled' ? list(dev.pooled?.models) : list(fold?.models);
    const percent = macro ? 10 : state.capacity;
    const scope = choices.find(([value]) => value === state.fold)[1];
    exportName = `development_${state.fold}_${percent}pct`;
    return `<div class="rob-intro"><h3>Evaluation on held-out courses</h3><p>Five outer folds use the development blocks (2013B/J and 2014B). Each outer module is excluded from fitting, parameter selection and calibration. This remains an exploratory, single-institution study.</p></div><div class="rob-controls">${select('rob-fold', 'Evaluation summary', choices, state.fold)}${capacityControl(macro)}${modelControl(models)}</div>${macro ? `<div class="research-boundary"><strong>Equal-weight means over ${num(dev.folds.length)} outer modules.</strong> Each module contributes equally, regardless of its size. Precision and recall here use each module’s own top-10% list. Counts are shown in individual folds; they are not averaged into fictitious people.</div>` : populationStrip(pop, state.fold === 'pooled' ? 'Development · pooled' : 'Held out · ' + state.fold)}${metricTable(modelRows(models, pop, percent, scope), scope + (macro ? ' · top 10% per module' : ` · top ${percent}%`), macro)}${differences(models, percent, macro)}<p class="rob-explanation">The module-prior baseline has a constant global-prior fallback on an unseen module. N is a controlled nonlinear comparator with the same eight inputs as C, not an assumed improvement. Brier scores apply to probability estimates.</p>${state.fold === 'pooled' ? `<div class="research-boundary"><strong>Pooled outer predictions are secondary.</strong> They combine five independently fitted models. They are not predictions from one model trained on the full population, and global ranking is a different allocation from separate module lists.</div>` : ''}<section class="rob-method"><h3>Training and evaluation populations</h3><p>Outer-module students are removed from the remaining modules. Around 20% of the remaining student groups are reserved for calibration. N searches exactly 7, 15 and 31 leaves using four inner held-out modules; A/B/C use fixed settings. Outer outcomes do not choose parameters.</p>${(fold ? [fold] : dev.folds).map(foldDetails).join('')}</section>${dev.note ? `<p class="section-note">${esc(dev.note)}</p>` : ''}`;
  }
  function stressCase(item) {
    const before = item.clean || {}, after = item.stressed || {};
    const fields = [...new Set([...Object.keys(before.signals || {}), ...Object.keys(after.signals || {})])];
    const contributions = new Map(list(after.contributions).map(c => [c.feature, c]));
    return `<section class="panel rob-stress-case"><div class="panel-head"><div><h3>${esc(item.id)} · Module ${esc(item.module)}</h3><p>C before and after the simulated impairment · full historical population</p></div><span class="tag">SIMULATED</span></div><div class="panel-body"><p class="research-boundary">${esc(item.warning || 'Verify the data feed before interpreting a changed score.')}</p><div class="rob-before-after"><div><span>Original record</span><strong>${pct(before.probability)}</strong><span>Rank #${num(before.rank)}</span></div><span aria-hidden="true">→</span><div><span>Impaired feed</span><strong>${pct(after.probability)}</strong><span>Rank #${num(after.rank)}</span></div></div><p class="rob-explanation">These are frozen-model probability estimates under two input conditions. A lower rank number means earlier review. A change caused by withheld records is not proof of changed learning.</p><details class="details-panel"><summary>Compare input evidence</summary><div class="panel-body rob-table-scroll" tabindex="0" role="region" aria-label="Original and impaired inputs"><table class="rob-table"><thead><tr><th>Input</th><th>Original</th><th>Impaired</th></tr></thead><tbody>${fields.map(key => `<tr><th scope="row">${esc(key.replace(/_/g, ' '))}</th><td>${dec(before.signals?.[key], 3)}</td><td>${dec(after.signals?.[key], 3)}</td></tr>`).join('')}</tbody></table></div></details><details class="details-panel"><summary>Compare all C feature contributions</summary><div class="panel-body rob-table-scroll" tabindex="0" role="region" aria-label="C feature contributions before and after impairment"><table class="rob-table"><thead><tr><th>Feature</th><th>Original</th><th>Impaired</th><th>Change</th></tr></thead><tbody>${list(before.contributions).map(c => { const next = contributions.get(c.feature)?.contribution; return `<tr><th scope="row">${esc(c.label || c.feature)}</th><td>${signed(c.contribution)}</td><td>${signed(next)}</td><td>${finite(next) && finite(c.contribution) ? signed(next - c.contribution) : '—'}</td></tr>`; }).join('')}</tbody></table><p class="section-note">Contributions are additive model log-odds associations. They do not explain a person’s circumstances or the cause of withdrawal.</p></div></details></div></section>`;
  }
  function stress(data) {
    const scenarios = list(data.stress?.scenarios);
    const scenario = scenarios.find(s => s.id === state.scenario) || scenarios[0];
    if (!scenario || !Array.isArray(scenario.models)) return empty('The simulated data-quality results are missing.');
    state.scenario = scenario.id;
    const cases = list(scenario.cases), chosen = cases.find(c => c.id === state.caseId) || cases[0];
    state.caseId = chosen?.id || null;
    exportName = `stress_${scenario.id}_${state.capacity}pct`;
    const modelSelect = modelControl(scenario.models);
    const visible = scenario.models.filter(m => state.models[state.section] === 'all' || m.id === state.models[state.section]);
    const historicalPopulation = list(data.historical?.populations).find(p => p.module === 'ALL') || {};
    const pop = { n: scenario.n, positives: historicalPopulation.positives, prevalence: historicalPopulation.prevalence };
    const rows = visible.flatMap(m => [
      ...modelRows([{ ...m.baseline, id: m.id, label: m.label + ' · original' }], pop, state.capacity, scenario.id + ' / original'),
      ...modelRows([{ ...m.stressed, id: m.id, label: m.label + ' · impaired' }], pop, state.capacity, scenario.id + ' / impaired')
    ]);
    return `<div class="rob-intro"><h3>Simulated data delays</h3><p>These fixed event-removal scenarios are simulated, not observed outages. The cohort and outcomes stay unchanged, and A/B/C are not retrained. The score response demonstrates the risk of treating missing events as absent activity.</p></div><div class="rob-controls">${select('rob-scenario', 'Simulated impairment', scenarios.map(s => [s.id, s.label]), state.scenario)}${capacityControl()}${modelSelect}</div><div class="research-boundary"><strong>Known simulated data impairment.</strong> ${esc(scenario.warning)}</div><div class="rob-population"><div><strong>${num(scenario.n)}</strong><span>fixed enrolments</span></div><div><strong>${num(scenario.affected_n)}</strong><span>affected by the mask</span></div><div><strong>${num(scenario.changed_n)}</strong><span>records with changed inputs</span></div></div>${scenario.affected_definition ? `<p class="section-note">Affected count: ${esc(scenario.affected_definition)}.</p>` : ''}<section class="panel rob-table-panel"><div class="panel-head"><div><h3>Changes in review-list membership</h3><p>Same top-${state.capacity}% workload before and after impairment. Turnover counts replacements, not replacements plus removals.</p></div></div><div class="rob-table-scroll" tabindex="0" role="region" aria-label="Review-list changes"><table class="rob-table"><thead><tr><th>Method</th><th>k</th><th>Shared records</th><th>Replacements</th><th>Jaccard overlap</th><th>Mean |probability change|</th><th>Maximum |probability change|</th><th>Median |rank change|</th><th>Maximum |rank change|</th></tr></thead><tbody>${visible.map(m => { const o = list(m.overlap).find(r => r.percent === state.capacity) || {}; return `<tr><th scope="row">${esc(m.label)}</th><td>${num(o.k)}</td><td>${num(o.intersection)}</td><td>${num(o.turnover)}</td><td>${pct(o.jaccard)}</td><td>${finite(m.mean_abs_probability_change) ? dec(100 * m.mean_abs_probability_change, 1) + ' pp' : '—'}</td><td>${finite(m.max_abs_probability_change) ? dec(100 * m.max_abs_probability_change, 1) + ' pp' : '—'}</td><td>${num(m.median_abs_rank_change)}</td><td>${num(m.max_abs_rank_change)}</td></tr>`; }).join('')}</tbody></table></div></section>${metricTable(rows, 'Original and impaired-feed metrics')}<section class="rob-method"><h3>Inspect a changed record</h3><p>Up to three affected records with the largest absolute C rank changes, ties broken by alias. Selection does not use later outcomes. The examples always describe C, regardless of the method filter above.</p>${cases.length ? `<div class="rob-case-picker">${select('rob-case', 'C example', cases.map(c => [c.id, `${c.id} · Module ${c.module}`]), state.caseId)}</div>${stressCase(chosen)}` : '<p class="rob-explanation">No changed example was exported for this scenario.</p>'}</section>${data.stress.note ? `<p class="section-note">${esc(data.stress.note)}</p>` : ''}`;
  }
  function download() {
    if (!exportRows.length) return;
    const headers = Object.keys(exportRows[0]);
    const quote = value => { let text = value == null ? '' : String(value); if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const csv = [headers, ...exportRows.map(row => headers.map(key => row[key]))].map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'robustness_' + exportName.replace(/[^a-z0-9_-]/gi, '_') + '.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('Exported the displayed experiment metric table.');
  }
  function render(main) {
    const data = window.LAB_ROBUSTNESS;
    exportRows = [];
    if (!data || !data.meta || !data.historical || !data.development || !data.stress) {
      main.innerHTML = empty('The course-robustness results are missing or incompatible. The preserved review queue and model evidence remain available.') + '<p class="rob-links"><a href="#queue">Return to the review queue →</a></p>';
      return;
    }
    const content = state.section === 'historical' ? historical(data) : state.section === 'development' ? development(data) : stress(data);
    main.innerHTML = `<section id="robustness-root" class="robustness"><div class="section-heading"><div><h2>Course robustness</h2><p>Explore how rankings vary across modules, held-out courses and simulated delays in the historical data.</p></div></div><div class="rob-tabs" role="group" aria-label="Robustness analyses">${[['historical', 'Within-course results'], ['development', 'Held-out courses'], ['stress', 'Simulated delays']].map(([value, label]) => `<button type="button" data-rob-section="${value}" aria-pressed="${state.section === value}" class="${state.section === value ? 'active' : ''}">${label}</button>`).join('')}</div>${content}<section class="rob-next"><h3>Interpretation and next steps</h3><p>Use the within-module and B → C comparisons to judge the assessment signal; use held-out modules to examine transfer and the stress results to identify evidence that needs checking. Negative and mixed results remain part of the decision.</p><p>The <a href="#trial">synthetic tutor practice</a> is ready to test understanding and review workflow. Participants will be arranged later. No real tutor study, contemporary institutional validation or support benefit is established here.</p><a href="${docs}results_v0.3.md" target="_blank" rel="noopener noreferrer">Read the full findings and limitations ↗</a> · <a href="${docs}protocol_v0.3.md" target="_blank" rel="noopener noreferrer">Comparison protocol ↗</a></section>${list(data.meta.notes).length ? `<details class="details-panel"><summary>Analysis notes and scope</summary><div class="panel-body"><ul class="evidence-list">${data.meta.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul></div></details>` : ''}</section>`;
    const root = main.querySelector('#robustness-root');
    root.addEventListener('click', event => {
      const section = event.target.closest('[data-rob-section]');
      if (section) {
        state.section = section.dataset.robSection;
        render(main);
        main.querySelector(`[data-rob-section="${state.section}"]`)?.focus({ preventScroll: true });
        announce('Showing ' + section.textContent + '.');
      } else if (event.target.closest('#rob-export')) download();
    });
    root.addEventListener('change', event => {
      const keys = { 'rob-module': 'module', 'rob-model': 'model', 'rob-fold': 'fold', 'rob-scenario': 'scenario', 'rob-case': 'caseId', 'rob-capacity': 'capacity' };
      const key = keys[event.target.id];
      if (!key) return;
      if (key === 'model') state.models[state.section] = event.target.value;
      else state[key] = key === 'capacity' ? Number(event.target.value) : event.target.value;
      render(main);
      document.getElementById(event.target.id)?.focus({ preventScroll: true });
      announce('Updated the selected robustness analysis.');
    });
  }
  window.LAB_ROBUSTNESS_UI = { render };
})();
