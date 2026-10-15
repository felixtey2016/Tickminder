export type QuizUploadEntry={path:string;bytes:Uint8Array};

/** Keep only a small number of image requests in flight. A failed run drains
 * requests already started and retains successful hashes for the next retry. */
export async function uploadQuizImages(entries:QuizUploadEntry[],cache:Map<string,string>,upload:(entry:QuizUploadEntry)=>Promise<string>,onProgress:(completed:number,total:number)=>void=()=>{}){
 const unique=[...new Map(entries.map(entry=>[entry.path,entry])).values()];
 const replacements=new Map<string,string>(),inflight=new Map<string,Promise<string>>();
 let cursor=0,completed=0,failed=false,failure:unknown;
 onProgress(0,unique.length);
 async function worker(){
  while(!failed&&cursor<unique.length){
   const entry=unique[cursor++];
   try{
    const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(entry.bytes).buffer);
    const hash=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
    let id=cache.get(hash);
    if(!id){
     let request=inflight.get(hash);
     if(!request){request=upload(entry).then(value=>{cache.set(hash,value);return value;});inflight.set(hash,request);}
     id=await request;
    }
    replacements.set(entry.path,id);onProgress(++completed,unique.length);
   }catch(error){if(!failed){failed=true;failure=error;}}
  }
 }
 await Promise.all(Array.from({length:Math.min(3,unique.length)},()=>worker()));
 if(failed)throw failure;
 return replacements;
}
