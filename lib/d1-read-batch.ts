export type D1BatchRead = (statement:D1PreparedStatement)=>Promise<D1Result<Record<string,unknown>>>;

/** Request-local, read-only round-trip coalescing. Transaction writes stay separate. */
export function d1ReadBatch(db:D1Database):D1BatchRead {
 let pending:Array<{statement:D1PreparedStatement;resolve:(result:D1Result<Record<string,unknown>>)=>void;reject:(error:unknown)=>void}>=[];
 return statement=>new Promise((resolve,reject)=>{
  pending.push({statement,resolve,reject});
  if(pending.length===1)queueMicrotask(async()=>{const jobs=pending;pending=[];try{const result=await db.batch<Record<string,unknown>>(jobs.map(job=>job.statement));jobs.forEach((job,index)=>job.resolve(result[index]));}catch(error){jobs.forEach(job=>job.reject(error));}});
 });
}
