import {env} from 'cloudflare:workers';
import {watchFreeVideoSql, watchVideoSelect, type WatchViewer} from './watch-preview-server';
import {watchVideoCursor, type WatchVideo} from './watch-preview-video';

const pageSize = 12;

function db() {
  if (!env.DB) throw Error('Watch storage unavailable');
  return env.DB;
}

function page<T extends {createdAt: string; id: string}>(results: T[]) {
  const items = results.slice(0, pageSize);
  const last = items.at(-1);
  return {items, nextCursor:results.length > pageSize && last ? last.createdAt+'~'+last.id : null};
}

export async function watchPersonalVideos(viewer: WatchViewer, after: string | null, favorites: boolean) {
  const cursor = watchVideoCursor(after);
  const date = favorites ? 'r.created_at' : 'v.created_at';
  const related = favorites
    ? "JOIN watch_video_reactions r ON r.video_id=v.id AND r.group_id=v.group_id AND r.account_id=? AND r.kind='favorite'"
    : 'JOIN watch_video_owners r ON r.video_id=v.id AND r.group_id=v.group_id AND r.account_id=?';
  const cursorFilter = cursor ? `AND (${date},v.id)<(?,?)` : '';
  const result = await db().prepare(`SELECT ${watchVideoSelect('v.')},${date} AS savedAt
    FROM watch_preview_videos v ${related} WHERE v.group_id=? ${cursorFilter}
    ${viewer.role==='learner' ? 'AND '+watchFreeVideoSql('v') : ''}
    ORDER BY ${date} DESC,v.id DESC LIMIT ?`)
    .bind(viewer.accountId,viewer.groupId,...(cursor ? [cursor.createdAt,cursor.id] : []),pageSize+1)
    .all<WatchVideo & {savedAt:string}>();
  const {items,nextCursor} = page(result.results.map(row=>({...row,createdAt:row.savedAt})));
  return {items,nextCursor};
}

export async function watchVideoActivity(viewer: WatchViewer, video: string, after: string | null) {
  const database = db();
  const cursor = watchVideoCursor(after);
  const comments = database.prepare(`SELECT c.id,c.body,c.created_at AS createdAt,
    coalesce(nullif(trim(a.name),''),'TickPlay') AS author,
    (SELECT count(*) FROM watch_comment_likes cl WHERE cl.comment_id=c.id) AS likes,
    EXISTS(SELECT 1 FROM watch_comment_likes cl WHERE cl.comment_id=c.id AND cl.account_id=?) AS liked,
    (c.account_id=? OR ?='admin') AS canRemove
    FROM watch_comments c LEFT JOIN accounts a ON a.id=c.account_id
    WHERE c.group_id=? AND c.video_id=? ${cursor ? 'AND (c.created_at,c.id)<(?,?)' : ''}
    ORDER BY c.created_at DESC,c.id DESC LIMIT ?`).bind(viewer.accountId,viewer.accountId,viewer.role,viewer.groupId,video,
      ...(cursor ? [cursor.createdAt,cursor.id] : []),pageSize+1);
  if (cursor) return page((await comments.all<{id:string;createdAt:string}>()).results);
  const summary = database.prepare(`SELECT
    EXISTS(SELECT 1 FROM watch_video_reactions WHERE video_id=v.id AND account_id=? AND kind='like') AS liked,
    EXISTS(SELECT 1 FROM watch_video_reactions WHERE video_id=v.id AND account_id=? AND kind='favorite') AS favorite,
    (SELECT count(*) FROM watch_video_reactions WHERE video_id=v.id AND kind='like') AS likes
    FROM watch_preview_videos v WHERE v.id=? AND v.group_id=?`).bind(viewer.accountId,viewer.accountId,video,viewer.groupId);
  const [meta,rows] = await database.batch([summary,comments]);
  return meta.results.length ? {...page(rows.results as {id:string;createdAt:string}[]),summary:meta.results[0]} : null;
}

export async function watchNotifications(viewer: WatchViewer, after: string | null) {
  const cursor = watchVideoCursor(after);
  const result = await db().prepare(`SELECT n.id,n.kind,n.video_id AS videoId,n.created_at AS createdAt,n.read_at AS readAt,
    v.title AS videoTitle,coalesce(nullif(trim(a.name),''),'TickPlay') AS actor
    FROM watch_notifications n JOIN watch_preview_videos v ON v.id=n.video_id AND v.group_id=n.group_id
    LEFT JOIN accounts a ON a.id=n.actor_id
    WHERE n.group_id=? AND n.recipient_id=? ${cursor ? 'AND (n.created_at,n.id)<(?,?)' : ''}
    ${viewer.role==='learner' ? 'AND '+watchFreeVideoSql('v') : ''}
    ORDER BY n.created_at DESC,n.id DESC LIMIT ?`).bind(viewer.groupId,viewer.accountId,
      ...(cursor ? [cursor.createdAt,cursor.id] : []),pageSize+1).all<{id:string;createdAt:string}>();
  return page(result.results);
}

