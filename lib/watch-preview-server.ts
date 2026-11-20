import {env} from 'cloudflare:workers';
import {currentBusinessAccount, hashToken} from './auth';
import {boundAccountSessionHash} from './account-session';
import {adminAuthority} from './admin-authority';
import {isOwnerAccount, OWNER_EMAIL} from './owner';
import {watchVideoCursor, watchVideoFields, watchVideoFilters, type WatchVideo} from './watch-preview-video';

export const WATCH_COOKIE = '__Host-tickminder_watch';
export const CHALLENGE_COOKIE = '__Host-tickminder_watch_start';
export const WATCH_MAX_AGE = 6 * 60 * 60;
export const WATCH_HANDOFF_AGE = 60;
const tokenPattern = /^[0-9a-f]{64}$/;

export function watchToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validWatchToken(value: unknown): value is string {
  return typeof value === 'string' && tokenPattern.test(value);
}
export function watchCookie(request: Request, name: string) {
  const pair = request.headers.get('cookie')?.split(';').find(value => value.trim().startsWith(name + '='));
  return pair ? pair.trim().slice(name.length + 1) : null;
}
export function setWatchCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function db() {
  if (!env.DB) throw Error('Watch storage unavailable');
  return env.DB;
}

export async function currentWatchAdmin() {
  const actor = await currentBusinessAccount();
  if (!actor || actor.role !== 'admin' || !actor.groupId) return null;
  const allowed = isOwnerAccount(actor) || (await adminAuthority(actor, actor.groupId)).isGroupChief;
  const sourceHash = boundAccountSessionHash(actor);
  if (!allowed || !sourceHash) return null;
  return {groupId: actor.groupId, sourceHash};
}

// Each Watch request checks the backing Tickminder session and live admin role.
const linkedAdministrator = `
 FROM sessions s JOIN accounts a ON a.id=s.account_id
 JOIN tuition_groups g ON g.id=w.group_id AND g.active=1
 WHERE s.token_hash=w.source_hash AND s.expires_at>?
 AND a.role='admin' AND a.disabled_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM local_credentials lc WHERE lc.account_id=a.id AND lc.must_change_password=1)
 AND ((a.group_id=g.id AND g.chief_admin_id=a.id)
      OR (lower(trim(a.email))=? AND substr(a.id,1,6)<>'local:'))
`;

export async function issueWatchHandoff(admin: NonNullable<Awaited<ReturnType<typeof currentWatchAdmin>>>, challenge: string) {
  const token = watchToken();
  const database = db();
  const now = Math.floor(Date.now() / 1000);
  await database.batch([
    database.prepare('DELETE FROM watch_preview_sessions WHERE token_hash IN (SELECT token_hash FROM watch_preview_sessions WHERE expires_at<=? LIMIT 40)').bind(now),
    database.prepare(`INSERT INTO watch_preview_sessions(token_hash,source_hash,group_id,purpose,challenge_hash,expires_at)
      VALUES(?,?,?,'handoff',?,?)`).bind(await hashToken(token), admin.sourceHash, admin.groupId, await hashToken(challenge), now + WATCH_HANDOFF_AGE),
  ]);
  return token;
}

export async function redeemWatchHandoff(token: string, challenge: string) {
  const session = watchToken();
  const now = Math.floor(Date.now() / 1000);
  const redeemed = await db().prepare(`UPDATE watch_preview_sessions AS w
    SET token_hash=?,purpose='watch',challenge_hash=NULL,expires_at=?
    WHERE token_hash=? AND challenge_hash=? AND purpose='handoff' AND expires_at>?
      AND EXISTS(SELECT 1 ${linkedAdministrator})
    RETURNING group_id AS groupId`)
    .bind(await hashToken(session), now + WATCH_MAX_AGE, await hashToken(token), await hashToken(challenge),
      now, new Date().toISOString(), OWNER_EMAIL).first<{groupId: string}>();
  return redeemed ? session : null;
}

