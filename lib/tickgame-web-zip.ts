import {gameFileList,maxGameFiles,maxGameZipBytes,validPackagePath} from './tickgame-studio-schema';
import type {GameFile} from './tickgame-studio-schema';

type Entry = GameFile & {packed:number; offset:number; method:number};
export async function openWebGameZip(file: File) {
  if (file.size > maxGameZipBytes || file.size < 22) throw new Error('zip-size');
  const tailStart=Math.max(0,file.size-65557);
  const tail=new DataView(await file.slice(tailStart).arrayBuffer());
  let footer=-1;
  for(let offset=tail.byteLength-22;offset>=0;offset--){
    if(tail.getUint32(offset,true)===0x06054b50 && offset+22+tail.getUint16(offset+20,true)===tail.byteLength){
      footer=offset;break;
    }
  }
  if(footer<0 || tail.getUint16(footer+4,true) || tail.getUint16(footer+6,true)) throw new Error('zip-format');
  const count=tail.getUint16(footer+10,true);
  const size=tail.getUint32(footer+12,true), start=tail.getUint32(footer+16,true);
  if(count>maxGameFiles*2 || size>4*1024*1024 || start+size>tailStart+footer ||
      count!==tail.getUint16(footer+8,true)) throw new Error('zip-format');

  const data=await file.slice(start,start+size).arrayBuffer();
  const central=new DataView(data), entries:Entry[]=[];
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let cursor=0;
  for(let i=0;i<count;i++){
    if(cursor+46>size || central.getUint32(cursor,true)!==0x02014b50)throw new Error('zip-format');
    const nameLength=central.getUint16(cursor+28,true);
    const next=cursor+46+nameLength+central.getUint16(cursor+30,true)+central.getUint16(cursor+32,true);
    if(next>size)throw new Error('zip-format');
    const path=decoder.decode(new Uint8Array(data,cursor+46,nameLength));
    const mode=central.getUint32(cursor+38,true)>>>16;
    const flags=central.getUint16(cursor+8,true);
    const method=central.getUint16(cursor+10,true);
    if((flags&1) || (mode&0xf000)===0xa000 || (method!==0&&method!==8) ||
        !validPackagePath(path.endsWith('/')?path.slice(0,-1):path)) throw new Error('zip-format');
    if(!path.endsWith('/') && !path.startsWith('__MACOSX/') && !path.endsWith('/.DS_Store') && path!=='.DS_Store'){
      entries.push({path,method,crc:central.getUint32(cursor+16,true),packed:central.getUint32(cursor+20,true),
        size:central.getUint32(cursor+24,true),offset:central.getUint32(cursor+42,true)});
    }
    cursor=next;
  }
  if(cursor!==size)throw new Error('zip-format');
  const list=gameFileList.safeParse(entries.map(({path,size,crc})=>({path,size,crc})));
  if(!list.success)throw new Error('zip-content');

  async function unpack(index:number) {
    const entry=entries[index];
    const header=new DataView(await file.slice(entry.offset,entry.offset+30).arrayBuffer());
    if(header.byteLength!==30 || header.getUint32(0,true)!==0x04034b50 || header.getUint16(8,true)!==entry.method)throw new Error('zip-format');
    const payload=entry.offset+30+header.getUint16(26,true)+header.getUint16(28,true);
    if(payload+entry.packed>start)throw new Error('zip-format');
    const body=file.slice(payload,payload+entry.packed);
    if(entry.method===0){
      if(body.size!==entry.size)throw new Error('zip-content');
      return body;
    }
    const reader=body.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks:Uint8Array<ArrayBuffer>[]=[];
    let size=0;
    try{
      for(;;){
        const result=await reader.read();
        if(result.done)break;
        size+=result.value.byteLength;
        if(size>entry.size)throw new Error('zip-content');
        chunks.push(new Uint8Array(result.value));
      }
      if(size!==entry.size)throw new Error('zip-content');
      return new Blob(chunks);
    }finally{await reader.cancel().catch(()=>{});}
  }
  return {files:list.data,unpack};
}
