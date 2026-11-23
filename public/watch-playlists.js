(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('playlist-editor');
  const form = $('playlist-form');
  const detail = $('playlist-detail');
  const search = $('playlist-search');
  const picker = $('playlist-picker');
  const selection = $('playlist-selection');
  const more = $('playlist-more');
  const save = $('save-playlist');
  const remove = $('remove-playlist');
  const close = $('close-playlist-editor');
  const status = $('playlist-picker-status');
  const error = $('playlist-error');
  const zh = document.documentElement.lang === 'zh-CN';
  const t = (cn,en) => zh ? cn : en;
  const endpoint = '/api/watch-preview/playlists';
  let chosen = [];
  let videos = [];
  let cursor = null;
  let request;
  let timer;
  let selectionRequest;
  let selectionReady = true;
  let busy = false;

  function element(tag, label) {
    const node = document.createElement(tag);
    if (label !== undefined) node.textContent = label;
    return node;
  }

  function button(label, description, run, disabled = false) {
    const node = element('button', label);
    node.type = 'button';
    node.className = 'quiet-button';
    node.setAttribute('aria-label',description);
    node.disabled = disabled;
    node.addEventListener('click',run);
    return node;
  }

  function showError(message = '') {
    error.hidden = !message;
    error.textContent = message;
  }

  function renderOrder() {
    selection.replaceChildren(...chosen.map((video,i) => {
      const row = element('li');
      row.append(element('span', String(i+1)+'. '+video.title));
      const actions = element('div');
      actions.className = 'playlist-order-actions';
      for (const [symbol, label, direction] of [
        ['↑',t('上移','Move up'),-1],['↓',t('下移','Move down'),1],['×',t('移除','Remove'),0],
      ]) {
        const target = i+direction;
        actions.append(button(symbol, label+' '+video.title, () => {
          if (!direction) chosen.splice(i,1);
          else [chosen[i],chosen[target]] = [chosen[target],chosen[i]];
          renderOrder();
          renderPicker();
          const focusRow = selection.children[Math.min(target, chosen.length-1)];
          const controls = focusRow?.querySelectorAll('button:not(:disabled)');
          (direction ? [...(controls || [])].find(control => control.textContent === symbol) || controls?.[0] : controls?.[0])?.focus();
        }, target < 0 || target >= chosen.length || busy));
      }
      row.append(actions);
      return row;
    }));
    if (!chosen.length) selection.append(element('li',t('请选择要加入的视频。','Choose videos to add.')));
    save.disabled = busy || !selectionReady || !chosen.length;
  }

  function renderPicker() {
    const selectedIds = new Set(chosen.map(video => video.id));
    picker.replaceChildren(...videos.map(video => {
      const row = element('li');
      const label = element('label');
      const input = element('input');
      input.type = 'checkbox';
      input.checked = selectedIds.has(video.id);
      input.disabled = busy || !selectionReady || !input.checked && chosen.length >= 100;
      input.addEventListener('change', () => {
        if (input.checked) chosen.push(video);
        else chosen = chosen.filter(item => item.id !== video.id);
        renderOrder();
        renderPicker();
        [...picker.querySelectorAll('input')].find(box => box.value === video.id)?.focus();
      });
      input.value = video.id;
      label.append(input,element('span',video.title));
      row.append(label);
      return row;
    }));
  }

  async function loadVideos(after) {
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const params = new URLSearchParams();
    if (search.value.trim()) params.set('q',search.value.trim());
    if (after) params.set('after',after);
    if (!after) {videos = [];renderPicker();}
    more.hidden = true;
    status.textContent = t('正在加载视频…','Loading videos…');
    try {
      const response = await fetch('/api/watch-preview/catalog?'+params,{signal:controller.signal,cache:'no-store'});
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (controller.signal.aborted) return;
      const prior = new Set(videos.map(video => video.id));
      videos.push(...result.videos.filter(video => !prior.has(video.id)));
      cursor = result.nextCursor;
      more.hidden = !cursor;
      status.textContent = videos.length ? '' : t('找不到符合条件的视频。','No matching videos.');
      renderPicker();
    } catch {
      if (!controller.signal.aborted) status.textContent = t('视频加载失败，请重试。','Could not load videos. Try again.');
      if (!controller.signal.aborted) {cursor = after || null; more.hidden = false;}
    }
  }

  async function send(body) {
    if (busy) return;
    busy = true;
    showError();
    renderOrder();
    renderPicker();
    close.disabled = true;
    if (remove) remove.disabled = true;
    try {
      const response = await fetch(endpoint,{
        method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.error === 'playlistChanged') throw new Error(t('清单或视频已变更，请重新打开页面。','The playlist or videos changed. Reload the page and try again.'));
        if (result.error === 'signIn' || result.error === 'forbidden') throw new Error(t('当前账号没有管理权限，请从 Tickminder 重新进入。','You do not have editing access. Reopen TickPlay from Tickminder.'));
        throw new Error(t('无法保存播放清单，请重试。','Could not save the playlist. Try again.'));
      }
      if (body.action === 'remove') location.assign(dialog.dataset.playlistUrl);
      else {
        const target = new URL(dialog.dataset.playlistUrl,location.href);
        target.pathname = dialog.dataset.entry + '/' + result.id;
        location.assign(target);
      }
    } catch (failure) {
      showError(failure.message);
    } finally {
      busy = false;
      close.disabled = false;
      if (remove) remove.disabled = false;
      renderOrder();
      renderPicker();
    }
  }

  $('open-playlist-editor').addEventListener('click', () => {
    form.reset();
    form.elements.title.value = detail ? $('playlist-title').textContent : '';
    chosen = [];
    selectionReady = !detail;
    showError();
    renderOrder();
    dialog.showModal();
    if (detail) {
      const controller = new AbortController();
      selectionRequest = controller;
      showError(t('正在加载播放顺序…','Loading the play order…'));
      fetch('/api/watch-preview/playlist-editor?playlist='+detail.dataset.id,{cache:'no-store',signal:controller.signal})
        .then(response=>{if(!response.ok)throw Error();return response.json();})
        .then(({videos})=>{
          if(controller.signal.aborted)return;
          chosen = videos;
          selectionReady = true;
          showError();
          renderOrder();
          renderPicker();
        })
        .catch(()=>{if(!controller.signal.aborted)showError(t('播放顺序加载失败，请关闭后重试。','Could not load the play order. Close and try again.'));});
    }
    void loadVideos();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel',event => {if (busy) event.preventDefault();});
  dialog.addEventListener('close', () => {clearTimeout(timer); request?.abort(); selectionRequest?.abort();});
  search.addEventListener('input', () => {
    clearTimeout(timer);
    request?.abort();
    timer = setTimeout(() => void loadVideos(),250);
  });
  more.addEventListener('click', () => void loadVideos(cursor));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!selectionReady || !chosen.length) return;
    const title = form.elements.title.value.trim();
    if (!title) {
      showError(t('请输入清单名称。','Enter a playlist name.'));
      form.elements.title.focus();
      return;
    }
    void send({
      action:detail ? 'edit' : 'create',id:detail?.dataset.id,revision:Number(detail?.dataset.revision),
      title,videoIds:chosen.map(video => video.id),
    });
  });
  remove?.addEventListener('click', () => {
    if (!confirm(t('删除这个播放清单？','Delete this playlist?'))) return;
    void send({action:'remove',id:detail.dataset.id,revision:Number(detail.dataset.revision)});
  });
})();
