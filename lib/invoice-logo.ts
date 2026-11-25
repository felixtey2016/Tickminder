import { Unzlib } from 'fflate';

export const INVOICE_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export class InvoiceLogoError extends Error { constructor(message: string) { super(message); } }
const bad = () => { throw new InvoiceLogoError('图片格式无效，请上传有效的透明背景 PNG。'); };
const crcTable = Array.from({length:256}, (_,n) => { for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0; });
function crc(bytes:Uint8Array){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function paeth(a:number,b:number,c:number){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}

/** Decode a bounded PNG locally. An alpha channel alone does not prove that a logo has a transparent background. */
export function inspectInvoiceLogo(bytes:Uint8Array):{width:number;height:number}{
 if(bytes.length<57||bytes.length>INVOICE_LOGO_MAX_BYTES)throw new InvoiceLogoError('Logo 须为 2 MB 以内的透明背景 PNG。');
 if(![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))bad();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),idat:Uint8Array[]=[];
 let offset=8,width=0,height=0,depth=0,color=-1,channels=0,palette:Uint8Array|null=null,transparency:Uint8Array|null=null,ended=false,seenIdat=false,idatEnded=false;
 while(offset+12<=bytes.length){
  const length=view.getUint32(offset);if(length>bytes.length-offset-12)bad();
  const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8)),data=bytes.subarray(offset+8,offset+8+length);
  if(crc(bytes.subarray(offset+4,offset+8+length))!==view.getUint32(offset+8+length))bad();
  if(!width&&type!=='IHDR')bad();
  if(type==='IHDR'){
   if(width||length!==13)bad();width=view.getUint32(offset+8);height=view.getUint32(offset+12);depth=data[8];color=data[9];
   if(!width||!height||width>2048||height>2048)throw new InvoiceLogoError('Logo 的宽和高都不能超过 2048 像素。');
   const allowed:Record<number,number[]>={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
   if(!allowed[color]?.includes(depth)||data[10]!==0||data[11]!==0)bad();
   if(data[12]!==0)throw new InvoiceLogoError('请将 Logo 重新导出为非交错式透明 PNG，再上传。');
   channels=({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[color];
  }else if(type==='PLTE'){
   if(seenIdat||palette||!length||length%3||length>768||color===0||color===4)bad();palette=data;
  }else if(type==='tRNS'){
   if(seenIdat||transparency||color===4||color===6)bad();transparency=data;
  }else if(type==='IDAT'){
   if(idatEnded)bad();seenIdat=true;idat.push(data);
  }else if(type==='IEND'){
   if(length!==0||!seenIdat)bad();ended=true;offset+=12;break;
  }else if(type==='acTL'||type==='fcTL'||type==='fdAT')throw new InvoiceLogoError('Logo 不支持动画 PNG，请上传静态透明 PNG。');
  else if(type[0]===type[0].toUpperCase())bad();
  if(seenIdat&&type!=='IDAT')idatEnded=true;
  offset+=length+12;
 }
 if(!ended||offset!==bytes.length||!width||!idat.length)bad();
 if(color===3&&(!palette||palette.length/3>2**depth||transparency&&(!transparency.length||transparency.length>palette.length/3)))bad();
 if(transparency&&((color===0&&transparency.length!==2)||(color===2&&transparency.length!==6)))bad();
 if(color!==4&&color!==6&&!transparency)throw new InvoiceLogoError('Logo 没有透明背景，请先移除背景后另存为 PNG。');
 const stride=Math.ceil(width*channels*depth/8),expected=(stride+1)*height,compressed=new Uint8Array(idat.reduce((n,v)=>n+v.length,0));
 let at=0;for(const part of idat){compressed.set(part,at);at+=part.length;}
 // Small compressed chunks let us stop expansion as soon as it exceeds the declared dimensions.
 // Supplying a fixed output to a one-shot inflater bounds memory but still processes an entire compression bomb.
 const raw=new Uint8Array(expected);let written=0,finished=false;
 try{
  const inflater=new Unzlib((chunk,final)=>{if(written+chunk.length>expected)bad();raw.set(chunk,written);written+=chunk.length;if(final)finished=true;});
  for(let i=0;i<compressed.length;i+=256)inflater.push(compressed.subarray(i,i+256),i+256>=compressed.length);
 }catch{bad();}
 if(written!==expected||!finished)bad();
 let adlerA=1,adlerB=0;for(const value of raw){adlerA=(adlerA+value)%65521;adlerB=(adlerB+adlerA)%65521;}
 if(compressed.length<6||((adlerB*65536+adlerA)>>>0)!==new DataView(compressed.buffer).getUint32(compressed.length-4))bad();
 const bpp=Math.max(1,Math.ceil(channels*depth/8)),row=new Uint8Array(stride),previous=new Uint8Array(stride),max=2**depth-1;
 const transparentView=transparency?new DataView(transparency.buffer,transparency.byteOffset,transparency.byteLength):null;
 let hasTransparent=false,hasVisible=false;
 for(let y=0;y<height;y++){
  const start=y*(stride+1),filter=raw[start];if(filter>4)bad();
  for(let x=0;x<stride;x++){
   const a=x>=bpp?row[x-bpp]:0,b=previous[x],c=x>=bpp?previous[x-bpp]:0;
   row[x]=(raw[start+1+x]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;
  }
  const sample=(index:number)=>depth===16?(row[index*2]<<8)|row[index*2+1]:depth===8?row[index]:(row[Math.floor(index*depth/8)]>>>(8-depth-(index*depth%8)))&max;
  for(let x=0;x<width;x++){
   let alpha=max;
   if(color===6)alpha=sample(x*4+3);
   else if(color===4)alpha=sample(x*2+1);
   else if(color===3){const index=sample(x);if(index>=palette!.length/3)bad();alpha=transparency?.[index]??255;}
   else if(color===0&&transparentView)alpha=sample(x)===transparentView.getUint16(0)?0:max;
   else if(color===2&&transparentView)alpha=[0,1,2].every(c=>sample(x*3+c)===transparentView.getUint16(c*2))?0:max;
   if(alpha===0)hasTransparent=true;if(alpha>0)hasVisible=true;
  }
  previous.set(row);
 }
 if(!hasTransparent)throw new InvoiceLogoError('Logo 没有透明背景，请先移除背景后另存为 PNG。');
 if(!hasVisible)throw new InvoiceLogoError('Logo 完全透明，未发现可显示的内容。');
 return{width,height};
}
