'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web/robustness.js'), 'utf8');

// Small, deliberately synthetic fixtures check UI logic; they are never shipped.
function method(id, n = 100, ap = .25) {
  const positive = n / 5;
  return { id, label: id, kind: ['reference', 'inactivity'].includes(id) ? 'index' : 'logistic',
    average_precision: ap, roc_auc: .6, brier: .16,
    capacities: [5, 10, 20].map(percent => {
      const k = Math.ceil(n * percent / 100), tp = Math.min(Math.ceil(k / 3), positive);
      return { percent, k, tp, fp: k - tp, fn: positive - tp, precision: tp / k, recall: tp / positive };
    }) };
}
function fixture() {
  const historicalModels = ['activity', 'trend', 'context', 'reference', 'inactivity', 'course_prior'];
  const models = n => historicalModels.map((id, i) => method(id, n, [.22, .3, .25, .21, .18, .2][i]));
  const population = (module, n) => ({ module, n, positives: n / 5, prevalence: .2, models: models(n),
    assessment_applicability: { with_due: module === 'ALL' ? 50 : 0, without_due: module === 'ALL' ? 50 : n } });
  const foldModels = ['activity', 'trend', 'context', 'nonlinear', 'course_prior'].map(id => method(id));
  const partition = { n: 100, students: 95, positives: 20 };
  const folds = ['BBB', 'DDD', 'EEE', 'FFF', 'GGG'].map(module => ({ module, fit: partition,
    calibration: partition, evaluation: { ...partition, prevalence: .2 }, purged_n: 3,
    isolation: { fit_calibration_overlap: 0, fit_evaluation_overlap: 0, calibration_evaluation_overlap: 0 },
    selection: { selected_max_leaf_nodes: 7, candidates: [7, 15, 31].map(max_leaf_nodes => ({ max_leaf_nodes, mean_ap: .3,
      inner: ['BBB', 'DDD', 'EEE', 'FFF', 'GGG'].filter(m => m !== module).map(m => ({ module: m, average_precision: .3, fit_n: 100, selection_n: 30, purged_n: 2 })) })) },
    models: foldModels }));
  const scenario = id => ({ id, label: id, affected_n: 10, changed_n: 9, n: 100,
    warning: 'Simulated missing records: verify the feed before interpreting the score.',
    models: ['activity', 'trend', 'context'].map(id => ({ id, label: id, baseline: method(id), stressed: method(id, 100, .2),
      overlap: [5, 10, 20].map(percent => ({ percent, k: percent, intersection: percent - 2, turnover: 2, jaccard: (percent - 2) / (percent + 2) })),
      mean_abs_probability_change: .01, max_abs_probability_change: .2, median_abs_rank_change: 3, max_abs_rank_change: 15 })),
    cases: [{ id: 'SYN-UI-1', module: 'BBB', warning: 'Known simulated impairment.',
      clean: { probability: .2, rank: 30, signals: { active_days_7: 4, overdue_count: 0 }, contributions: [{ feature: 'days', label: 'Activity days', contribution: -.2 }] },
      stressed: { probability: .4, rank: 15, signals: { active_days_7: 0, overdue_count: 1 }, contributions: [{ feature: 'days', label: 'Activity days', contribution: .1 }] } }] });
  return { meta: { version: '0.3.0', notes: ['Synthetic UI fixture only.'] },
    historical: { populations: [population('ALL', 100), population('BBB', 50)], allocation: { global_k: 10, module_k_sum: 11 } },
    development: { folds, macro: foldModels.map(m => ({ ...m, capacities: undefined, precision_at_10: .4, recall_at_10: .2 })),
      pooled: { n: 100, positives: 20, prevalence: .2, models: foldModels }, note: 'Exploratory development data.' },
    stress: { scenarios: ['activity_delay', 'submission_delay', 'activity_missing'].map(scenario), note: 'No real outage is asserted.' } };
}
function harness(data = fixture(), withApp = false) {
  const nodes = new Map(), events = {}, blobs = [], downloads = [];
  function node(extra = {}) {
    return { listeners: {}, dataset: {}, attributes: {}, textContent: '', focus() {}, remove() {},
      classList: { toggle() {} }, addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; },
      querySelectorAll() { return []; },
      closest(selector) {
        if (selector.startsWith('#')) return this.id === selector.slice(1) ? this : null;
        if (selector === '[data-rob-section]') return this.dataset.robSection ? this : null;
        if (selector === '[data-rob-open-queue]') return this.dataset.robOpenQueue ? this : null;
        return null;
      }, ...extra };
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, node({ id })); return nodes.get(id); };
  const main = get('main'); let html = '', child;
  Object.defineProperty(main, 'innerHTML', { get: () => html, set(value) { html = value; child = node(); } });
  main.querySelector = selector => selector === '#robustness-root' ? child : node();
  const nav = ['overview', 'queue', 'evidence', 'robustness', 'research'].map(view => node({ dataset: { view } }));
  const document = { getElementById: get, querySelector: () => node(),
    querySelectorAll: selector => selector === '[data-view]' ? nav : [],
    body: { appendChild() {} }, createElement: () => node({ click() { downloads.push(this.download); } }) };
  const window = { LAB_ROBUSTNESS: data, location: { hash: '#robustness' }, scrollY: 0, scrollTo() {},
    addEventListener(type, callback) { events[type] = callback; } };
  const context = vm.createContext({ window, document, Blob, console,
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} }, setTimeout(callback) { callback(); } });
  vm.runInContext(source, context);
  if (withApp) for (const file of ['data.js', 'reference-data.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(root, 'web', file), 'utf8'), context);
  else window.LAB_ROBUSTNESS_UI.render(main);
  return { window, main, nav, get html() { return html; },
    change(id, value) { child.listeners.change({ target: node({ id, value }) }); },
    section(section) { child.listeners.click({ target: node({ dataset: { robSection: section }, textContent: section }) }); },
    route(view) { window.location.hash = '#' + view; events.hashchange(); },
    render() { window.LAB_ROBUSTNESS_UI.render(main); },
    queueLink() { main.listeners.click({ target: node({ dataset: { robOpenQueue: true } }) }); this.route('queue'); },
    appChange(id, value) { main.listeners.change({ target: node({ id, value }) }); },
    async csv() { child.listeners.click({ target: node({ id: 'rob-export' }) }); return { name: downloads.at(-1), text: await blobs.at(-1).text() }; }
  };
}
function parseCsv(text) {
  return text.replace(/^\ufeff/, '').split('\r\n').map(line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replace(/""/g, '"')));
}

