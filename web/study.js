/* Local-only formative study tools. Nothing is uploaded or stored automatically. */
(function () {
  'use strict';
  const DATA = window.LAB_STUDY_CASES;
  const TASK_IDS = ['patterns', 'context', 'capacity', 'explanation'];
  const ROLES = ['Tutor / lecturer', 'Student support', 'Learning analytics', 'Other relevant experience'];
  const CHECKS = {
    freshness: 'Record freshness / missing feed', extension: 'Deadline or authorised extension',
    offline: 'Learning away from the platform', timetable: 'Teaching timetable / planned break',
    access: 'Access or technical difficulty', perspective: 'The learner’s own account'
  };
  const TASK_FIELDS = ['initial_response', 'proposed_next_step', 'revised_response', 'observation', 'participant_explanation'];
  const FEEDBACK_FIELDS = ['clarity', 'missing_context', 'workflow_fit', 'suggested_change'];
  const STATUSES = ['pending', 'running', 'paused', 'completed', 'skipped'];
  const EVENTS = ['started', 'paused', 'initial_saved', 'context_revealed', 'revision_saved', 'completed', 'skipped', 'help_requested'];
  const MAX_BYTES = 256000;
  const iso = now => new Date(now).toISOString();
  const copy = value => JSON.parse(JSON.stringify(value));
  const text = (value, limit = 2000) => typeof value === 'string' && value.length <= limit;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const fail = message => { throw new Error(message); };
  function exactKeys(value, keys, label) {
    if (!object(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k))) fail('Invalid fields in ' + label + '.');
  }
  function makeSession(config = {}, now = Date.now()) {
    const mode = config.mode || 'practice';
    if (!['practice', 'facilitated'].includes(mode)) fail('Choose practice or a facilitated session.');
    if (mode === 'facilitated') {
      if (!/^P[1-9]\d{0,2}$/.test(config.participant_code || '')) fail('Use an anonymous code such as P1; do not enter a name.');
      if (!ROLES.includes(config.broad_role)) fail('Choose a broad role category.');
      if (config.adult_confirmed !== true || config.consent_confirmed !== true) fail('Confirm adult participation and informed agreement before starting.');
      if (!day(config.withdrawal_deadline) || config.withdrawal_deadline < iso(now).slice(0, 10)) fail('Agree a withdrawal deadline today or later before starting.');
    }
    return {
      schema_version: 1, app_version: '0.4.0', task_set_version: DATA.task_set_version,
      session_id: 'STUDY-' + now + '-' + Math.random().toString(36).slice(2, 8), mode,
      participant_code: mode === 'facilitated' ? config.participant_code : '',
      broad_role: mode === 'facilitated' ? config.broad_role : '',
      adult_confirmed: mode === 'facilitated', consent_confirmed: mode === 'facilitated',
      withdrawal_deadline: mode === 'facilitated' ? config.withdrawal_deadline : '',
      started_at: iso(now), ended_at: null, status: 'active',
      tasks: TASK_IDS.map(id => ({ id, status: 'pending', started_at: null, ended_at: null,
        active_duration_ms: 0, timer_started_at: null, assistance_count: 0,
        initial_response: '', proposed_next_step: '', checks: [], initial_saved_at: null,
        context_revealed: false, revised_response: '', revision_saved_at: null,
        selected_case_ids: [], observation: '', participant_explanation: '' })),
      feedback: Object.fromEntries(FEEDBACK_FIELDS.map(field => [field, ''])), events: [], events_truncated: false
    };
  }
  const taskFor = (session, id) => session.tasks.find(task => task.id === id) || fail('Unknown task.');
  function editable(session) {
    if (!['active', 'paused'].includes(session.status)) fail('This session has ended. Export it or start a new session.');
  }
  function running(session, id) {
    editable(session);
    const task = taskFor(session, id);
    if (task.status !== 'running') fail('Start or resume this task before changing responses.');
    return task;
  }
  function event(session, id, kind, now) {
    // Keep only meaningful task transitions; never record keystrokes or identities.
    // The bounded history must never block a response, pause or route change.
    // Current task fields remain authoritative after the history stops growing.
    if (session.events.length >= 500) { session.events_truncated = true; return; }
    session.events.push({ task_id: id, event: kind, at: iso(now) });
  }
  function elapsed(task, now) {
    return task.active_duration_ms + (task.timer_started_at === null ? 0 : Math.max(0, now - task.timer_started_at));
  }
  function pauseTask(session, id, now = Date.now()) {
    const task = taskFor(session, id);
    if (task.status !== 'running') return;
    task.active_duration_ms = elapsed(task, now);
    task.timer_started_at = null;
    task.status = 'paused';
    event(session, id, 'paused', now);
  }
  function startTask(session, id, now = Date.now()) {
    editable(session);
    const task = taskFor(session, id);
    if (['completed', 'skipped'].includes(task.status)) fail('This task is already closed.');
    if (task.status === 'running') return;
    session.tasks.forEach(other => { if (other.id !== id) pauseTask(session, other.id, now); });
    task.started_at = task.started_at || iso(now);
    task.timer_started_at = now;
    task.status = 'running';
    session.status = 'active';
    event(session, id, 'started', now);
  }
  function updateTask(session, id, field, value) {
    const task = running(session, id);
    if (!TASK_FIELDS.includes(field) || !text(value)) fail('Response is not supported or exceeds 2,000 characters.');
    if (id === 'context' && task.initial_saved_at && ['initial_response', 'proposed_next_step'].includes(field)) fail('The saved initial judgment is kept unchanged. Add a revised response below.');
    if (field === 'revised_response' && !task.context_revealed) fail('Reveal the hypothetical context before revising.');
    task[field] = value;
    if (['initial_response', 'proposed_next_step'].includes(field)) task.initial_saved_at = null;
    if (field === 'revised_response') task.revision_saved_at = null;
  }
  function setCheck(session, id, key, selected) {
    const task = running(session, id);
    if (!Object.hasOwn(CHECKS, key)) fail('Unknown context check.');
    if (id === 'context' && task.initial_saved_at) fail('The initial context checks have already been recorded.');
    task.checks = selected ? [...new Set([...task.checks, key])] : task.checks.filter(item => item !== key);
  }
  function saveInitial(session, id, now = Date.now()) {
    const task = running(session, id);
    if (!task.initial_response.trim() || !task.proposed_next_step.trim()) fail('Record your interpretation and a proposed next check first.');
    if (id === 'context' && task.initial_saved_at) fail('The initial response is already saved.');
    task.initial_saved_at = iso(now);
    event(session, id, 'initial_saved', now);
  }
  function revealContext(session, now = Date.now()) {
    const task = running(session, 'context');
    if (!hasSavedInitial(task)) fail('Save a complete initial response and proposed next check before revealing context.');
    if (task.context_revealed) return;
    task.context_revealed = true;
    event(session, 'context', 'context_revealed', now);
  }
  function saveRevision(session, now = Date.now()) {
    const task = running(session, 'context');
    if (!task.context_revealed || !task.revised_response.trim()) fail('Reveal the context and record a revised interpretation first.');
    task.revision_saved_at = iso(now);
    event(session, 'context', 'revision_saved', now);
  }
  function selectCase(session, id, selected) {
    const task = running(session, 'capacity');
    if (!DATA.cases.some(item => item.id === id)) fail('Unknown synthetic case.');
    if (selected && !task.selected_case_ids.includes(id) && task.selected_case_ids.length >= 5) fail('Capacity is five records. Deselect one before adding another.');
    task.selected_case_ids = selected ? [...new Set([...task.selected_case_ids, id])].sort() : task.selected_case_ids.filter(item => item !== id);
  }
  function hasSavedInitial(task) {
    return task.initial_saved_at !== null && task.started_at !== null && task.status !== 'pending' &&
      task.initial_response.trim() !== '' && task.proposed_next_step.trim() !== '';
  }
  function completionProblem(task) {
    if (!task.initial_saved_at || !task.initial_response.trim() || !task.proposed_next_step.trim()) return 'Save an interpretation and proposed next check before completing.';
    if (task.id === 'context' && (!task.context_revealed || !task.revision_saved_at || !task.revised_response.trim())) return 'Reveal the context and save your revised response first.';
    if (task.id === 'capacity' && task.selected_case_ids.length !== 5) return 'Select exactly five records, or skip this task.';
    return '';
  }
  function closeTask(session, id, status, now = Date.now()) {
    const task = running(session, id);
    if (!['completed', 'skipped'].includes(status)) fail('Unknown task status.');
    if (status === 'completed' && completionProblem(task)) fail(completionProblem(task));
    task.active_duration_ms = elapsed(task, now);
    task.timer_started_at = null;
    task.status = status;
    task.ended_at = iso(now);
    event(session, id, status, now);
  }
  function requestHelp(session, id, now = Date.now()) {
    const task = running(session, id);
    if (task.assistance_count >= Number.MAX_SAFE_INTEGER) fail('The help counter cannot increase further. Export this session.');
    task.assistance_count++;
    event(session, id, 'help_requested', now);
  }
  function setFeedback(session, field, value) {
    editable(session);
    if (!FEEDBACK_FIELDS.includes(field) || !text(value)) fail('Feedback is not supported or exceeds 2,000 characters.');
    session.feedback[field] = value;
  }
  function endSession(session, status = 'completed', now = Date.now()) {
    editable(session);
    if (!['completed', 'stopped'].includes(status)) fail('Unknown ending status.');
    if (status === 'completed' && session.tasks.some(task => !['completed', 'skipped'].includes(task.status))) fail('Complete or skip each task first, or choose Stop early.');
    session.tasks.forEach(task => pauseTask(session, task.id, now));
    session.status = status;
    session.ended_at = iso(now);
  }
  function snapshot(session, now = Date.now()) {
    const result = copy(session);
    result.tasks.forEach(task => {
      task.active_duration_ms = elapsed(task, now);
      task.timer_started_at = null;
      if (task.status === 'running') task.status = 'paused';
    });
    if (result.status === 'active') result.status = 'paused';
    return result;
  }
  function validateSession(value) {
    const rootKeys = ['schema_version', 'app_version', 'task_set_version', 'session_id', 'mode', 'participant_code', 'broad_role', 'adult_confirmed', 'consent_confirmed', 'withdrawal_deadline', 'started_at', 'ended_at', 'status', 'tasks', 'feedback', 'events', 'events_truncated'];
    exactKeys(value, rootKeys, 'session');
    if (value.schema_version !== 1 || value.app_version !== '0.4.0' || value.task_set_version !== DATA.task_set_version) fail('Unsupported study file version.');
    if (!text(value.session_id, 80) || !/^STUDY-[a-z0-9-]+$/i.test(value.session_id)) fail('Invalid session identifier.');
    if (!['practice', 'facilitated'].includes(value.mode) || !['paused', 'completed', 'stopped'].includes(value.status)) fail('Invalid saved session mode or status.');
    if (!date(value.started_at) || (value.ended_at !== null && !date(value.ended_at))) fail('Invalid session dates.');
    if ((['completed', 'stopped'].includes(value.status)) !== (value.ended_at !== null)) fail('Session ending status and date disagree.');
    if (value.mode === 'facilitated') {
      if (!/^P[1-9]\d{0,2}$/.test(value.participant_code) || !ROLES.includes(value.broad_role) || value.adult_confirmed !== true || value.consent_confirmed !== true || !day(value.withdrawal_deadline)) fail('The facilitated record is missing its anonymous code or agreement fields.');
    } else if (value.participant_code !== '' || value.broad_role !== '' || value.adult_confirmed !== false || value.consent_confirmed !== false || value.withdrawal_deadline !== '') fail('Practice records cannot contain participant agreement metadata.');
    if (!Array.isArray(value.tasks) || value.tasks.length !== 4 || new Set(value.tasks.map(task => task?.id)).size !== 4) fail('The file must contain the four known tasks once each.');
    const taskKeys = ['id', 'status', 'started_at', 'ended_at', 'active_duration_ms', 'timer_started_at', 'assistance_count', ...TASK_FIELDS, 'checks', 'initial_saved_at', 'context_revealed', 'revision_saved_at', 'selected_case_ids'];
    value.tasks.forEach(task => {
      exactKeys(task, taskKeys, 'task');
      if (!TASK_IDS.includes(task.id) || !STATUSES.includes(task.status) || task.status === 'running' || task.timer_started_at !== null) fail('Saved tasks must be stopped or paused.');
      if (!Number.isInteger(task.active_duration_ms) || task.active_duration_ms < 0 || task.active_duration_ms > 86400000 || !Number.isSafeInteger(task.assistance_count) || task.assistance_count < 0) fail('Invalid task timing or help count.');
      if (TASK_FIELDS.some(field => !text(task[field]))) fail('Task text exceeds the allowed size.');
      for (const key of ['started_at', 'ended_at', 'initial_saved_at', 'revision_saved_at']) if (task[key] !== null && !date(task[key])) fail('Invalid task date.');
      if ((task.status === 'pending') !== (task.started_at === null)) fail('Task start metadata is inconsistent.');
      if ((['completed', 'skipped'].includes(task.status)) !== (task.ended_at !== null)) fail('Task ending metadata is inconsistent.');
      if (task.initial_saved_at !== null && !hasSavedInitial(task)) fail('A saved initial response requires a started task, an interpretation and a proposed next check.');
      if (!Array.isArray(task.checks) || new Set(task.checks).size !== task.checks.length || task.checks.some(key => !Object.hasOwn(CHECKS, key))) fail('Invalid context checks.');
      if (typeof task.context_revealed !== 'boolean' || (task.context_revealed && (task.id !== 'context' || !hasSavedInitial(task)))) fail('Context must follow a complete saved initial interpretation.');
      if ((task.revised_response || task.revision_saved_at) && !task.context_revealed) fail('Revision cannot precede context disclosure.');
      if (task.revision_saved_at !== null && !task.revised_response.trim()) fail('A saved revision requires a revised interpretation.');
      if (!Array.isArray(task.selected_case_ids) || task.selected_case_ids.length > 5 || new Set(task.selected_case_ids).size !== task.selected_case_ids.length || task.selected_case_ids.some(id => !DATA.cases.some(item => item.id === id)) || (task.id !== 'capacity' && task.selected_case_ids.length)) fail('Invalid capacity selection.');
      if (task.status === 'completed' && completionProblem(task)) fail('A completed task lacks its required response.');
    });
    if (value.status === 'completed' && value.tasks.some(task => !['completed', 'skipped'].includes(task.status))) fail('Completed session has unfinished tasks.');
    exactKeys(value.feedback, FEEDBACK_FIELDS, 'feedback');
    if (FEEDBACK_FIELDS.some(field => !text(value.feedback[field]))) fail('Feedback exceeds the allowed size.');
    if (!Array.isArray(value.events) || value.events.length > 500) fail('Too many task events.');
    if (typeof value.events_truncated !== 'boolean' || (value.events_truncated && value.events.length !== 500)) fail('Invalid event history truncation marker.');
    value.events.forEach(item => {
      exactKeys(item, ['task_id', 'event', 'at'], 'event');
      if (!TASK_IDS.includes(item.task_id) || !EVENTS.includes(item.event) || !date(item.at)) fail('Invalid task event.');
    });
    return copy(value);
  }
  function importJSON(contents) {
    if (typeof contents !== 'string' || new TextEncoder().encode(contents).length > MAX_BYTES) fail('Choose a study JSON file smaller than 256 KB.');
    let value;
    try { value = JSON.parse(contents); } catch (_) { fail('This is not a valid JSON file.'); }
    return validateSession(value);
  }
  function csvCell(value) {
    let content = String(value ?? '');
    if (/^\s*[=+\-@]/.test(content)) content = "'" + content;
    return '"' + content.replace(/"/g, '""') + '"';
  }
  function exportCSV(session, now = Date.now()) {
    const s = snapshot(session, now);
    const header = ['session_id', 'mode', 'participant_code', 'broad_role', 'session_status', 'task', 'task_status', 'active_seconds', 'help_requests', 'initial_response', 'initial_next_check', 'checks', 'context_revealed', 'revised_response', 'selected_cases', 'observation', 'participant_explanation', ...FEEDBACK_FIELDS, 'events_truncated'];
    const rows = s.tasks.map(task => [s.session_id, s.mode, s.participant_code, s.broad_role, s.status, task.id, task.status,
      Math.round(task.active_duration_ms / 1000), task.assistance_count, task.initial_response, task.proposed_next_step,
      task.checks.join('; '), task.context_revealed, task.revised_response, task.selected_case_ids.join('; '),
      task.observation, task.participant_explanation, ...FEEDBACK_FIELDS.map(key => s.feedback[key]), s.events_truncated]);
    return '\ufeff' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  }

  const core = { makeSession, startTask, pauseTask, updateTask, setCheck, saveInitial, revealContext,
    saveRevision, selectCase, closeTask, requestHelp, setFeedback, endSession, snapshot, importJSON,
    validateSession, exportCSV, elapsed };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const label = value => value.charAt(0).toUpperCase() + value.slice(1);
  const button = (action, title, disabled = false, extra = '') => '<button type="button" data-study-action="' + action + '" ' + extra + (disabled ? ' disabled' : '') + '>' + title + '</button>';
  let session = null, host = null, panel = 'patterns', error = '', notice = '', showExport = false, resetPending = false, ticker = null;
  let setup = { mode: 'practice', participant_code: '', broad_role: ROLES[0], adult_confirmed: false, consent_confirmed: false, withdrawal_deadline: '' };
  let importDraft = '', hintTask = null;
  const taskSpec = id => DATA.tasks.find(item => item.id === id);
  function textarea(field, title, value, disabled, feedback = false) {
    const attribute = feedback ? 'data-study-feedback' : 'data-study-field';
    return '<label class="study-field">' + title + '<textarea rows="3" maxlength="2000" ' + attribute + '="' + field + '"' + (disabled ? ' disabled' : '') + '>' + esc(value) + '</textarea></label>';
  }
  function importPanel() {
    return '<details class="study-import"><summary>Restore an exported session</summary><p>Choose your own study JSON file. It is read only in this page, and resumes paused. Do not import student records or personal details.</p><label class="study-field">Study JSON file<input type="file" id="study-import-file" accept=".json,application/json"></label><details><summary>Or paste exported JSON</summary><textarea id="study-import-text" aria-label="Exported study JSON" rows="5" maxlength="256000">' + esc(importDraft) + '</textarea>' + button('import-text', 'Restore pasted JSON') + '</details></details>';
  }
  function setupPanel() {
    const actual = setup.mode === 'facilitated';
    return '<div class="study-intro-grid"><section class="study-card"><h3>Start with a practice run</h3><p>Work through four short tasks using 50 invented records. Practise interpreting evidence, checking missing context and choosing a manageable review list.</p><ul><li>All cases and example scores are synthetic.</li><li>No student decision or message is made.</li><li>Notes stay in this tab until you download them.</li></ul><p><strong>Study status:</strong> materials prepared; volunteers and real sessions are still to be arranged.</p></section><section class="study-card"><h3>Session setup</h3><label class="study-field">Mode<select data-study-setup="mode"><option value="practice"' + (!actual ? ' selected' : '') + '>Practice — not research evidence</option><option value="facilitated"' + (actual ? ' selected' : '') + '>Facilitated session — actual consenting volunteer</option></select></label>' +
      (actual ? '<p class="study-note">The facilitator must discuss the participant information sheet before starting. Enter a code only; keep recruitment details outside this tool.</p><label class="study-field">Anonymous participant code<input data-study-setup="participant_code" maxlength="4" placeholder="P1" value="' + esc(setup.participant_code) + '"></label><label class="study-field">Broad role<select data-study-setup="broad_role">' + ROLES.map(role => '<option' + (setup.broad_role === role ? ' selected' : '') + '>' + esc(role) + '</option>').join('') + '</select></label><label class="study-field">Agreed withdrawal deadline<input type="date" data-study-setup="withdrawal_deadline" value="' + esc(setup.withdrawal_deadline) + '"></label><label class="study-checkbox"><input type="checkbox" data-study-setup="adult_confirmed"' + (setup.adult_confirmed ? ' checked' : '') + '>The participant is an adult with relevant experience.</label><label class="study-checkbox"><input type="checkbox" data-study-setup="consent_confirmed"' + (setup.consent_confirmed ? ' checked' : '') + '>After reading the information sheet, the participant voluntarily agreed to take part and to de-identified notes.</label>' : '<p class="study-note">Practice exports are marked <strong>practice</strong> and excluded from the research summary. No participant details or agreement are recorded.</p>') +
      button('begin', actual ? 'Begin facilitated session' : 'Begin practice', false, 'class="study-primary"') + '</section></div>' + importPanel();
  }
  function caseCard(item, showContext = false, max = Math.max(...item.weeks, 1)) {
    return '<article class="study-case"><div class="study-case-title"><span class="small-label">' + esc(item.id) + ' · SYNTHETIC</span><h4>' + esc(item.student_name) + '</h4>' + (item.scenario_label ? '<span>' + esc(item.scenario_label) + '</span>' : '') + '</div><div class="study-week-bars" role="img" aria-label="Invented weekly clicks: ' + item.weeks.join(', ') + '">' + item.weeks.map((count, i) => '<div><span class="study-week-bar" style="height:' + Math.round(count / max * 72 + 3) + 'px"></span><strong>' + count + '</strong><small>Week ' + (i + 1) + '</small></div>').join('') + '</div><dl class="study-facts"><div><dt>Total recorded clicks</dt><dd>' + item.weeks.reduce((a, b) => a + b, 0) + '</dd></div><div><dt>Days since activity</dt><dd>' + item.days_since_activity + '</dd></div><div><dt>Due / submitted in record</dt><dd>' + item.assessments_due + ' / ' + item.submissions_recorded + '</dd></div></dl>' + (item.illustrative_probability ? '<p class="study-probability">Invented probability display: <strong>' + Math.round(item.illustrative_probability * 100) + '%</strong><br><span>Demonstration only. No model produced this number.</span></p><p>' + esc(item.hypothetical_outcome) + '</p>' : '') + (showContext ? '<div class="study-context"><strong>New hypothetical context</strong><p>' + esc(item.context) + '</p></div>' : '') + '</article>';
  }
  function capacityTable(task, disabled) {
    const sorted = DATA.cases.slice().sort((a, b) => b.illustrative_index - a.illustrative_index || a.id.localeCompare(b.id));
    return '<div class="study-capacity-summary"><strong id="study-selected-count">' + task.selected_case_ids.length + ' / 5 selected</strong><p>Fifty invented records, ordered by an illustrative review index. The index is not a probability. Selection stays manual.</p></div><div class="study-table-scroll"><table class="study-capacity-table"><caption>Choose up to five records; use the response below to explain your selection.</caption><thead><tr><th>Choose</th><th>Case</th><th>Example index /100</th><th>Weekly clicks</th><th>Days since activity</th><th>Due / recorded</th></tr></thead><tbody>' + sorted.map(item => '<tr><td><input type="checkbox" data-study-select="' + item.id + '" aria-label="Select ' + esc(item.student_name) + ', ' + item.id + '"' + (task.selected_case_ids.includes(item.id) ? ' checked' : '') + (disabled ? ' disabled' : '') + '></td><th scope="row">' + esc(item.student_name) + '<span class="cell-sub">' + esc(item.id) + '</span></th><td>' + item.illustrative_index + '</td><td>' + item.weeks.join(' · ') + '</td><td>' + item.days_since_activity + '</td><td>' + item.assessments_due + ' / ' + item.submissions_recorded + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function taskPanel(id) {
    const task = taskFor(session, id), spec = taskSpec(id);
    const taskCases = spec.case_ids.map(caseId => DATA.cases.find(item => item.id === caseId));
    const weeklyMax = Math.max(1, ...taskCases.flatMap(item => item.weeks));
    const closed = ['completed', 'skipped'].includes(task.status), ended = ['completed', 'stopped'].includes(session.status);
    const disabled = task.status !== 'running' || ended;
    const initialLocked = disabled || (id === 'context' && !!task.initial_saved_at);
    const seconds = Math.round(elapsed(task, Date.now()) / 1000);
    return '<section class="study-card study-task"><div class="study-task-heading"><div><span class="small-label">TASK ' + (TASK_IDS.indexOf(id) + 1) + ' OF 4</span><h3>' + esc(spec.title) + '</h3><p>' + esc(spec.prompt) + '</p></div><span class="tag">' + label(task.status) + '</span></div><div class="study-task-controls">' + (task.status === 'running' ? button('pause', 'Pause task') : button('start', task.status === 'pending' ? 'Start task' : 'Resume task', closed || ended)) + button('help', 'Request a neutral prompt', disabled) + '<span>' + seconds + 's active · ' + task.assistance_count + ' help requests</span></div>' +
      (hintTask === id ? '<p class="study-context">' + esc(spec.hint) + '</p>' : '') +
      (id === 'capacity' ? capacityTable(task, disabled) : '<p class="study-note">Weekly clicks use the same scale within this task.</p><div class="study-case-grid">' + taskCases.map(item => caseCard(item, id === 'explanation' || (id === 'context' && task.context_revealed), weeklyMax)).join('') + '</div>') +
      '<div class="study-response-grid"><div>' + textarea('initial_response', id === 'capacity' ? 'Why these five? What remains uncertain?' : 'Initial interpretation — observations and uncertainty', task.initial_response, initialLocked) + textarea('proposed_next_step', 'Proposed next check — no message will be sent', task.proposed_next_step, initialLocked) + '<fieldset class="study-checks"><legend>Context you would check</legend>' + Object.entries(CHECKS).map(([key, title]) => '<label><input type="checkbox" data-study-check="' + key + '"' + (task.checks.includes(key) ? ' checked' : '') + (initialLocked ? ' disabled' : '') + '>' + title + '</label>').join('') + '</fieldset>' + button('save-initial', task.initial_saved_at ? 'Initial response saved' : 'Save initial response', initialLocked, 'class="study-primary"') +
      (id === 'context' ? '<div class="study-revision">' + button('reveal', task.context_revealed ? 'Context revealed above' : 'Reveal hypothetical context', disabled || !task.initial_saved_at || task.context_revealed) + (task.context_revealed ? textarea('revised_response', 'Revised interpretation and next check', task.revised_response, disabled) + button('save-revision', task.revision_saved_at ? 'Save revised response again' : 'Save revised response', disabled) : '<p class="study-note">Save your first interpretation before viewing the additional context.</p>') + '</div>' : '') + '</div><details class="study-observation"' + (session.mode === 'facilitated' ? ' open' : '') + '><summary>Facilitator notes / practice reflection</summary><p>Keep observation separate from interpretation. Do not enter names, real student details or institutional records.</p>' + textarea('observation', 'What happened — observable actions or difficulty', task.observation, disabled) + textarea('participant_explanation', 'Participant’s explanation — short, de-identified account', task.participant_explanation, disabled) + '</details></div><div class="study-task-footer">' + button('complete-task', 'Complete task', disabled, 'class="study-primary"') + button('skip-task', 'Skip this task', disabled) + '<p>Tasks may be skipped. Active time includes time spent entering notes; it is an approximate task measure.</p></div></section>';
  }
  function finishPanel() {
    const ended = ['completed', 'stopped'].includes(session.status);
    return '<section class="study-card"><h3>Debrief and save your record</h3><p>Invite contrary views as well as suggestions. These responses describe this session, not the effectiveness of student support.</p><div class="study-feedback-grid">' + textarea('clarity', 'What was clear or misleading?', session.feedback.clarity, ended, true) + textarea('missing_context', 'Which missing information mattered?', session.feedback.missing_context, ended, true) + textarea('workflow_fit', 'Where might this fit, and what would prevent use?', session.feedback.workflow_fit, ended, true) + textarea('suggested_change', 'One useful change, and any disagreement or contrary example', session.feedback.suggested_change, ended, true) + '</div><div class="study-task-controls">' + button('finish', 'Finish session', ended, 'class="study-primary"') + button('stop', 'Stop early', ended) + '</div><p class="study-note">Finished sessions remain in this tab until exported. JSON preserves the complete record and supports restore; CSV is a task-level analysis table. Neither format is sent anywhere by this page.</p>' + button('preview-export', showExport ? 'Hide export preview' : 'Preview and download record', false, 'class="study-primary"') +
      (showExport ? '<div class="study-export"><p><strong>Check for identifying information before saving.</strong> Remove any accidental personal details before sharing or synthesis. Store session records outside the public repository.</p><dl class="study-facts"><div><dt>Mode</dt><dd>' + esc(session.mode) + '</dd></div><div><dt>Participant code</dt><dd>' + esc(session.participant_code || 'None — practice') + '</dd></div><div><dt>Status</dt><dd>' + esc(session.status) + '</dd></div></dl><details><summary>Inspect the complete exported JSON</summary><pre>' + esc(JSON.stringify(snapshot(session), null, 2)) + '</pre></details><div class="study-task-controls">' + button('download-json', 'Download JSON') + button('download-csv', 'Download CSV') + '</div></div>' : '') + '</section>';
  }
  function render(main) {
    if (ticker !== null) { window.clearInterval(ticker); ticker = null; }
    host = main;
    if (!DATA?.cases || !DATA?.tasks) { main.innerHTML = '<div class="panel"><p>Synthetic task materials are unavailable.</p></div>'; return; }
    main.innerHTML = '<section id="study-root" class="study-root"><div class="section-heading"><div><h2>Tutor practice & study</h2><p>A safe place to practise evidence review and prepare a small formative study.</p></div><span class="tag teal">SYNTHETIC CASES ONLY</span></div><p class="study-boundary">The practice group uses the example OU course <i>' + esc(DATA.course_title) + '</i>. All learner names, records, scores and outcomes in these exercises are fictional. Real user research has not yet been conducted.</p><div id="study-alert" class="study-alert' + (error ? ' is-error' : '') + '" role="status" aria-live="polite">' + esc(error || notice) + '</div>' +
      (!session ? setupPanel() : '<div class="study-session-bar"><span><strong>' + (session.mode === 'practice' ? 'Practice — not research evidence' : 'Facilitated session · ' + esc(session.participant_code)) + '</strong><small>' + label(session.status) + ' · ' + session.tasks.filter(task => ['completed', 'skipped'].includes(task.status)).length + ' of 4 tasks closed</small></span><div>' + button('open-finish', 'Debrief / export') + button('reset', 'New session') + '</div></div><p class="study-memory-note">Your record is held in this tab only. Export before reloading or closing it. Switching to another lab page pauses an active task and keeps your notes.</p>' + (session.events_truncated ? '<p class="study-memory-note" role="status">The event history is limited to its first 500 entries. Current responses, task status, timing and help totals continue to be saved; the sequence of later events is not recorded.</p>' : '') + (resetPending ? '<div class="study-reset" role="alert"><p>Starting again will discard this tab’s current record. Export it first if needed.</p>' + button('reset-confirm', 'Discard and start again') + button('reset-cancel', 'Keep this session') + '</div>' : '') + '<nav class="study-task-nav" aria-label="Study tasks">' + DATA.tasks.map((task, i) => button('open-task', (i + 1) + '. ' + esc(task.title), false, 'data-study-task="' + task.id + '"' + (panel === task.id ? ' aria-current="step"' : ''))).join('') + button('open-finish', '5. Debrief & export', false, panel === 'finish' ? 'aria-current="step"' : '') + '</nav>' + (panel === 'finish' ? finishPanel() : taskPanel(panel))) + '</section>';
    const root = main.querySelector('#study-root');
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    if (session && panel !== 'finish' && typeof window.setInterval === 'function') {
      ticker = window.setInterval(() => {
        const clock = host?.querySelector('.study-task-controls>span');
        const task = taskFor(session, panel);
        if (clock) clock.textContent = Math.round(elapsed(task, Date.now()) / 1000) + 's active · ' + task.assistance_count + ' help requests';
      }, 1000);
    }
  }
  function notify(message, isError = false) {
    error = isError ? message : ''; notice = isError ? '' : message;
    const area = host?.querySelector('#study-alert');
    if (area) { area.textContent = message; area.classList.toggle('is-error', isError); }
  }
  function rerender() { if (host) render(host); }
  function download(contents, extension, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = session.session_id + '-' + session.mode + '.' + extension;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Saved a ' + session.mode + ' ' + extension.toUpperCase() + ' download. No record was uploaded.');
  }
  function restore(contents) {
    if (session) fail('Start a new session first if you want to replace the current record.');
    session = importJSON(contents);
    panel = session.tasks.find(task => !['completed', 'skipped'].includes(task.status))?.id || 'finish';
    importDraft = ''; notice = 'Record restored. Paused tasks resume only when you choose Resume task.'; error = '';
    rerender();
  }
  function onInput(event) {
    const target = event.target;
    try {
      if (target.dataset.studySetup) setup[target.dataset.studySetup] = target.type === 'checkbox' ? target.checked : target.value;
      else if (target.dataset.studyField) updateTask(session, panel, target.dataset.studyField, target.value);
      else if (target.dataset.studyFeedback) setFeedback(session, target.dataset.studyFeedback, target.value);
      else if (target.id === 'study-import-text') importDraft = target.value;
    } catch (err) { notify(err.message, true); }
  }
  async function onChange(event) {
    const target = event.target;
    try {
      if (target.dataset.studySetup) { setup[target.dataset.studySetup] = target.type === 'checkbox' ? target.checked : target.value; if (target.dataset.studySetup === 'mode') rerender(); }
      else if (target.dataset.studyCheck) setCheck(session, panel, target.dataset.studyCheck, target.checked);
      else if (target.dataset.studySelect) {
        try { selectCase(session, target.dataset.studySelect, target.checked); } catch (err) { target.checked = false; throw err; }
        const count = host.querySelector('#study-selected-count'); if (count) count.textContent = taskFor(session, 'capacity').selected_case_ids.length + ' / 5 selected';
        notify('Selection recorded. Explain the choices before completing the task.');
      } else if (target.id === 'study-import-file' && target.files?.[0]) {
        const file = target.files[0];
        if (file.size > MAX_BYTES) fail('Choose a study JSON file smaller than 256 KB.');
        restore(await file.text());
      }
    } catch (err) { notify(err.message, true); }
  }
  function onClick(event) {
    const control = event.target.closest('[data-study-action]');
    if (!control || control.disabled) return;
    const action = control.dataset.studyAction;
    try {
      error = ''; notice = '';
      if (action === 'begin') { session = makeSession(setup); panel = 'patterns'; startTask(session, panel); }
      else if (action === 'import-text') { restore(importDraft); return; }
      else if (action === 'open-task' || action === 'open-finish') { if (session) session.tasks.forEach(task => pauseTask(session, task.id)); panel = action === 'open-finish' ? 'finish' : control.dataset.studyTask; }
      else if (action === 'start') startTask(session, panel);
      else if (action === 'pause') pauseTask(session, panel);
      else if (action === 'help') { requestHelp(session, panel); hintTask = panel; }
      else if (action === 'save-initial') { saveInitial(session, panel); notice = 'Initial interpretation and next check saved.'; }
      else if (action === 'reveal') revealContext(session);
      else if (action === 'save-revision') { saveRevision(session); notice = 'Revised interpretation saved alongside the initial response.'; }
      else if (action === 'complete-task' || action === 'skip-task') { closeTask(session, panel, action === 'complete-task' ? 'completed' : 'skipped'); notice = action === 'complete-task' ? 'Task completed. Choose the next task when ready.' : 'Task skipped. This is recorded separately from completion.'; }
      else if (action === 'finish' || action === 'stop') { endSession(session, action === 'finish' ? 'completed' : 'stopped'); showExport = true; notice = 'Session ended. Preview and download the record before closing this tab.'; }
      else if (action === 'preview-export') showExport = !showExport;
      else if (action === 'download-json') { download(JSON.stringify(snapshot(session), null, 2), 'json', 'application/json'); return; }
      else if (action === 'download-csv') { download(exportCSV(session), 'csv', 'text/csv;charset=utf-8'); return; }
      else if (action === 'reset') resetPending = true;
      else if (action === 'reset-cancel') resetPending = false;
      else if (action === 'reset-confirm') { session = null; resetPending = false; panel = 'patterns'; showExport = false; hintTask = null; setup = { ...setup, participant_code: '', adult_confirmed: false, consent_confirmed: false }; }
      rerender();
    } catch (err) { notify(err.message, true); }
  }
  function suspend() {
    if (ticker !== null) { window.clearInterval(ticker); ticker = null; }
    if (session) session.tasks.forEach(task => pauseTask(session, task.id));
    host = null;
  }
  // The main router calls suspend() when leaving #trial, so time on other pages is excluded.
  // No browser storage, network requests or beforeunload handler is installed.
  window.LAB_STUDY_UI = { render, suspend, core, getSession: () => session ? snapshot(session) : null };
})();
