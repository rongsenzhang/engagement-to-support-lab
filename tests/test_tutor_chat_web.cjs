'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/tutor-chat.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.parts = new Map();
    this.text = '';
    this.value = '';
  }
  querySelector(selector) {
    if (!this.parts.has(selector)) {
      const node = new Element();
      node.hidden = ['form', '[data-stop]', '[data-analysis-cancel]'].includes(selector);
      this.parts.set(selector, node);
    }
    return this.parts.get(selector);
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map(node => node.textContent ?? node).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, action) { this.listeners[type] = action; }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
  fire(type) { return this.listeners[type]({preventDefault() {}}); }
}

function harness(replies, url = 'http://localhost:8765', getResponse) {
  const calls = [];
  const timers = new Map();
  const window = {location: new URL(url), navigator: {onLine: true}};
  const context = {
    window, document: {createElement: () => new Element(), createTextNode: text => ({textContent: text})},
    AbortController, TextDecoder, URL,
    setTimeout(action, delay) { const id = Symbol(); timers.set(id, {action, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (path, options) => {
      calls.push({path, ...options});
      if (options.method !== 'POST') return getResponse ? getResponse(path, options) : Response.json({available: true});
      return replies.shift()(options);
    }
  };
  vm.runInNewContext(source, context);
  const slot = new Element();
  // Exercise the narrow-layout shortcut using the queue header recreated on render.
  let shortcuts;
  const heading = {
    parentNode: {querySelector: () => shortcuts},
    insertAdjacentElement(position, node) { shortcuts = node; }
  };
  slot.closest = () => ({querySelector: () => heading});
  return {
    get jump() { return shortcuts.children[1]; },
    get analysisJump() { return shortcuts.children[0]; },
    get analysis() { return slot.children[0]; },
    get posts() { return calls.filter(call => call.method === 'POST'); },
    calls, api: window.LAB_TUTOR_CHAT, navigator: window.navigator,
    async advance(delay = 500) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay > delay) continue;
        timers.delete(id);
        timer.action();
      }
      await tick();
    },
    async select(record = 'S-A', model = 'context', displayName) {
      shortcuts = null;
      window.LAB_TUTOR_CHAT.mount(slot, record, model, model, displayName);
      await tick();
      return slot.children.at(-1);
    }
  };
}

function submit(panel, text) {
  panel.querySelector('textarea').value = text;
  return panel.querySelector('form').fire('submit');
}

function stream(...chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  }));
}

test('static/offline views give a local launch option without making any network request', async () => {
  for (const url of ['https://example.github.io/demo', 'file:///tmp/demo.html']) {
    const h = harness([], url);
    const panel = await h.select();
    assert.equal(h.calls.length, 0);
    assert.match(panel.querySelector('.tutor-chat-notice').textContent, /run_demo.py --chat/);
    assert.ok(panel.querySelector('form').hidden);
  }
});

test('split UTF-8 chunks yield a literal reply and a grounded follow-up; record/model changes reset history', async () => {
  const answer = '查证迟交。<b>demo</b>';
  const bytes = Buffer.from(JSON.stringify({type:'delta',text:answer}) + '\n{"type":"done"}\n');
  const cut = bytes.indexOf(Buffer.from('查')) + 1;
  const h = harness(Array.from({length:4}, () => () => stream(bytes.subarray(0,cut),bytes.subarray(cut))));
  const first = await h.select();
  await submit(first, '这个分数是什么？');
  const literal = first.querySelector('.tutor-chat-replies').children[1].children[1];
  assert.equal(literal.textContent, answer);
  assert.equal(literal.children[0].textContent, answer);
  const same = await h.select();
  assert.equal(same, first);
  await submit(same, '下一步呢？');
  const payload = JSON.parse(h.calls.at(-1).body);
  assert.deepEqual(payload, {recordId:'S-A',model:'context',messages:[
    {role:'user',content:'这个分数是什么？'}, {role:'assistant',content:answer}, {role:'user',content:'下一步呢？'}
  ]});
  await submit(await h.select('S-B'), 'New question');
  assert.equal(JSON.parse(h.calls.at(-1).body).messages.length,1);
  await submit(await h.select('S-B','reference'), 'Which rule?');
  assert.equal(JSON.parse(h.calls.at(-1).body).messages.length,1);
});

test('an interrupted or failed reply restores the question and is excluded from the retry', async () => {
  const h = harness([
    () => stream(Buffer.from('{"type":"delta","text":"Partial"}\n')),
    () => Response.json({error:'Check project access.'},{status:403})
  ]);
  const panel = await h.select();
  await submit(panel,'Question');
  assert.equal(panel.querySelector('textarea').value,'Question');
  assert.match(panel.querySelector('.tutor-chat-status').textContent,/before the reply was complete/);
  await submit(panel,'Question');
  assert.equal(JSON.parse(h.calls.at(-1).body).messages.length,1);
  assert.equal(panel.querySelector('.tutor-chat-status').textContent,'Check project access.');
});

