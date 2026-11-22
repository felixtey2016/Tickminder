import {env} from 'cloudflare:workers';
import {WatchPreviewConfig, watchPreviewConfig} from '@/lib/watch-preview-config';
import {
  CHALLENGE_COOKIE, WATCH_COOKIE, WATCH_MAX_AGE, createWatchVideo, currentWatchAdmin, currentWatchSession,
  deleteWatchVideo, editWatchVideo, issueWatchHandoff, redeemWatchHandoff, setWatchCookie, validWatchToken, watchCookie,
  watchToken, watchVideoDetail, watchVideoFacets, watchVideoList,
} from '@/lib/watch-preview-server';
import {watchPreviewPage} from '@/lib/watch-preview-page';
import {validWatchVideoId, watchCatalogParams, watchVideoFields, watchVideoFilters} from '@/lib/watch-preview-video';

import {readAcademicCatalogue} from '@/lib/academic-catalogue-server';
import {catalogueKey} from '@/lib/academic-catalogue';

const headers = {'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY'};
const json = (data: unknown, status = 200) => Response.json(data, {status, headers});
type Context = {params: Promise<{action: string}>};
const path = '/api/watch-preview/';
const themeName = '__Host-tickminder_watch_theme';
const readTheme = (value: string | null) => value === 'light' || value === 'dark' ? value : null;
const themeCookie = (theme: 'light' | 'dark') => `${themeName}=${theme}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`;
function redirect(url: string, cookies: string[] = []) {
  const responseHeaders = new Headers({...headers, Location:url});
  for (const cookie of cookies) responseHeaders.append('Set-Cookie', cookie);
  return new Response(null, {status:303,headers:responseHeaders});
}
function watchEntry(config: WatchPreviewConfig, params: URLSearchParams, id: string | null = null) {
  const url = id ? config.entry.replace(/\/$/, '') + '/videos/' + id : config.entry;
  return url + '?' + params;
}
async function viewer(request: Request, config: WatchPreviewConfig) {
  return config.splitOrigin ? currentWatchSession(request) : currentWatchAdmin();
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
  const lang = catalogParams.get('lang') === 'en' ? 'en' : 'zh';
  const from = url.searchParams.get('from');
  const appOrigin = from && config.appOrigins.has(from) ? from : config.app;
  if (appOrigin !== config.app) catalogParams.set('from', appOrigin);
  const id = url.searchParams.get('video');
  const videoId = validWatchVideoId(id) ? id : null;
  const requestedTheme = readTheme(url.searchParams.get('theme'));
  const {action} = await params;
  const page = action === 'view' || action === 'video';
  const handoffParams = new URLSearchParams(catalogParams);
  if (videoId) handoffParams.set('video', videoId);
  if (requestedTheme) handoffParams.set('theme', requestedTheme);
  try {
    if (action === 'authorize' && config.splitOrigin && config.appOrigins.has(url.origin)) {
      const challenge = url.searchParams.get('challenge');
      if (!validWatchToken(challenge)) return json({error:'invalidLink'},400);
      const admin = await currentWatchAdmin();
      if (!admin) return json({error:'adminOnly'},403);
      const code = await issueWatchHandoff(admin, challenge);
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
      return redirect(watchEntry(config, catalogParams, videoId), [
        setWatchCookie(CHALLENGE_COOKIE, '', 0),
        setWatchCookie(WATCH_COOKIE, session, WATCH_MAX_AGE),
        ...(requestedTheme ? [themeCookie(requestedTheme)] : []),
      ]);
    }
    if (!page && action !== 'catalog' && action !== 'facets' && action !== 'academic-options') return json({error:'notFound'},404);
    if (action === 'view' && videoId) return redirect(watchEntry(config, catalogParams, videoId));
    if (action === 'video' && !videoId) return json({error:'notFound'},404);
    const entering = action === 'view' && url.searchParams.get('enter') === '1';
    const admin = config.splitOrigin && entering ? null : await viewer(request, config);
    if (!admin && config.splitOrigin && page) {
      const challenge = watchToken();
      handoffParams.set('challenge', challenge);
      return redirect(appOrigin + path + 'authorize?' + handoffParams,
        [setWatchCookie(CHALLENGE_COOKIE, challenge, 120)]);
    }
    if (!admin) return json({error:'adminOnly'},403);
    if (action === 'catalog') return json(await watchVideoList(admin.groupId, catalogParams));
    if (action === 'academic-options') return json({syllabuses:await watchAcademicOptions()});
    if (action === 'facets') return json({facets:await watchVideoFacets(admin.groupId)});
    if (requestedTheme) return redirect(watchEntry(config, catalogParams, videoId), [themeCookie(requestedTheme)]);
    const video = action === 'video' && videoId ? await watchVideoDetail(admin.groupId, videoId) : undefined;
    const theme = readTheme(watchCookie(request, themeName));
    const html = watchPreviewPage(lang, appOrigin + '/manage', config.entryPath, watchEntry(config, catalogParams), theme, video);
    const framePolicy = video ? 'https://www.youtube-nocookie.com' : "'none'";
    return new Response(html, {status:video === null ? 404 : 200, headers:{
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
  if (!config || url.origin !== config.watch || action !== 'catalog') return json({error:'notFound'},404);
  if (request.headers.get('origin') !== config.watch) return json({error:'adminOnly'},403);
  try {
    const admin = await viewer(request, config);
    if (!admin) return json({error:'adminOnly'},403);
    if (Number(request.headers.get('content-length') ?? '0') > 4096) return json({error:'invalidVideo'},400);
    const raw = await request.text();
    if (raw.length > 4096) return json({error:'invalidVideo'},400);
    let body;
    try {body = JSON.parse(raw);} catch {return json({error:'invalidVideo'},400);}
    const mode = body?.action;
    if (mode !== 'create' && !validWatchVideoId(body?.id)) return json({error:'notFound'},404);
    if (mode === 'remove') {
      return await deleteWatchVideo(admin.groupId, body.id) ? json({ok:true}) : json({error:'notFound'},404);
    }
    if (mode !== 'create' && mode !== 'edit') return json({error:'invalidVideo'},400);
    const input = watchVideoFields(body);
    if (!input) return json({error:'invalidVideo'},400);
    const video = mode === 'create' ? await createWatchVideo(admin.groupId, input) : await editWatchVideo(admin.groupId, body.id, input);
    return video ? json({video}) : json({error:'alreadyAdded'},409);
  } catch {
    return json({error:'unavailable'},503);
  }
}
