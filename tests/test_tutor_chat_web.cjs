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
      node.hidden = selector === 'form' || selector === '[data-stop]';
      this.parts.set(selector, node);
    }
    return this.parts.get(selector);
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map(node => node.textContent ?? node).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, action) { this.listeners[type] = action; }
  focus() {}
  fire(type) { return this.listeners[type]({preventDefault() {}}); }
}

function harness(replies, url = 'http://localhost:8765') {
  const calls = [];
  const window = {location: new URL(url)};
  const context = {
    window, document: {createElement: () => new Element(), createTextNode: text => ({textContent: text})},
    AbortController, TextDecoder,
    fetch: async (path, options) => {
      calls.push({path, ...options});
      if (options.method !== 'POST') return Response.json({available: true});
      return replies.shift()(options);
    }
  };
  vm.runInNewContext(source, context);
  const slot = new Element();
  return {
    calls, api: window.LAB_TUTOR_CHAT,
    async select(record = 'S-A', model = 'context') {
      window.LAB_TUTOR_CHAT.mount(slot, record, model, model);
      await tick();
      return slot.children[0];
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
