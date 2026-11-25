
(() => {
  'use strict';
  const more = document.querySelector('[data-watch-more]');
  const list = document.querySelector('[data-watch-batch]');
  if (!more || !list) return;
  const status = document.getElementById('watch-batch-status');
  const zh = document.documentElement.lang === 'zh-CN';
  let busy = false;
  const key = row=>row.dataset.videoId || row.getAttribute('href');
  more.addEventListener('click',async event=>{
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (busy) return;
    busy = true;
    more.setAttribute('aria-disabled','true');
    status.textContent = zh ? '加载中…' : 'Loading…';
    try {
      const href = new URL(more.href);
      const response = await fetch(href,{cache:'no-store'});
      if (!response.ok || response.redirected) throw Error();
      const next = new DOMParser().parseFromString(await response.text(),'text/html');
      const children = next.querySelector('[data-watch-batch]');
      if (!children) throw Error();
      const known = new Set([...list.children].map(key));
      for (const row of children.children) {
        if (!known.has(key(row))) list.append(document.importNode(row,true));
      }
      const continuation = next.querySelector('[data-watch-more]')?.getAttribute('href');
      if (continuation) more.href = new URL(continuation,href);
      else more.hidden = true;
      status.textContent = '';
    } catch {
      status.textContent = zh ? '加载失败，请重试。' : 'Could not load more. Try again.';
    } finally {
      busy = false;
      more.removeAttribute('aria-disabled');
    }
  });
})();
