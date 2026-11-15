'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function load() {
  const downloads = [], blobs = [];
  const window = { setTimeout(callback) { callback(); } };
  const document = { body: { appendChild() {} }, createElement() { return {
    remove() {}, click() { downloads.push({ name: this.download, href: this.href }); }
  }; } };
  const fakeURL = { createObjectURL(blob) { blobs.push(blob); return 'blob:' + blobs.length; }, revokeObjectURL() {} };
  const context = vm.createContext({ window, document, console, Date, TextEncoder, Blob, URL: fakeURL });
  for (const file of ['study-data.js', 'study.js']) vm.runInContext(fs.readFileSync(path.join(root, 'web', file), 'utf8'), context, { filename: file });
  const api = { ...window.LAB_STUDY_UI, data: window.LAB_STUDY_CASES };
  const listeners = {}, status = { textContent: '', classList: { toggle() {} } };
  const host = { innerHTML: '', querySelector(selector) {
    if (selector === '#study-root') return { addEventListener(name, callback) { listeners[name] = callback; } };
    return status;
  } };
  return { ...api, downloads, blobs, host, status,
    click(action, extra = {}) { listeners.click({ target: { closest() { return { disabled: false, dataset: { studyAction: action, ...extra } }; } } }); },
    input(dataset, value) { listeners.input({ target: { dataset, value } }); },
    change(dataset, value, checked = false, type = 'text') { return listeners.change({ target: { dataset, value, checked, type } }); },
    importText(contents) { listeners.input({ target: { id: 'study-import-text', dataset: {}, value: contents } }); }
  };
}
const plain = object => JSON.parse(JSON.stringify(object));
const config = { mode: 'facilitated', participant_code: 'P1', broad_role: 'Tutor / lecturer', adult_confirmed: true, consent_confirmed: true, withdrawal_deadline: '2026-12-01' };
const NOW = Date.parse('2026-11-15T12:00:00Z');
function response(core, session, id, now) {
  core.startTask(session, id, now);
  core.updateTask(session, id, 'initial_response', 'Observed evidence is incomplete; this is not a diagnosis.');
  core.updateTask(session, id, 'proposed_next_step', 'Check the timetable and ask about the missing context.');
  core.setCheck(session, id, 'freshness', true);
  core.saveInitial(session, id, now + 1000);
}
test('the study uses fifty unique invented cases and a genuinely equal-total pattern pair', () => {
  const { data } = load();
  assert.equal(data.cases.length, 50);
  assert.equal(new Set(data.cases.map(row => row.id)).size, 50);
  assert.ok(data.cases.every(row => /^SYN-\d{3}$/.test(row.id) && row.illustrative_index >= 0 && row.illustrative_index <= 100));
  assert.equal(data.cases[0].weeks.reduce((a, b) => a + b), 200);
  assert.equal(data.cases[1].weeks.reduce((a, b) => a + b), 200);
  assert.notDeepEqual(plain(data.cases[0].weeks), plain(data.cases[1].weeks));
  assert.match(data.provenance, /not measured model results/);
});
test('weekly charts share a scale across cases within a task', () => {
  const app = load();
  const charts = () => [...app.host.innerHTML.matchAll(/<article class="study-case">([\s\S]*?)<\/article>/g)]
    .map(card => [...card[1].matchAll(/class="study-week-bar" style="height:(\d+)px"><\/span><strong>(\d+)<\/strong>/g)]
      .map(bar => ({ height: Number(bar[1]), clicks: Number(bar[2]) })));
  app.render(app.host);
  app.click('begin');
  assert.match(app.host.innerHTML, /Weekly clicks use the same scale within this task\./);
  let [learnerA, learnerB] = charts();
  assert.equal(learnerA.length, 4);
  assert.equal(learnerB.length, 4);
  assert.equal(learnerA[0].clicks, 50);
  assert.equal(learnerB[0].clicks, 110);
  assert.ok(learnerA[0].height < learnerB[0].height, '50 clicks must be shorter than 110 clicks across cases');
  const fullHeight = learnerB[0].height;

  // Give the second case a shared count while retaining different case maxima.
  app.data.cases[1].weeks = [110, 50, 35, 5];
  app.render(app.host);
  [learnerA, learnerB] = charts();
  assert.equal(learnerA[0].clicks, learnerB[1].clicks);
  assert.equal(learnerA[0].height, learnerB[1].height, 'equal counts must have equal heights across cases');

  app.click('open-task', { studyTask: 'context' });
  const [singleCase] = charts();
  assert.equal(charts().length, 1);
  assert.equal(Math.max(...singleCase.map(bar => bar.height)), fullHeight, 'a single case keeps its own full-height maximum');
});
test('practice has no participant metadata even when configuration contains it', () => {
  const { core } = load();
  const session = core.makeSession({ ...config, mode: 'practice' }, NOW);
  assert.equal(session.mode, 'practice');
  assert.equal(session.participant_code, '');
  assert.equal(session.consent_confirmed, false);
  assert.equal(session.adult_confirmed, false);
  assert.deepEqual(plain(core.importJSON(JSON.stringify(core.snapshot(session, NOW)))), plain(core.snapshot(session, NOW)));
});
test('all fifty synthetic records have consistent recent clicks, active days and recency', () => {
  const { data } = load();
  for (const row of data.cases) {
    assert.ok(row.weeks.every(clicks => Number.isInteger(clicks) && clicks >= 0), row.id);
    assert.ok(Number.isInteger(row.days_since_activity) && row.days_since_activity >= 0 && row.days_since_activity <= 6, row.id);
    assert.ok(Number.isInteger(row.active_days_recent) && row.active_days_recent >= 1, row.id);
    assert.ok(row.active_days_recent <= 7 - row.days_since_activity, row.id + ' active days must fit before the most recent activity');
    assert.ok(row.active_days_recent <= row.weeks[3], row.id + ' every active day requires a click');
  }
});
test('facilitated setup requires each real-session agreement field and a valid anonymous code', () => {
  const { core } = load();
  for (const change of [{ adult_confirmed: false }, { consent_confirmed: false }, { participant_code: 'Alice' }, { broad_role: 'Named department' }, { withdrawal_deadline: '' }, { withdrawal_deadline: '2026-02-30' }, { withdrawal_deadline: '2026-11-14' }]) {
    assert.throws(() => core.makeSession({ ...config, ...change }, NOW));
  }
  assert.equal(core.makeSession(config, NOW).mode, 'facilitated');
});
test('context cannot be revealed before a recorded first judgment; that judgment stays intact', () => {
  const { core } = load(), s = core.makeSession({}, NOW);
  core.startTask(s, 'context', NOW);
  assert.throws(() => core.revealContext(s, NOW + 1), /initial/);
  assert.throws(() => core.updateTask(s, 'context', 'revised_response', 'Guess'), /Reveal/);
  response(core, s, 'context', NOW + 10);
  const initial = s.tasks[1].initial_response;
  core.revealContext(s, NOW + 2000);
  assert.throws(() => core.updateTask(s, 'context', 'initial_response', 'Overwrite'), /unchanged/);
  assert.throws(() => core.setCheck(s, 'context', 'extension', true), /recorded/);
  core.updateTask(s, 'context', 'revised_response', 'An authorised extension changes the deadline interpretation.');
  core.saveRevision(s, NOW + 3000);
  core.closeTask(s, 'context', 'completed', NOW + 4000);
  assert.equal(s.tasks[1].initial_response, initial);
  assert.match(s.tasks[1].revised_response, /extension/);
  assert.equal(s.tasks[1].status, 'completed');
});
test('capacity selection is manual, limited to five, and supports replacing a choice', () => {
  const { core } = load(), s = core.makeSession({}, NOW);
  response(core, s, 'capacity', NOW);
  for (let i = 1; i <= 5; i++) core.selectCase(s, 'SYN-00' + i, true);
  assert.throws(() => core.selectCase(s, 'SYN-006', true), /five/);
  assert.equal(s.tasks[2].selected_case_ids.length, 5);
  core.selectCase(s, 'SYN-001', false);
  assert.throws(() => core.closeTask(s, 'capacity', 'completed', NOW + 3000), /exactly five/);
  core.selectCase(s, 'SYN-006', true);
  assert.throws(() => core.selectCase(s, 'REAL-1', false), /Unknown/);
  core.closeTask(s, 'capacity', 'completed', NOW + 4000);
  assert.deepEqual(plain(s.tasks[2].selected_case_ids), ['SYN-002', 'SYN-003', 'SYN-004', 'SYN-005', 'SYN-006']);
});
test('import rejects incomplete or unstarted saved judgments and valid restored context remains completable', () => {
  const { core } = load(), s = core.makeSession({}, NOW);
  response(core, s, 'context', NOW);
  const saved = plain(core.snapshot(s, NOW + 1500));
  const mutations = [
    value => { value.tasks[1].status = 'pending'; value.tasks[1].started_at = null; },
    value => { value.tasks[1].proposed_next_step = '  '; },
    value => { value.tasks[1].initial_response = ''; },
    value => { value.tasks[1].proposed_next_step = ''; value.tasks[1].context_revealed = true; }
  ];
  for (const mutate of mutations) {
    const bad = plain(saved); mutate(bad);
    assert.throws(() => core.importJSON(JSON.stringify(bad)), /saved initial response/);
  }
  const restored = core.importJSON(JSON.stringify(saved));
  core.startTask(restored, 'context', NOW + 10000);
  core.revealContext(restored, NOW + 11000);
  core.updateTask(restored, 'context', 'revised_response', 'Check the authorised extension and offline work.');
  core.saveRevision(restored, NOW + 12000);
  core.closeTask(restored, 'context', 'completed', NOW + 13000);
  assert.equal(restored.tasks[1].status, 'completed');
  const inconsistent = core.makeSession({}, NOW);
  core.startTask(inconsistent, 'context', NOW);
  inconsistent.tasks[1].initial_saved_at = new Date(NOW).toISOString();
  inconsistent.tasks[1].initial_response = 'A partial response';
  assert.throws(() => core.revealContext(inconsistent, NOW + 1), /complete initial/);
  assert.equal(inconsistent.tasks[1].context_revealed, false);
});
test('editing a saved response makes a restorable draft and requires saving the new version', () => {
  const { core } = load(), s = core.makeSession({}, NOW);
  response(core, s, 'patterns', NOW);
  core.updateTask(s, 'patterns', 'proposed_next_step', '');
  assert.equal(s.tasks[0].initial_saved_at, null);
  assert.doesNotThrow(() => core.importJSON(JSON.stringify(core.snapshot(s, NOW + 1001))));
  core.updateTask(s, 'patterns', 'proposed_next_step', 'Check the timetable.');
  assert.throws(() => core.closeTask(s, 'patterns', 'completed', NOW + 1002), /Save/);
  core.saveInitial(s, 'patterns', NOW + 1003);
  core.closeTask(s, 'patterns', 'completed', NOW + 1004);
  response(core, s, 'context', NOW + 2000);
  core.revealContext(s, NOW + 4000);
  core.updateTask(s, 'context', 'revised_response', 'The extension changes the interpretation.');
  core.saveRevision(s, NOW + 5000);
  core.updateTask(s, 'context', 'revised_response', '');
  assert.equal(s.tasks[1].revision_saved_at, null);
  assert.doesNotThrow(() => core.importJSON(JSON.stringify(core.snapshot(s, NOW + 6000))));
  assert.throws(() => core.closeTask(s, 'context', 'completed', NOW + 7000), /revised/);
});
test('pausing excludes waiting time and switching tasks never runs two timers', () => {
  const { core } = load(), s = core.makeSession({}, NOW);
  core.startTask(s, 'patterns', NOW);
  core.pauseTask(s, 'patterns', NOW + 5000);
  assert.equal(core.elapsed(s.tasks[0], NOW + 90000), 5000);
  assert.throws(() => core.updateTask(s, 'patterns', 'initial_response', 'During pause'), /resume/);
  core.startTask(s, 'patterns', NOW + 100000);
  core.startTask(s, 'context', NOW + 103000);
  assert.equal(s.tasks[0].active_duration_ms, 8000);
  assert.equal(s.tasks[0].status, 'paused');
  assert.equal(s.tasks.filter(task => task.status === 'running').length, 1);
  assert.equal(core.elapsed(s.tasks[1], NOW + 104000), 1000);
});
test('help, completion, skipping and early stop remain distinct', () => {
  const { core } = load(), s = core.makeSession({}, NOW);
  core.startTask(s, 'patterns', NOW);
  core.requestHelp(s, 'patterns', NOW + 1000);
  assert.equal(s.tasks[0].assistance_count, 1);
  assert.throws(() => core.closeTask(s, 'patterns', 'completed', NOW + 2000), /Save/);
  core.closeTask(s, 'patterns', 'skipped', NOW + 3000);
  assert.throws(() => core.startTask(s, 'patterns', NOW + 4000), /closed/);
  assert.throws(() => core.endSession(s, 'completed', NOW + 5000), /each task/);
  core.endSession(s, 'stopped', NOW + 5000);
  assert.equal(s.status, 'stopped');
  assert.equal(s.tasks[0].status, 'skipped');
  assert.equal(s.tasks[1].status, 'pending');
});
test('full event history never blocks progress, task switching, pausing or export restoration', () => {
  const { core } = load(), s = core.makeSession({}, NOW);
  core.startTask(s, 'patterns', NOW);
  for (let i = 0; i < 499; i++) core.requestHelp(s, 'patterns', NOW + i + 1);
  assert.equal(s.events.length, 500);
  assert.equal(s.events_truncated, false);
  core.requestHelp(s, 'patterns', NOW + 500);
  core.requestHelp(s, 'patterns', NOW + 501);
  assert.equal(s.tasks[0].assistance_count, 501);
  assert.equal(s.events.length, 500);
  assert.equal(s.events_truncated, true);
  response(core, s, 'patterns', NOW + 1000);
  core.startTask(s, 'context', NOW + 3000);
  assert.equal(s.tasks[0].status, 'paused');
  core.pauseTask(s, 'context', NOW + 4000);
  assert.equal(s.tasks[1].active_duration_ms, 1000);
  core.startTask(s, 'patterns', NOW + 5000);
  core.closeTask(s, 'patterns', 'completed', NOW + 6000);
  core.endSession(s, 'stopped', NOW + 7000);
  const exported = core.snapshot(s, NOW + 7000);
  assert.deepEqual(plain(core.importJSON(JSON.stringify(exported))), plain(exported));
  assert.match(core.exportCSV(s, NOW + 7000), /"events_truncated"/);
});
test('leaving the module with a full event history pauses safely and explains the truncated history', () => {
  const app = load(), s = app.core.makeSession({}, NOW);
  app.core.startTask(s, 'patterns', NOW);
  for (let i = 0; i < 499; i++) app.core.requestHelp(s, 'patterns', NOW + i + 1);
  app.render(app.host);
  app.importText(JSON.stringify(app.core.snapshot(s, NOW + 500)));
  app.click('import-text');
  app.click('start');
  app.click('help');
  assert.match(app.host.innerHTML, /first 500 entries/);
  assert.doesNotThrow(() => app.suspend());
  const exported = app.getSession();
  assert.equal(exported.tasks[0].status, 'paused');
  assert.equal(exported.events_truncated, true);
  assert.equal(exported.tasks[0].assistance_count, 500);
  assert.doesNotThrow(() => app.core.importJSON(JSON.stringify(exported)));
  app.render(app.host);
  assert.match(app.host.innerHTML, /Resume task/);
});
test('a complete practice journey exports and restores every response without claiming participant evidence', () => {
  const { core } = load(), s = core.makeSession({}, NOW);
  for (const [index, id] of ['patterns', 'context', 'capacity', 'explanation'].entries()) {
    const at = NOW + index * 10000;
    response(core, s, id, at);
    if (id === 'context') {
      core.revealContext(s, at + 2000);
      core.updateTask(s, id, 'revised_response', 'Check the extension before interpreting the apparent missed deadline.');
      core.saveRevision(s, at + 3000);
    }
    if (id === 'capacity') for (let i = 1; i <= 5; i++) core.selectCase(s, 'SYN-00' + i, true);
    core.updateTask(s, id, 'observation', 'Practice reflection, not a participant observation.');
    core.closeTask(s, id, 'completed', at + 5000);
  }
  core.setFeedback(s, 'suggested_change', 'A practice-only interface suggestion.');
  core.endSession(s, 'completed', NOW + 40000);
  const saved = core.snapshot(s, NOW + 50000);
  assert.deepEqual(plain(core.importJSON(JSON.stringify(saved))), plain(saved));
  assert.equal(saved.mode, 'practice');
  assert.equal(saved.participant_code, '');
  assert.equal(saved.tasks.reduce((n, task) => n + task.active_duration_ms, 0), 20000);
});
test('export snapshots active tasks as paused without stopping the current session', () => {
  const { core } = load(), s = core.makeSession(config, NOW);
  core.startTask(s, 'patterns', NOW);
  const saved = core.snapshot(s, NOW + 12000);
  assert.equal(saved.tasks[0].status, 'paused');
  assert.equal(saved.tasks[0].active_duration_ms, 12000);
  assert.equal(saved.tasks[0].timer_started_at, null);
  assert.equal(s.tasks[0].status, 'running');
  const restored = core.importJSON(JSON.stringify(saved));
  core.startTask(restored, 'patterns', NOW + 100000);
  assert.equal(core.elapsed(restored.tasks[0], NOW + 103000), 15000);
});
test('CSV quotes multiline text and neutralises spreadsheet formulas', () => {
  const { core } = load(), s = core.makeSession({}, NOW);
  core.startTask(s, 'patterns', NOW);
  core.updateTask(s, 'patterns', 'initial_response', '=HYPERLINK("https://example.invalid","x")');
  core.updateTask(s, 'patterns', 'observation', 'Quoted "word", then\na second line');
  core.setFeedback(s, 'clarity', '\t+FORMULA()');
  const csv = core.exportCSV(s, NOW + 1);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.invalid"",""x"")"'));
  assert.ok(csv.includes('"Quoted ""word"", then\na second line"'));
  assert.ok(csv.includes('"\'\t+FORMULA()"'));
  assert.ok(csv.includes('"practice"'));
});
test('import rejects malformed, excessive, unknown and logically inconsistent records', () => {
  const { core } = load(), s = core.snapshot(core.makeSession({}, NOW), NOW);
  assert.throws(() => core.importJSON('not JSON'), /valid JSON/);
  assert.throws(() => core.importJSON(' '.repeat(256001)), /256 KB/);
  const mutations = [
    value => { value.name = 'Unexpected identifying field'; },
    value => { value.schema_version = 99; },
    value => { value.mode = 'facilitated'; },
    value => { value.tasks[0].timer_started_at = NOW; },
    value => { value.tasks[0].active_duration_ms = -1; },
    value => { value.tasks[0].assistance_count = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.tasks[0].status = 'completed'; },
    value => { value.tasks[1].context_revealed = true; },
    value => { value.tasks[0].initial_response = 'x'.repeat(2001); },
    value => { value.tasks[0].checks = ['unknown']; },
    value => { value.tasks[2].selected_case_ids = ['SYN-001', 'SYN-001']; },
    value => { value.tasks[2].selected_case_ids = ['PRIVATE-STUDENT']; },
    value => { value.tasks[1] = value.tasks[0]; },
    value => { value.feedback.extra = 'unrecognised'; },
    value => { value.events_truncated = 'true'; },
    value => { value.events_truncated = true; },
    value => { value.events = [{ task_id: 'patterns', event: 'unexpected', at: new Date(NOW).toISOString() }]; }
  ];
  for (const mutate of mutations) { const bad = plain(s); mutate(bad); assert.throws(() => core.importJSON(JSON.stringify(bad))); }
  assert.throws(() => core.importJSON(JSON.stringify(s).replace('"schema_version":1', '"__proto__":{},"schema_version":1')), /Invalid fields/);
});
test('HTML-like notes stay literal data and cannot alter the rendered interface', () => {
  const app = load(), { core } = app, s = core.makeSession({}, NOW);
  core.startTask(s, 'patterns', NOW);
  core.updateTask(s, 'patterns', 'initial_response', '<img src=x onerror="evil()">');
  const restored = core.importJSON(JSON.stringify(core.snapshot(s, NOW)));
  assert.equal(restored.tasks[0].initial_response, '<img src=x onerror="evil()">');
  app.render(app.host);
  app.importText(JSON.stringify(restored));
  app.click('import-text');
  assert.ok(app.host.innerHTML.includes('&lt;img src=x onerror=&quot;evil()&quot;&gt;'));
  assert.ok(!app.host.innerHTML.includes('<img src=x'));
});
test('real UI event wiring preserves drafts across panels and pauses on leaving the module', async () => {
  const app = load();
  app.render(app.host);
  assert.match(app.host.innerHTML, /Begin practice/);
  app.click('begin');
  app.input({ studyField: 'initial_response' }, 'Keep this unsaved draft when changing pages.');
  app.input({ studyField: 'proposed_next_step' }, 'Check local teaching dates.');
  app.click('open-task', { studyTask: 'context' });
  assert.equal(app.getSession().tasks[0].initial_response, 'Keep this unsaved draft when changing pages.');
  app.click('start');
  app.suspend();
  assert.equal(app.getSession().tasks[1].status, 'paused');
  app.render(app.host);
  assert.match(app.host.innerHTML, /Resume task/);
  app.click('open-finish');
  app.input({ studyFeedback: 'clarity' }, 'Practice reflection');
  app.click('preview-export');
  assert.match(app.host.innerHTML, /Inspect the complete exported JSON/);
  app.click('download-json');
  assert.equal(app.downloads.length, 1);
  const exported = JSON.parse(await app.blobs[0].text());
  assert.equal(exported.mode, 'practice');
  assert.equal(exported.feedback.clarity, 'Practice reflection');
  assert.ok(app.downloads[0].name.endsWith('-practice.json'));
  app.click('reset');
  assert.match(app.host.innerHTML, /Discard and start again/);
  assert.ok(app.getSession());
  app.click('reset-cancel');
  assert.ok(app.getSession());
  app.click('reset'); app.click('reset-confirm');
  assert.equal(app.getSession(), null);
});
