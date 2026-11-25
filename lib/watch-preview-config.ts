import {tickLearnAccountOrigin,tickLearnPlayOrigin,tickLearnStudyOrigin} from './ticklearn-routes';
import {validWatchVideoId, watchCatalogParams} from './watch-preview-video';

export const watchPreviewBranding = {
  logo: '/branding/tickplay-logo.webp',
  favicon: '/branding/tickplay-icon-64.png',
} as const;

export type WatchPreviewBindings = {
  WATCH_PREVIEW_APP_ORIGIN?: string;
  WATCH_PREVIEW_APP_ALIASES?: string;
  WATCH_PREVIEW_ORIGIN?: string;
  WATCH_PREVIEW_LEGACY_ORIGIN?: string;
};

function origin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== value) return null;
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return value;
  } catch {}
  return null;
}

export function watchPreviewConfig(bindings: WatchPreviewBindings) {
  const app = origin(bindings.WATCH_PREVIEW_APP_ORIGIN);
  const watch = origin(bindings.WATCH_PREVIEW_ORIGIN);
  if (!app || !watch) return null;
  const splitOrigin = app !== watch;
  const entryPath = splitOrigin ? '/' : '/watch';
  const appOrigins = new Set([app]);
  if (app === tickLearnAccountOrigin && watch === tickLearnPlayOrigin) appOrigins.add(tickLearnStudyOrigin);
  for (const value of bindings.WATCH_PREVIEW_APP_ALIASES?.split(',') ?? []) {
    const alias = origin(value.trim());
    if (alias && alias !== watch) appOrigins.add(alias);
  }
  const legacyOrigin = origin(bindings.WATCH_PREVIEW_LEGACY_ORIGIN);
  const legacyWatch = splitOrigin && legacyOrigin && legacyOrigin !== watch && !appOrigins.has(legacyOrigin)
    ? legacyOrigin : null;
  return {app, appOrigins, watch, legacyWatch, splitOrigin, entryPath, entry: watch + entryPath};
}

export type WatchPreviewConfig = NonNullable<ReturnType<typeof watchPreviewConfig>>;

export function watchPreviewEntry(config: WatchPreviewConfig, appOrigin: string) {
  if (!config.splitOrigin) return config.entry;
  const url = new URL(config.entry);
  url.searchParams.set('enter', '1');
  if (appOrigin !== config.app && config.appOrigins.has(appOrigin)) url.searchParams.set('from', appOrigin);
  return url.href;
}

export function watchPreviewLegacyLocation(config: WatchPreviewConfig, url: URL) {
  const root = url.pathname === '/';
  const videoPrefix = '/videos/';
  const video = root ? url.searchParams.get('video') : url.pathname.slice(videoPrefix.length);
  if (!root && (!url.pathname.startsWith(videoPrefix) || !validWatchVideoId(video))) return null;

  const target = new URL(config.entry);
  if (validWatchVideoId(video)) target.pathname = videoPrefix + video;
  const params = watchCatalogParams(url.searchParams);
  const theme = url.searchParams.get('theme');
  const from = url.searchParams.get('from');
  if (theme === 'light' || theme === 'dark') params.set('theme', theme);
  if (from && config.appOrigins.has(from)) params.set('from', from);
  if (root && url.searchParams.get('enter') === '1') params.set('enter', '1');
  target.search = params.toString();
  return target.href;
}
