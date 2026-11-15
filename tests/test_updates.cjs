/* Release checking with a simulated DOM, network and clock; no browser or server. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../web/updates.js'), 'utf8');
const CURRENT = 'b'.repeat(64);
const NEXT = 'c'.repeat(64);
const PREVIOUS = 'a'.repeat(64);
function manifest(build = CURRENT, version = '0.2') {
  return {
    schema_version: 1, version, build_id: build, revision: 'd'.repeat(40),
    assets: { 'app.js': { path: 'assets/app.012345.js', sha256: 'e'.repeat(64) } },
    html: { path: 'index.html', sha256: 'f'.repeat(64) }
  };
}
async function settle() {
  // Fetch, response.json(), and finally each enqueue a microtask.
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
function harness(options = {}) {
  let now = 100000, nextTimer = 0;
  const timers = new Map(), windowEvents = new Map(), documentEvents = new Map();
  const responses = [...(options.responses || [manifest()])];
  const calls = [], navigation = [];
  const elements = new Map();
  function element(id) {
    const listeners = new Map();
    const node = {
      id, hidden: id === 'update-notice', textContent: '', innerHTML: '', focusCount: 0,
      addEventListener(name, callback) { listeners.set(name, callback); },
      click() { document.activeElement = this; listeners.get('click')?.(); },
      focus() { this.focusCount++; document.activeElement = this; },
      contains(child) { return child === this || (id === 'update-notice' && ['update-refresh', 'update-later'].includes(child?.id)); }
    };
    elements.set(id, node);
    return node;
  }
  for (const id of ['update-notice', 'update-message', 'update-status', 'update-refresh', 'update-later', 'main', 'module-select']) element(id);
  elements.get('main').innerHTML = '<section>Current review in progress</section>';
  elements.get('module-select').value = 'BBB';
  const metadata = {
    'lab-build-id': options.build === undefined ? CURRENT : options.build,
    'lab-version': options.version === undefined ? '0.2' : options.version
  };
  const document = {
    hidden: options.hidden || false, activeElement: elements.get('module-select'),
    querySelector(selector) {
      const key = selector.match(/name="([^"]+)"/)?.[1];
      return key in metadata ? { content: metadata[key] } : null;
    },
    getElementById(id) { return elements.get(id); },
    addEventListener(name, callback) { documentEvents.set(name, callback); }
  };
  const location = new URL(options.url || 'https://example.org/lab/?cohort=BBB#queue');
  location.assign = href => navigation.push(href);
  const window = {
    location, AbortController,
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, callback) { windowEvents.set(name, callback); },
    async fetch(url, settings) {
      calls.push({ url, settings });
      const next = responses.length ? responses.shift() : manifest();
      if (next instanceof Error) throw next;
      if (next?.pending) {
        return new Promise((resolve, reject) => {
          settings.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
      return {
        ok: next?.httpError !== true,
        async json() {
          if (next?.jsonError) throw new SyntaxError('Invalid JSON');
          return next;
        }
      };
    }
  };
  if (options.noFetch) delete window.fetch;
  vm.runInNewContext(source, { window, document, URL, Date: class extends Date { static now() { return now; } } });
  return {
    calls, navigation, elements, document, window,
    get notice() { return elements.get('update-notice'); },
    get message() { return elements.get('update-message').textContent; },
    enqueue(...items) { responses.push(...items); },
    focus() { windowEvents.get('focus')?.(); },
    visibility(hidden) { document.hidden = hidden; documentEvents.get('visibilitychange')?.(); },
    async advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const first = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!first) break;
        now = first[1].at;
        timers.delete(first[0]);
        first[1].callback();
        await settle();
      }
      now = end;
      await settle();
    },
    get timerCount() { return timers.size; }
  };
}

test('same build stays quiet and checks immediately with a fresh manifest request', async () => {
  const h = harness();
  assert.equal(h.calls.length, 1);
  await settle();
  assert.equal(h.notice.hidden, true);
  assert.deepEqual(h.navigation, []);
  const request = h.calls[0];
  const url = new URL(request.url);
  assert.equal(url.origin, 'https://example.org');
  assert.equal(url.pathname, '/lab/version.json');
  assert.ok(url.searchParams.has('_check'));
  assert.equal(url.searchParams.has('cohort'), false);
  assert.equal(request.settings.cache, 'no-store');
  assert.equal(request.settings.redirect, 'error');
  await h.advance(60000);
  assert.equal(h.calls.length, 2);
  assert.notEqual(h.calls[0].url, h.calls[1].url);
});

test('a different build shows a notice without navigating, altering review or stealing focus', async () => {
  const h = harness({ responses: [manifest(NEXT)] });
  await settle();
  assert.equal(h.notice.hidden, false);
  assert.match(h.message, /Version 0\.2 is ready/);
  assert.match(h.message, /resets your current filters/);
  assert.match(h.elements.get('update-status').textContent, /An updated demo is available/);
  assert.equal(h.elements.get('main').innerHTML, '<section>Current review in progress</section>');
  assert.equal(h.elements.get('module-select').value, 'BBB');
  assert.equal(h.document.activeElement.id, 'module-select');
  assert.deepEqual(h.navigation, []);
});

test('rollback with the same version also triggers a notice', async () => {
  const h = harness({ responses: [manifest(PREVIOUS)] });
  await settle();
  assert.equal(h.notice.hidden, false);
  h.elements.get('update-refresh').click();
  assert.equal(new URL(h.navigation[0]).searchParams.get('release'), PREVIOUS);
});

test('Later suppresses the current release but another build and later rollback can prompt again', async () => {
  const h = harness({ responses: [manifest(NEXT), manifest(NEXT), manifest(PREVIOUS), manifest(NEXT)] });
  await settle();
  h.elements.get('update-later').click();
  assert.equal(h.notice.hidden, true);
  assert.equal(h.document.activeElement.id, 'main');
  assert.equal(h.elements.get('update-status').textContent, '');
  await h.advance(60000);
  assert.equal(h.notice.hidden, true);
  await h.advance(60000);
  assert.equal(h.notice.hidden, false);
  h.elements.get('update-later').click();
  await h.advance(60000);
  assert.equal(h.notice.hidden, false);
  assert.equal(h.elements.get('module-select').value, 'BBB');
  assert.deepEqual(h.navigation, []);
});

test('returning to the current build removes a stale release notice', async () => {
  const h = harness({ responses: [manifest(NEXT), manifest(CURRENT)] });
  await settle();
  assert.equal(h.notice.hidden, false);
  await h.advance(60000);
  assert.equal(h.notice.hidden, true);
  h.elements.get('update-refresh').click();
  assert.deepEqual(h.navigation, []);
});

test('refresh keeps the current same-origin URL, query and route and ignores manifest redirect fields', async () => {
  const h = harness({
    url: 'https://example.org/lab/index.html?cohort=BBB&release=old&view=detail#queue',
    responses: [{ ...manifest(NEXT), url: 'https://attacker.invalid/', redirect_url: '//attacker.invalid/' }]
  });
  await settle();
  // Read the URL at click time, after navigation within the app.
  h.window.location.hash = '#evidence';
  h.elements.get('update-refresh').click();
  const result = new URL(h.navigation[0]);
  assert.equal(result.origin, 'https://example.org');
  assert.equal(result.pathname, '/lab/index.html');
  assert.equal(result.hash, '#evidence');
  assert.equal(result.searchParams.get('cohort'), 'BBB');
  assert.equal(result.searchParams.get('view'), 'detail');
  assert.deepEqual(result.searchParams.getAll('release'), [NEXT]);
});

test('invalid manifest fields, invalid JSON and failed HTTP responses remain silent', async () => {
  const invalid = [
    null, [], {}, { ...manifest(NEXT), schema_version: 2 },
    { ...manifest(NEXT), version: '<img src=x>' },
    { ...manifest(NEXT), build_id: 'not-a-build' },
    { ...manifest(NEXT), revision: 'short' },
    { ...manifest(NEXT), assets: {} },
    { ...manifest(NEXT), assets: { 'app.js': { path: 'app.js', sha256: 'invalid' } } },
    { ...manifest(NEXT), html: { path: 'https://attacker.invalid/index.html', sha256: CURRENT } },
    { ...manifest(NEXT), html: { path: '../index.html', sha256: CURRENT } },
    { jsonError: true }, { httpError: true }
  ];
  for (const response of invalid) {
    const h = harness({ responses: [response] });
    await settle();
    assert.equal(h.notice.hidden, true, JSON.stringify(response));
    assert.deepEqual(h.navigation, []);
    assert.equal(h.elements.get('module-select').value, 'BBB');
  }
});

test('offline failure leaves the page working and polling can recover', async () => {
  const h = harness({ responses: [new Error('offline'), manifest(NEXT)] });
  await settle();
  assert.equal(h.notice.hidden, true);
  await h.advance(60000);
  assert.equal(h.notice.hidden, false);
  assert.deepEqual(h.navigation, []);
});

test('bad responses do not erase an already available update', async () => {
  const h = harness({ responses: [manifest(NEXT), new Error('offline'), { jsonError: true }] });
  await settle();
  await h.advance(120000);
  assert.equal(h.notice.hidden, false);
  h.elements.get('update-refresh').click();
  assert.equal(new URL(h.navigation[0]).searchParams.get('release'), NEXT);
});

test('unbuilt previews, file URLs and unavailable fetch do not install polling', async () => {
  for (const options of [{ build: '' }, { version: '' }, { build: 'bad' },
    { url: 'file:///tmp/Engagement_Lab_v0.2.html' }, { noFetch: true }]) {
    const h = harness(options);
    h.focus();
    h.visibility(false);
    await h.advance(180000);
    assert.equal(h.calls.length, 0);
    assert.equal(h.timerCount, 0);
    assert.equal(h.notice.hidden, true);
  }
});

test('hidden tabs do not poll; returning to visibility checks promptly', async () => {
  const h = harness({ hidden: true, responses: [manifest(NEXT)] });
  await h.advance(180000);
  h.focus();
  assert.equal(h.calls.length, 0);
  h.visibility(false);
  await settle();
  assert.equal(h.calls.length, 1);
  assert.equal(h.notice.hidden, false);
  h.visibility(true);
  await h.advance(180000);
  assert.equal(h.calls.length, 1);
  assert.equal(h.timerCount, 0);
  h.visibility(false);
  await settle();
  assert.equal(h.calls.length, 2);
});

test('focus and visibility events are throttled and never duplicate in-flight requests', async () => {
  const h = harness({ responses: [{ pending: true }, manifest(NEXT)] });
  for (let i = 0; i < 10; i++) { h.focus(); h.visibility(false); }
  assert.equal(h.calls.length, 1);
  await h.advance(8000);
  h.focus();
  for (let i = 0; i < 10; i++) h.focus();
  await h.advance(1999);
  assert.equal(h.calls.length, 1);
  await h.advance(1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.notice.hidden, false);
});

test('timeout aborts a stalled request and a later poll recovers', async () => {
  const h = harness({ responses: [{ pending: true }, manifest(NEXT)] });
  await h.advance(7999);
  assert.equal(h.calls[0].settings.signal.aborted, false);
  await h.advance(1);
  assert.equal(h.calls[0].settings.signal.aborted, true);
  assert.equal(h.notice.hidden, true);
  await h.advance(60000);
  assert.equal(h.calls.length, 2);
  assert.equal(h.notice.hidden, false);
});

test('hiding a tab cancels the active request and resumes checking on return', async () => {
  const h = harness({ responses: [{ pending: true }, manifest(NEXT)] });
  h.visibility(true);
  await settle();
  assert.equal(h.calls[0].settings.signal.aborted, true);
  await h.advance(10000);
  assert.equal(h.timerCount, 0);
  h.visibility(false);
  await settle();
  assert.equal(h.calls.length, 2);
  assert.equal(h.notice.hidden, false);
});
