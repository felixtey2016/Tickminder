import type {WatchVideo} from './watch-preview-video';
import {escapeWatchHtml as escapeHtml, watchPlaylistMarkup, type PlaylistSection} from './watch-playlists-page';
import {watchPersonalMarkup, watchPersonalMenu, watchVideoSocialMarkup, type WatchPersonalSection} from './watch-social-page';
import {watchPreviewBranding} from './watch-preview-config';
import {tickLearnFreeDailyVideoLimit} from './ticklearn-free';
import {tickLearnNavStyles,tickLearnSessionScript,tickLearnNavItems,tickMinderReturnItem} from './ticklearn-navigation';

import {preferencesCopy,preferencesLanguageNames} from './ticklearn-preferences';
import type {TickMinderEntry} from './ticklearn-routes';

type Language = 'en' | 'zh';

const symbols = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  filter: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="M8 5v4m8 1v4m-5 1v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  preferences: '<path d="M3 5h7m4 0h7M3 12h3m4 0h11M3 19h11m4 0h3M10 3v4M6 10v4m8 3v4"/>',
  back: '<path d="m12 5-7 7 7 7M5 12h14"/>',
  settings: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2"/>',
};
function icon(name: keyof typeof symbols) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]}</svg>`;
}

export function watchPreviewPage(language: Language, managementUrl: string, entryPath: string, catalogUrl: string, theme: 'light' | 'dark' | null, video: WatchVideo | null | undefined, options: PlaylistSection & {canEditVideos: boolean; params: URLSearchParams; personal: WatchPersonalSection|null; name: string; freeQuota?: {remaining?: number; blocked: boolean}; learning?:boolean; minderEntry?:TickMinderEntry}) {
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;
  const management = escapeHtml(managementUrl);
  const preferences = preferencesCopy[language];
  const back = tickMinderReturnItem(language,options.minderEntry);
  const backLabel = escapeHtml(back?.name??t('返回','Back'));
  const dailyLimit = tickLearnFreeDailyVideoLimit;
  const remaining = options.freeQuota?.remaining;
  const blocked = options.freeQuota?.blocked;
  const playlistPage = options.playlists !== undefined || options.playlist !== undefined;
  const catalog = video === undefined && !playlistPage && !options.personal;
  const playlistTitle = options.playlist?.title || t('播放清单','Playlists');
  const base = entryPath.replace(/\/$/, '');
  const browsingParams = new URLSearchParams({lang:language});
  const from = options.params.get('from');
  if (from) browsingParams.set('from', from);
  if (options.learning) browsingParams.set('learn','1');
  if (options.minderEntry) browsingParams.set('minderFrom', options.minderEntry);
  const playlistPath = base + '/playlists';
  const menu = `<nav class="watch-section-nav" aria-label="${t('视频库菜单','Library navigation')}">
    <a class="quiet-button" href="${escapeHtml(entryPath+'?'+browsingParams)}" ${catalog ? 'aria-current="page"' : ''}>${t('视频库','Video library')}</a>
    ${options.freeQuota ? '' : `<a class="quiet-button" href="${escapeHtml(playlistPath+'?'+browsingParams)}" ${playlistPage ? 'aria-current="page"' : ''}>${t('播放清单','Playlists')}</a>`}
    ${watchPersonalMenu(options.personal,base,browsingParams,t)}
   </nav>`;
  const title = blocked ? t('今日免费视频额度已用完', 'Daily free video limit reached')
    : video ? escapeHtml(video.title) : t('视频暂不可用', 'Video unavailable');
  const metadata = video && escapeHtml([video.category, video.subject, video.chapter].filter(Boolean).join(' · '));
  return `<!doctype html>
<html lang="${language === 'zh' ? 'zh-CN' : 'en'}"${theme ? ` data-theme="${theme}"` : ''}>
<head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
 <meta name="robots" content="noindex, nofollow">
 <meta name="color-scheme" content="light dark">
 <title>${catalog || options.personal ? 'TickPlay' : (playlistPage ? escapeHtml(playlistTitle) : title) + ' · TickPlay'}</title>
 <link rel="icon" href="${watchPreviewBranding.favicon}" type="image/png" sizes="64x64">
 <link rel="stylesheet" href="/watch-preview.css?v=center-pagination">
 <link rel="stylesheet" href="${tickLearnNavStyles}">
 <script defer src="${tickLearnSessionScript}"></script>
 <script defer src="/watch-preview.js?v=preferences-menu"></script>
 ${playlistPage && options.canEditPlaylists ? '<script defer src="/watch-playlists.js?v=2"></script>' : ''}
 ${(video && !blocked) || options.personal ? '<script defer src="/watch-social.js?v=1"></script>' : ''}
 ${playlistPage ? '<script defer src="/watch-more.js?v=1"></script>' : ''}
