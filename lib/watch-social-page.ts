import {escapeWatchHtml as escape} from './watch-playlists-page';

const sections = ['account','my-videos','favorites','notifications'] as const;
export type WatchPersonalSection = typeof sections[number];
type Translate = (zh:string,en:string)=>string;
export function watchPersonalSection(value: string | null): WatchPersonalSection | null {
  return sections.find(section => section === value) ?? null;
}

export function watchPersonalMenu(current: WatchPersonalSection | null, base: string, params: URLSearchParams, t: Translate) {
  return `<a class="quiet-button" href="${escape(base+'/account?'+params)}" ${current && current!=='notifications' ? 'aria-current="page"' : ''}>${t('我的账号','My account')}</a>
   <a class="quiet-button" href="${escape(base+'/notifications?'+params)}" ${current==='notifications' ? 'aria-current="page"' : ''}>${t('通知','Notifications')}</a>`;
}

export function watchPersonalMarkup(section: WatchPersonalSection, name: string, base: string, params: URLSearchParams, t: Translate) {
  const items = [
    ['account','/account',t('个人资料','Profile')],
    ['my-videos','/account/videos',t('我发布的视频','My published videos')],
    ['favorites','/favorites',t('我的收藏','Favorites')],
  ];
  const heading = section === 'notifications' ? t('通知','Notifications') : items.find(item=>item[0]===section)![2];
  return `<section aria-labelledby="watch-account-title" id="watch-personal" data-section="${section}" data-base="${escape(base)}" data-query="${escape(params.toString())}">
   <div class="library-head">
    <h1 id="watch-account-title">${heading}</h1>
    ${section==='notifications' ? `<button type="button" id="watch-mark-read" class="quiet-button" hidden>${t('全部标为已读','Mark all as read')}</button>` : ''}
   </div>
   ${section==='notifications' ? '' : `<nav class="watch-account-tabs" aria-label="${t('账号菜单','Account menu')}">
    ${items.map(([id,path,label])=>`<a class="quiet-button" href="${escape(base+path+'?'+params)}" ${section===id?'aria-current="page"':''}>${label}</a>`).join('')}
   </nav>`}
   ${section==='account' ? `<div class="watch-personal-profile"><strong>${escape(name || 'TickPlay')}</strong></div>` : listMarkup(t)}
  </section>`;
}

function listMarkup(t: Translate) {
  return `<div class="watch-feed" id="watch-feed" aria-busy="true"></div>
   <p id="watch-social-status" class="muted" role="status"></p>
   <button type="button" id="watch-social-more" class="quiet-button" hidden>${t('加载更多','Load more')}</button>`;
}

export function watchVideoSocialMarkup(videoId: string, t: Translate) {
  return `<section class="watch-video-social" id="watch-video-social" data-video-id="${videoId}" aria-labelledby="watch-comments-title">
    <div class="watch-reaction-buttons">
     <button type="button" id="watch-like" class="quiet-button" aria-pressed="false" disabled>${t('点赞','Like')}</button>
     <button type="button" id="watch-favorite" class="quiet-button" aria-pressed="false" disabled>${t('收藏','Save to favorites')}</button>
    </div>
    <h2 id="watch-comments-title">${t('评论','Comments')}</h2>
    <form id="watch-comment-form">
     <label for="watch-comment">${t('写评论','Write a comment')}</label>
     <textarea id="watch-comment" name="comment" maxlength="1000" rows="3" required></textarea>
     <button type="submit" class="primary-button" id="watch-send-comment">${t('发表评论','Post comment')}</button>
    </form>
    <p id="watch-social-action-status" class="muted" role="status"></p>
    ${listMarkup(t)}
  </section>`;
}
