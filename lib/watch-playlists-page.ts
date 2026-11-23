import type {WatchPlaylist, WatchPlaylistDetail} from './watch-playlists-server';

export type PlaylistSection = {
  canEditPlaylists: boolean;
  playlists?: {playlists: WatchPlaylist[]; previousCursor: string | null; nextCursor: string | null};
  playlist?: WatchPlaylistDetail | null;
};

export const escapeWatchHtml = (value: string) =>
  value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');

export function watchPlaylistMarkup(options: PlaylistSection, base: string, params: URLSearchParams,
  t: (zh: string, en: string) => string, closeIcon: string) {
  const e = escapeWatchHtml;
  const path = base + '/playlists';
  const url = path + '?' + params;
  const action = (label: string) => `<button type="button" class="primary-button" id="open-playlist-editor">${label}</button>`;
  const back = `<a class="quiet-button" href="${e(url)}">${t('‹ 全部播放清单','‹ All playlists')}</a>`;
  const playlist = options.playlist;
  let markup: string;
  if (options.playlists) {
    const {playlists, previousCursor, nextCursor} = options.playlists;
    const pageLink = (cursor: string, direction: string, label: string) => {
      const page = new URLSearchParams(params);
      page.set(direction, cursor);
      return `<a class="quiet-button" ${direction==='after'?'data-watch-more':''} href="${e(path+'?'+page)}">${label}</a>`;
    };
    const cards = playlists.map(item => `<a class="playlist-card" href="${e(path+'/'+item.id+'?'+params)}">
      <h2>${e(item.title)}</h2><span aria-hidden="true">›</span></a>`).join('');
    markup = `<section aria-labelledby="playlist-title"><div class="library-head">
     <h1 id="playlist-title">${t('播放清单','Playlists')}</h1>
     ${options.canEditPlaylists ? action(t('创建播放清单','Create playlist')) : ''}
    </div>
    ${cards ? `<div class="playlist-grid" data-watch-batch>${cards}</div>` : `<p class="empty-library">${t('还没有播放清单。','No playlists yet.')}</p>`}
    ${previousCursor || nextCursor ? `<nav class="catalog-pages" aria-label="${t('播放清单分页','Playlist pages')}">
     ${previousCursor ? pageLink(previousCursor, 'before', t('‹ 上一页','‹ Previous')) : ''}
     ${nextCursor ? pageLink(nextCursor, 'after', t('加载更多','Load more')) : ''}
    </nav><p id="watch-batch-status" class="muted" role="status"></p>` : ''}
    </section>`;
  } else if (playlist) {
    const query = new URLSearchParams(params);
    query.set('playlist', playlist.id);
    const next = new URLSearchParams(params);
    if (playlist.nextPosition !== null) next.set('position',String(playlist.nextPosition));
    const videos = playlist.videos.map(video => `<li data-video-id="${video.id}">
      <a class="playlist-card" href="${e(base+'/videos/'+video.id+'?'+query)}">
       <img src="https://i.ytimg.com/vi/${e(video.youtubeId)}/mqdefault.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="96" height="54">
       <strong>${e(video.title)}</strong><span aria-hidden="true">▶</span>
      </a></li>`).join('');
    markup = `<section aria-labelledby="playlist-title" id="playlist-detail" data-id="${playlist.id}" data-revision="${playlist.revision}">
     ${back}<div class="library-head playlist-detail-heading">
      <h1 id="playlist-title">${e(playlist.title)}</h1>
      ${options.canEditPlaylists ? action(t('编辑播放清单','Edit playlist')) : ''}
     </div>
     ${videos ? `<ol class="playlist-videos" data-watch-batch>${videos}</ol>`
       : `<p class="empty-library">${t('这个播放清单暂时没有视频。','This playlist has no available videos.')}</p>`}
     ${playlist.nextPosition !== null ? `<div class="catalog-pages"><a class="quiet-button" data-watch-more href="${e(path+'/'+playlist.id+'?'+next)}">${t('加载更多','Load more')}</a></div><p id="watch-batch-status" class="muted" role="status"></p>` : ''}
    </section>`;
  } else {
    return `<section>${back}<h1 id="playlist-title">${t('找不到播放清单','Playlist unavailable')}</h1></section>`;
  }

  if (!options.canEditPlaylists) return markup;
  return markup + `<dialog id="playlist-editor" aria-labelledby="playlist-editor-title" data-playlist-url="${e(url)}" data-entry="${e(path)}">
   <form id="playlist-form">
    <header class="dialog-head">
     <h2 id="playlist-editor-title">${playlist ? t('编辑播放清单','Edit playlist') : t('创建播放清单','Create playlist')}</h2>
     <button type="button" class="icon-button" id="close-playlist-editor" aria-label="${t('关闭','Close')}">${closeIcon}</button>
    </header>
    <div class="editor-fields playlist-editor-fields">
     <label>${t('清单名称','Playlist name')}<input name="title" maxlength="120" required autofocus></label>
     <section class="playlist-editor-section" aria-labelledby="playlist-order-title">
      <h3 id="playlist-order-title">${t('播放顺序','Play order')}</h3>
      <ol id="playlist-selection" class="playlist-selection"></ol>
     </section>
     <section class="playlist-editor-section" aria-labelledby="playlist-picker-title">
      <h3 id="playlist-picker-title">${t('从视频库加入','Add from library')}</h3>
      <label>${t('搜索视频','Search videos')}<input type="search" maxlength="120" id="playlist-search"></label>
      <ul id="playlist-picker" class="playlist-picker"></ul>
      <p id="playlist-picker-status" class="muted" role="status"></p>
      <button type="button" class="quiet-button" id="playlist-more" hidden>${t('更多视频','More videos')}</button>
     </section>
     <p id="playlist-error" class="inline-error" role="alert" hidden></p>
    </div>
    <footer class="dialog-actions">
     ${playlist ? `<button type="button" class="danger-button" id="remove-playlist">${t('删除播放清单','Delete playlist')}</button>` : ''}
     <button type="submit" class="primary-button" id="save-playlist">${t('保存','Save')}</button>
    </footer>
   </form>
  </dialog>`;
}
