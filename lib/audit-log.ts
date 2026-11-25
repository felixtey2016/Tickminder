/** Audit statements join the caller's existing transaction and authority guard. */
export type AuditMetadata={actorName?:string;objectName?:string};
export type AuditEvent=AuditMetadata&{groupId:string;lessonId:string;actorId:string;action:string;before?:unknown;after?:unknown;id?:string;at?:string;guard?:{sql:string;args:unknown[]}};
export type AuditPreparer={prepare:(sql:string)=>D1PreparedStatement};
const sensitive=/(?:password|passwd|passphrase|credential|secret|token|cookie|authorization|privatekey|apikey|endpoint|subscription|objectkey|onlineLink|driveUrl|downloadUrl|fileUrl|attachmentUrl)|^(?:session|sessions|sessionhash|authsession|loginsession)$/i;
export function sensitiveAuditKey(key:string){return sensitive.test(key.replace(/[^a-z0-9]/gi,''));}
export function sanitizeAuditValue(value:unknown,depth=0):unknown{
 if(depth>8)return null;
 if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value==='string')return value.slice(0,4000);
 // The validated administrator catalog exceeds 100 grants. Keep complete
 // permission snapshots while retaining a fixed bound for arbitrary arrays.
 if(Array.isArray(value))return value.slice(0,256).map(item=>sanitizeAuditValue(item,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='_audit'&&!sensitiveAuditKey(key)).slice(0,100).map(([key,item])=>[key,sanitizeAuditValue(item,depth+1)]));
 return null;
}
export function auditJson(value:unknown,metadata?:AuditMetadata):string|null{
 const clean=sanitizeAuditValue(value),meta:AuditMetadata={};
 if(metadata?.actorName)meta.actorName=metadata.actorName.slice(0,160);
 if(metadata?.objectName)meta.objectName=metadata.objectName.slice(0,240);
 if(!Object.keys(meta).length)return value==null?null:JSON.stringify(clean);
 return JSON.stringify({...((clean&&typeof clean==='object'&&!Array.isArray(clean))?clean:{value:clean}),_audit:meta});
}
export function appendAudit(db:AuditPreparer,event:AuditEvent):D1PreparedStatement{
 const values=[event.groupId,event.id||crypto.randomUUID(),event.lessonId,event.actorId,event.action,auditJson(event.before),auditJson(event.after,{actorName:event.actorName,objectName:event.objectName}),event.at||new Date().toISOString()];
 return db.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) '+(event.guard?'SELECT ?,?,?,?,?,?,?,? WHERE '+event.guard.sql:'VALUES(?,?,?,?,?,?,?,?)')).bind(...values,...(event.guard?.args||[]));
}