test('historical filters export the selected population, method and integer workload', async () => {
  const h = harness();
  h.change('rob-module', 'BBB'); h.change('rob-capacity', '20'); h.change('rob-model', 'reference');
  assert.match(h.html, /Module BBB · within-module ranking · top 20%/);
  assert.match(h.html, /Eligible assessment due by day 28: 0 \/ 50/);
  assert.match(h.html, /known applicability state, not a missing feed/);
  assert.match(h.html, /original models learned different coefficients/);
  assert.match(h.html, /N\/A/);
  const csv = await h.csv(), rows = parseCsv(csv.text), record = Object.fromEntries(rows[0].map((key, i) => [key, rows[1][i]]));
  assert.equal(rows.length, 2);
  assert.equal(record.model_id, 'reference'); assert.equal(record.n, '50'); assert.equal(record.k, '10');
  assert.equal(record.brier, ''); assert.equal(record.capacity_percent, '20');
  assert.match(csv.name, /historical_BBB_20pct/);
  h.render(); assert.match(h.html, /value="BBB" selected/); assert.match(h.html, /value="reference" selected/);
});

test('contrasts distinguish assessment from joint changes and keep negative findings', () => {
  const h = harness();
  assert.match(h.html, /Eligible assessment due by day 28: 50 \/ 100/);
  assert.doesNotMatch(h.html, /original models learned different coefficients/);
  assert.match(h.html, /B → C/); assert.match(h.html, /Adds assessment features/);
  assert.match(h.html, /A → C/); assert.match(h.html, /Adds both trend and assessment/);
  assert.match(h.html, /-0\.050/); assert.match(h.html, /\+0\.030/);
  assert.match(h.html, /not a slice of the global queue/);
  assert.match(h.html, /global list contains 10 records/);
  assert.match(h.html, /selects 11 records in total/);
});

test('development exposes all folds and inner selection; macro means use fixed 10% without fabricated counts', async () => {
  const h = harness(); h.section('development');
  for (const module of ['BBB', 'DDD', 'EEE', 'FFF', 'GGG']) assert.ok(h.html.includes(`Module ${module}: fitting`));
  assert.match(h.html, /id="rob-capacity" disabled/);
  assert.match(h.html, /top 10% per module/);
  assert.match(h.html, /N selection: candidate scores/);
  const rows = parseCsv((await h.csv()).text), record = Object.fromEntries(rows[0].map((key, i) => [key, rows[1][i]]));
  assert.equal(record.n, ''); assert.equal(record.tp, ''); assert.equal(record.k, '');
  assert.equal(record.precision, '0.4');
  h.change('rob-fold', 'DDD'); h.change('rob-capacity', '5');
  assert.match(h.html, /Outer module DDD · top 5%/);
  assert.match(h.html, /Purged before fitting: 3 enrolments/);
  assert.doesNotMatch(h.html, /Module BBB: fitting/);
  h.change('rob-fold', 'pooled'); assert.match(h.html, /combine five independently fitted models/);
});

