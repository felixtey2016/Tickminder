(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const zh = document.documentElement.lang === 'zh-CN';
  const t = (cn, en) => zh ? cn : en;
  const api = '/api/watch-preview/catalog';
  const appearance = document.documentElement.dataset;
  const systemTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const readTheme = () => {
    try {return localStorage.getItem('tickminder-watch-theme');} catch {return null;}
  };
  const savedTheme = readTheme();
  if (!appearance.theme) appearance.theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : systemTheme;
  $('appearance').addEventListener('click', () => {
    appearance.theme = appearance.theme === 'dark' ? 'light' : 'dark';
    document.cookie = '__Host-tickminder_watch_theme=' + appearance.theme + '; Max-Age=31536000; Path=/; Secure; SameSite=Lax';
    try {localStorage.setItem('tickminder-watch-theme', appearance.theme);} catch {}
  });

  const grid = $('video-grid');
  if (!grid) return;

  const fields = [
    ['category', t('分类', 'Category'), 48],
    ['subject', t('科目', 'Subject'), 48],
    ['chapter', t('章节', 'Chapter'), 80],
  ];
  const editor = $('video-editor');
  const form = $('editor-form');
  const removal = $('remove-dialog');
  const initial = new URLSearchParams(location.search);
  let type = ['short', 'lesson'].includes(initial.get('kind')) ? initial.get('kind') : '';
  let filters = Object.fromEntries(fields.map(([key, , limit]) => [key, (initial.get(key) || '').slice(0, limit)]));
  let pageRequest;
  let facetRequest;
  let facets;
  let searchTimer;
  let academicOptions;
  let academicRequest;
  const customOption = '\u0001';
  let editing = null;
  let busy = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(label, className, click) {
    const node = element('button', className, label);
    node.type = 'button';
    node.addEventListener('click', click);
    return node;
  }
  function status(id, message) {
    const output = $(id);
    output.textContent = message;
    output.hidden = !message;
  }

  async function request(url, options) {
    const response = await fetch(url, {...options, cache:'no-store'});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        alreadyAdded: t('此链接已加入视频库。', 'This link is already in the library.'),
        invalidVideo: t('请输入标题和有效的 YouTube 链接。', 'Enter a title and a valid YouTube link.'),
        adminOnly: t('管理员会话已失效，请从管理页重新进入。', 'Your admin session expired. Reopen Watch from Manage.'),
        notFound: t('找不到该视频。', 'This video is unavailable.'),
      };
      throw new Error(messages[result.error] || t('视频库暂时无法使用，请稍后重试。', 'The library is unavailable. Try again.'));
    }
    return result;
  }
  const save = data => request(api, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data),
  });

  function metadata(video) {
    return [video.category, video.subject, video.chapter].filter(Boolean).join(' · ');
  }
  function card(video, query) {
    const article = element('article', 'video-card');
    const open = element('a', 'video-open');
    open.href = grid.dataset.entry.replace(/\/$/, '') + '/videos/' + video.id + query;
    open.setAttribute('aria-label', t('播放 ', 'Play ') + video.title);
    const thumb = element('div', 'thumbnail');
    const img = element('img');
    img.src = 'https://i.ytimg.com/vi/' + video.youtubeId + '/hqdefault.jpg';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {img.hidden = true;});
    thumb.append(img, element('span', 'play-icon', '▶'));
    if (video.kind === 'short') thumb.append(element('span', 'short-tag', t('短视频','Short')));
    const content = element('div', 'video-text');
    content.append(element('h3','',video.title));
    const meta = metadata(video);
    if (meta) content.append(element('p','muted',meta));
    open.append(thumb, content);
    article.append(open, button(t('编辑','Edit'), 'edit-button', () => openEditor(video)));
    return article;
  }

  function pageLink(url, direction, cursor) {
    const link = new URL(url);
    link.searchParams.delete('before');
    link.searchParams.delete('after');
    if (cursor) link.searchParams.set(direction, cursor);
    return link.href;
  }
  function renderResults({videos, previousCursor, nextCursor}, url) {
    grid.replaceChildren(...videos.map(video => card(video, url.search)));
    grid.dataset.solo = String(videos.length === 1);
    const paged = url.searchParams.has('before') || url.searchParams.has('after');
    const filtered = ['q', 'kind', ...fields.map(([key]) => key)].some(key => url.searchParams.has(key));
    $('result-count').textContent = t('本页 ' + videos.length + ' 条', videos.length + ' on this page');
    if (!videos.length) {
      const empty = element('div','empty-library');
      empty.append(element('h3','',filtered || paged ? t('没有符合条件的视频','No matching videos') : t('还没有视频','No videos yet')));
      if (paged) {
        const first = element('a', 'quiet-button', t('返回第一页', 'Return to first page'));
        first.href = pageLink(url);
        empty.append(first);
      } else if (filtered) {
        empty.append(button(t('清除搜索和筛选','Clear search and filters'), 'quiet-button', clearFilters));
      }
      grid.append(empty);
    }
    for (const [id, direction, cursor] of [['previous-page', 'before', previousCursor], ['next-page', 'after', nextCursor]]) {
      const link = $(id);
      link.hidden = !cursor;
      if (cursor) link.href = pageLink(url, direction, cursor);
    }
    $('catalog-pages').hidden = !previousCursor && !nextCursor;
  }

  async function loadPage(resetPage = false, message = '') {
    clearTimeout(searchTimer);
    pageRequest?.abort();
    const controller = new AbortController();
    pageRequest = controller;
    const url = new URL(location.href);
    url.pathname = grid.dataset.entry;
    if (resetPage) {
      url.searchParams.delete('before');
      url.searchParams.delete('after');
    }
    for (const [key, value] of Object.entries({q: $('search').value.trim(), kind: type, ...filters})) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href !== location.href) history.replaceState(null, '', url);
    grid.setAttribute('aria-busy', 'true');
    status('notice', message);
    try {
      const result = await request(api + url.search, {signal: controller.signal});
      if (!controller.signal.aborted) renderResults(result, url);
    } catch (error) {
      if (!controller.signal.aborted) status('notice', error.message);
    } finally {
      if (pageRequest === controller) grid.setAttribute('aria-busy', 'false');
    }
  }

  function useFilter(key, value) {
    filters[key] = value.trim();
    renderFilters(key, filters[key]);
    void loadPage(true);
  }

  async function loadFacets() {
    if (facets || facetRequest) return;
    const controller = new AbortController();
    facetRequest = controller;
    try {
      const result = await request('/api/watch-preview/facets', {signal:controller.signal});
      if (!controller.signal.aborted) {
        facets = result.facets;
        renderFilters();
      }
    } catch (error) {
      if (!controller.signal.aborted) status('notice', error.message);
    } finally {
      if (facetRequest === controller) facetRequest = null;
    }
  }

  function renderFilters(focusKey, focusValue) {
    const all = t('全部','All');
    const group = $('filter-fields');
    let focusTarget = null;
    const nodes = fields.map(([key, label, limit]) => {
      const values = [...(facets?.[key]?.values ?? [])];
      if (filters[key] && !values.includes(filters[key])) values.unshift(filters[key]);
      const set = element('fieldset','filter-field');
      set.append(element('legend','',label));
      const chips = element('div','filter-chips');
      ['', ...values].forEach(value => {
        const chip = button(value || all, 'filter-chip', () => useFilter(key, value));
        chip.setAttribute('aria-pressed', String((filters[key] || '') === value));
        if (focusKey === key && focusValue === value) focusTarget = chip;
        chips.append(chip);
      });
      set.append(chips);
      if (facets?.[key]?.hasMore) {
        const extra = element('form', 'filter-extra');
        const value = element('input');
        value.maxLength = limit;
        value.placeholder = t('输入其他选项', 'Enter another option');
        value.setAttribute('aria-label', label);
        const apply = element('button', 'quiet-button', t('应用', 'Apply'));
        apply.type = 'submit';
        extra.append(value, apply);
        extra.addEventListener('submit', event => {
          event.preventDefault();
          if (value.value.trim()) useFilter(key, value.value);
        });
        set.append(extra);
      }
      return set;
    });
    group.replaceChildren(...nodes);
    const count = Object.values(filters).filter(Boolean).length;
    $('filter-count').hidden = !count;
    $('filter-count').textContent = count || '';
    focusTarget?.focus();
  }

  function syncType() {
    for (const option of $('video-types').querySelectorAll('[data-type]')) {
      option.setAttribute('aria-pressed', String(option.dataset.type === type));
    }
  }
  function clearFilters() {
    filters = {};
    type = '';
    $('search').value = '';
    renderFilters();
    syncType();
    void loadPage(true);
  }

  function editorValue(key) {
    const value = form.elements[key].value;
    return value === customOption ? $('custom-' + key).value.trim() : value;
  }
  function renderSelect(key, choices, value, pendingCustom = false) {
    const select = form.elements[key];
    const custom = value ? !choices.includes(value) : pendingCustom;
    select.replaceChildren(new Option(t('不指定','None'), ''), ...choices.map(name => new Option(name, name)),
      new Option(t('自定义…','Custom…'), customOption));
    select.value = custom ? customOption : value;
    $('custom-' + key).value = custom ? value : '';
    $('custom-' + key + '-row').hidden = !custom;
  }
  function subjectsFor(category) {
    const syllabus = academicOptions?.find(option => option.name === category);
    return syllabus?.subjects ?? [...new Set((academicOptions ?? []).flatMap(option => option.subjects))];
  }
  function renderAcademicChoices(category, subject, preserveInput = false) {
    renderSelect('category', (academicOptions ?? []).map(option => option.name), category, preserveInput && form.elements.category.value === customOption);
    renderSelect('subject', subjectsFor(category), subject, preserveInput && form.elements.subject.value === customOption);
  }
  async function loadAcademicChoices() {
    if (academicOptions || academicRequest) return;
    $('retry-academic').hidden = true;
    status('academic-status', t('正在载入课程目录…', 'Loading the course catalogue…'));
    academicRequest = request('/api/watch-preview/academic-options');
    try {
      const {syllabuses} = await academicRequest;
      if (!Array.isArray(syllabuses)) throw new Error('Invalid course catalogue');
      academicOptions = syllabuses;
      renderAcademicChoices(editorValue('category'), editorValue('subject'), true);
      status('academic-status', '');
    } catch {
      status('academic-status', t('课程目录暂时无法载入。','Course catalogue unavailable.'));
      $('retry-academic').hidden = false;
    } finally {academicRequest = null;}
  }
  function openEditor(video) {
    editing = video || null;
    form.reset();
    $('optional-fields').open = false;
    status('editor-error','');
    $('editor-title').textContent = video ? t('编辑视频','Edit video') : t('添加视频','Add video');
    $('save-video').textContent = video ? t('保存','Save') : t('添加视频','Add video');
    $('remove-video').hidden = !video;
    renderAcademicChoices(video?.category || '', video?.subject || '');
    if (video) {
      form.elements.title.value = video.title;
      form.elements.url.value = (video.kind === 'short' ? 'https://www.youtube.com/shorts/' : 'https://youtu.be/') + video.youtubeId;
      form.elements.chapter.value = video.chapter;
    }
    editor.showModal();
  }
  function afterChange(message) {
    facetRequest?.abort();
    facetRequest = null;
    facets = null;
    if (!$('filter-panel').hidden) void loadFacets();
    void loadPage(true, message);
  }
  async function withSaveError(errorId, work) {
    if (busy) return;
    busy = true;
    $('save-video').disabled = true;
    $('confirm-remove').disabled = true;
    status(errorId,'');
    try {await work();}
    catch (error) {status(errorId,error instanceof Error ? error.message : t('请重试。','Try again.'));}
    finally {
      busy = false;
      $('save-video').disabled = false;
      $('confirm-remove').disabled = false;
    }
  }

  $('search-form').addEventListener('submit', event => {
    event.preventDefault();
    void loadPage(true);
  });
  $('search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadPage(true), 300);
  });
  $('video-types').addEventListener('click', event => {
    const option = event.target.closest('button[data-type]');
    if (!option || option.dataset.type === type) return;
    type = option.dataset.type;
    syncType();
    void loadPage(true);
  });
  $('show-filters').addEventListener('click', () => {
    $('filter-panel').hidden = !$('filter-panel').hidden;
    const expanded = !$('filter-panel').hidden;
    $('show-filters').setAttribute('aria-expanded', String(expanded));
    if (expanded) void loadFacets();
  });
  $('clear-filters').addEventListener('click',clearFilters);
  $('optional-fields').addEventListener('toggle', () => {
    if ($('optional-fields').open) void loadAcademicChoices();
  });
  $('retry-academic').addEventListener('click', () => void loadAcademicChoices());
  form.elements.category.addEventListener('change', () => {
    const selected = form.elements.category.value;
    const custom = selected === customOption;
    $('custom-category-row').hidden = !custom;
    const choices = subjectsFor(selected);
    const subject = editorValue('subject');
    const customSubject = form.elements.subject.value === customOption;
    renderSelect('subject', choices, customSubject || choices.includes(subject) ? subject : '', customSubject);
    if (custom) $('custom-category').focus();
  });
  form.elements.subject.addEventListener('change', () => {
    const custom = form.elements.subject.value === customOption;
    $('custom-subject-row').hidden = !custom;
    if (custom) $('custom-subject').focus();
  });
  $('add-video').addEventListener('click',() => openEditor());
  $('close-editor').addEventListener('click',() => {if (!busy) editor.close();});
  $('cancel-remove').addEventListener('click',() => {if (!busy) removal.close();});
  $('remove-video').addEventListener('click',() => {
    if (busy || !editing) return;
    $('remove-title-name').textContent = editing.title;
    status('remove-error','');
    removal.showModal();
  });
  for (const dialog of [editor, removal]) dialog.addEventListener('cancel',event => {if (busy) event.preventDefault();});
  form.addEventListener('submit', event => {
    event.preventDefault();
    void withSaveError('editor-error', async () => {
      const data = Object.fromEntries(new FormData(form));
      await save({...data, category:editorValue('category'), subject:editorValue('subject'), action: editing ? 'edit' : 'create', id:editing?.id});
      editor.close();
      afterChange(t('视频已保存。','Video saved.'));
    });
  });
  $('confirm-remove').addEventListener('click',() => {
    void withSaveError('remove-error', async () => {
      if (!editing) return;
      await save({action:'remove',id:editing.id});
      removal.close();
      editor.close();
      afterChange(t('已从视频库移除。','Removed from the library.'));
    });
  });

  $('search').value = (initial.get('q') || '').slice(0, 120);
  syncType();
  renderFilters();
  void loadPage();
})();
