(function () {
  'use strict';

  const endpoint = '/api/tutor-chat';
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
    const question = find('textarea');
    const stop = find('[data-stop]');
    const send = find('[type="submit"]');
    const replies = find('.tutor-chat-replies');
    const examples = find('.tutor-chat-examples');
    const status = find('.tutor-chat-status');
    const lifetime = new AbortController();
    const history = [];
    let active = null;

    find('.tutor-chat-scope').textContent = recordId + ' · ' + modelLabel;

    function showSetup() {
      notice.textContent = 'To chat with this record, start your local copy with ';
      const command = document.createElement('code');
      command.textContent = 'python3 run_demo.py --chat';
      notice.append(command, ' and open the local demo.');
    }

    async function checkStatus() {
      if (!localServer()) {
        showSetup();
        return;
      }
      notice.textContent = 'Connecting to the local chat service…';
      try {
        const response = await fetch(endpoint + '/status', {
          signal: lifetime.signal, cache: 'no-store', mode: 'same-origin', redirect: 'error'
        });
        const info = response.ok && await response.json();
        if (lifetime.signal.aborted) return;
        if (info && info.available === true) {
          notice.hidden = true;
          form.hidden = false;
        } else {
          showSetup();
        }
      } catch {
        if (!lifetime.signal.aborted) showSetup();
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
      question.value = '';
      try {
        const response = await fetch(endpoint, {
          method: 'POST', mode: 'same-origin', redirect: 'error',
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
        status.textContent = control.signal.aborted ? 'Reply stopped.' : error.message || 'Connection failed. Please try again.';
        question.value = prompt;
      } finally {
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
  }

  window.LAB_TUTOR_CHAT = {mount, close};
})();
