import {tickLearnFreeUnlimited} from '@/lib/ticklearn-free';
import {env} from 'cloudflare:workers';
import {WatchPreviewConfig, watchPreviewConfig} from '@/lib/watch-preview-config';
import {
  CHALLENGE_COOKIE, WATCH_COOKIE, WATCH_MAX_AGE, createWatchVideo, currentWatchViewer, currentWatchSession,
  deleteWatchVideo, editWatchVideo, issueWatchHandoff, redeemWatchHandoff, setWatchCookie, validWatchToken, watchCookie,
  openFreeWatchVideo, remainingFreeWatchVideos, watchToken, watchVideoDetail, watchVideoFacets, watchVideoList,
} from '@/lib/watch-preview-server';
import {canEditWatchPlaylist, removeWatchPlaylist, saveWatchPlaylist, watchPlaylistDetail, watchPlaylistEdit, watchPlaylists} from '@/lib/watch-playlists-server';
import {addWatchComment, markWatchNotificationsRead, removeWatchComment, setWatchCommentLike, setWatchVideoReaction,
  watchCommentText, watchNotifications, watchPersonalVideos, watchVideoActivity} from '@/lib/watch-social-server';
import {watchPersonalSection} from '@/lib/watch-social-page';
import {watchPreviewPage} from '@/lib/watch-preview-page';
import {validWatchVideoId, watchCatalogParams, watchVideoFields, watchVideoFilters} from '@/lib/watch-preview-video';

import {readAcademicCatalogue} from '@/lib/academic-catalogue-server';
import {catalogueKey} from '@/lib/academic-catalogue';
import {currentIdentity} from '@/lib/auth';
import {tickLearnHomeItem} from '@/lib/ticklearn-navigation';
import {tickLearnAuthLink,tickLearnStudyOrigin,tickMinderEntry} from '@/lib/ticklearn-routes';

const headers = {'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY'};
const json = (data: unknown, status = 200) => Response.json(data, {status, headers});
type Context = {params: Promise<{action: string}>};
const path = '/api/watch-preview/';
const themeName = '__Host-tickminder_watch_theme';
const learnModeCookie = '__Host-ticklearn_watch_mode';
const readTheme = (value: string | null) => value === 'light' || value === 'dark' ? value : null;
const themeCookie = (theme: 'light' | 'dark') => `${themeName}=${theme}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`;
function redirect(url: string, cookies: string[] = []) {
  const responseHeaders = new Headers({...headers, Location:url});
  for (const cookie of cookies) responseHeaders.append('Set-Cookie', cookie);
  return new Response(null, {status:303,headers:responseHeaders});
}
function watchEntry(config: WatchPreviewConfig, params: URLSearchParams, videoId: string | null = null,
  playlistId: string | null = null, playlists = false, personal: ReturnType<typeof watchPersonalSection> = null) {
  const url = new URL(config.entry);
  const base = config.entryPath.replace(/\/$/, '');
  url.search = params.toString();
  if (videoId) {
    url.pathname = base + '/videos/' + videoId;
    if (playlistId) url.searchParams.set('playlist', playlistId);
  } else if (personal) {
    url.pathname = base + (personal === 'my-videos' ? '/account/videos' : '/' + personal);
  } else if (playlists || playlistId) {
    url.pathname = base + '/playlists' + (playlistId ? '/' + playlistId : '');
  }
  return url.href;
}
async function viewer(request: Request, config: WatchPreviewConfig) {
  return config.splitOrigin ? currentWatchSession(request) : currentWatchViewer();
}

async function watchAcademicOptions() {
  const catalogues = await Promise.all([readAcademicCatalogue('quiz'), readAcademicCatalogue('student')]);
  const options = new Map<string, {name:string; subjects:Map<string,string>}>();
  for (const {syllabuses} of catalogues) for (const {name, active, subjects} of syllabuses) {
    if (!active || name.length > watchVideoFilters.category) continue;
    const key = catalogueKey(name);
    const option = options.get(key) ?? {name, subjects:new Map<string,string>()};
    options.set(key, option);
    for (const subject of subjects) if (subject.active && subject.name.length <= watchVideoFilters.subject) {
      const subjectKey = catalogueKey(subject.name);
      if (!option.subjects.has(subjectKey)) option.subjects.set(subjectKey, subject.name);
    }
  }
  return [...options.values()].map(({name, subjects}) => ({name, subjects:[...subjects.values()]}));
}

