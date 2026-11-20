export type WatchPreviewBindings = {
  WATCH_PREVIEW_APP_ORIGIN?: string;
  WATCH_PREVIEW_APP_ALIASES?: string;
  WATCH_PREVIEW_ORIGIN?: string;
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
  for (const value of bindings.WATCH_PREVIEW_APP_ALIASES?.split(',') ?? []) {
    const alias = origin(value.trim());
    if (alias && alias !== watch) appOrigins.add(alias);
  }
  return {app, appOrigins, watch, splitOrigin, entryPath, entry: watch + entryPath};
}

export type WatchPreviewConfig = NonNullable<ReturnType<typeof watchPreviewConfig>>;

export function watchPreviewEntry(config: WatchPreviewConfig, appOrigin: string) {
  if (!config.splitOrigin) return config.entry;
  const url = new URL(config.entry);
  url.searchParams.set('enter', '1');
  if (appOrigin !== config.app && config.appOrigins.has(appOrigin)) url.searchParams.set('from', appOrigin);
  return url.href;
}
