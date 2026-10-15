import {deleteQuiz,quizManager,quizCanDelete} from '@/lib/quiz-delete';
import {isOwnerAccount} from '@/lib/owner';
import {quizActor,quizFailure,quizResponse,readQuiz,quizKeys,saveQuiz,shareQuiz,quizRequestBytes,quizCopyReplay} from '@/lib/quiz-server';
import {learningDb} from '@/lib/learning-server';
import {QuizError,type QuizCatalog,type QuizContent} from '@/lib/quiz';
import {quizBankKind,quizCatalogGroupKey} from '@/lib/quiz-catalog';

export async function GET(request:Request){try{
 const actor=await quizActor(true),url=new URL(request.url),id=url.searchParams.get('id'),bank=url.searchParams.get('bank')==='1',manage=url.searchParams.get('manage')==='1',manager=await quizManager(actor);
 if(manage&&(!manager||actor.role==='student'||bank))throw new QuizError('quiz.forbidden',403);
 if(actor.role==='student'&&(!bank||id&&url.searchParams.get('preview')!=='1'))throw new QuizError('quiz.forbidden',403);
 if(id){
  const r=await readQuiz(actor,id,bank),revision=r.revision;
  if(url.searchParams.get('preview')==='1')return quizResponse({id,revision,content:r.content});
  return quizResponse({id,revision,sharedRevision:r.q.shared_revision,visibility:r.q.visibility,canEdit:r.canEdit,canDelete:quizCanDelete(actor,r.q,manager),content:r.content,keys:await quizKeys(r.v.id),...(r.canEdit?{sourceKey:r.q.source_key}: {})});
 }
 const offset=Math.floor(Math.max(0,Math.min(10000,Number(url.searchParams.get('offset'))||0))),search=(url.searchParams.get('search')||'').trim().slice(0,100),subject=(url.searchParams.get('subject')||'').trim().slice(0,100),year=url.searchParams.get('year'),difficulty=url.searchParams.get('difficulty'),bankKind=url.searchParams.get('bankKind'),level=url.searchParams.get('level'),chapterCode=url.searchParams.get('chapterCode'),subtopicCode=url.searchParams.get('subtopicCode'),catalogKind=url.searchParams.get('catalogKind'),sort=url.searchParams.get('sort')||'latest',values:unknown[]=[];
 if(!['latest','oldest','title'].includes(sort))throw new QuizError('quiz.invalidFields');
 if(bankKind&&!['platform','creator'].includes(bankKind)||level&&!['Form 1','Form 2','Form 3','Form 4','Form 5'].includes(level)||catalogKind&&!['subtopic','chapter_overall','level_overall'].includes(catalogKind)||chapterCode&&!/^[1-9]\d{0,2}$/.test(chapterCode)||subtopicCode&&!/^[1-9]\d{0,2}(?:\.[1-9]\d{0,2}){1,3}$/.test(subtopicCode))throw new QuizError('quiz.invalidFields');
 let where=bank?"q.shared_revision IS NOT NULL AND (q.visibility='public' OR (q.visibility='organisation' AND q.group_id=?))":manage?(isOwnerAccount(actor)?'1=1':'q.group_id=?'):'q.group_id=? AND q.owner_id=?';if(!(manage&&isOwnerAccount(actor)))values.push(actor.groupId);if(!bank&&!manage)values.push(actor.id);where+=' AND q.deleted_at IS NULL';
 if(bankKind){where+=" AND COALESCE(json_extract(v.content_json,'$.bankKind'),'creator')=?";values.push(bankKind);}
 // Every projection, filter and aggregate uses the explicitly shared version.
 const from=`FROM quizzes q JOIN quiz_versions v ON v.quiz_id=q.id AND v.group_id=q.group_id AND v.revision=CASE WHEN ${bank?1:0}=1 THEN q.shared_revision ELSE q.revision END JOIN accounts a ON a.id=q.owner_id JOIN tuition_groups g ON g.id=q.group_id${manage&&isOwnerAccount(actor)?'':' AND g.active=1'}`;
 let facets:{subjects:string[];levels:string[];chapters:{code:string;title:string;level:string;subject:string}[];maintenanceImport:boolean;manageQuizzes:boolean}|undefined;
 if(url.searchParams.get('facets')==='1'){
  const rows=await learningDb().prepare(`SELECT DISTINCT json_extract(v.content_json,'$.subject') AS subject,json_extract(v.content_json,'$.catalog.level') AS level,json_extract(v.content_json,'$.catalog.chapterCode') AS code,json_extract(v.content_json,'$.catalog.chapterTitle') AS title ${from} WHERE ${where}`).bind(...values).all<{subject:string;level:string|null;code:string|null;title:string|null}>();
  const subjects=[...new Set(rows.results.map(r=>r.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),levels=[...new Set(rows.results.map(r=>r.level).filter((x):x is string=>Boolean(x)))].sort(),chapters=new Map<string,{code:string;title:string;level:string;subject:string}>();
  for(const r of rows.results)if(r.code&&r.title&&r.level)chapters.set(JSON.stringify([r.subject,r.level,r.code]),{code:r.code,title:r.title,level:r.level,subject:r.subject});
  facets={subjects,levels,chapters:[...chapters.values()].sort((a,b)=>a.subject.localeCompare(b.subject)||a.level.localeCompare(b.level)||Number(a.code)-Number(b.code)),maintenanceImport:actor.role==='admin'||actor.role==='teacher',manageQuizzes:manager};
 }
 if(search){where+=" AND (instr(lower(json_extract(v.content_json,'$.title')),lower(?))>0 OR instr(lower(json_extract(v.content_json,'$.subject')),lower(?))>0)";values.push(search,search);}
 if(subject){where+=" AND json_extract(v.content_json,'$.subject')=?";values.push(subject);}
 if(year&&/^\d{4}$/.test(year)){where+=" AND json_extract(v.content_json,'$.year')=?";values.push(Number(year));}
 if(level){where+=" AND json_extract(v.content_json,'$.catalog.level')=?";values.push(level);}
 if(chapterCode){where+=" AND json_extract(v.content_json,'$.catalog.chapterCode')=?";values.push(chapterCode);}
 if(subtopicCode){where+=" AND json_extract(v.content_json,'$.catalog.subtopicCode')=?";values.push(subtopicCode);}
 if(catalogKind){where+=" AND json_extract(v.content_json,'$.catalog.kind')=?";values.push(catalogKind);}
 if(difficulty&&['easy','medium','hard','mixed'].includes(difficulty)){where+=difficulty==='mixed'?" AND json_extract(v.content_json,'$.difficulty')=?":" AND EXISTS(SELECT 1 FROM json_each(v.content_json,'$.questions') item WHERE json_extract(item.value,'$.difficulty')=?)";values.push(difficulty);}
 if(url.searchParams.get('topics')==='1'){
  // Aggregate before pagination so 41+ Sets still have complete topic counts.
  const topicOrder=sort==='oldest'?'MAX(v.created_at) ASC':sort==='title'?"MIN(json_extract(v.content_json,'$.title')) COLLATE NOCASE ASC":'MAX(v.created_at) DESC';
  const rows=await learningDb().prepare(`SELECT json_extract(v.content_json,'$.subject') AS subject,json_extract(v.content_json,'$.catalog.kind') AS kind,json_extract(v.content_json,'$.catalog.level') AS level,json_extract(v.content_json,'$.catalog.chapterCode') AS chapterCode,MIN(json_extract(v.content_json,'$.catalog.chapterTitle')) AS chapterTitle,json_extract(v.content_json,'$.catalog.subtopicCode') AS subtopicCode,MIN(json_extract(v.content_json,'$.catalog.subtopicTitle')) AS subtopicTitle,COUNT(*) AS setCount,MAX(v.created_at) AS updatedAt,MIN(q.created_at) AS createdAt,SUM(CASE WHEN json_extract(v.content_json,'$.difficulty')='easy' THEN 1 ELSE 0 END) AS easy,SUM(CASE WHEN json_extract(v.content_json,'$.difficulty')='medium' THEN 1 ELSE 0 END) AS medium,SUM(CASE WHEN json_extract(v.content_json,'$.difficulty')='hard' THEN 1 ELSE 0 END) AS hard ${from} WHERE ${where} AND json_extract(v.content_json,'$.bankKind')='platform' AND json_type(v.content_json,'$.catalog')='object' GROUP BY json_extract(v.content_json,'$.subject'),json_extract(v.content_json,'$.catalog.level'),json_extract(v.content_json,'$.catalog.kind'),json_extract(v.content_json,'$.catalog.chapterCode'),json_extract(v.content_json,'$.catalog.subtopicCode') ORDER BY ${topicOrder},json_extract(v.content_json,'$.subject'),json_extract(v.content_json,'$.catalog.level'),CAST(json_extract(v.content_json,'$.catalog.chapterCode') AS INTEGER),json_extract(v.content_json,'$.catalog.subtopicCode')`).bind(...values).all<{subject:string;kind:QuizCatalog['kind'];level:QuizCatalog['level'];chapterCode:string;chapterTitle:string;subtopicCode:string;subtopicTitle:string;setCount:number;updatedAt:string;createdAt:string;easy:number;medium:number;hard:number}>();
  const topics=rows.results.map(({setCount,easy,medium,hard,subject,updatedAt,createdAt,...catalog})=>({key:quizCatalogGroupKey({id:'',bankKind:'platform',subject,catalog:{...catalog,setNumber:1}}),bankKind:'platform',subject,catalog,difficulties:{easy,medium,hard},setCount,updatedAt,latestAt:updatedAt,createdAt}));
  return quizResponse({topics,hasMore:false,...(facets?{facets}:{})});
 }
 const order=sort==='oldest'?'v.created_at ASC':sort==='title'?"json_extract(v.content_json,'$.title') COLLATE NOCASE ASC":'v.created_at DESC';
 const list=await learningDb().prepare(`SELECT q.id,q.group_id AS groupId,q.owner_id AS ownerId,q.visibility,q.shared_revision AS sharedRevision,v.created_at AS updatedAt,q.created_at AS createdAt,a.name AS creator,g.name AS organisation,q.owner_id=? AND q.group_id=? AS canEdit,v.content_json ${from} WHERE ${where} ORDER BY ${order},q.id LIMIT 41 OFFSET ?`).bind(actor.id,actor.groupId,...values,offset).all<{id:string;groupId:string;ownerId:string;visibility:string;sharedRevision:number|null;updatedAt:string;createdAt:string;creator:string;organisation:string;canEdit:number;content_json:string}>();
 const items=list.results.slice(0,40).map(({content_json,...q})=>{const c=JSON.parse(content_json) as QuizContent,kind=quizBankKind(c);return {...q,canDelete:quizCanDelete(actor,{group_id:q.groupId,owner_id:q.ownerId},manager),canEdit:q.canEdit&&(kind!=='platform'||actor.role==='admin')?1:0,title:c.title,subject:c.subject,exam:c.exam,year:c.year,difficulty:c.difficulty,questionCount:c.questions.length,totalScore:c.questions.reduce((n,x)=>n+x.points,0),bankKind:kind,catalog:c.catalog||null};});
 return quizResponse({items,hasMore:list.results.length>40,...(facets?{facets}:{})});
 }catch(e){return quizFailure(e);}}

export async function POST(request:Request){try{
 if(new URL(request.url).origin!==request.headers.get('origin'))throw new QuizError('quiz.forbidden',403);
 const actor=await quizActor(),bytes=await quizRequestBytes(request,650000);let data:Record<string,unknown>;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new QuizError('quiz.invalidFields');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new QuizError('quiz.invalidFields');
 if(data.action==='delete')return quizResponse(await deleteQuiz(actor,data));
 if(data.action==='save')return quizResponse(await saveQuiz(actor,data));
 if(data.action==='maintenanceImport'){
  if(!['teacher','admin'].includes(actor.role))throw new QuizError('quiz.maintenanceOnly',403);
  return quizResponse(await saveQuiz(actor,data,undefined,true));
 }
 if(data.action==='share')return quizResponse(await shareQuiz(actor,data));
 if(data.action==='duplicate'){
  if(typeof data.sourceId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(data.sourceId)||data.title!=null&&(typeof data.title!=='string'||data.title.length>160))throw new QuizError('quiz.invalidFields');
  const intent={sourceId:data.sourceId,bank:data.bank===true,title:typeof data.title==='string'&&data.title.trim()?data.title.trim():null},replay=await quizCopyReplay(actor,data,intent);if(replay)return quizResponse(replay);
  const source=await readQuiz(actor,intent.sourceId,intent.bank);
  return quizResponse(await saveQuiz(actor,{id:data.id,revision:0,operationId:data.operationId,content:{...source.content,bankKind:'creator',catalog:null,title:(intent.title||source.content.title+' · Copy').slice(0,160)},keys:await quizKeys(source.v.id)},{versionId:source.v.id,request:intent}));
 }throw new QuizError('quiz.invalidFields');
 }catch(e){return quizFailure(e);}}

