import { learningDb } from "./learning-server";

export class FolderError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export type ClassroomFolder = { id: string; parentId: string | null; name: string };
export async function folderTree(groupId: string, classroomId: string) {
  const result = await learningDb().prepare("SELECT id,parent_id AS parentId,name FROM classroom_folders WHERE group_id=? AND classroom_id=? ORDER BY name_key,id").bind(groupId,classroomId).all<ClassroomFolder>();
  return result.results;
}
export async function folderRevision(groupId: string, classroomId: string) {
  const row = await learningDb().prepare("SELECT revision FROM classroom_content_state WHERE group_id=? AND classroom_id=?").bind(groupId,classroomId).first<{revision:number}>();
  if (!row) throw new FolderError("班级不存在或无权访问",404);
  return row.revision;
}
export async function validateContentFolder(groupId: string, classroomId: string, folderId: string) {
  if (!folderId) return null;
  if (!await learningDb().prepare("SELECT 1 FROM classroom_folders WHERE group_id=? AND classroom_id=? AND id=?").bind(groupId,classroomId,folderId).first()) throw new FolderError("文件夹不存在或不属于这个班级",403);
  return folderId;
}
export function folderDescendants(tree: ClassroomFolder[], id: string) {
  const ids = new Set([id]);
  for (let i=0;i<tree.length;i++) {
    let added = false;
    for (const node of tree) if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); added=true; }
    if (!added) break;
  }
  return [...ids];
}
export function validateFolderPosition(tree: ClassroomFolder[], id: string, parentId: string | null) {
  if (parentId && !tree.some(f=>f.id===parentId)) throw new FolderError("文件夹不存在或不属于这个班级",403);
  if (id && parentId && folderDescendants(tree,id).includes(parentId)) throw new FolderError("不能移入自己或自己的子文件夹");
  let depth = 1, cursor=parentId;
  const seen = new Set<string>();
  while (cursor) { if(seen.has(cursor)) throw new FolderError("文件夹结构无效",409); seen.add(cursor); depth++; cursor=tree.find(f=>f.id===cursor)?.parentId || null; }
  let subtreeDepth=0;
  function visit(node: string, level: number) { subtreeDepth=Math.max(subtreeDepth,level); for(const f of tree) if(f.parentId===node) visit(f.id,level+1); }
  if(id) visit(id,0);
  if(depth+subtreeDepth>8) throw new FolderError("文件夹最多支持 8 层");
}
export function folderName(value: unknown) {
  const name = typeof value === "string" ? value.trim().normalize("NFC") : "";
  if(!name || name.length>80 || /[\/\\\x00-\x1f]/.test(name) || name==="." || name==="..") throw new FolderError("文件夹名称须为 1 至 80 个字符，不能包含斜线");
  return {name,key:name.normalize("NFKC").toLocaleLowerCase("en-US")};
}
