import {env} from 'cloudflare:workers';
import {detectGameCover,gameUploadRequest,uploadId} from './tickgame-studio-schema';
import type {GameUploadRequest,StudioDraft,StudioGame,StudioCover} from './tickgame-studio-schema';

const inventoryKey='studio/v1/catalog.json';
const payloadLimit=1024*1024;
const manifestKey=(game:string,version:string)=>'studio/v1/versions/'+game+'/'+version+'/manifest.json';
const readyKey=(game:string,version:string)=>'studio/v1/versions/'+game+'/'+version+'/ready.json';
const coverKey=(game:string,version:string)=>'studio/v1/versions/'+game+'/'+version+'/cover';
export const bundlePrefix=(game:string,version:string)=>'studio/v1/versions/'+game+'/'+version+'/files/';

export async function studioGames(bucket=env.TICKGAME_ASSETS):Promise<StudioGame[]> {
  const inventory=await bucket?.get(inventoryKey);
  return inventory ? inventory.json<StudioGame[]>() : [];
}

export async function studioDraft(bucket:R2Bucket,game:string,version:string) {
  const item=await bucket.get(manifestKey(game,version));
  return item?.json<StudioDraft>();
}

export async function studioReady(bucket:R2Bucket,game:string,version:string) {
  return Boolean(await bucket.head(readyKey(game,version)));
}

export async function studioCover(bucket:R2Bucket,game:string,cover:StudioCover,head:boolean) {
  return head ? bucket.head(coverKey(game,cover.version)) : bucket.get(coverKey(game,cover.version));
}

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const failure=(error:string,status=400)=>reply({error},status);
const writeOnce={onlyIf:{etagDoesNotMatch:'*'}};

async function readInput(request:Request) {
  if(!request.body) return null;
  const buffer=new Uint8Array(payloadLimit);
  const reader=request.body.getReader();
  let length=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(length+value.byteLength>buffer.byteLength)return null;
      buffer.set(value,length);length+=value.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(buffer.subarray(0,length)));
  }catch{return null;}
  finally{await reader.cancel().catch(()=>{});}
}

async function create(bucket:R2Bucket,body:GameUploadRequest) {
  const game=body.game||crypto.randomUUID(), version=crypto.randomUUID();
  const previous=body.game ? (await studioGames(bucket)).find(item=>item.id===game) : undefined;
  if(body.game&&!previous)return failure('game-not-found',404);
  if(!body.cover&&!previous)return failure('cover-required');
  const cover=body.cover ? {version,type:body.cover.type} : previous!.cover;
  const draft:StudioDraft={game,version,title:body.title,subject:body.subject,description:body.description,
    previousVersion:previous?.version||null,cover,coverSize:body.cover?.size||0,files:body.files,createdAt:Date.now()};
  if(!await bucket.put(manifestKey(game,version),JSON.stringify(draft),writeOnce))return failure('conflict',409);
  return reply({game,version},201);
}

async function storeFile(request:Request,bucket:R2Bucket,draft:StudioDraft,index:string) {
  if(index==='cover'){
    if(draft.cover.version!==draft.version||Number(request.headers.get('content-length'))!==draft.coverSize)
      return failure('file-size');
    const image=await request.arrayBuffer();
    if(image.byteLength!==draft.coverSize||detectGameCover(new Uint8Array(image,0,Math.min(12,image.byteLength)))!==draft.cover.type)return failure('cover-format');
    await bucket.put(coverKey(draft.game,draft.version),image,writeOnce);
    return reply({ok:true});
  }
  if(!/^\d{1,4}$/.test(index))return failure('file-not-found',404);
  const file=draft.files[Number(index)];
  const size=request.headers.get('content-length');
  if(!file||size===null||Number(size)!==file.size)return failure('file-size');
  if(file.size&&!request.body)return failure('file-size');
  const key=bundlePrefix(draft.game,draft.version)+file.path;
  const saved=await bucket.put(key,request.body??new Uint8Array(),writeOnce);
  if(!saved && (await bucket.head(key))?.size!==file.size)return failure('file-size',409);
  return reply({ok:true});
}

async function finish(bucket:R2Bucket,draft:StudioDraft) {
  const prefix=bundlePrefix(draft.game,draft.version);
  const files=new Map(draft.files.map(file=>[prefix+file.path,file.size]));
  let cursor: string|undefined;
  do{
    const result=await bucket.list({prefix,cursor,limit:1000});
    for(const object of result.objects)if(files.get(object.key)===object.size)files.delete(object.key);
    cursor=result.truncated ? result.cursor : undefined;
  }while(cursor);
  if(files.size||(draft.coverSize&& (await bucket.head(coverKey(draft.game,draft.version)))?.size!==draft.coverSize))
    return failure('incomplete',409);
  await bucket.put(readyKey(draft.game,draft.version),'1',writeOnce);
  return reply({ok:true});
}

async function publish(bucket:R2Bucket,draft:StudioDraft) {
  if(!await studioReady(bucket,draft.game,draft.version))return failure('incomplete',409);
  const game:StudioGame={id:draft.game,version:draft.version,title:draft.title,subject:draft.subject,
    description:draft.description,cover:draft.cover,publishedAt:new Date().toISOString()};
  for(let attempts=0;attempts<4;attempts++){
    const inventory=await bucket.get(inventoryKey);
    const items=inventory?await inventory.json<StudioGame[]>():[];
    const current=items.find(item=>item.id===game.id);
    if(current?.version===game.version)return reply({ok:true});
    if((current?.version||null)!==draft.previousVersion)return failure('version-conflict',409);
    const next=[game,...items.filter(item=>item.id!==game.id)];
    const result=await bucket.put(inventoryKey,JSON.stringify(next),{
      onlyIf:inventory?{etagMatches:inventory.etag}:{etagDoesNotMatch:'*'},
    });
    if(result)return reply({ok:true});
  }
  return failure('conflict',409);
}

export async function studioApi(request:Request,bucket:R2Bucket) {
  const url=new URL(request.url), action=url.searchParams.get('action');
  if(action==='create'&&request.method==='POST'){
    const input=gameUploadRequest.safeParse(await readInput(request));
    return input.success?create(bucket,input.data):failure('invalid-package');
  }
  const game=uploadId.safeParse(url.searchParams.get('game')),version=uploadId.safeParse(url.searchParams.get('version'));
  if(!game.success||!version.success)return failure('draft-not-found',404);
  const draft=await studioDraft(bucket,game.data,version.data);
  if(!draft)return failure('draft-not-found',404);
  if(action==='file'&&request.method==='PUT')return storeFile(request,bucket,draft,url.searchParams.get('file')||'');
  if(action==='finish'&&request.method==='POST')return finish(bucket,draft);
  if(action==='publish'&&request.method==='POST')return publish(bucket,draft);
  return failure('method',405);
}