test('changing record or leaving the queue aborts work; Stop restores the active question', async () => {
  const untilAbort = options => new Promise((_,reject) => {
    options.signal.addEventListener('abort',() => reject(new Error('aborted')));
  });
  const h = harness([untilAbort,untilAbort,untilAbort]);
  const first = await h.select();
  const pending = submit(first,'First');
  const signal = h.calls.at(-1).signal;
  const next = await h.select('S-B');
  assert.equal(signal.aborted,true);
  await pending;
  assert.equal(next.querySelector('.tutor-chat-replies').children.length,0);
  const second = submit(next,'Second');
  next.querySelector('[data-stop]').fire('click');
  await second;
  assert.equal(next.querySelector('textarea').value,'Second');
  assert.equal(next.querySelector('.tutor-chat-status').textContent,'Reply stopped.');
  const third = submit(next,'Third');
  h.api.close();
  await third;
  assert.equal(h.calls.at(-1).signal.aborted,true);
});

const pages = 'https://rongsenzhang.github.io/engagement-to-support-lab/';
const worker = 'https://record-chat.test-account.workers.dev';

test('published Pages uses its project config and sends only the requested record to its worker', async () => {
  const h = harness([() => stream(Buffer.from('{"type":"done"}\n'))], pages, path =>
    Response.json(path.endsWith('config.json') ? {origin: worker} : {available: true}));
  const panel = await h.select();
  assert.equal(h.calls[0].path, '/engagement-to-support-lab/tutor-chat-config.json');
  assert.equal(h.calls[0].mode, 'same-origin');
  assert.equal(h.calls[1].path, worker + '/api/tutor-chat/status');
  await submit(panel, 'What should I verify?');
  const post = h.calls.at(-1);
  assert.equal(post.path, worker + '/api/tutor-chat');
  assert.equal(post.mode, 'cors');
  assert.equal(post.credentials, 'omit');
  assert.equal(post.redirect, 'error');
  assert.deepEqual(Object.keys(JSON.parse(post.body)).sort(), ['messages','model','recordId']);
});

test('a hosted Worker site calls its same-origin backend without Pages configuration', async () => {
  const h = harness([], worker);
  assert.equal((await h.select()).querySelector('form').hidden, false);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].path, '/api/tutor-chat/status');
  assert.equal(h.calls[0].mode, 'same-origin');
});

test('missing or unsafe project config does not contact another origin and can be retried', async () => {
  for (const bad of [null, 'https://evil.example', worker + '/other', 'http://x.workers.dev', worker + '?url=test']) {
    let failed = true;
    const h = harness([], pages, path => {
      if (path.endsWith('config.json')) {
        if (failed && bad === null) return new Response(null,{status:404});
        return Response.json({origin: failed ? bad : worker});
      }
      return Response.json({available:true});
    });
    const panel = await h.select();
    assert.equal(h.calls.length, 1);
    assert.equal(panel.querySelector('form').hidden, true);
    assert.match(panel.querySelector('.tutor-chat-notice').textContent,/currently unavailable/);
    failed = false;
    await panel.querySelector('[data-reconnect]').fire('click');
    assert.equal(panel.querySelector('form').hidden, false);
  }
});

test('other GitHub projects on the same owner do not search for a backend', async () => {
  const h = harness([], 'https://rongsenzhang.github.io/other/');
  await h.select();
  assert.equal(h.calls.length, 0);
});

test('narrow-screen shortcuts focus the selected record analysis or open its conversation', async () => {
  const h = harness([], worker);
  const first = await h.select('S-A');
  assert.match(h.analysisJump.textContent, /S-A/);
  const second = await h.select('S-B');
  assert.match(h.analysisJump.textContent, /S-B/);
  h.analysisJump.fire('click');
  assert.equal(h.analysis.querySelector('h4').focused, true);
  assert.equal(h.analysis.scrolled, true);
  h.jump.fire('click');
  assert.equal(second.open, true);
  assert.equal(second.querySelector('summary').focused, true);
  assert.equal(second.scrolled, true);
  assert.ok(!first.open);
});

const report = [
  '### Observed evidence', '15 clicks in week 2; <em>one</em> submission.',
  '**Model interpretation:** Lower recorded activity contributes to this score.',
  '3. Missing context', 'Offline study is unknown.',
  'Next check: Confirm the assessment deadline.'
].join('\n');
const complete = content => stream(Buffer.from(JSON.stringify({type: 'delta', text: content}) + '\n{"type":"done"}\n'));
const reportStatus = panel => panel.querySelector('.tutor-analysis-status').textContent;
const reportBlocks = panel => panel.querySelector('.tutor-analysis-results').children;
const reportAction = panel => panel.querySelector('[data-analysis-action]');
const pressReport = panel => reportAction(panel).fire('click');

