/* A release notice never replaces the current view or reloads it automatically. */
(function () {
  'use strict';

  const currentBuild = document.querySelector('meta[name="lab-build-id"]')?.content.trim().toLowerCase();
  const currentVersion = document.querySelector('meta[name="lab-version"]')?.content.trim();
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
  const version = value => typeof value === 'string' && /^\d+(?:\.\d+){1,2}(?:[-+][a-z0-9.-]+)?$/i.test(value) && value.length <= 40;
  if (!/^https?:$/.test(window.location.protocol) || !hash(currentBuild) || !version(currentVersion) ||
      typeof window.fetch !== 'function' || typeof window.AbortController !== 'function') return;

  const notice = document.getElementById('update-notice');
  const message = document.getElementById('update-message');
  const status = document.getElementById('update-status');
  const refreshButton = document.getElementById('update-refresh');
  const laterButton = document.getElementById('update-later');
  if (!notice || !message || !status || !refreshButton || !laterButton) return;

  const POLL_MS = 60000;
  const MIN_CHECK_GAP_MS = 10000;
  const TIMEOUT_MS = 8000;
  let timer = null;
  let request = null;
  let lastCheck = -Infinity;
  let sequence = 0;
  let latestBuild = null;
  let dismissedBuild = null;
  let pendingBuild = null;

  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function artifact(value) {
    return object(value) && hash(value.sha256) && typeof value.path === 'string' &&
      value.path.length <= 256 && /^[a-z0-9._/-]+$/i.test(value.path) &&
      !value.path.startsWith('/') && value.path.split('/').every(part => part && part !== '.' && part !== '..');
  }
  function validManifest(value) {
    return object(value) && value.schema_version === 1 && version(value.version) && hash(value.build_id) &&
      typeof value.revision === 'string' && /^[a-f0-9]{40}$/i.test(value.revision) &&
      object(value.assets) && Object.keys(value.assets).length > 0 &&
      Object.values(value.assets).every(artifact) && artifact(value.html);
  }
  function hideNotice() {
    // Dismissing a focused button must not leave keyboard focus on a hidden control.
    const restoreFocus = notice.contains(document.activeElement);
    notice.hidden = true;
    pendingBuild = null;
    status.textContent = '';
    if (restoreFocus) document.getElementById('main')?.focus({ preventScroll: true });
  }
  function showManifest(manifest) {
    const build = manifest.build_id.toLowerCase();
    if (build !== latestBuild) {
      latestBuild = build;
      dismissedBuild = null;
    }
    if (build === currentBuild || build === dismissedBuild) {
      hideNotice();
      return;
    }
    if (pendingBuild === build && !notice.hidden) return;
    pendingBuild = build;
    notice.hidden = false;
    message.textContent = `Version ${manifest.version} is ready. Refreshing resets your current filters.`;
    // This live region stays in the accessibility tree while the notice is hidden.
    status.textContent = `An updated demo is available. ${message.textContent}`;
    // Do not move focus: users can finish their current review before responding.
  }
  function cancelTimer() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  }
  function schedule(delay = POLL_MS) {
    cancelTimer();
    if (!document.hidden) timer = window.setTimeout(check, delay);
  }
  async function check() {
    if (document.hidden || request) return;
    const wait = MIN_CHECK_GAP_MS - (Date.now() - lastCheck);
    if (wait > 0) {
      schedule(wait);
      return;
    }
    cancelTimer();
    lastCheck = Date.now();
    request = new window.AbortController();
    const activeRequest = request;
    const timeout = window.setTimeout(() => activeRequest.abort(), TIMEOUT_MS);
    try {
      // The manifest path is local and fixed. Neither its URLs nor its paths can
      // choose a navigation destination. A unique query also avoids stale proxies.
      const url = new URL('version.json', window.location.href);
      url.searchParams.set('_check', `${Date.now()}-${++sequence}`);
      const response = await window.fetch(url.href, {
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal: activeRequest.signal
      });
      if (!response.ok) return;
      const manifest = await response.json();
      if (!activeRequest.signal.aborted && !document.hidden && validManifest(manifest)) showManifest(manifest);
    } catch (_) {
      // Offline, timeout and invalid responses leave the working demo untouched.
    } finally {
      window.clearTimeout(timeout);
      request = null;
      schedule();
    }
  }

  laterButton.addEventListener('click', () => {
    dismissedBuild = pendingBuild;
    hideNotice();
  });
  refreshButton.addEventListener('click', () => {
    if (!pendingBuild || pendingBuild === currentBuild) return;
    const destination = new URL(window.location.href);
    destination.searchParams.set('release', pendingBuild);
    window.location.assign(destination.href);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelTimer();
      request?.abort();
    } else {
      void check();
    }
  });
  window.addEventListener('focus', () => { void check(); });
  void check();
})();