export async function markWatchNotificationsRead(viewer: WatchViewer) {
  await db().prepare('UPDATE watch_notifications SET read_at=? WHERE group_id=? AND recipient_id=? AND read_at IS NULL')
    .bind(new Date().toISOString(),viewer.groupId,viewer.accountId).run();
}

export async function setWatchVideoReaction(viewer: WatchViewer, video: string, kind: 'like'|'favorite', selected: boolean) {
  const database = db();
  const now = new Date().toISOString();
  if (!selected) {
    await database.prepare('DELETE FROM watch_video_reactions WHERE video_id=? AND group_id=? AND account_id=? AND kind=?')
      .bind(video,viewer.groupId,viewer.accountId,kind).run();
    return;
  }
  const statements = [database.prepare(`INSERT OR IGNORE INTO watch_video_reactions(video_id,group_id,account_id,kind,created_at)
    SELECT id,group_id,?,?,? FROM watch_preview_videos WHERE id=? AND group_id=?`)
    .bind(viewer.accountId,kind,now,video,viewer.groupId)];
  if (kind === 'like') statements.push(database.prepare(`INSERT OR IGNORE INTO watch_notifications
    (id,group_id,video_id,recipient_id,actor_id,kind,created_at,dedupe_key)
    SELECT ?,o.group_id,o.video_id,o.account_id,?,'like',?,? FROM watch_video_owners o
    WHERE o.video_id=? AND o.group_id=? AND o.account_id<>?
      AND EXISTS(SELECT 1 FROM watch_video_reactions WHERE video_id=o.video_id AND kind='like' AND account_id=?)`)
    .bind(crypto.randomUUID(),viewer.accountId,now,'like:'+video+':'+viewer.accountId,video,viewer.groupId,viewer.accountId,viewer.accountId));
  await database.batch(statements);
}

export function watchCommentText(value: unknown) {
  if (typeof value !== 'string' || value.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) return null;
  return value.trim() || null;
}

export async function addWatchComment(viewer: WatchViewer, video: string, id: string, text: string) {
  const database = db();
  const now = new Date().toISOString();
  const results = await database.batch([
    database.prepare(`INSERT OR IGNORE INTO watch_comments(id,video_id,group_id,account_id,body,created_at)
      SELECT ?,id,group_id,?,?,? FROM watch_preview_videos WHERE id=? AND group_id=?`)
      .bind(id,viewer.accountId,text,now,video,viewer.groupId),
    database.prepare(`INSERT OR IGNORE INTO watch_notifications
      (id,group_id,video_id,comment_id,recipient_id,actor_id,kind,created_at,dedupe_key)
      SELECT ?,o.group_id,o.video_id,c.id,o.account_id,c.account_id,'comment',?,? FROM watch_video_owners o
      JOIN watch_comments c ON c.id=? AND c.video_id=o.video_id AND c.group_id=o.group_id
      WHERE o.video_id=? AND o.group_id=? AND o.account_id<>c.account_id AND c.account_id=?`)
      .bind(crypto.randomUUID(),now,'comment:'+id,id,video,viewer.groupId,viewer.accountId),
    database.prepare('SELECT id FROM watch_comments WHERE id=? AND video_id=? AND group_id=? AND account_id=? AND body=?')
      .bind(id,video,viewer.groupId,viewer.accountId,text),
  ]);
  return results[2].results.length > 0;
}

export async function setWatchCommentLike(viewer: WatchViewer, video: string, comment: string, selected: boolean) {
  const database = db();
  if (!selected) {
    await database.prepare(`DELETE FROM watch_comment_likes WHERE comment_id=? AND account_id=?
      AND EXISTS(SELECT 1 FROM watch_comments WHERE id=? AND video_id=? AND group_id=?)`)
      .bind(comment,viewer.accountId,comment,video,viewer.groupId).run();
    return;
  }
  await database.batch([
    database.prepare(`INSERT OR IGNORE INTO watch_comment_likes(comment_id,account_id)
      SELECT id,? FROM watch_comments WHERE id=? AND video_id=? AND group_id=?`)
      .bind(viewer.accountId,comment,video,viewer.groupId),
    database.prepare(`INSERT OR IGNORE INTO watch_notifications
      (id,group_id,video_id,comment_id,recipient_id,actor_id,kind,created_at,dedupe_key)
      SELECT ?,c.group_id,c.video_id,c.id,c.account_id,?,'comment-like',?,? FROM watch_comments c
      JOIN watch_comment_likes l ON l.comment_id=c.id AND l.account_id=?
      WHERE c.id=? AND c.video_id=? AND c.group_id=? AND c.account_id<>?`)
      .bind(crypto.randomUUID(),viewer.accountId,new Date().toISOString(),'comment-like:'+comment+':'+viewer.accountId,
        viewer.accountId,comment,video,viewer.groupId,viewer.accountId),
  ]);
}

export async function removeWatchComment(viewer: WatchViewer, video: string, comment: string) {
  const result = await db().prepare(`DELETE FROM watch_comments
    WHERE id=? AND video_id=? AND group_id=? AND (account_id=? OR ?='admin')`)
    .bind(comment,video,viewer.groupId,viewer.accountId,viewer.role).run();
  return Boolean(result.meta.changes);
}
