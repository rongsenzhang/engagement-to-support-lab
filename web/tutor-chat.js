(function () {
  'use strict';

  const apiPath = '/api/tutor-chat';
  const pagesPath = '/engagement-to-support-lab/';
  const prompts = [
    'Which observations contribute to this score?',
    'What should I check before contacting this learner?'
  ];
  let current = null;

  function localServer() {
    const {protocol, hostname} = window.location;
    return ['http:', 'https:'].includes(protocol) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
  }

  function isWorkerOrigin(url) {
    return url.protocol === 'https:' && url.hostname.endsWith('.workers.dev') && !url.port;
  }

  function isProjectPage(url) {
    return url.origin === 'https://rongsenzhang.github.io' &&
      [pagesPath, pagesPath + 'index.html', pagesPath.slice(0, -1)].includes(url.pathname);
  }

  async function resolveService(signal) {
    if (!isProjectPage(window.location)) return {endpoint: apiPath, mode: 'same-origin'};
    const config = await fetch(pagesPath + 'tutor-chat-config.json', {
      signal, mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store'
    });
    if (!config.ok) throw new Error('Chat is currently unavailable on this site.');
    const {origin} = await config.json();
    const url = new URL(origin);
    if (!isWorkerOrigin(url) || ![url.origin, url.origin + '/'].includes(origin)) {
      throw new Error('Chat is currently unavailable on this site.');
    }
    return {endpoint: url.origin + apiPath, mode: 'cors'};
  }

  async function readReply(response, showDelta) {
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(typeof detail.error === 'string' ? detail.error : 'The chat service could not answer. Please try again.');
    }
    if (!response.body) throw new Error('The chat service returned no reply.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';

    function processLine(line) {
      if (!line.trim()) return false;
      const event = JSON.parse(line);
      if (event.type === 'done') return true;
      if (event.type === 'error') throw new Error(event.message || 'The reply was interrupted.');
      if (event.type !== 'delta' || typeof event.text !== 'string') {
        throw new Error('The chat service sent an unreadable reply.');
      }
      showDelta(event.text);
      return false;
    }

    try {
      while (true) {
        const {value, done} = await reader.read();
        pending += decoder.decode(value, {stream: !done});
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines) if (processLine(line)) return;
        if (done) {
          if (processLine(pending)) return;
          throw new Error('Connection ended before the reply was complete. Please try again.');
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  function makePanel(recordId, model, modelLabel) {
    const panel = document.createElement('details');
    panel.className = 'tutor-chat';
    // This template contains only fixed UI text. Questions and generated replies use plain text nodes.
    panel.innerHTML = `
      <summary>Discuss this record with AI</summary>
      <div class="tutor-chat-body">
        <p class="tutor-chat-scope"></p>
        <p class="tutor-chat-notice" role="status"></p>
        <button type="button" class="quiet-button" data-reconnect hidden>Retry connection</button>
        <form hidden>
          <p>Sending a question shares this record’s day-28 evidence and your conversation with OpenAI. Use demo details only. Check answers against the record below.</p>
          <div class="tutor-chat-examples" role="group" aria-label="Suggested questions"></div>
          <div class="tutor-chat-replies" role="region" aria-label="Conversation" tabindex="0"></div>
          <label for="tutor-chat-question">Your question</label>
          <textarea id="tutor-chat-question" rows="2" maxlength="1000" placeholder="Ask about the evidence or a possible next check." required></textarea>
          <div class="tutor-chat-actions">
            <button type="submit" class="primary-button">Send</button>
            <button type="button" class="quiet-button" data-stop hidden>Stop reply</button>
            <span class="tutor-chat-status" role="status"></span>
          </div>
        </form>
      </div>`;
    const find = selector => panel.querySelector(selector);
    const notice = find('.tutor-chat-notice');
    const form = find('form');
    const reconnect = find('[data-reconnect]');
    const question = find('textarea');
    const stop = find('[data-stop]');
    const send = find('[type="submit"]');
    const replies = find('.tutor-chat-replies');
    const examples = find('.tutor-chat-examples');
    const status = find('.tutor-chat-status');
    const lifetime = new AbortController();
    const history = [];
    let active = null;
    let service = null;

    find('.tutor-chat-scope').textContent = recordId + ' · ' + modelLabel;

    function showSetup() {
      notice.textContent = 'To chat with this record, start your local copy with ';
      const command = document.createElement('code');
      command.textContent = 'python3 run_demo.py --chat';
      notice.append(command, ' and open the local demo.');
    }

    async function checkStatus() {
      if (!localServer() && !isWorkerOrigin(window.location) && !isProjectPage(window.location)) {
        showSetup();
        return;
      }
      notice.textContent = 'Connecting to record chat…';
      reconnect.hidden = true;
      const control = new AbortController();
      const abort = () => control.abort();
      lifetime.signal.addEventListener('abort', abort, {once: true});
      const timer = setTimeout(abort, 12000);
      try {
        service = await resolveService(control.signal);
        const response = await fetch(service.endpoint + '/status', {
          signal: control.signal, cache: 'no-store', mode: service.mode,
          credentials: 'omit', redirect: 'error'
        });
        const info = response.ok && await response.json();
        if (lifetime.signal.aborted) return;
        if (!info || info.available !== true) throw new Error('Unavailable');
        notice.hidden = true;
        form.hidden = false;
      } catch {
        if (lifetime.signal.aborted) return;
        if (localServer()) showSetup();
        else notice.textContent = 'Record chat is currently unavailable. You can still review this record’s evidence below.';
        reconnect.hidden = false;
      } finally {
        clearTimeout(timer);
        lifetime.signal.removeEventListener('abort', abort);
      }
    }

    function addTurn(labelText, content) {
      const turn = document.createElement('div');
      turn.className = 'tutor-chat-turn';
      const label = document.createElement('strong');
      label.textContent = labelText;
      const text = document.createElement('p');
      text.textContent = content;
      turn.append(label, text);
      replies.append(turn);
      replies.scrollTop = replies.scrollHeight;
      return {text, label};
    }

    function setBusy(busy) {
      stop.hidden = !busy;
      send.disabled = busy;
      question.readOnly = busy;
      for (const button of examples.children) button.disabled = busy;
    }

    async function submit(event) {
      event.preventDefault();
      const prompt = question.value.trim();
      if (active || !prompt || form.hidden || prompt.length > 1000) return;
      const control = new AbortController();
      active = control;
      setBusy(true);
      status.textContent = 'Waiting for a reply…';
      addTurn('You', prompt);
      const reply = addTurn('AI response', '');
      const userMessage = {role: 'user', content: prompt};
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; control.abort(); }, 125000);
      question.value = '';
      try {
        const response = await fetch(service.endpoint, {
          method: 'POST', mode: service.mode, credentials: 'omit', redirect: 'error',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({recordId, model, messages: [...history, userMessage]}),
          signal: control.signal
        });
        await readReply(response, delta => {
          if (control.signal.aborted) return;
          const atBottom = replies.scrollHeight - replies.scrollTop - replies.clientHeight < 32;
          reply.text.append(document.createTextNode(delta));
          if (atBottom) replies.scrollTop = replies.scrollHeight;
          if (status.textContent !== 'Receiving reply…') status.textContent = 'Receiving reply…';
        });
        if (control.signal.aborted) throw new Error('Reply stopped.');
        if (!reply.text.textContent.trim()) throw new Error('The model returned an empty answer. Please try again.');
        history.push(userMessage, {role: 'assistant', content: reply.text.textContent.slice(0, 8000)});
        if (history.length > 6) history.splice(0, 2);
        status.textContent = 'Reply complete.';
      } catch (error) {
        if (lifetime.signal.aborted) return;
        reply.label.textContent = 'Incomplete reply';
        if (!reply.text.textContent) reply.text.textContent = 'No answer received.';
        if (timedOut) status.textContent = 'The reply timed out. Send your question again to retry.';
        else if (control.signal.aborted) status.textContent = 'Reply stopped.';
        else if (error.name === 'TypeError') status.textContent = 'Connection lost. Check your connection and send again.';
        else status.textContent = error.message || 'Connection failed. Please try again.';
        question.value = prompt;
      } finally {
        clearTimeout(timer);
        active = null;
        setBusy(false);
      }
    }

    for (const prompt of prompts) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = prompt;
      button.addEventListener('click', () => {
        question.value = prompt;
        question.focus();
      });
      examples.append(button);
    }
    reconnect.addEventListener('click', checkStatus);
    form.addEventListener('submit', submit);
    stop.addEventListener('click', () => active?.abort());
    checkStatus();
    return {recordId, model, panel, dispose() { lifetime.abort(); active?.abort(); }};
  }

  function close() {
    current?.dispose();
    current = null;
  }

  function mount(slot, recordId, model, modelLabel) {
    if (!slot || !recordId) {
      close();
      return;
    }
    if (!current || current.recordId !== recordId || current.model !== model) {
      close();
      current = makePanel(recordId, model, modelLabel);
    }
    slot.replaceChildren(current.panel);
    // On a narrow screen the entire queue is above the record detail.
    const heading = slot.closest?.('.workspace-grid')?.querySelector('.panel-head');
    if (heading && !heading.parentNode.querySelector('.tutor-chat-jump')) {
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'quiet-button tutor-chat-jump';
      jump.textContent = 'Open chat for ' + recordId;
      jump.addEventListener('click', () => {
        current.panel.open = true;
        current.panel.querySelector('summary').focus({preventScroll: true});
        current.panel.scrollIntoView({block: 'start'});
      });
      heading.insertAdjacentElement('afterend', jump);
    }
  }

  window.LAB_TUTOR_CHAT = {mount, close};
})();
