import {beginPrivateImageMutation,getPrivateReadSnapshot} from './private-read-lifecycle';
import {PrivateReadInvalidatedError} from './private-read-flight';

export type QuizUploadEntry={path:string;bytes:Uint8Array};
const cacheScopes=new WeakMap<Map<string,string>,number>();

/** Keep only a small number of image requests in flight. A failed run drains
 * requests already started and retains successful hashes for the next retry. */
export async function uploadQuizImages(entries:QuizUploadEntry[],cache:Map<string,string>,upload:(entry:QuizUploadEntry)=>Promise<string>,onProgress:(completed:number,total:number)=>void=()=>{}){
 const context=getPrivateReadSnapshot();
 if(cacheScopes.get(cache)!==context.clearEpoch){cache.clear();cacheScopes.set(cache,context.clearEpoch);}
 const current=()=>{const now=getPrivateReadSnapshot();if(now.authEpoch!==context.authEpoch||now.clearEpoch!==context.clearEpoch||now.blocked)throw new PrivateReadInvalidatedError(true);};
 const finish=beginPrivateImageMutation();
 try {
 const unique=[...new Map(entries.map(entry=>[entry.path,entry])).values()];
 const replacements=new Map<string,string>(),inflight=new Map<string,Promise<string>>();
 let cursor=0,completed=0,failed=false,failure:unknown;
 onProgress(0,unique.length);
 async function worker(){
  while(!failed&&cursor<unique.length){
   const entry=unique[cursor++];
   try{
    current();
    const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(entry.bytes).buffer);
    current();
    const hash=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
    let id=cache.get(hash);
    if(!id){
     let request=inflight.get(hash);
     if(!request){request=upload(entry).then(value=>{current();cache.set(hash,value);return value;});inflight.set(hash,request);}
     id=await request;
    }
    replacements.set(entry.path,id);onProgress(++completed,unique.length);
   }catch(error){if(!failed){failed=true;failure=error;}}
  }
 }
 await Promise.all(Array.from({length:Math.min(3,unique.length)},()=>worker()));
 current();
 if(failed)throw failure;
 return replacements;
 } finally {
  if(getPrivateReadSnapshot().clearEpoch!==context.clearEpoch&&cacheScopes.get(cache)===context.clearEpoch)cache.clear();
  finish({changed:false}); // Requests record committed/unknown changes.
 }
}
