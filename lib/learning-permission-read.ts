import type {Account} from "@/lib/auth";
import type {AdminGrantKey} from "@/lib/admin-permissions";
import {adminPermissionStatements} from "@/lib/admin-permission-access";
import {groupReader,groupStatement} from "@/lib/group-data";
import {learningDb} from "@/lib/learning-server";
type Row=Record<string,unknown>;

// Keep the live grant guard outside groupReader's scoped CTEs. The guard and
// projected rows share one SQLite snapshot, so a revoked grant cannot leak the
// following read, including historic versions and direct file URLs.
export function guardedLearningReader(account:Account,key:AdminGrantKey) {
  const reader=groupReader(account.groupId);
  const read=async <T extends Row>(query:string,values:unknown[])=>{
    const guards=adminPermissionStatements(account,key);
    if(!guards.length)return reader.rows<T>(query,...values);
    const results=await learningDb().batch([...guards,groupStatement(account.groupId,query).bind(...values)]);
    return results[guards.length].results as T[];
  };
  return {rows:<T extends Row=Row>(query:string,...values:unknown[])=>read<T>(query,values),first:async<T extends Row=Row>(query:string,...values:unknown[])=>(await read<T>(query,values))[0]||null};
}
