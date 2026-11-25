import {tikQuizRoute} from './tikquiz-route';

export const tickLearnOrigin = 'https://learn.tickminder.com';
export const tickLearnAccountOrigin = 'https://www.tickminder.com';
export const tickLearnStudyOrigin = 'https://study.tickminder.com';
export const tickLearnGoogleCookie = '__Host-ticklearn-google-session';
export const tickMinderApexOrigin = 'https://tickminder.com';
export const tickLearnPlayOrigin = 'https://tickplay.tickminder.com';
export const tickLearnGameOrigin = 'https://tickgame.tickminder.com';
export const tickLearnSignupReason = 'ticklearn_signup';

export const tickLearnLanguages = ['zh', 'en', 'ms'] as const;
export type TickLearnLanguage = typeof tickLearnLanguages[number];
export function tickLearnLanguage(value: unknown): TickLearnLanguage {
  return value === 'en' || value === 'ms' ? value : 'zh';
}

export function tickLearnProductLanguage(language:TickLearnLanguage) {
  return language === 'ms' ? 'en' : language;
}

export function tickMinderOrigin(value:unknown) {
  return value === tickLearnAccountOrigin || value === tickMinderApexOrigin ? value : null;
}

export type TickMinderEntry = 'www' | 'apex';

export function tickMinderEntry(value: unknown): TickMinderEntry | undefined {
  return value === 'www' || value === 'apex' ? value : undefined;
}

export function tickMinderEntryQuery(entry?: TickMinderEntry) {
  return entry ? '&minderFrom=' + entry : '';
}

export function tickLearnGamePath(path: string) {
  return path === '/' || /^\/sejarah(?:\/bab-1)?\/?$/.test(path) ||
    /^\/games\/[0-9a-f-]{36}\/?$/.test(path);
}

export function tickLearnReturn(value: unknown, language: TickLearnLanguage) {
  const fallback = new URL('/ticklearn/study', tickLearnStudyOrigin);
  fallback.searchParams.set('lang', language);
  if (typeof value !== 'string' || value.length > 2000 || /[\\\u0000-\u001f]/.test(value)) return fallback;
  let url: URL;
  try { url = new URL(value, tickLearnStudyOrigin); }
  catch { return fallback; }
  if (url.username || url.password) return fallback;
  if (url.origin === tickLearnOrigin && url.pathname === '/') {
    const landing = new URL('/', tickLearnOrigin);
    landing.searchParams.set('lang', language);
    return landing;
  }
  const accountHost = url.origin === tickLearnStudyOrigin || tickMinderOrigin(url.origin);
  const quiz = accountHost && tikQuizRoute(url.pathname);
  const play = url.origin === tickLearnPlayOrigin &&
    /^\/(?:videos\/[A-Za-z0-9_-]+\/?|playlists(?:\/[A-Za-z0-9_-]+)?\/?|account(?:\/videos)?\/?|favorites\/?|notifications\/?)?$/.test(url.pathname);
  const game = url.origin === tickLearnGameOrigin && tickLearnGamePath(url.pathname);
  const entry = tickMinderEntry(url.searchParams.get('minderFrom'));
  if (accountHost && (url.pathname === '/ticklearn/settings' || url.pathname === '/ticklearn/study')) {
    return new URL(url.pathname + '?lang=' + language + tickMinderEntryQuery(entry), tickLearnStudyOrigin);
  }
  url.searchParams.delete('minderFrom');
  if (entry) url.searchParams.set('minderFrom', entry);
  if (!quiz && !play && !game) return fallback;
  if (quiz) url.hostname = new URL(tickLearnStudyOrigin).hostname;
  for (const key of ['code', 'ticket', 'challenge', 'enter', 'from']) url.searchParams.delete(key);
  if (quiz || play) url.searchParams.set('learn', '1');
  if (play) {
    url.searchParams.set('from', tickLearnStudyOrigin);
    url.searchParams.set('enter', '1');
  }
  if (game) url.searchParams.delete('version');
  const requestedLanguage=url.searchParams.get('lang');
  if (requestedLanguage!=='zh'&&requestedLanguage!=='en') url.searchParams.set('lang',tickLearnProductLanguage(language));
  return url;
}

export function tickLearnAuthLink(destination: string | URL, language: TickLearnLanguage = 'zh', mode: 'login' | 'signup' = 'login') {
  const url = new URL('/ticklearn/' + mode, tickLearnStudyOrigin);
  url.searchParams.set('next', tickLearnReturn(String(destination), language).href);
  url.searchParams.set('lang', language);
  return url.href;
}

export function tickLearnEntryLink(destination: URL, language: TickLearnLanguage, source?: 'www' | 'apex' | 'google') {
  const url = new URL('/api/ticklearn/entry', tickLearnStudyOrigin);
  url.searchParams.set('next', destination.href);
  url.searchParams.set('lang', language);
  if (source) url.searchParams.set('source', source);
  return url;
}

export function tickLearnContinue(destination: URL) {
  if (destination.origin !== tickLearnGameOrigin) return destination;
  const game = new URL(destination);
  game.searchParams.delete('minder');
  game.searchParams.set('learn', '1');
  const entry = new URL('/api/ticklearn/game', tickLearnStudyOrigin);
  entry.searchParams.set('next', game.href);
  return entry;
}
