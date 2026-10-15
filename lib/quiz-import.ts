import {unzipSync} from 'fflate';
import {emptyQuiz,newQuestion,quizImageIds,quizImageMime,type QuizContent,type QuizKey} from './quiz';
import {parseQuizNotation} from './quiz-notation';
export type QuizImport={content:QuizContent;keys:QuizKey[];images:Map<string,Uint8Array>;warnings:string[];sourceKey:string;filename:string};
export class QuizImportError extends Error{constructor(public issues:string[]){super(issues.join('\n'));}}
const imagePath=/^images\/[\p{L}\p{N}_ .-]+\.(png|jpe?g|webp)$/iu;
const crcTable=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes:Uint8Array){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
// Validate central and local headers before allocation. fflate's filename map
// would otherwise silently overwrite duplicate paths, and it does not check CRC.
function zipEntries(bytes:Uint8Array){
 if(bytes.length<22)throw new QuizImportError(['Invalid ZIP: missing directory']);
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(d.getUint32(p,true)===0x06054b50&&p+22+d.getUint16(p+20,true)===bytes.length){end=p;break;}
 if(end<0||d.getUint16(end+4,true)!==0||d.getUint16(end+6,true)!==0)throw new QuizImportError(['Invalid ZIP or unsupported multi-volume archive']);
 const count=d.getUint16(end+10,true),size=d.getUint32(end+12,true),start=d.getUint32(end+16,true);
 if(!count||count>300||count!==d.getUint16(end+8,true)||start+size!==end)throw new QuizImportError(['ZIP directory is invalid or exceeds 300 entries']);
 const entries=new Map<string,{size:number;crc:number}>(),offsets=new Set<number>();let p=start,total=0;
 for(let i=0;i<count;i++){
  if(p+46>end||d.getUint32(p,true)!==0x02014b50)throw new QuizImportError(['Invalid ZIP directory entry']);
  const flags=d.getUint16(p+8,true),method=d.getUint16(p+10,true),crc=d.getUint32(p+16,true),compressed=d.getUint32(p+20,true),original=d.getUint32(p+24,true),nameSize=d.getUint16(p+28,true),extra=d.getUint16(p+30,true),comment=d.getUint16(p+32,true),disk=d.getUint16(p+34,true),local=d.getUint32(p+42,true),next=p+46+nameSize+extra+comment;
  if(next>end||flags&1||disk||![0,8].includes(method)||!nameSize||local+30>start)throw new QuizImportError(['ZIP contains encrypted, unsupported or invalid entries']);
  let name:string;try{name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(p+46,p+46+nameSize));}catch{throw new QuizImportError(['ZIP filenames must use UTF-8']);}
  total+=original;
  if(entries.has(name)||offsets.has(local)||original>5*1024*1024||total>60*1024*1024||name.startsWith('/')||name.includes('\\')||name.includes(':')||/[\u0000-\u001f]/u.test(name)||name.split('/').some(x=>x==='..'||x==='.'))throw new QuizImportError(['ZIP contains duplicate/unsafe paths or exceeds extraction limits']);
  if(d.getUint32(local,true)!==0x04034b50||d.getUint16(local+8,true)!==method||d.getUint16(local+6,true)!==flags||d.getUint16(local+26,true)!==nameSize)throw new QuizImportError(['ZIP local header differs from directory']);
  const dataStart=local+30+nameSize+d.getUint16(local+28,true);
  if(dataStart+compressed>start||dataStart>start||new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(local+30,local+30+nameSize))!==name)throw new QuizImportError(['ZIP entry data is truncated or inconsistent']);
  if(name==='questions.txt'&&original>1024*1024)throw new QuizImportError(['questions.txt maximum: 1 MB']);
  if(method===0&&compressed!==original)throw new QuizImportError(['Stored ZIP entry has an invalid size']);
  entries.set(name,{size:original,crc});offsets.add(local);p=next;
 }
 if(p!==end)throw new QuizImportError(['ZIP directory length is inconsistent']);return entries;
}
export function parseQuestionText(source:string,files:Map<string,Uint8Array>){
 const issues:string[]=[],warnings:string[]=[],content=emptyQuiz(),keys:QuizKey[]=[],usedIds=new Set<string>(),usedNumbers=new Set<number>();content.primaryLanguage='ms';
 const clean=source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),blocks=clean.split(/(?=^\[Q\d+\]\s*$)/m).filter(x=>/^\[Q\d+\]/.test(x));
 if(!blocks.length||blocks.length>150)throw new QuizImportError(['questions.txt: 1–150 [Q01] question blocks required']);
 if([...clean.matchAll(/^\[Q[^\]\n]*\]\s*$/gm)].some(m=>!/^\[Q\d+\]\s*$/.test(m[0])))throw new QuizImportError(['Invalid question block header: use [Q01]']);
 for(const block of blocks){const number=block.match(/^\[Q(\d+)\]/)![1],fields=new Map<string,string>();let current='';
  if(usedNumbers.has(Number(number)))issues.push('Q'+number+': duplicate question number');usedNumbers.add(Number(number));
  for(const line of block.split('\n').slice(1)){const match=line.match(/^([^：\n]{1,100})[：](.*)$/);if(match){current=match[1].trim();if(fields.has(current))issues.push('Q'+number+': duplicate field '+current);fields.set(current,match[2].trim());}else if(line.trim()&&current)fields.set(current,(fields.get(current)||'')+'\n'+line.trim());}
  const get=(k:string)=>fields.get(k)||'',{question:q,key}=newQuestion('mcq');q.sourceId=get('题目编码');q.level=get('所属年级');q.chapter=[get('所属章节'),get('所属子章节')].filter(Boolean).join(' · ').slice(0,200);q.prompt={primary:get('题干 (BM)'),en:get('题干 (EN)')};
  if(!q.sourceId||usedIds.has(q.sourceId))issues.push('Q'+number+': missing or duplicate 题目编码');usedIds.add(q.sourceId);
  if(!['easy','medium','hard'].includes(get('难度等级')))issues.push('Q'+number+': difficulty must be easy / medium / hard');else q.difficulty=get('难度等级') as typeof q.difficulty;
  if(!q.prompt.primary&&!q.prompt.en)issues.push('Q'+number+': missing prompt');
  const image=(label:string)=>{const p=get(label);if(!p||p==='NONE')return null;if(!imagePath.test(p)||p.includes('..')||!files.has(p)){issues.push('Q'+number+': image not found or invalid path '+p);return null;}return p;};q.imageId=image('图片入口');
  q.options=q.options.map((o,i)=>{const letter=String.fromCharCode(65+i);o.text={primary:get('选项 '+letter+' (BM)'),en:get('选项 '+letter+' (EN)')};o.imageId=image('选项 '+letter+' 图片入口');if(!o.text.primary&&!o.text.en&&!o.imageId)issues.push('Q'+number+': empty option '+letter);return o;});
  const composite=image('选项合图入口');if(composite)q.extraImageIds=[composite];
  const correct=get('标准答案');if(!/^[A-D]$/.test(correct))issues.push('Q'+number+': answer must be A / B / C / D');else key.correctOptionId=q.options[correct.charCodeAt(0)-65].id;
  for(const [field,value] of [['题干 (BM)',q.prompt.primary],['题干 (EN)',q.prompt.en],...q.options.flatMap((o,i)=>[[`选项 ${String.fromCharCode(65+i)} (BM)`,o.text.primary],[`选项 ${String.fromCharCode(65+i)} (EN)`,o.text.en]])])for(const warning of parseQuizNotation(value).warnings)warnings.push(`Q${number} ${field}: 符号范围不明确，保留原文，请对照原卷检查 / Ambiguous notation kept as written; check the source: ${warning.expression}`);
  content.questions.push(q);keys.push(key);
 }
 if(issues.length)throw new QuizImportError(issues);
 const used=new Set(quizImageIds(content)),unused=[...files.keys()].filter(k=>!used.has(k));if(unused.length)warnings.push('Unused image files: '+unused.join(', '));
 return {content,keys,warnings};
}
export async function importQuizZip(bytes:Uint8Array,filename:string):Promise<QuizImport>{
 if(bytes.length>20*1024*1024)throw new QuizImportError(['ZIP maximum: 20 MB']);const directory=zipEntries(bytes);let entries:Record<string,Uint8Array>;
 try{entries=unzipSync(bytes,{filter:f=>f.name==='questions.txt'||imagePath.test(f.name)});}catch(e){if(e instanceof QuizImportError)throw e;throw new QuizImportError(['Invalid or damaged ZIP compression']);}
 if(!entries['questions.txt'])throw new QuizImportError(['questions.txt must be at the ZIP root']);if(entries['questions.txt'].length>1024*1024)throw new QuizImportError(['questions.txt maximum: 1 MB']);
 let actual=0;for(const [name,value] of Object.entries(entries)){const meta=directory.get(name);actual+=value.length;if(!meta||value.length!==meta.size||actual>60*1024*1024||crc32(value)!==meta.crc)throw new QuizImportError(['ZIP entry size or checksum mismatch: '+name]);if(name!=='questions.txt'&&!quizImageMime(value))throw new QuizImportError(['Invalid image content: '+name]);}
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(entries['questions.txt']);}catch{throw new QuizImportError(['questions.txt must use UTF-8']);}
 const images=new Map(Object.entries(entries).filter(([name])=>imagePath.test(name))),parsed=parseQuestionText(text,images);
 const skipped=[...directory.keys()].filter(name=>!name.endsWith('/')&&!(name in entries));if(skipped.length)parsed.warnings.push('Ignored unsupported files: '+skipped.join(', '));
 const sourceKey=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('');
 parsed.content.title=filename.replace(/\.zip$/i,'').slice(0,160);
 return {...parsed,images,sourceKey,filename};
}
