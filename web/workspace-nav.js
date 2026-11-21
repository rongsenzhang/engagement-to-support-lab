// The same navigation links are used in the desktop bar and the mobile menu.
(() => {
  const menu = document.getElementById('workspace-menu');
  const nav = document.getElementById('workspace-nav');
  const main = document.getElementById('main');
  const narrow = window.matchMedia('(max-width: 950px)');
  const isOpen = () => menu.getAttribute('aria-expanded') === 'true';
  const close = () => menu.setAttribute('aria-expanded', 'false');

  menu.addEventListener('click', () => menu.setAttribute('aria-expanded', String(!isOpen())));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) {
      close();
      menu.focus();
    }
  });
  document.addEventListener('click', event => {
    if (isOpen() && !nav.contains(event.target) && !menu.contains(event.target)) close();
  });
  nav.addEventListener('click', event => {
    const link = event.target.closest('[data-view]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (isOpen()) {
      close();
      main.focus({preventScroll: true});
    }
  });
  document.getElementById('skip-to-workspace').addEventListener('click', event => {
    event.preventDefault();
    main.focus();
  });
  window.addEventListener('hashchange', () => {
    close();
    window.scrollTo(0, 0);
  });
  narrow.addEventListener('change', close);
})();