</head>
<body${options.learning?' class="ticklearn-app-view"':''}>
 ${options.learning?`<nav class="ticklearn-product-nav" aria-label="TickLearn">
  ${tickLearnNavItems(language,options.minderEntry).map(({key,name,href,logo})=>`<a href="${escapeHtml(href)}" ${key==='play'?'aria-current="page"':''}>${logo?`<img class="${key==='home'?'ticklearn-nav-home':''}" src="${logo}" width="100" height="38" alt="">`:`<span class="ticklearn-nav-settings">${icon('settings')}</span>`}<span>${name}</span></a>`).join('')}
 </nav>`:''}
 <header class="watch-bar">
  <div class="watch-bar-inner" data-view="${catalog ? 'catalog' : 'video'}">
   <a class="brand" href="${management}">
    <img src="${watchPreviewBranding.logo}" alt="TickPlay" width="1370" height="552">
   </a>
   ${catalog ? `<form id="search-form" class="search-field" role="search">
    ${icon('search')}<input id="search" type="search" maxlength="120"
     placeholder="${t('搜索视频、科目或章节', 'Search videos, subjects or chapters')}"
     aria-label="${t('搜索视频', 'Search videos')}" autocomplete="off">
   </form>` : ''}
   <div class="bar-actions">
    <button type="button" class="ticklearn-preferences-trigger" id="watch-preferences" aria-haspopup="dialog" aria-label="${preferences.title}" title="${preferences.title}">${icon('preferences')}</button>
    <dialog class="ticklearn-preferences-dialog" id="watch-preferences-dialog" aria-labelledby="watch-preferences-title">
     <div class="ticklearn-preferences-panel">
      <div class="ticklearn-preferences-heading">
       <h2 id="watch-preferences-title">${preferences.title}</h2>
       <button type="button" class="ticklearn-preferences-close" aria-label="${preferences.close}">${icon('close')}</button>
      </div>
      <fieldset class="ticklearn-preferences-options">
       <legend>${preferences.language}</legend>
       ${(['zh','en'] as const).map(item=>`<button type="button" data-language="${item}" aria-pressed="${item===language}">${preferencesLanguageNames[item]}</button>`).join('')}
      </fieldset>
      <fieldset class="ticklearn-preferences-options">
       <legend>${preferences.appearance}</legend>
       <button type="button" data-appearance="light" aria-pressed="${theme!=='dark'}">${preferences.light}</button>
       <button type="button" data-appearance="dark" aria-pressed="${theme==='dark'}">${preferences.dark}</button>
      </fieldset>
     </div>
    </dialog>
    ${options.learning?`<span class="ticklearn-back-slot"><a class="ticklearn-back-button${back?' ticklearn-back-button--minder':''}" href="${back ? escapeHtml(back.href) : management}" aria-label="${backLabel}" title="${backLabel}">${icon('back')}${back?`<span>${backLabel}</span>`:''}</a></span>`:
`<a class="back-link" href="${management}">${icon('back')}<span>${t('返回 Tickminder','Back to Tickminder')}</span></a>`}
   </div>
  </div>
 </header>
 <main class="watch-main">
  ${(catalog || playlistPage || options.personal) ? menu : ''}
  ${options.personal ? watchPersonalMarkup(options.personal, options.name, base, browsingParams, t) : playlistPage ? watchPlaylistMarkup(options, base, browsingParams, t, icon('close')) : catalog ? `<section aria-labelledby="library-title">
   <div class="library-head">
    <div>
     <h1 id="library-title">${t('视频库','Video library')}</h1>
     ${remaining === undefined ? '' : `<p class="muted">${t(`免费方案 · 今日还可看 ${remaining} / ${dailyLimit} 部新视频`, `Free plan · ${remaining} of ${dailyLimit} new videos left today`)}</p>`}
    </div>
    ${options.canEditVideos ? `<button type="button" class="primary-button" id="add-video">${icon('plus')}${t('添加视频','Add video')}</button>` : ''}
   </div>
   <div class="filter-bar">
    <div class="segmented" id="video-types" role="group" aria-label="${t('视频类型','Video type')}">
     <button type="button" data-type="" aria-pressed="true">${t('全部','All')}</button>
     <button type="button" data-type="lesson" aria-pressed="false">${t('视频','Videos')}</button>
     <button type="button" data-type="short" aria-pressed="false">${t('短视频','Shorts')}</button>
    </div>
    <button type="button" class="filter-button" id="show-filters" aria-controls="filter-panel" aria-expanded="false">${icon('filter')}${t('筛选','Filters')}<span id="filter-count" hidden></span></button>
   </div>
   <div id="filter-panel" class="filter-panel" hidden>
    <div id="filter-fields"></div>
    <button type="button" id="clear-filters" class="quiet-button">${t('清除筛选','Clear filters')}</button>
   </div>
   <div class="results-heading"><h2>${t('视频','Videos')}</h2><p id="result-count" class="muted" role="status"></p></div>
   <p id="notice" class="notice" role="status" hidden></p>
   <div id="video-grid" class="video-grid" data-entry="${escapeHtml(entryPath)}" aria-busy="true"></div>
   <nav id="catalog-pages" class="catalog-pages" aria-label="${t('视频分页','Video pages')}" hidden>
    <a id="previous-page" class="quiet-button">${t('‹ 上一页','‹ Previous')}</a>
    <a id="next-page" class="quiet-button">${t('加载更多','Load more')}</a>
   </nav>
  </section>
  ` : `<section id="player-section" class="player-section" data-type="${video?.kind ?? ''}" aria-labelledby="player-title">
   <a href="${escapeHtml(catalogUrl)}" id="back-library" class="quiet-button">${new URL(catalogUrl).pathname.startsWith(playlistPath+'/') ? t('‹ 返回播放清单','‹ Back to playlist') : t('‹ 返回视频库', '‹ Back to library')}</a>
   ${video && !blocked ? `<div id="player" class="player">
    <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(video.youtubeId)}?rel=0&amp;playsinline=1"
     title="${title}" allow="encrypted-media; picture-in-picture; fullscreen"
     referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
   </div>` : ''}
   <h1 id="player-title">${title}</h1>
   ${blocked ? `<p class="notice" role="status">${t(
     `今天的 ${dailyLimit} 部免费视频额度已用完。今天看过的视频仍可重看，额度会在马来西亚时间午夜重置。`,
     `You’ve used your ${dailyLimit} free videos for today. You can rewatch them, and your limit resets at midnight Malaysia time.`,
   )}</p>` : ''}
   ${metadata && !blocked ? `<p id="player-meta" class="muted">${metadata}</p>` : ''}
   ${video && !blocked ? watchVideoSocialMarkup(video.id,t) : ''}
  </section>`}
 </main>
 ${catalog && options.canEditVideos ? `<dialog id="video-editor" aria-labelledby="editor-title">
  <form id="editor-form">
   <header class="dialog-head"><h2 id="editor-title">${t('添加视频','Add video')}</h2>
    <button type="button" class="icon-button" id="close-editor" aria-label="${t('关闭','Close')}">${icon('close')}</button>
   </header>
   <div class="editor-fields">
    <label>${t('标题','Title')}<input name="title" maxlength="120" required autofocus></label>
    <label>${t('YouTube 链接','YouTube link')}<input name="url" type="url" inputmode="url" maxlength="500" required></label>
    <details id="optional-fields">
     <summary>${t('分类、科目与章节（选填）','Category, subject and chapter (optional)')}</summary>
     <p id="academic-status" class="muted" role="status" hidden></p>
     <button type="button" id="retry-academic" class="quiet-button" hidden>${t('重试','Retry')}</button>
     <label>${t('分类 / 课程体系','Category / curriculum')}<select name="category"></select></label>
     <label id="custom-category-row" hidden>${t('自定义分类','Custom category')}<input id="custom-category" maxlength="48"></label>
     <label>${t('科目','Subject')}<select name="subject"></select></label>
     <label id="custom-subject-row" hidden>${t('自定义科目','Custom subject')}<input id="custom-subject" maxlength="48"></label>
     <label>${t('章节','Chapter')}<input name="chapter" maxlength="80"></label>
    </details>
    <p id="editor-error" class="inline-error" role="alert" hidden></p>
   </div>
   <footer class="dialog-actions">
    <button type="button" class="danger-button" id="remove-video" hidden>${t('移除视频','Remove video')}</button>
    <button type="submit" class="primary-button" id="save-video">${t('添加视频','Add video')}</button>
   </footer>
  </form>
 </dialog>
 <dialog id="remove-dialog" aria-labelledby="remove-title"><div class="remove-form">
  <header class="dialog-head"><h2 id="remove-title">${t('从视频库移除？','Remove from library?')}</h2>
   <button type="button" class="icon-button" id="cancel-remove" aria-label="${t('关闭','Close')}">${icon('close')}</button>
  </header>
  <p id="remove-title-name"></p>
  <p id="remove-error" class="inline-error" role="alert" hidden></p>
  <footer class="dialog-actions"><button type="button" class="danger-button" id="confirm-remove">${t('移除','Remove')}</button></footer>
 </div></dialog>` : ''}
</body>
</html>`;
}
