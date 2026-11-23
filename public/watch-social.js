(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('watch-video-social');
  const personal = $('watch-personal');
  const feed = $('watch-feed');
  if (!feed) return;
  const section = personal?.dataset.section;
  const videoId = video?.dataset.videoId;
  const more = $('watch-social-more');
  const status = $('watch-social-status');
  const feedback = $('watch-social-action-status') || status;
  const markRead = $('watch-mark-read');
  const zh = document.documentElement.lang === 'zh-CN';
  const t = (cn,en) => zh ? cn : en;
  const api = '/api/watch-preview/social';
  const date = new Intl.DateTimeFormat(zh?'zh-CN':'en-GB',{dateStyle:'medium',timeStyle:'short'});
  let cursor = null;
  let loading = false;
  let commentOperation;
  const pending = new WeakSet();

  function element(tag, label, className) {
    const node = document.createElement(tag);
    if (label !== undefined) node.textContent = label;
    if (className) node.className = className;
    return node;
  }
  function sourceLink(id) {
    return personal.dataset.base+'/videos/'+id+'?'+personal.dataset.query;
  }
  function time(value) {
    const node = element('time',date.format(new Date(value)),'muted');
    node.dateTime = value;
    return node;
  }
  async function request(params, body) {
    const url = api+(params ? '?'+params : '');
    const response = await fetch(url, body
      ? {method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}
      : {cache:'no-store'});
    const result = await response.json().catch(()=>null);
    if (response.status === 403) throw Error(t('请从 Tickminder 重新进入。','Reopen TickPlay from Tickminder.'));
    if (!response.ok || !result) throw Error(t('暂时无法完成，请重试。','Could not complete the request. Try again.'));
    return result;
  }

  async function act(button, task) {
    if (pending.has(button)) return;
    pending.add(button);
    button.disabled = true;
    feedback.textContent = '';
    try {await task();}
    catch(error) {feedback.textContent = error.message;}
    finally {button.disabled=false;pending.delete(button);}
  }

  function likeLabel(button, selected, likes) {
    button.textContent=t('点赞','Like')+' · '+likes;
    button.setAttribute('aria-pressed',String(selected));
  }
  function reaction(button, data) {
    const kind = data.kind;
    const apply = () => {
      if (kind === 'favorite') {
        button.textContent = data.selected ? t('已收藏','Saved to favorites') : t('收藏','Save to favorites');
        button.setAttribute('aria-pressed',String(data.selected));
      } else likeLabel(button,data.selected,data.likes);
    };
    apply();
    button.disabled = false;
    button.onclick = () => void act(button, async () => {
      const selected = !data.selected;
      await request(null,{action:kind,videoId,selected,id:data.id});
      data.selected = selected;
      data.likes += selected ? 1 : -1;
      apply();
    });
  }

  function commentCard(item) {
    const box = element('article',undefined,'watch-feed-card');
    const head = element('div',undefined,'watch-comment-heading');
    head.append(element('strong',item.author),time(item.createdAt));
    const body = element('p',item.body,'watch-comment-body');
    const actions = element('div',undefined,'watch-reaction-buttons');
    const like = element('button',undefined,'quiet-button');
    like.type = 'button';
    reaction(like,{kind:'likeComment',id:item.id,selected:Boolean(item.liked),likes:item.likes});
    actions.append(like);
    if (item.canRemove) {
      const remove = element('button',t('删除','Delete'),'quiet-button');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        if (!confirm(t('删除这条评论？','Delete this comment?'))) return;
        void act(remove, async () => {
          await request(null,{action:'removeComment',videoId,id:item.id});
          box.remove();
          if (!feed.children.length && !cursor) status.textContent=emptyMessage();
        });
      });
      actions.append(remove);
    }
    box.append(head,body,actions);
    return box;
  }

  function notificationCard(item) {
    const row = element('a',undefined,'watch-feed-card watch-notification');
    row.href = sourceLink(item.videoId);
    if (!item.readAt) row.classList.add('is-unread');
    const description = {
      like:t('赞了你的视频','liked your video'),
      comment:t('评论了你的视频','commented on your video'),
      'comment-like':t('赞了你的评论','liked your comment'),
    }[item.kind];
    row.append(element('strong',item.actor+' '+description),element('span',item.videoTitle),time(item.createdAt));
    return row;
  }

  function videoCard(item) {
    const row = element('a',undefined,'playlist-card');
    row.href = sourceLink(item.id);
    const thumbnail = element('img');
    thumbnail.src='https://i.ytimg.com/vi/'+item.youtubeId+'/mqdefault.jpg';
    thumbnail.alt='';
    thumbnail.loading='lazy';
    thumbnail.decoding='async';
    thumbnail.referrerPolicy='no-referrer';
    thumbnail.width=96;
    thumbnail.height=54;
    row.append(thumbnail,element('strong',item.title),element('span','▶'));
    return row;
  }

  function emptyMessage() {
    if (videoId) return t('还没有评论。','No comments yet.');
    if (section==='notifications') return t('暂时没有通知。','No notifications yet.');
    if (section==='favorites') return t('还没有收藏视频。','No saved videos yet.');
    return t('还没有发布视频。','No published videos yet.');
  }

  async function load(after) {
    if (loading) return;
    loading = true;
    feed.setAttribute('aria-busy','true');
    more.disabled = true;
    status.textContent = t('加载中…','Loading…');
    try {
      const params = new URLSearchParams(videoId ? {video:videoId} : {section});
      if (after) params.set('after',after);
      const data = await request(params);
      if (data.summary) {
        reaction($('watch-like'),{kind:'like',selected:Boolean(data.summary.liked),likes:data.summary.likes});
        reaction($('watch-favorite'),{kind:'favorite',selected:Boolean(data.summary.favorite),likes:0});
      }
      if (!after) feed.replaceChildren();
      const render = videoId ? commentCard : section==='notifications' ? notificationCard : videoCard;
      feed.append(...data.items.map(render));
      cursor = data.nextCursor;
      more.hidden = !cursor;
      status.textContent = feed.children.length ? '' : emptyMessage();
      if (markRead) markRead.hidden = !feed.children.length;
    } catch(error) {
      status.textContent = error.message;
      more.hidden = false;
    } finally {
      loading = false;
      more.disabled = false;
      feed.setAttribute('aria-busy','false');
    }
  }

  more.addEventListener('click',()=>void load(cursor));
  markRead?.addEventListener('click',()=>void act(markRead,async()=>{
    await request(null,{action:'readNotifications'});
    for (const item of feed.querySelectorAll('.is-unread')) item.classList.remove('is-unread');
  }));
  $('watch-comment-form')?.addEventListener('submit', event=>{
    event.preventDefault();
    const field=$('watch-comment');
    const text=field.value.trim();
    if (!text) {field.focus();return;}
    if (commentOperation?.text!==text) commentOperation={id:crypto.randomUUID(),text};
    const operation=commentOperation;
    void act($('watch-send-comment'),async()=>{
      await request(null,{action:'comment',videoId,...operation});
      commentOperation=undefined;
      if (field.value.trim()===text) field.value='';
      await load();
    });
  });
  void load();
})();
