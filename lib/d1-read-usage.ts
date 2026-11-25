import {AsyncLocalStorage} from 'node:async_hooks';
import type {Account} from './auth';
import {currentDiagnosticContext} from './diagnostics-context';

type Usage={queries:number;rowsRead:number;rowsWritten:number;durationMs:number;missingMeta:number};
const storage=new AsyncLocalStorage<Usage>();
const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0;
const identifier=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_:-]{1,128}$/.test(value)?value:null;

/** Aggregate metadata already returned by guarded core batches; never query or write D1. */
export function recordD1ReadUsage(results:readonly {meta?:unknown}[]){
 const usage=storage.getStore();if(!usage)return;
 for(const result of results){
  usage.queries++;
  const meta=result.meta as {rows_read?:unknown;rows_written?:unknown;duration?:unknown}|undefined;
  if(typeof meta?.rows_read!=='number')usage.missingMeta++;
  usage.rowsRead+=count(meta?.rows_read);usage.rowsWritten+=count(meta?.rows_written);usage.durationMs+=count(meta?.duration);
 }
}

/** Internal IDs only: no SQL, bound values, names, email, URL query, cookies or tokens. */
export async function withD1ReadUsage<T>(actor:Account,route:'/api/home-summary'|'/api/courses',run:()=>Promise<T>):Promise<T>{
 const usage:Usage={queries:0,rowsRead:0,rowsWritten:0,durationMs:0,missingMeta:0};
 return storage.run(usage,async()=>{
  let outcome='ok';
  try{return await run();}catch(error){outcome='error';throw error;}
  finally{
   try{
    const context=currentDiagnosticContext();
    console.info(JSON.stringify({event:'tickminder.d1_read_usage',coverage:'guarded-core-batches',source:'authenticated-api',route,
     accountId:identifier(actor.id),groupId:identifier(actor.groupId),role:['admin','teacher','student','parent'].includes(actor.role)?actor.role:'other',
     requestId:identifier(context?.requestId),buildId:identifier(context?.buildId),outcome,...usage}));
   }catch{/* Observability must not change a business result. */}
  }
 });
}
