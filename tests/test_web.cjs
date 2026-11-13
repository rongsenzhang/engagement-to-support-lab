/* Dependency-free integration checks for the browser application.
 *
 * These execute the real data and application scripts in Node's VM with a small
 * simulated DOM. They check rendered content, event-driven state and exports.
 * They do not render CSS, emulate browser layout/accessibility, or constitute
 * desktop/mobile browser acceptance testing.
 * Run: node --test tests/test_web.cjs
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = Object.fromEntries(['data.js', 'reference-data.js', 'app.js'].map(
  file => [file, fs.readFileSync(path.join(root, 'web', file), 'utf8')]
));

function element(extra = {}) {
  const node = {
    innerHTML: '', textContent: '', dataset: {}, attributes: {}, listeners: {},
    classList: { toggle() {} },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() {}, remove() {},
    closest(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1) ? this : null;
      const match = selector.match(/^\[data-(case|model|student)\]$/);
      return match && this.dataset[match[1]] !== undefined ? this : null;
    },
    querySelectorAll() { return []; },
    ...extra,
  };
  return node;
}

function app(options = {}) {
  const nodes = new Map();
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, element({ id }));
    return nodes.get(id);
  };
  const main = getNode('main');
  const navigation = ['overview', 'queue', 'evidence', 'research'].map(
    view => element({ dataset: { view } })
  );
  const downloads = [], blobs = [], events = {};
  const document = {
    getElementById: getNode,
    querySelectorAll: selector => selector === '[data-view]' ? navigation : [],
    querySelector: () => element(),
    createElement: tagName => element({ tagName, click() {
      downloads.push({ filename: this.download, href: this.href });
    } }),
    body: { appendChild() {} },
  };
  const window = {
    location: { hash: options.hash || '' }, scrollY: 0, scrollTo() {},
    addEventListener(type, callback) { events[type] = callback; },
  };
  const context = vm.createContext({
    window, document, Blob, console,
    URL: {
      createObjectURL(blob) { blobs.push(blob); return `blob:test-${blobs.length}`; },
      revokeObjectURL() {},
    },
    // Timers only clean up exported object URLs; no real event loop is needed.
    setTimeout(callback) { callback(); },
  });
  if (!options.omitBase) vm.runInContext(source['data.js'], context, { filename: 'data.js' });
  if (!options.omitReference) {
    vm.runInContext(source['reference-data.js'], context, { filename: 'reference-data.js' });
    if (options.referenceEdit) options.referenceEdit(window.LAB_REFERENCE);
  }
  vm.runInContext(source['app.js'], context, { filename: 'app.js' });
  return {
    main, window, navigation, nodes,
    get html() { return main.innerHTML; },
    route(view) {
      window.location.hash = `#${view}`;
      events.hashchange();
    },
    change(id, value, checked) {
      main.listeners.change({ target: element({ id, value, checked }) });
    },
    input(id, value) {
      main.listeners.input({ target: element({ id, value }) });
    },
    click(selector, value) {
      const target = selector.startsWith('#')
        ? element({ id: selector.slice(1), tagName: 'BUTTON' })
        : element({ dataset: { [selector]: value }, tagName: 'BUTTON' });
      main.listeners.click({ target });
    },
    async csv() {
      main.listeners.click({ target: element({ id: 'export-queue' }) });
      return { filename: downloads.at(-1).filename, rows: parseCSV(await blobs.at(-1).text()) };
    },
  };
}

function parseCSV(text) {
  const rows = [], row = [];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (i === 0 && c === '\ufeff') continue;
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\r' || c === '\n')) {
      row.push(field); field = '';
      if (c !== ',') {
        rows.push(row.splice(0));
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else field += c;
  }
  row.push(field); rows.push(row);
  return rows;
}

function tableRow(html, model) {
  return [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)]
    .map(match => match[0]).find(row => row.includes(`data-model="${model}"`));
}

test('overview presents all three actual workload results with exploratory limits', () => {
  const a = app();
  assert.match(a.html, /RESEARCH QUESTION/);
  const cards = [...a.html.matchAll(/<article class="comparison-card[^\"]*">([\s\S]*?)<\/article>/g)]
    .map(match => match[1]);
  assert.equal(cards.length, 3);
  for (const [i, model] of ['activity', 'context', 'reference'].entries()) {
    const result = a.window.LAB_REFERENCE.comparison.models.find(m => m.id === model);
    assert.ok(cards[i].includes(`>${result.tp}<span> / ${result.k}</span>`));
  }
  assert.match(a.html, /already inspected in v0\.1/);
  assert.match(a.html, /does not show prevented withdrawals/);
  assert.equal(a.navigation.find(n => n.dataset.view === 'overview').attributes['aria-current'], 'page');
});

test('routes render and navigation exposes exactly one current view', () => {
  const a = app();
  const markers = { queue: 'id="model-select"', evidence: 'class="model-table"',
    research: 'class="research-grid"', overview: 'id="case-heading"' };
  for (const [view, marker] of Object.entries(markers)) {
    a.route(view);
    assert.ok(a.html.includes(marker), view);
    assert.equal(a.navigation.filter(n => n.attributes['aria-current'] === 'page').length, 1);
    assert.equal(a.navigation.find(n => n.attributes['aria-current'] === 'page').dataset.view, view);
  }
  a.route('unknown-route');
  assert.match(a.html, /RESEARCH QUESTION/);
});

test('overlay integration never mutates the frozen v0.1 model or record scores', () => {
  const a = app();
  a.route('queue');
  a.change('model-select', 'reference');
  assert.equal(a.window.LAB_DATA.models.length, 4);
  assert.equal(a.window.LAB_DATA.meta.default_model, 'context');
  assert.ok(a.window.LAB_DATA.students.every(s => !Object.hasOwn(s.scores, 'reference')));
  assert.match(a.html, /Activity \+ trend \+ assessment · selected/);
});

test('R queue uses index units and reconstructible components, with outcomes initially hidden', () => {
  const a = app({ hash: '#queue' });
  a.change('model-select', 'reference');
  assert.match(a.html, /Index \/ 100/);
  assert.match(a.html, /Transparent review index/);
  assert.match(a.html, /R1 calculation/);
  assert.match(a.html, /not a probability/);
  assert.doesNotMatch(a.html, /Estimated subsequent module withdrawal risk/);
  assert.doesNotMatch(a.html, /<th scope="col">Later outcome<\/th>/);
  assert.doesNotMatch(a.html, /<strong>Retrospective outcome:/);
});

test('R evidence has no Brier score or calibration points; original default remains C', () => {
  const a = app({ hash: '#evidence' });
  a.click('model', 'reference');
  const row = tableRow(a.html, 'reference');
  assert.ok(row);
  assert.match(row, /N\/A/);
  assert.match(row, />0\.192<\/td>/);
  assert.match(row, />0\.583<\/td>/);
  assert.match(a.html, /Probability calibration: not applicable/);
  assert.doesNotMatch(a.html, /<svg class="calibration-chart"/);
  assert.match(tableRow(a.html, 'context'), /chosen-label">Default/);
  a.click('model', 'activity');
  assert.match(a.html, /<svg class="calibration-chart"/);
});

test('each deterministic case opens, including failures outside both review queues', () => {
  const a = app();
  for (const c of a.window.LAB_REFERENCE.cases) {
    a.click('case', c.kind);
    const detail = a.html.split('id="case-detail"')[1];
    assert.ok(detail, c.kind);
    assert.ok(detail.includes(`<h3>${c.id}</h3>`), c.kind);
    assert.ok(detail.includes(c.population_count.toLocaleString('en-GB') + ' records meet this rule'));
    if (c.kind === 'both_miss_withdrawal') {
      assert.equal((detail.match(/Outside top 637/g) || []).length >= 2, true);
      assert.match(detail, /Later outcome: withdrew from this module/);
    }
    if (c.kind === 'C_false_positive') assert.match(detail, /Later outcome: no module withdrawal recorded/);
    if (c.kind === 'no_due_assessment') {
      assert.match(detail, /No assessment due: excluded/);
      assert.match(detail, /Equal weights across 2 applicable components/);
      assert.match(detail, /\/ 2 ≈/);
    }
  }
});

test('module and committed capacity changes export the matching deterministically ranked cohort', async () => {
  const a = app({ hash: '#queue' });
  a.change('model-select', 'reference');
  a.change('module-select', 'BBB');
  const cohort = a.window.LAB_DATA.students.filter(s => s.module === 'BBB');
  a.input('capacity-input', '20');
  assert.ok(a.nodes.get('capacity-output').textContent.startsWith('20%'));
  let exported = await a.csv();
  assert.equal(exported.rows.length - 1, Math.ceil(cohort.length * .1));
  a.change('capacity-input', '20');
  exported = await a.csv();
  const k = Math.ceil(cohort.length * .2);
  assert.equal(exported.rows.length - 1, k);
  assert.ok(exported.rows.slice(1).every(row => row[1] === 'BBB'));
  assert.equal(exported.filename, 'support_review_BBB_reference_20pct.csv');
  const scoreById = new Map(a.window.LAB_REFERENCE.records.map(r => [r.id, r.score]));
  const expected = Array.from(cohort).sort((x, y) => scoreById.get(y.id) - scoreById.get(x.id) ||
    (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)).slice(0, k).map(s => s.id);
  assert.deepEqual(exported.rows.slice(1).map(row => row[0]), expected);
});

test('CSV declares index units and includes later outcomes only after explicit reveal', async () => {
  const a = app({ hash: '#queue' });
  a.change('model-select', 'reference');
  let { rows, filename } = await a.csv();
  const unitColumn = rows[0].indexOf('score_unit');
  assert.ok(unitColumn >= 0);
  assert.equal(rows[0].includes('later_module_withdrawal'), false);
  assert.equal(rows.length - 1, 637);
  assert.ok(rows.slice(1).every(row => row[unitColumn] === 'index_0_to_100'));
  assert.doesNotMatch(filename, /retrospective/);
  a.change('reveal-outcomes', undefined, true);
  ({ rows, filename } = await a.csv());
  assert.equal(rows[0].at(-1), 'later_module_withdrawal');
  assert.equal(rows.slice(1).reduce((sum, row) => sum + Number(row.at(-1)), 0), 157);
  assert.match(filename, /_retrospective\.csv$/);
  assert.match(a.html, /<th scope="col">Later outcome<\/th>/);
  a.change('reveal-outcomes', undefined, false);
  assert.doesNotMatch(a.html, /<strong>Retrospective outcome:/);
});

test('existing inactivity and logistic exports keep their distinct units', async () => {
  const a = app({ hash: '#queue' });
  for (const [model, unit] of [['inactivity', 'days'], ['activity', 'probability']]) {
    a.change('model-select', model);
    const { rows } = await a.csv();
    const column = rows[0].indexOf('score_unit');
    assert.ok(rows.slice(1).every(row => row[column] === unit));
  }
});

test('missing or incompatible R artifacts retain original views without fabricated scores', () => {
  const cases = [
    { omitReference: true },
    { referenceEdit: r => r.records.pop() },
    { referenceEdit: r => { r.records[0].score = NaN; } },
    { referenceEdit: r => { r.records[0].score = 101; } },
    { referenceEdit: r => { r.records[0].components.recency = NaN; } },
    { referenceEdit: r => { r.records[0].component_count = 4; } },
    { referenceEdit: r => { r.records[0].score += 0.01; } },
    { referenceEdit: r => { r.records[1].id = r.records[0].id; } },
    { referenceEdit: r => { r.records[0] = null; } },
  ];
  for (const options of cases) {
    const a = app(options);
    assert.match(a.html, /Reference artifact unavailable/);
    assert.match(a.html, /missing or incompatible/);
    a.route('queue');
    assert.doesNotMatch(a.html, /<option value="reference"/);
    assert.match(a.html, /id="model-select"/);
    a.route('evidence');
    assert.equal(tableRow(a.html, 'reference'), undefined);
    assert.ok(tableRow(a.html, 'context'));
  }
});

test('missing base results produce a clear unavailable state', () => {
  const a = app({ omitBase: true });
  assert.match(a.html, /Research results are not available/);
  assert.doesNotMatch(a.html, /157/);
});
