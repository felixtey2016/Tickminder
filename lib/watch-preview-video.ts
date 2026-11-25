export type WatchVideo = {
  id: string;
  youtubeId: string;
  title: string;
  category: string;
  subject: string;
  chapter: string;
  kind: 'lesson' | 'short';
  createdAt: string;
};

const idPattern = /^[A-Za-z0-9_-]{11}$/;
export function validWatchVideoId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
}

export const watchVideoFilters = {category: 48, subject: 48, chapter: 80} as const;

export function watchVideoCursor(value: string | null) {
  if (!value || value.length !== 61 || value[24] !== '~') return null;
  const createdAt = value.slice(0, 24);
  const id = value.slice(25);
  const date = new Date(createdAt);
  return validWatchVideoId(id) && Number.isFinite(date.getTime()) && date.toISOString() === createdAt
    ? {createdAt, id} : null;
}

export function watchCatalogParams(input: URLSearchParams) {
  const params = new URLSearchParams({lang: input.get('lang') === 'en' ? 'en' : 'zh'});
  for (const [key, limit] of Object.entries({q: 120, ...watchVideoFilters})) {
    const value = input.get(key)?.slice(0, limit).trim();
    if (value) params.set(key, value);
  }
  const kind = input.get('kind');
  if (kind === 'lesson' || kind === 'short') params.set('kind', kind);
  for (const key of ['after', 'before']) {
    const value = input.get(key);
    if (value && watchVideoCursor(value)) {
      params.set(key, value);
      break;
    }
  }
  return params;
}

export function watchYoutubeId(value: unknown) {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const path = url.pathname.split('/').filter(Boolean);
    let id: string | null = null;
    if (url.hostname === 'youtu.be' && path.length === 1) id = path[0];
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      if (path.length === 2 && ['shorts', 'embed'].includes(path[0])) id = path[1];
    }
    return id && idPattern.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function watchVideoFields(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const field = (value: unknown, max: number) =>
    typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
  const youtubeId = watchYoutubeId(input.url);
  const title = field(input.title, 120);
  if (!youtubeId || !title) return null;
  const kind = new URL(String(input.url).trim()).pathname.startsWith('/shorts/') ? 'short' as const : 'lesson' as const;
  return {youtubeId, title, kind, category: field(input.category, 48),
    subject: field(input.subject, 48), chapter: field(input.chapter, 80)};
}
