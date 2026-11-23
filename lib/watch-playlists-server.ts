import {env} from 'cloudflare:workers';
import {watchVideoSelect, type WatchViewer} from './watch-preview-server';
import {validWatchVideoId, watchVideoCursor, type WatchVideo} from './watch-preview-video';

export type WatchPlaylist = {id: string; title: string; createdAt: string; revision: number; createdBy: string};
export type WatchPlaylistDetail = WatchPlaylist & {videos: WatchVideo[]; nextPosition:number|null};
const fields = 'id,title,created_at AS createdAt,revision,created_by AS createdBy';
const pageSize = 24;

function db() {
  if (!env.DB) throw Error('Watch storage unavailable');
  return env.DB;
}

export function canEditWatchPlaylist(viewer: WatchViewer, playlist?: WatchPlaylist) {
  return viewer.role === 'admin' || (viewer.role === 'teacher' && (!playlist || playlist.createdBy === viewer.accountId));
}

export async function watchPlaylists(groupId: string, params: URLSearchParams) {
  const previous = watchVideoCursor(params.get('before'));
  const next = watchVideoCursor(params.get('after'));
  const cursor = previous ?? next;
  const where = cursor ? (previous ? ' AND (created_at,id)>(?,?)' : ' AND (created_at,id)<(?,?)') : '';
  const order = previous ? 'created_at ASC,id ASC' : 'created_at DESC,id DESC';
  const {results} = await db().prepare(`SELECT ${fields} FROM watch_playlists WHERE group_id=?${where}
    ORDER BY ${order} LIMIT ?`).bind(groupId, ...(cursor ? [cursor.createdAt, cursor.id] : []), pageSize+1).all<WatchPlaylist>();
  const playlists = results.slice(0, pageSize);
  if (previous) playlists.reverse();
  const value = (playlist: WatchPlaylist) => playlist.createdAt + '~' + playlist.id;
  return {
    playlists,
    previousCursor: playlists.length > 0 && (next || (previous && results.length > pageSize)) ? value(playlists[0]) : null,
    nextCursor: playlists.length > 0 && (previous || results.length > pageSize) ? value(playlists[playlists.length-1]) : null,
  };
}

export async function watchPlaylistDetail(groupId: string, id: string, offset = 0, editing = false): Promise<WatchPlaylistDetail | null> {
  const limit = editing ? 100 : 12;
  const database = db();
  const [metadata, videos] = await database.batch([
    database.prepare(`SELECT ${fields} FROM watch_playlists WHERE group_id=? AND id=?`).bind(groupId, id),
    database.prepare(`SELECT ${watchVideoSelect('v.')} FROM watch_playlists p, json_each(p.video_ids) item
      JOIN watch_preview_videos v ON v.id=item.value AND v.group_id=p.group_id
      WHERE p.group_id=? AND p.id=? ORDER BY item.key LIMIT ? OFFSET ?`).bind(groupId, id, limit+1, offset),
  ]);
  const playlist = metadata.results[0] as WatchPlaylist | undefined;
  return playlist ? {...playlist, videos:videos.results.slice(0,limit) as WatchVideo[],
    nextPosition:videos.results.length>limit?offset+limit:null} : null;
}

export function watchPlaylistEdit(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const {title, videoIds} = value as Record<string, unknown>;
  if (typeof title !== 'string' || !title.trim() || title.length > 120 || /[\u0000-\u001f\u007f]/.test(title)) return null;
  if (!Array.isArray(videoIds) || !videoIds.length || videoIds.length > 100 ||
    !videoIds.every(validWatchVideoId) || new Set(videoIds).size !== videoIds.length) return null;
  return {title:title.trim(), videoIds};
}

const availableVideos = `NOT EXISTS(SELECT 1 FROM json_each(?) item LEFT JOIN watch_preview_videos v
  ON v.id=item.value AND v.group_id=? WHERE v.id IS NULL)`;

export async function saveWatchPlaylist(viewer: WatchViewer, input: NonNullable<ReturnType<typeof watchPlaylistEdit>>,
  existing?: {id: string; revision: number}) {
  if (!canEditWatchPlaylist(viewer)) return null;
  const ids = JSON.stringify(input.videoIds);
  if (existing) return db().prepare(`UPDATE watch_playlists SET title=?,video_ids=?,revision=revision+1
    WHERE group_id=? AND id=? AND revision=? AND (?='admin' OR created_by=?) AND ${availableVideos} RETURNING id`)
    .bind(input.title, ids, viewer.groupId, existing.id, existing.revision, viewer.role, viewer.accountId, ids, viewer.groupId).first<{id:string}>();
  return db().prepare(`INSERT INTO watch_playlists(id,group_id,created_by,title,video_ids,created_at)
    SELECT ?,?,?,?,?,? WHERE ${availableVideos} RETURNING id`)
    .bind(crypto.randomUUID(), viewer.groupId, viewer.accountId, input.title, ids, new Date().toISOString(), ids, viewer.groupId).first<{id:string}>();
}

export async function removeWatchPlaylist(viewer: WatchViewer, id: string, revision: number) {
  if (!canEditWatchPlaylist(viewer)) return false;
  const result = await db().prepare(`DELETE FROM watch_playlists
    WHERE group_id=? AND id=? AND revision=? AND (?='admin' OR created_by=?)`)
    .bind(viewer.groupId, id, revision, viewer.role, viewer.accountId).run();
  return Boolean(result.meta.changes);
}