export async function currentWatchSession(request: Request) {
  const token = watchCookie(request, WATCH_COOKIE);
  if (!validWatchToken(token)) return null;
  return db().prepare(`SELECT w.group_id AS groupId FROM watch_preview_sessions w
    WHERE w.token_hash=? AND w.purpose='watch' AND w.expires_at>? AND EXISTS(SELECT 1 ${linkedAdministrator})`)
    .bind(await hashToken(token), Math.floor(Date.now() / 1000), new Date().toISOString(), OWNER_EMAIL).first<{groupId: string}>();
}

const videoFields = 'id,youtube_id AS youtubeId,title,category,subject,chapter,kind,created_at AS createdAt';
const pageSize = 12;
const cursorFor = (video: WatchVideo) => video.createdAt + '~' + video.id;

export async function watchVideoList(groupId: string, params: URLSearchParams) {
  const previous = watchVideoCursor(params.get('before'));
  const next = watchVideoCursor(params.get('after'));
  const cursor = previous ?? next;
  const where = ['group_id=?'];
  const args = [groupId];
  if (cursor) {
    where.push(previous ? '(created_at,id)>(?,?)' : '(created_at,id)<(?,?)');
    args.push(cursor.createdAt, cursor.id);
  }
  for (const key of ['kind', ...Object.keys(watchVideoFilters)]) {
    const value = params.get(key);
    if (!value) continue;
    where.push(key + '=?');
    args.push(value);
  }
  const terms = params.get('q')?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  for (const term of terms) {
    where.push("instr(lower(title || ' ' || category || ' ' || subject || ' ' || chapter),?)>0");
    args.push(term);
  }
  const order = previous ? 'created_at ASC,id ASC' : 'created_at DESC,id DESC';
  const result = await db().prepare(`SELECT ${videoFields} FROM watch_preview_videos
    WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`).bind(...args, pageSize + 1).all<WatchVideo>();
  const hasMore = result.results.length > pageSize;
  const videos = result.results.slice(0, pageSize);
  if (previous) videos.reverse();
  return {
    videos,
    previousCursor: videos.length && (next || (previous && hasMore)) ? cursorFor(videos[0]) : null,
    nextCursor: videos.length && (previous || hasMore) ? cursorFor(videos[videos.length - 1]) : null,
  };
}

export async function watchVideoDetail(groupId: string, id: string) {
  return db().prepare(`SELECT ${videoFields} FROM watch_preview_videos WHERE group_id=? AND id=?`)
    .bind(groupId, id).first<WatchVideo>();
}

export async function watchVideoFacets(groupId: string) {
  const keys = Object.keys(watchVideoFilters);
  const database = db();
  const results = await database.batch<{value: string}>(keys.map(key => database
    .prepare(`SELECT DISTINCT ${key} AS value FROM watch_preview_videos
      WHERE group_id=? AND ${key}<>'' ORDER BY value COLLATE NOCASE LIMIT 41`).bind(groupId)));
  return Object.fromEntries(keys.map((key, index) => [key, {
    values: results[index].results.slice(0, 40).map(row => row.value),
    hasMore: results[index].results.length > 40,
  }]));
}

export async function createWatchVideo(groupId: string, input: NonNullable<ReturnType<typeof watchVideoFields>>) {
  const result = await db().prepare(`INSERT INTO watch_preview_videos(id,group_id,youtube_id,title,category,subject,chapter,kind,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(group_id,youtube_id) DO NOTHING RETURNING ${videoFields}`)
    .bind(crypto.randomUUID(), groupId, input.youtubeId, input.title, input.category, input.subject,
      input.chapter, input.kind, new Date().toISOString()).first<WatchVideo>();
  return result;
}

export async function editWatchVideo(groupId: string, id: string, input: NonNullable<ReturnType<typeof watchVideoFields>>) {
  return db().prepare(`UPDATE OR IGNORE watch_preview_videos SET youtube_id=?,title=?,category=?,subject=?,chapter=?,kind=?
    WHERE group_id=? AND id=? RETURNING ${videoFields}`)
    .bind(input.youtubeId, input.title, input.category, input.subject, input.chapter, input.kind, groupId, id).first<WatchVideo>();
}

export async function deleteWatchVideo(groupId: string, id: string) {
  const result = await db().prepare('DELETE FROM watch_preview_videos WHERE group_id=? AND id=?').bind(groupId, id).run();
  return Boolean(result.meta.changes);
}