test('stress resets incompatible method selection and reports real stored overlap and before/after C values', async () => {
  const h = harness(); h.change('rob-model', 'reference'); h.section('stress');
  assert.match(h.html, /data-rob-model="context"/);
  assert.match(h.html, /Known simulated data impairment/);
  h.change('rob-scenario', 'submission_delay'); h.change('rob-model', 'context'); h.change('rob-capacity', '20');
  assert.match(h.html, /Rank #30/); assert.match(h.html, /Rank #15/);
  assert.match(h.html, /20\.0%/); assert.match(h.html, /40\.0%/);
  assert.match(h.html, /-0\.200/); assert.match(h.html, /\+0\.100/);
  assert.match(h.html, /Selection does not use later outcomes/);
  const rows = parseCsv((await h.csv()).text);
  assert.equal(rows.length, 3); assert.ok(rows[1].includes('context · original')); assert.ok(rows[2].includes('context · impaired'));
  assert.ok(rows[1].includes('20')); assert.ok(rows[1].includes('0.2')); // fixed outcome prevalence
  assert.match(h.html, /81\.8%/); // Jaccard 18 / 22, not shared fraction 18 / 20.
  h.section('historical'); assert.match(h.html, /value="reference" selected/); // Each section retains its own method filter.
});

test('missing sections and unavailable metrics do not invent zeros or break other routes', async () => {
  const h = harness(null, true);
  assert.match(h.html, /results are missing or incompatible/);
  h.route('queue'); assert.match(h.html, /id="model-select"/);
  const data = fixture(); data.development.folds = [];
  const a = harness(data); a.section('development'); assert.match(a.html, /Analysis unavailable/);
  const sparse = fixture(); sparse.historical.populations[0].models[0].average_precision = null;
  const b = harness(sparse); b.change('rob-model', 'activity');
  const rows = parseCsv((await b.csv()).text);
  assert.equal(rows[1][rows[0].indexOf('average_precision')], '');
});

test('module state survives routing and does not replace existing main handlers or the selected queue state', () => {
  const h = harness(fixture(), true);
  const handlers = { ...h.main.listeners };
  h.change('rob-module', 'BBB'); h.change('rob-capacity', '20');
  h.route('queue'); h.appChange('module-select', 'BBB'); h.appChange('model-select', 'activity');
  h.route('robustness'); assert.match(h.html, /value="BBB" selected/); assert.match(h.html, /top 20%/);
  for (const [event, callback] of Object.entries(handlers)) assert.equal(h.main.listeners[event], callback);
  assert.equal(h.nav.filter(n => n.attributes['aria-current'] === 'page').length, 1);
  assert.equal(h.nav.find(n => n.attributes['aria-current'] === 'page').dataset.view, 'robustness');
  h.route('queue'); assert.match(h.html, /value="activity" selected/);
  h.route('robustness'); h.queueLink();
  assert.match(h.html, /value="context" selected/); assert.match(h.html, /All held-out modules/);
  assert.match(h.html, /10% · 637 records/);
});

test('export neutralises spreadsheet formulas and HTML escapes payload labels', async () => {
  const data = fixture(); data.historical.populations[0].models[0].label = '=SUM(1,2)<script>';
  const h = harness(data); h.change('rob-model', 'activity');
  assert.match(h.html, /&lt;script&gt;/); assert.doesNotMatch(h.html, /<script>/);
  const rows = parseCsv((await h.csv()).text);
  assert.equal(rows[1][rows[0].indexOf('model')], "'=SUM(1,2)<script>");
});

test('committed experiment payload renders and exports its actual metric rows', { skip: !fs.existsSync(path.join(root, 'web/robustness-data.js')) }, async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'web/robustness-data.js'), 'utf8'), sandbox);
  const data = sandbox.window.LAB_ROBUSTNESS, h = harness(data);
  for (const pop of data.historical.populations) {
    h.change('rob-module', pop.module);
    if (pop.assessment_applicability) {
      assert.ok(h.html.includes('Eligible assessment due by day 28: ' + pop.assessment_applicability.with_due.toLocaleString('en-GB') + ' / ' + pop.n.toLocaleString('en-GB')));
      if (pop.assessment_applicability.with_due === 0) assert.match(h.html, /original models learned different coefficients/);
    }
    const rows = parseCsv((await h.csv()).text), headers = rows[0];
    assert.equal(rows.length - 1, pop.models.length);
    for (const [i, m] of pop.models.entries()) {
      assert.equal(rows[i + 1][headers.indexOf('average_precision')], String(m.average_precision ?? ''));
      assert.equal(rows[i + 1][headers.indexOf('tp')], String(m.capacities.find(c => c.percent === 10).tp));
    }
  }
  h.section('development'); for (const fold of data.development.folds) { h.change('rob-fold', fold.module); assert.ok(h.html.includes('Outer module ' + fold.module)); }
  h.section('stress'); for (const scenario of data.stress.scenarios) { h.change('rob-scenario', scenario.id); assert.ok(h.html.includes(scenario.cases[0]?.id || 'No changed example')); }
});
