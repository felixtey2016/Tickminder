import assert from 'node:assert/strict';
import {createFixtureLoader} from './fixture-loader.mjs';
const {module:client}=await createFixtureLoader({runtimeFiles:[]})('lib/google-drive-client.ts');
const selection={id:'fictional-file_1',name:'Selected worksheet.pdf',mimeType:'application/pdf',resourceKey:'fictional-resource-key'},token='fictional-private-memory-token',pdf=new TextEncoder().encode('%PDF-1.7\nfictional PDF bytes\n%%EOF');
let calls=[],cancelled=0,checks=0;
function check(label,fn){fn();checks++;console.log('PASS '+label);}
function setup(options={}){
 calls=[];cancelled=0;const metadata={id:selection.id,name:'Actual worksheet.pdf',mimeType:'application/pdf',size:String(pdf.length),capabilities:{canDownload:true},...options.metadata};
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});if(calls.length===1){options.afterMetadata?.();if(options.invalidJson)return new Response('invalid JSON');return Response.json(metadata,{status:options.metadataStatus||200});}
  if(options.noBody)return new Response(null);
  const chunks=(options.chunks||[pdf]).slice();let loaded=0;
  const stream=new ReadableStream({pull(controller){if(chunks.length){controller.enqueue(chunks.shift());loaded++;options.onPull?.(loaded);}else controller.close();},cancel(){cancelled++;}},{highWaterMark:0});
  return new Response(stream,{status:options.mediaStatus||200,headers:options.headers||{}});
 };
}
async function download(options={},limit=10485760,chosen=selection,accessToken=token){setup(options);return client.downloadDrivePdf(chosen,accessToken,limit,options.signal||new AbortController().signal,options.progress);}
async function rejects(label,expected,options={},limit=10485760,chosen=selection,accessToken=token){let error;try{await download(options,limit,chosen,accessToken);}catch(e){error=e;}check(label,()=>{assert(error,'must reject');if(expected==='AbortError')assert.equal(error.name,'AbortError');else{assert(error instanceof client.GoogleDriveClientError);assert.equal(error.code,expected);}});}
const progress=[];let file=await download({chunks:[pdf.slice(0,1),pdf.slice(1,3),pdf.slice(3,5),pdf.slice(5)],progress:(loaded,total)=>progress.push([loaded,total])});
check('fragmented PDF signature downloads the exact selected bytes',()=>{assert(file instanceof File);assert.equal(file.name,'Actual worksheet.pdf');assert.equal(file.type,'application/pdf');assert.equal(file.size,pdf.length);assert.deepEqual(progress.at(-1),[pdf.length,pdf.length]);});
check('REST requests use fixed Google host and memory-only bearer with no URL credential',()=>{assert.equal(calls.length,2);for(const call of calls){const u=new URL(call.url);assert.equal(u.origin,'https://www.googleapis.com');assert.equal(u.pathname,'/drive/v3/files/'+selection.id);assert(!call.url.includes(token));assert(!u.searchParams.has('access_token'));assert.equal(call.init.headers.Authorization,'Bearer '+token);assert.equal(call.init.headers['X-Goog-Drive-Resource-Keys'],selection.id+'/'+selection.resourceKey);assert.equal(call.init.credentials,'omit');assert.equal(call.init.redirect,'error');assert.equal(call.init.referrerPolicy,'no-referrer');}const fields=new URL(calls[0].url).searchParams.get('fields');assert.equal(fields,'id,name,mimeType,size,capabilities(canDownload)');assert.equal(new URL(calls[1].url).searchParams.get('alt'),'media');});
check('downloaded content preserves original PDF bytes',()=>{});assert.deepEqual(new Uint8Array(await file.arrayBuffer()),pdf);
await rejects('Drive capabilities deny preview-only PDF download','download_forbidden',{metadata:{capabilities:{canDownload:false}}});check('denied Drive capabilities never request media bytes',()=>assert.equal(calls.length,1));
await rejects('missing Drive capability cannot imply download permission','download_forbidden',{metadata:{capabilities:undefined}});
await rejects('a response for a different Drive ID cannot substitute another document','invalid_selection',{metadata:{id:'different-file'}});
await rejects('native Google documents cannot masquerade as PDF blobs','not_pdf',{metadata:{mimeType:'application/vnd.google-apps.document'}});
await rejects('empty metadata is rejected before media fetch','empty_file',{metadata:{size:'0'}});
await rejects('metadata above the real ten MiB cap is rejected','too_large',{metadata:{size:'10485761'}});
await rejects('caller quota can lower the download bound','too_large',{},pdf.length-1);
await rejects('declared media Content-Length above bound cancels the body','too_large',{metadata:{size:undefined},headers:{'Content-Length':'10485761'}});check('oversized declared body was cancelled',()=>assert.equal(cancelled,1));
await rejects('unknown-length streams are bounded by actual received bytes','too_large',{metadata:{size:undefined},chunks:[pdf,new Uint8Array(10485760)]});check('unknown-length oversized stream is cancelled',()=>assert.equal(cancelled,1));
const huge=new Uint8Array(10485761);huge.set(pdf);
await rejects('a single oversized chunk cannot bypass the ten MiB cap','too_large',{metadata:{size:undefined},chunks:[huge]},Number.MAX_SAFE_INTEGER);check('oversized single chunk is cancelled',()=>assert.equal(cancelled,1));
await rejects('misleading short Content-Length cannot bypass actual stream bound','too_large',{metadata:{size:undefined},headers:{'Content-Length':'5'},chunks:[pdf,new Uint8Array(64)]},64);check('misleading-length stream is cancelled',()=>assert.equal(cancelled,1));
file=await download({metadata:{size:undefined},headers:{'Content-Length':'1'}});check('unknown metadata size supports bounded valid PDF downloads',()=>assert.equal(file.size,pdf.length));
await rejects('metadata byte changes are detected after download','file_changed',{metadata:{size:String(pdf.length+1)}});
await rejects('a forged PDF name and MIME do not bypass the signature','not_pdf',{metadata:{size:undefined},chunks:[new TextEncoder().encode('<html>not PDF</html>')]});check('invalid-signature stream is cancelled immediately',()=>assert.equal(cancelled,1));
await rejects('too-short PDF signatures cannot become uploaded files','not_pdf',{metadata:{size:undefined},chunks:[new TextEncoder().encode('%PDF')]});
await rejects('empty media stream cannot produce an empty PDF file','empty_file',{metadata:{size:undefined},chunks:[]});
await rejects('missing media body fails visibly','download_failed',{noBody:true});
await rejects('invalid metadata JSON fails visibly','download_failed',{invalidJson:true});
for(const status of[401,403,404])await rejects('metadata HTTP '+status+' is classified',status===401?'authorization_expired':status===403?'download_forbidden':'download_failed',{metadataStatus:status});
for(const status of[401,403,500])await rejects('download HTTP '+status+' is classified',status===401?'authorization_expired':status===403?'download_forbidden':'download_failed',{mediaStatus:status});
const preAbort=new AbortController();preAbort.abort();await rejects('pre-aborted queues make no Google request','AbortError',{signal:preAbort.signal});check('pre-abort performs no fetch',()=>assert.equal(calls.length,0));
const metadataAbort=new AbortController();await rejects('aborting during metadata stops before media','AbortError',{signal:metadataAbort.signal,afterMetadata:()=>metadataAbort.abort()});check('metadata abort performs no media fetch',()=>assert.equal(calls.length,1));
const streamAbort=new AbortController();await rejects('mid-stream abort stops reading and cancels the body','AbortError',{signal:streamAbort.signal,chunks:[pdf.slice(0,5),pdf.slice(5)],onPull:count=>{if(count===1)streamAbort.abort();}});check('aborted media stream is cancelled',()=>assert.equal(cancelled,1));
await rejects('empty access token cannot cause unauthenticated Google download','authorization_expired',{},10485760,selection,'');check('missing token performs no fetch',()=>assert.equal(calls.length,0));
await rejects('path traversal in file ID never becomes an arbitrary request','invalid_selection',{},10485760,{...selection,id:'../other?access_token=oops'});check('invalid ID performs no fetch',()=>assert.equal(calls.length,0));
file=await download({metadata:{name:'../secret\u202e.pdf\n'}});check('untrusted Drive filenames lose traversal separators and directional controls',()=>{assert(!/[\\/\u0000-\u001f\u202a-\u202e]/.test(file.name));assert(file.name.endsWith('.pdf'));assert(file.name.length<=124);});
check('long and blank filenames get bounded safe PDF names',()=>{assert.equal(client.sanitizeDriveFilename(' '.repeat(20)),'Google Drive PDF.pdf');assert(client.sanitizeDriveFilename('x'.repeat(500)).length<=124);assert.equal(client.sanitizeDriveFilename('Notes.PDF'),'Notes.pdf');});
console.log(JSON.stringify({suite:'google-drive-client-download',checks,networkRequests:0,productionWrites:false}));
