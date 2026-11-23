import type {WatchVideo} from './watch-preview-video';
import {escapeWatchHtml as escapeHtml, watchPlaylistMarkup, type PlaylistSection} from './watch-playlists-page';
import {watchPersonalMarkup, watchPersonalMenu, watchVideoSocialMarkup, type WatchPersonalSection} from './watch-social-page';
import {watchPreviewBranding} from './watch-preview-config';

type Language = 'en' | 'zh';

const symbols = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  filter: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="M8 5v4m8 1v4m-5 1v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  appearance: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/>',
  back: '<path d="m12 5-7 7 7 7M5 12h14"/>',
};
function icon(name: keyof typeof symbols) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]}</svg>`;
}

export function watchPreviewPage(language: Language, managementUrl: string, entryPath: string, catalogUrl: string, theme: 'light' | 'dark' | null, video: WatchVideo | null | undefined, options: PlaylistSection & {canEditVideos: boolean; params: URLSearchParams; personal: WatchPersonalSection|null; name: string}) {
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;
  const management = escapeHtml(managementUrl);
  const playlistPage = options.playlists !== undefined || options.playlist !== undefined;
  const catalog = video === undefined && !playlistPage && !options.personal;
  const playlistTitle = options.playlist?.title || t('播放清单','Playlists');
  const base = entryPath.replace(/\/$/, '');
  const browsingParams = new URLSearchParams({lang:language});
  const from = options.params.get('from');
  if (from) browsingParams.set('from', from);
  const playlistPath = base + '/playlists';
  const menu = `<nav class="watch-section-nav" aria-label="${t('视频库菜单','Library navigation')}">
    <a class="quiet-button" href="${escapeHtml(entryPath+'?'+browsingParams)}" ${catalog ? 'aria-current="page"' : ''}>${t('视频库','Video library')}</a>
    <a class="quiet-button" href="${escapeHtml(playlistPath+'?'+browsingParams)}" ${playlistPage ? 'aria-current="page"' : ''}>${t('播放清单','Playlists')}</a>
    ${watchPersonalMenu(options.personal,base,browsingParams,t)}
   </nav>`;
  const title = video ? escapeHtml(video.title) : t('视频暂不可用', 'Video unavailable');
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
 <link rel="stylesheet" href="/watch-preview.css?v=cover-fit">
 <script defer src="/watch-preview.js?v=6"></script>
 ${playlistPage && options.canEditPlaylists ? '<script defer src="/watch-playlists.js?v=2"></script>' : ''}
 ${video || options.personal ? '<script defer src="/watch-social.js?v=1"></script>' : ''}
 ${playlistPage ? '<script defer src="/watch-more.js?v=1"></script>' : ''}
</head>
<body>
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
    <button type="button" class="icon-button" id="appearance" aria-label="${t('切换主题', 'Change appearance')}">${icon('appearance')}</button>
    <a class="back-link" href="${management}">${icon('back')}<span>${t('返回 Tickminder','Back to Tickminder')}</span></a>
   </div>
  </div>
 </header>
 <main class="watch-main">
  ${(catalog || playlistPage || options.personal) ? menu : ''}
  ${options.personal ? watchPersonalMarkup(options.personal, options.name, base, browsingParams, t) : playlistPage ? watchPlaylistMarkup(options, base, browsingParams, t, icon('close')) : catalog ? `<section aria-labelledby="library-title">
   <div class="library-head">
    <div>
     <h1 id="library-title">${t('视频库','Video library')}</h1>
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
   ${video ? `<div id="player" class="player">
    <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(video.youtubeId)}?rel=0&amp;playsinline=1"
     title="${title}" allow="encrypted-media; picture-in-picture; fullscreen"
     referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
   </div>` : ''}
   <h1 id="player-title">${title}</h1>
   ${metadata ? `<p id="player-meta" class="muted">${metadata}</p>` : ''}
   ${video ? watchVideoSocialMarkup(video.id,t) : ''}
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
