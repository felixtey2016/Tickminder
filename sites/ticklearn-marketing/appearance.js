(() => {
  function sync() {
    const preference=document.cookie.match(/(?:^|;\s*)ticklearn_theme=(light|dark)(?:;|$)/)?.[1];
    document.documentElement.dataset.theme=preference||'light';
  }
  sync();
  window.addEventListener('pageshow',sync);
  document.addEventListener('visibilitychange',sync);
})();
