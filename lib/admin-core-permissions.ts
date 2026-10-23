import type {Account} from './auth';
import {learningDb} from './learning-server';
import {groupStatement} from './group-data';
import {adminPermissionsEnforced,requireAdminPermission,adminPermissionStatements,AdminPermissionDenied} from './admin-permission-access';

// Keep permission guards and writes in the same transaction while preserving
// the business code's result indexes and existing tenant/ownership predicates.
export async function requireCorePermissions(actor:Account,keys:readonly string[]) {
  if(actor.role!=="admin")return;
  for(const key of new Set(keys))await requireAdminPermission(actor,key);
}
export function corePermissionKeys(action:string):string[] {
  const keys:Record<string,string>={
    createLocalAccount:'accounts.create',resetLocalPassword:'accounts.resetPassword',activateAccount:'accounts.activate',deleteAccount:'accounts.disable',restoreAccount:'accounts.restore',bind:'accounts.assign',
    saveStudent:'students.create',updateStudentProfile:'students.edit',create:'lessons.create',edit:'lessons.edit',cancel:'lessons.cancel',
    attendance:'attendance.edit',review:'attendance.review',saveSessionAttendance:'attendance.edit',reviewSessionAttendance:'attendance.review',lockSessionAttendance:'attendance.review',unlockSessionAttendance:'attendance.review',
    proposeReschedule:'reschedules.create',respondReschedule:'reschedules.respond',
    createClassSession:'lessons.create',editClassSession:'lessons.edit',cancelClassSession:'lessons.cancel',proposeClassReschedule:'reschedules.create',respondClassReschedule:'reschedules.respond',updateClassSessionLink:'lessons.edit',
  };
  return keys[action]?[keys[action]]:[];
}
export function rejectUnknownAdminAction(actor:Account,keys:readonly string[]) {
  if(actor.role==='admin'&&adminPermissionsEnforced()&&!keys.length)throw new AdminPermissionDenied();
}
export function guardedCoreDb(actor:Account,keys:readonly string[]):D1Database {
  const raw=learningDb(),unwrapped=new WeakMap<object,D1PreparedStatement>();
  const guards=()=>[...new Set(keys)].flatMap(key=>adminPermissionStatements(actor,key));
  const batch=async <T=unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>=>{
    const checks=guards();
    const result=await raw.batch<T>([...checks,...statements.map(statement=>unwrapped.get(statement)||statement)]);
    return result.slice(checks.length);
  };
  const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>{
    const proxy=new Proxy(statement,{get(target,key){
      if(key==='bind')return (...args:unknown[])=>wrap(target.bind(...args));
      if(key==='run')return async <T=Record<string,unknown>>()=>(await batch<T>([target]))[0];
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
    unwrapped.set(proxy,statement);return proxy;
  };
  return new Proxy(raw,{get(target,key){
    if(key==='prepare')return (query:string)=>wrap(target.prepare(query));
    if(key==='batch')return batch;
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
}
export async function guardedCoreRun<T=Record<string,unknown>>(actor:Account,keys:readonly string[],statement:D1PreparedStatement) {
  return (await guardedCoreDb(actor,keys).batch<T>([statement]))[0];
}
export async function guardedCoreChange(actor:Account,keys:readonly string[],action:string,recordId:string,after:Record<string,unknown>|null=null) {
  const db=guardedCoreDb(actor,keys);
  await db.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,?,NULL,?,?)')
    .bind(actor.groupId,crypto.randomUUID(),`learning:${recordId}`,actor.id,action,after?JSON.stringify(after):null,new Date().toISOString()).run();
}
export function guardedCoreReader(actor:Account,keys:readonly string[]) {
  const db=guardedCoreDb(actor,keys);
  const rows=async <T extends Record<string,unknown>=Record<string,unknown>>(query:string,...args:unknown[]):Promise<T[]>=>{
    const result=await db.batch<T>([groupStatement(actor.groupId,query).bind(...args)]);return result[0].results||[];
  };
  return {rows,first:async <T extends Record<string,unknown>=Record<string,unknown>>(query:string,...args:unknown[]):Promise<T|null>=>(await rows<T>(query,...args))[0]||null};
}
