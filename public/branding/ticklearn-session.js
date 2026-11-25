(() => {
  const root = document.documentElement;
  const hidden = 'data-ticklearn-private-hidden';

  // A history snapshot can outlive its server session. Freeze it without
  // visible private content and let a fresh request recheck the session.
  window.addEventListener('pagehide', () => root.setAttribute(hidden, ''));
  window.addEventListener('pageshow', event => {
    if (event.persisted || root.hasAttribute(hidden)) {
      root.setAttribute(hidden, '');
      window.location.reload();
    }
  });
})();
