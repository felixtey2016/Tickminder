import {learningDb} from './learning-server';
import type {Account} from './auth';
const display=(value:unknown)=>typeof value==='string'?value.trim().slice(0,160):'';
/** Resolve only identities referenced by events the caller may already see. */
export async function auditNames(actor:Account,ids:string[]):Promise<Map<string,string>>{
 const unique=[...new Set(ids)].filter(Boolean),names=new Map<string,string>();if(!unique.length)return names;
 const data=await learningDb().prepare(`WITH requested AS(SELECT value AS id FROM json_each(?))
 SELECT requested.id,coalesce(
  (SELECT nullif(trim(name),'') FROM accounts WHERE id=requested.id AND group_id=?),
  (SELECT nullif(trim(json_extract(after_json,'$._audit.actorName')),'') FROM audit WHERE group_id=? AND actor_id=requested.id AND json_valid(after_json) AND json_type(after_json,'$._audit.actorName')='text' ORDER BY at DESC,id DESC LIMIT 1),
  (SELECT coalesce(CASE WHEN json_valid(after_json) THEN nullif(trim(json_extract(after_json,'$.name')),'') END,CASE WHEN json_valid(before_json) THEN nullif(trim(json_extract(before_json,'$.name')),'') END) FROM audit WHERE group_id=? AND lesson_id='account:'||requested.id AND action IN('createLocalAccount','deleteAccount','restoreAccount','permanentDelete','bind') AND ((json_valid(after_json) AND json_type(after_json,'$.name')='text') OR (json_valid(before_json) AND json_type(before_json,'$.name')='text')) ORDER BY at DESC,id DESC LIMIT 1),
  (SELECT nullif(trim(json_extract(after_json,'$.oldName')),'') FROM audit WHERE group_id=? AND action='mergeAccount' AND json_valid(after_json) AND json_extract(after_json,'$.oldAccountId')=requested.id AND json_type(after_json,'$.oldName')='text' ORDER BY at DESC,id DESC LIMIT 1)
 ) AS name FROM requested`).bind(JSON.stringify(unique),actor.groupId,actor.groupId,actor.groupId,actor.groupId).all<{id:string;name:string|null}>();
 for(const row of data.results||[]){const name=display(row.name);if(name)names.set(row.id,name);}
 if(unique.includes(actor.id)&&!names.has(actor.id))names.set(actor.id,display(actor.name));
 if(unique.includes('system'))names.set('system','系统');
 return names;
}
export function historicalAccountLabel(id:string,names:Map<string,string>){return names.get(id)||`已删除账号（${id.slice(-8)}）`;}