test('selecting records leaves the report idle until clicked, then Pages shows literal evidence under four headings', async () => {
  const h = harness([() => complete(report)], pages, path =>
    Response.json(path.endsWith('config.json') ? {origin: worker} : {available: true}));
  await h.select('S-A');
  const chat = await h.select('S-B', 'reference', 'Fictional Learner');
  await h.advance(125000);
  assert.equal(h.posts.length, 0);
  assert.equal(reportAction(h.analysis).textContent, 'Generate AI analysis');
  await pressReport(h.analysis);
  assert.equal(h.posts.length, 1);
  const [post] = h.posts;
  assert.deepEqual(JSON.parse(post.body), {recordId: 'S-B', model: 'reference', mode: 'analysis'});
  assert.equal(post.path, worker + '/api/tutor-chat');
  assert.equal(post.mode, 'cors');
  assert.equal(post.credentials, 'omit');
  assert.equal(h.analysis.className, 'tutor-analysis');
  assert.match(h.analysis.innerHTML, /AI record analysis/);
  assert.match(h.analysis.innerHTML, /GPT-6.2 Sol/);
  assert.equal(h.analysis.querySelector('.tutor-analysis-scope').textContent, 'Fictional Learner · reference');
  assert.equal(chat.querySelector('.tutor-chat-scope').textContent, 'Fictional Learner · reference');
  assert.match(h.analysisJump.textContent, /Fictional Learner/);
  const blocks = reportBlocks(h.analysis);
  assert.deepEqual(Array.from(blocks, block => block.children[0].textContent),
    ['Observed evidence', 'Model interpretation', 'Missing context', 'Next check']);
  assert.equal(blocks[0].children[1].textContent, '15 clicks in week 2; <em>one</em> submission.');
  assert.equal(blocks[0].children[1].children.length, 0);
  assert.equal(reportStatus(h.analysis), 'Analysis ready.');
});

test('completed reports survive rerenders and queue revisits, keyed by the record and ranking model', async () => {
  const h = harness([() => complete('Observed evidence: First.'), () => complete('Observed evidence: Second.')]);
  await h.select();
  await pressReport(h.analysis);
  const initial = h.analysis;
  await h.select();
  assert.equal(h.analysis, initial);
  assert.equal(h.posts.length, 1);
  await h.select('S-A', 'reference');
  assert.equal(h.posts.length, 1);
  assert.equal(reportAction(h.analysis).textContent, 'Generate AI analysis');
  await pressReport(h.analysis);
  assert.equal(h.posts.length, 2);
  assert.match(reportBlocks(h.analysis)[0].textContent, /Second/);
  h.api.close();
  await h.select();
  await h.advance();
  assert.equal(reportBlocks(h.analysis).length, 0);
  assert.equal(reportAction(h.analysis).textContent, 'View saved analysis');
  await pressReport(h.analysis);
  assert.equal(h.posts.length, 2);
  assert.match(reportBlocks(h.analysis)[0].textContent, /First/);
});

test('report selection and queue disposal abort pending generation and discard late text', async () => {
  let finish;
  const h = harness([
    () => new Promise(resolve => { finish = () => resolve(complete('Observed evidence: Stale.')); }),
    () => new Promise((_, reject) => { finish = () => reject(new TypeError()); }),
    () => complete('Observed evidence: Fresh.')
  ]);
  await h.select();
  const first = h.analysis;
  const pendingA = pressReport(h.analysis);
  const aSignal = h.posts.at(-1).signal;
  await h.select('S-B');
  assert.equal(aSignal.aborted, true);
  finish();
  await pendingA;
  assert.equal(h.posts.length, 1);
  const pendingB = pressReport(h.analysis);
  const bSignal = h.posts.at(-1).signal;
  assert.equal(reportBlocks(first).length, 0);
  assert.equal(reportBlocks(h.analysis).length, 0);
  h.api.close();
  assert.equal(bSignal.aborted, true);
  finish();
  await pendingB;
  await h.select();
  await pressReport(h.analysis);
  assert.equal(h.posts.length, 3);
  assert.match(reportBlocks(h.analysis)[0].textContent, /Fresh/);
});