export async function GET(request: Request, {params}: Context) {
  const config = watchPreviewConfig(env);
  if (!config) return json({error:'notFound'},404);
  const url = new URL(request.url);
  const catalogParams = watchCatalogParams(url.searchParams);
  const learnMode = url.searchParams.get('learn')==='1' ||
    !url.searchParams.has('enter') && watchCookie(request,learnModeCookie)==='1';
  const minderEntry = learnMode ? tickMinderEntry(url.searchParams.get('minderFrom')) : undefined;
  if(learnMode)catalogParams.set('learn','1');
  if(minderEntry)catalogParams.set('minderFrom',minderEntry);
  const lang = catalogParams.get('lang') === 'en' ? 'en' : 'zh';
  const from = url.searchParams.get('from');
  const appOrigin = learnMode && config.appOrigins.has(tickLearnStudyOrigin) ? tickLearnStudyOrigin :
    from && from !== tickLearnStudyOrigin && config.appOrigins.has(from) ? from : config.app;
  if (appOrigin !== config.app) catalogParams.set('from', appOrigin);
  const id = url.searchParams.get('video');
  const videoId = validWatchVideoId(id) ? id : null;
  const requestedTheme = readTheme(url.searchParams.get('theme'));
  const {action} = await params;
  const personal = watchPersonalSection(['authorize','redeem'].includes(action) ? url.searchParams.get('panel') : action);
  const page = Boolean(personal) || ['view','video','playlists','playlist'].includes(action);
  const rawPlaylistId = url.searchParams.get('playlist');
  const playlistId = validWatchVideoId(rawPlaylistId) ? rawPlaylistId : null;
  const playlistIndex = action === 'playlists' || ['authorize','redeem'].includes(action) && url.searchParams.get('section') === 'playlists';
  const handoffParams = new URLSearchParams(catalogParams);
  if (videoId) handoffParams.set('video', videoId);
  if (playlistId) handoffParams.set('playlist', playlistId);
  if (playlistIndex) handoffParams.set('section', 'playlists');
  if (personal) handoffParams.set('panel', personal);
  if (requestedTheme) handoffParams.set('theme', requestedTheme);
  try {
    if (action === 'authorize' && config.splitOrigin && config.appOrigins.has(url.origin)) {
      const challenge = url.searchParams.get('challenge');
      if (!validWatchToken(challenge)) return json({error:'invalidLink'},400);
      const account = await currentWatchViewer();
      if (!account) {
        if(await currentIdentity())return json({error:'signIn'},403);
        return redirect(tickLearnAuthLink(watchEntry(config,catalogParams,videoId,playlistId,playlistIndex,personal),lang));
      }
      const code = await issueWatchHandoff(account, challenge);
      handoffParams.set('code', code);
      return redirect(config.watch + path + 'redeem?' + handoffParams);
    }
    if (url.origin !== config.watch) return json({error:'notFound'},404);
    if (action === 'redeem' && config.splitOrigin) {
      const code = url.searchParams.get('code');
      const challenge = watchCookie(request, CHALLENGE_COOKIE);
      if (!validWatchToken(code) || !validWatchToken(challenge)) return json({error:'invalidLink'},401);
      const session = await redeemWatchHandoff(code, challenge);
      if (!session) return json({error:'invalidLink'},401);
      return redirect(watchEntry(config, catalogParams, videoId, playlistId, playlistIndex, personal), [
        setWatchCookie(CHALLENGE_COOKIE, '', 0),
        setWatchCookie(WATCH_COOKIE, session, WATCH_MAX_AGE),
        setWatchCookie(learnModeCookie,learnMode?'1':'',learnMode?WATCH_MAX_AGE:0),
        ...(requestedTheme ? [themeCookie(requestedTheme)] : []),
      ]);
    }
    if (!page && !['catalog','facets','academic-options','social','playlist-editor'].includes(action)) return json({error:'notFound'},404);
    if (action === 'view' && videoId) return redirect(watchEntry(config, catalogParams, videoId));
    if ((action === 'video' && !videoId) || (action === 'playlist' && !playlistId)) return json({error:'notFound'},404);
    const entering = page && url.searchParams.get('enter') === '1';
    const account = config.splitOrigin && entering ? null : await viewer(request, config);
    if (!account && config.splitOrigin && page) {
      const challenge = watchToken();
      handoffParams.set('challenge', challenge);
      return redirect(appOrigin + path + 'authorize?' + handoffParams,
        [setWatchCookie(CHALLENGE_COOKIE, challenge, 120)]);
    }
    if (!account) return json({error:'signIn'},403);
    const free = account.role==='learner';
    if(free&&['playlists','playlist','playlist-editor'].includes(action)) {
      return page ? redirect(watchEntry(config,catalogParams)) : json({error:'forbidden'},403);
    }
    if (action === 'catalog') return json(await watchVideoList(account.groupId, catalogParams,free));
    if (action === 'social') {
      const after = catalogParams.get('after');
      if (url.searchParams.get('section') === 'notifications') return json(await watchNotifications(account, after));
      if (url.searchParams.get('section') === 'favorites') return json(await watchPersonalVideos(account, after, true));
      if (url.searchParams.get('section') === 'my-videos') return json(await watchPersonalVideos(account, after, false));
      if (!videoId) return json({error:'notFound'},404);
      if (free && !await watchVideoDetail(account.groupId,videoId,true)) return json({error:'notFound'},404);
      const activity = await watchVideoActivity(account, videoId, after);
      return activity ? json(activity) : json({error:'notFound'},404);
    }
    if (action === 'playlist-editor') {
      if (!playlistId || !canEditWatchPlaylist(account)) return json({error:'forbidden'},403);
      const playlist = await watchPlaylistDetail(account.groupId, playlistId, 0, true);
      if (!playlist || !canEditWatchPlaylist(account, playlist)) return json({error:'notFound'},404);
      return json({videos:playlist.videos.map(({id,title})=>({id,title}))});
    }
    if (action === 'academic-options') {
      if (account.role !== 'admin') return json({error:'forbidden'},403);
      return json({syllabuses:await watchAcademicOptions()});
    }
    if (action === 'facets') return json({facets:await watchVideoFacets(account.groupId,free)});
    if (requestedTheme) return redirect(watchEntry(config, catalogParams, videoId, playlistId, playlistIndex, personal), [themeCookie(requestedTheme)]);
    const video = action === 'video' && videoId ? await watchVideoDetail(account.groupId, videoId,free) : undefined;
    const unlimited = free && tickLearnFreeUnlimited();
    const quotaBlocked = free && !unlimited && video && request.method === 'GET'
      ? !await openFreeWatchVideo(account.accountId, video.id)
      : false;
    const remaining = free && !unlimited && action === 'view' ? await remainingFreeWatchVideos(account.accountId) : undefined;
    const playlists = action === 'playlists' ? await watchPlaylists(account.groupId, catalogParams) : undefined;
    const position = Number(url.searchParams.get('position'));
    const offset = Number.isSafeInteger(position) && position >= 0 && position <= 100 ? position : 0;
    const playlist = action === 'playlist' && playlistId ? await watchPlaylistDetail(account.groupId, playlistId, offset) : undefined;
    const theme = readTheme(watchCookie(request,'ticklearn_theme')) || readTheme(watchCookie(request,themeName));
    const catalogUrl = watchEntry(config, catalogParams, null, videoId ? playlistId : null);
    const learning = learnMode || free;
    const managementUrl = learning ? tickLearnHomeItem(lang,minderEntry).href : appOrigin+(account.role==='admin'?'/manage':'/');
    const html = watchPreviewPage(lang, managementUrl, config.entryPath, catalogUrl, theme, video, {
      freeQuota: free ? {remaining, blocked:quotaBlocked, unlimited} : undefined,
      learning, minderEntry,
      canEditVideos: account.role === 'admin',
      canEditPlaylists: playlist !== null && canEditWatchPlaylist(account, playlist),
      playlists, playlist, params:catalogParams, personal, name:account.name || '',
    });
    const framePolicy = video && !quotaBlocked ? 'https://www.youtube-nocookie.com' : "'none'";
    return new Response(html, {status:quotaBlocked ? 429 : video === null || playlist === null ? 404 : 200, headers:{
      ...headers, 'Content-Type':'text/html; charset=utf-8',
      'Referrer-Policy':'strict-origin-when-cross-origin',
      'Content-Security-Policy':`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://i.ytimg.com; frame-src ${framePolicy}; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`,
    }});
  } catch {
    return json({error:'unavailable'},503);
  }
}

export async function POST(request: Request, {params}: Context) {
  const config = watchPreviewConfig(env);
  const url = new URL(request.url);
  const {action} = await params;
  if (!config || url.origin !== config.watch || !['catalog','playlists','social'].includes(action)) return json({error:'notFound'},404);
  if (request.headers.get('origin') !== config.watch) return json({error:'forbidden'},403);
  try {
    const account = await viewer(request, config);
    if (!account) return json({error:'signIn'},403);
    if ((action === 'catalog' && account.role !== 'admin') || (action === 'playlists' && !canEditWatchPlaylist(account))) return json({error:'forbidden'},403);
    const limit = action === 'catalog' ? 4096 : 8192;
    const invalid = action === 'catalog' ? 'invalidVideo' : action === 'playlists' ? 'invalidPlaylist' : 'invalidActivity';
    if (Number(request.headers.get('content-length') ?? '0') > limit) return json({error:invalid},400);
    const raw = await request.text();
    if (raw.length > limit) return json({error:invalid},400);
    let body;
    try {body = JSON.parse(raw);} catch {return json({error:invalid},400);}
    const mode = body?.action;
    if (action === 'social') {
      if (mode === 'readNotifications') {
        await markWatchNotificationsRead(account);
        return json({ok:true});
      }
      if (!validWatchVideoId(body?.videoId)) return json({error:invalid},400);
      if (account.role==='learner' && !await watchVideoDetail(account.groupId,body.videoId,true)) return json({error:'notFound'},404);
      if ((mode === 'like' || mode === 'favorite') && typeof body.selected === 'boolean') {
        await setWatchVideoReaction(account, body.videoId, mode, body.selected);
      } else if (mode === 'comment') {
        const content = watchCommentText(body.text);
        if (!content || !validWatchVideoId(body.id)) return json({error:invalid},400);
        if (!await addWatchComment(account, body.videoId, body.id, content)) return json({error:'notFound'},404);
      } else if (mode === 'likeComment' && validWatchVideoId(body.id) && typeof body.selected === 'boolean') {
        await setWatchCommentLike(account, body.videoId, body.id, body.selected);
      } else if (mode === 'removeComment' && validWatchVideoId(body.id)) {
        if (!await removeWatchComment(account, body.videoId, body.id)) return json({error:'notFound'},404);
      } else return json({error:invalid},400);
      return json({ok:true});
    }
    if (action === 'playlists') {
      if (!['create','edit','remove'].includes(mode)) return json({error:invalid},400);
      const existing = mode === 'create' ? undefined : {id:body.id, revision:body.revision};
      if (existing && (!validWatchVideoId(existing.id) || !Number.isSafeInteger(existing.revision) || existing.revision < 1)) return json({error:invalid},400);
      if (existing && mode === 'remove') return await removeWatchPlaylist(account, existing.id, existing.revision)
        ? json({ok:true}) : json({error:'playlistChanged'},409);
      const input = watchPlaylistEdit(body);
      if (!input) return json({error:invalid},400);
      const saved = await saveWatchPlaylist(account, input, existing);
      return saved ? json(saved) : json({error:'playlistChanged'},409);
    }
    if (mode !== 'create' && !validWatchVideoId(body?.id)) return json({error:'notFound'},404);
    if (mode === 'remove') {
      return await deleteWatchVideo(account.groupId, body.id) ? json({ok:true}) : json({error:'notFound'},404);
    }
    if (mode !== 'create' && mode !== 'edit') return json({error:'invalidVideo'},400);
    const input = watchVideoFields(body);
    if (!input) return json({error:'invalidVideo'},400);
    const video = mode === 'create' ? await createWatchVideo(account.groupId, account.accountId, input) : await editWatchVideo(account.groupId, body.id, input);
    return video ? json({video}) : json({error:'alreadyAdded'},409);
  } catch {
    return json({error:'unavailable'},503);
  }
}