test('Generate ignores repeated clicks; Cancel or a timeout permits an explicit retry', async () => {
  const pending = options => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  });
  const h = harness([pending, pending, () => complete(report)]);
  await h.select();
  const cancel = h.analysis.querySelector('[data-analysis-cancel]');
  const first = pressReport(h.analysis);
  await pressReport(h.analysis);
  assert.equal(h.posts.length, 1);
  assert.equal(cancel.hidden, false);
  cancel.fire('click');
  await first;
  assert.equal(reportStatus(h.analysis), 'Analysis cancelled.');
  assert.equal(cancel.hidden, true);
  assert.equal(reportAction(h.analysis).textContent, 'Retry analysis');
  const second = pressReport(h.analysis);
  await h.advance(125000);
  await second;
  assert.match(reportStatus(h.analysis), /timed out/);
  assert.equal(h.posts.length, 2);
  await pressReport(h.analysis);
  assert.equal(reportStatus(h.analysis), 'Analysis ready.');
  await pressReport(h.analysis);
  assert.equal(h.posts.length, 3);
});

test('incomplete, empty and failed reports allow chat and retry only on request', async () => {
  for (const fail of [
    () => stream(Buffer.from('{"type":"delta","text":"Partial body."}\n')),
    () => complete('Observed evidence:  '),
    () => Response.json({error:'Daily analysis limit reached.'}, {status:429})
  ]) {
    const h = harness([fail, () => complete('Chat works.'), () => complete(report)]);
    const panel = await h.select();
    await pressReport(h.analysis);
    assert.equal(reportBlocks(h.analysis).length, 0);
    assert.equal(reportAction(h.analysis).textContent, 'Retry analysis');
    await submit(panel, 'What do we know?');
    assert.equal(JSON.parse(h.posts.at(-1).body).messages.length, 1);
    await h.select('S-B');
    await h.select();
    await h.advance();
    assert.equal(h.posts.length, 2);
    await pressReport(h.analysis);
    assert.equal(h.posts.length, 3);
    assert.equal(reportBlocks(h.analysis).length, 4);
  }
});

test('offline or unavailable services never generate a report, retry shares the connection with chat', async () => {
  const h = harness([() => complete(report)]);
  h.navigator.onLine = false;
  const panel = await h.select();
  await h.advance();
  assert.equal(h.calls.length, 0);
  assert.match(reportStatus(h.analysis), /offline/);
  h.navigator.onLine = true;
  await pressReport(h.analysis);
  assert.equal(panel.querySelector('form').hidden, false);
  await h.advance();
  assert.equal(h.posts.length, 0);
  assert.equal(reportAction(h.analysis).textContent, 'Generate AI analysis');
  await pressReport(h.analysis);
  assert.equal(h.posts.length, 1);
  const unavailable = harness([], worker, () => Response.json({available: false}));
  await unavailable.select();
  await unavailable.advance();
  assert.equal(unavailable.posts.length, 0);
  assert.match(reportStatus(unavailable.analysis), /unavailable/);
  const file = harness([], 'file:///tmp/demo.html');
  await file.select();
  await file.advance();
  assert.equal(file.calls.length, 0);
  assert.match(reportStatus(file.analysis), /hosted demo/);
  assert.equal(reportAction(file.analysis).disabled, true);
  await pressReport(file.analysis);
  assert.equal(file.calls.length, 0);
  const disconnected = harness([]);
  await disconnected.select();
  disconnected.navigator.onLine = false;
  await pressReport(disconnected.analysis);
  assert.equal(disconnected.posts.length, 0);
  assert.match(reportStatus(disconnected.analysis), /offline/);
});

test('follow-up can refer to this completed analysis; it drops from history after later turns, or on record/model changes', async () => {
  const h = harness([() => complete(report), ...Array.from({length: 7}, () => () => complete('Chat answer.'))]);
  const panel = await h.select();
  await pressReport(h.analysis);
  for (let i = 0; i < 5; i++) {
    await submit(panel, 'Explain point ' + i);
    const {messages} = JSON.parse(h.posts.at(-1).body);
    assert.equal(messages.filter(message => message.content === report).length, i < 3 ? 1 : 0);
    assert.equal(messages.at(-1).role, 'user');
    assert.ok(messages.length <= 9);
  }
  const different = await h.select('S-A', 'reference');
  await submit(different, 'What changed?');
  assert.equal(JSON.parse(h.posts.at(-1).body).messages.length, 1);
  const another = await h.select('S-B');
  await submit(another, 'What evidence?');
  assert.equal(JSON.parse(h.posts.at(-1).body).messages.length, 1);
});

test('a tutor can generate a report midway through a conversation and immediately ask about it', async () => {
  const h = harness([() => complete('Review the schedule.'), () => complete(report), () => complete('There is a deadline.')]);
  const panel = await h.select();
  await submit(panel, 'What can I check?');
  await pressReport(h.analysis);
  await submit(panel, 'Why did the report mention offline study?');
  const messages = JSON.parse(h.posts.at(-1).body).messages;
  assert.equal(messages[0].content, 'What can I check?');
  assert.deepEqual(messages[3], {role: 'assistant', content: report});
  assert.equal(messages.at(-1).content, 'Why did the report mention offline study?');
});
