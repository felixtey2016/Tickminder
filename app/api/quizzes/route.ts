import {deleteQuiz,quizManager,quizCanDelete} from '@/lib/quiz-delete';
import {isOwnerAccount} from '@/lib/owner';
import {quizActor,quizFailure,quizResponse,readQuiz,quizKeys,saveQuiz,shareQuiz,quizRequestBytes,quizCopyReplay} from '@/lib/quiz-server';
import {learningDb} from '@/lib/learning-server';
import {QuizError,type QuizCatalog} from '@/lib/quiz';
import {quizCatalogGroupKey} from '@/lib/quiz-catalog';
import {readAcademicCatalogue} from '@/lib/academic-catalogue-server';
import {findCatalogueSyllabus,findCatalogueSubject} from '@/lib/academic-catalogue';

type Facets={subjects:string[];levels:string[];chapters:{code:string;title:string;level:string;subject:string;exam:string}[];maintenanceImport:boolean;manageQuizzes:boolean};
type Card={id:string;groupId:string;ownerId:string;visibility:string;sharedRevision:number|null;updatedAt:string;createdAt:string;creator:string;organisation:string;canEdit:number;title:string;subject:string;exam:string;year:number|null;difficulty:string;questionCount:number;totalScore:number;bankKind:'creator'|'platform';catalog_json:string|null};

export async function GET(request:Request){try{
 const actor=await quizActor(true),url=new URL(request.url),id=url.searchParams.get('id'),bank=url.searchParams.get('bank')==='1',manage=url.searchParams.get('manage')==='1',manager=await quizManager(actor);
 if(manage&&(!manager||actor.role==='student'||bank))throw new QuizError('quiz.forbidden',403);
 if(actor.role==='student'&&(!bank||id&&url.searchParams.get('preview')!=='1'))throw new QuizError('quiz.forbidden',403);
 if(id){
  const r=await readQuiz(actor,id,bank),revision=r.revision;
  if(url.searchParams.get('preview')==='1')return quizResponse({id,revision,content:r.content});
  return quizResponse({id,revision,sharedRevision:r.q.shared_revision,visibility:r.q.visibility,canEdit:r.canEdit,canDelete:quizCanDelete(actor,r.q,manager),content:r.content,keys:await quizKeys(r.v.id),...(r.canEdit?{sourceKey:r.q.source_key}: {})});
 }
 const offset=Math.floor(Math.max(0,Math.min(1000000,Number(url.searchParams.get('offset'))||0))),search=(url.searchParams.get('search')||'').trim().slice(0,100),subject=(url.searchParams.get('subject')||'').trim().slice(0,100),year=url.searchParams.get('year'),difficulty=url.searchParams.get('difficulty'),bankKind=url.searchParams.get('bankKind'),level=url.searchParams.get('level'),chapterCode=url.searchParams.get('chapterCode'),subtopicCode=url.searchParams.get('subtopicCode'),catalogKind=url.searchParams.get('catalogKind'),sort=url.searchParams.get('sort')||'latest',values:unknown[]=[];
 const catalogue=await readAcademicCatalogue('quiz'),syllabusInput=(url.searchParams.get('syllabus')||'').trim().slice(0,80),syllabus=syllabusInput&&syllabusInput!=='__unclassified__'?findCatalogueSyllabus(catalogue,syllabusInput):null;
 if(syllabusInput&&syllabusInput!=='__unclassified__'&&!syllabus)throw new QuizError('quiz.invalidFields');
 if(!['latest','oldest','title'].includes(sort))throw new QuizError('quiz.invalidFields');
 if(bankKind&&!['platform','creator'].includes(bankKind)||level&&(level.length>80||!level.trim())||catalogKind&&!['subtopic','chapter_overall','level_overall'].includes(catalogKind)||chapterCode&&!/^[1-9]\d{0,2}$/.test(chapterCode)||subtopicCode&&!/^[1-9]\d{0,2}(?:\.[1-9]\d{0,2}){1,3}$/.test(subtopicCode))throw new QuizError('quiz.invalidFields');
 let where=bank?"q.shared_revision IS NOT NULL AND (q.visibility='public' OR (q.visibility='organisation' AND q.group_id=?))":manage?(isOwnerAccount(actor)?'1=1':'q.group_id=?'):'q.group_id=? AND q.owner_id=?';if(!(manage&&isOwnerAccount(actor)))values.push(actor.groupId);if(!bank&&!manage)values.push(actor.id);where+=' AND q.deleted_at IS NULL';
 if(bankKind){where+=" AND COALESCE(json_extract(v.content_json,'$.bankKind'),'creator')=?";values.push(bankKind);}
 // Every projection, filter and aggregate uses the explicitly shared version.
 const from=`FROM quizzes q JOIN quiz_versions v ON v.quiz_id=q.id AND v.group_id=q.group_id AND v.revision=CASE WHEN ${bank?1:0}=1 THEN q.shared_revision ELSE q.revision END JOIN accounts a ON a.id=q.owner_id JOIN tuition_groups g ON g.id=q.group_id${manage&&isOwnerAccount(actor)?'':' AND g.active=1'}`;
 if(search){where+=" AND (instr(lower(json_extract(v.content_json,'$.title')),lower(?))>0 OR instr(lower(json_extract(v.content_json,'$.subject')),lower(?))>0)";values.push(search,search);}
 if(syllabusInput==='__unclassified__'){where+=" AND trim(coalesce(json_extract(v.content_json,'$.exam'),''))=''";}
 else if(syllabus){where+=" AND (json_extract(v.content_json,'$.syllabusId')=? OR lower(trim(json_extract(v.content_json,'$.exam')))=lower(?))";values.push(syllabus.id,syllabus.name);}
 if(subject){const options=syllabus?[findCatalogueSubject(syllabus,subject)]:catalogue.syllabuses.map(s=>findCatalogueSubject(s,subject));const selected=options.filter((s):s is NonNullable<typeof s>=>Boolean(s)),labels=[...new Set(selected.flatMap(s=>[s.name,...s.aliases]))];where+=" AND (json_extract(v.content_json,'$.subjectId')=? OR lower(trim(json_extract(v.content_json,'$.subject'))) IN (SELECT lower(trim(value)) FROM json_each(?)))";values.push(selected[0]?.id||subject,JSON.stringify(labels.length?labels:[subject]));}
 if(year&&/^\d{4}$/.test(year)){where+=" AND json_extract(v.content_json,'$.year')=?";values.push(Number(year));}
 if(level){where+=" AND json_extract(v.content_json,'$.catalog.level')=?";values.push(level);}
 if(chapterCode){where+=" AND json_extract(v.content_json,'$.catalog.chapterCode')=?";values.push(chapterCode);}
 if(subtopicCode){where+=" AND json_extract(v.content_json,'$.catalog.subtopicCode')=?";values.push(subtopicCode);}
 if(catalogKind){where+=" AND json_extract(v.content_json,'$.catalog.kind')=?";values.push(catalogKind);}
 if(difficulty&&['easy','medium','hard','mixed'].includes(difficulty)){where+=difficulty==='mixed'?" AND json_extract(v.content_json,'$.difficulty')=?":" AND EXISTS(SELECT 1 FROM json_each(v.content_json,'$.questions') item WHERE json_extract(item.value,'$.difficulty')=?)";values.push(difficulty);}
 // Only the selected subject's chapter labels are fetched. The centrally
 // configured syllabus/subject menus do not enumerate the entire Quiz bank.
 const facetsRequest:Promise<Facets|undefined>=url.searchParams.get('facets')==='1'?(async()=>{
  const options=syllabus?[syllabus]:catalogue.syllabuses,subjects=[...new Set(options.filter(s=>s.active).flatMap(s=>s.subjects.filter(x=>x.active).map(x=>x.name)))].sort(),levels=syllabus?.grades||[];
  const rows=syllabus&&subject?await learningDb().prepare(`SELECT DISTINCT json_extract(v.content_json,'$.subject') AS subject,json_extract(v.content_json,'$.exam') AS exam,json_extract(v.content_json,'$.catalog.level') AS level,json_extract(v.content_json,'$.catalog.chapterCode') AS code,json_extract(v.content_json,'$.catalog.chapterTitle') AS title ${from} WHERE ${where} AND json_type(v.content_json,'$.catalog')='object' ORDER BY level,CAST(code AS INTEGER),title LIMIT 200`).bind(...values).all<{subject:string;exam:string;level:string;code:string;title:string}>():{results:[]};
  return {subjects,levels,chapters:rows.results.filter(r=>r.code&&r.title&&r.level),maintenanceImport:actor.role==='admin'||actor.role==='teacher',manageQuizzes:manager};
 })():Promise.resolve(undefined);
 if(url.searchParams.get('topics')==='1'){
  // Aggregate before pagination so 41+ Sets still have complete topic counts.
  const topicOrder=sort==='oldest'?'MAX(v.created_at) ASC':sort==='title'?"MIN(json_extract(v.content_json,'$.title')) COLLATE NOCASE ASC":'MAX(v.created_at) DESC';
  const [facets,rows]=await Promise.all([facetsRequest,learningDb().prepare(`SELECT coalesce(json_extract(v.content_json,'$.exam'),'') AS exam,json_extract(v.content_json,'$.subject') AS subject,json_extract(v.content_json,'$.catalog.kind') AS kind,json_extract(v.content_json,'$.catalog.level') AS level,json_extract(v.content_json,'$.catalog.chapterCode') AS chapterCode,MIN(json_extract(v.content_json,'$.catalog.chapterTitle')) AS chapterTitle,json_extract(v.content_json,'$.catalog.subtopicCode') AS subtopicCode,MIN(json_extract(v.content_json,'$.catalog.subtopicTitle')) AS subtopicTitle,COUNT(*) AS setCount,MAX(v.created_at) AS updatedAt,MIN(q.created_at) AS createdAt,SUM(CASE WHEN json_extract(v.content_json,'$.difficulty')='easy' THEN 1 ELSE 0 END) AS easy,SUM(CASE WHEN json_extract(v.content_json,'$.difficulty')='medium' THEN 1 ELSE 0 END) AS medium,SUM(CASE WHEN json_extract(v.content_json,'$.difficulty')='hard' THEN 1 ELSE 0 END) AS hard ${from} WHERE ${where} AND json_extract(v.content_json,'$.bankKind')='platform' AND json_type(v.content_json,'$.catalog')='object' GROUP BY lower(trim(coalesce(json_extract(v.content_json,'$.exam'),''))),lower(trim(json_extract(v.content_json,'$.subject'))),json_extract(v.content_json,'$.catalog.level'),json_extract(v.content_json,'$.catalog.kind'),json_extract(v.content_json,'$.catalog.chapterCode'),json_extract(v.content_json,'$.catalog.subtopicCode') ORDER BY ${topicOrder},coalesce(json_extract(v.content_json,'$.exam'),''),json_extract(v.content_json,'$.subject'),json_extract(v.content_json,'$.catalog.level'),CAST(json_extract(v.content_json,'$.catalog.chapterCode') AS INTEGER),json_extract(v.content_json,'$.catalog.subtopicCode') LIMIT 41 OFFSET ?`).bind(...values,offset).all<{exam:string;subject:string;kind:QuizCatalog['kind'];level:QuizCatalog['level'];chapterCode:string;chapterTitle:string;subtopicCode:string;subtopicTitle:string;setCount:number;updatedAt:string;createdAt:string;easy:number;medium:number;hard:number}>()]);
  const topics=rows.results.slice(0,40).map(({setCount,easy,medium,hard,subject,exam,updatedAt,createdAt,...catalog})=>({key:quizCatalogGroupKey({id:'',bankKind:'platform',subject,exam,catalog:{...catalog,setNumber:1}}),bankKind:'platform',subject,exam,catalog,difficulties:{easy,medium,hard},setCount,updatedAt,latestAt:updatedAt,createdAt}));
  return quizResponse({topics,hasMore:rows.results.length>40,...(facets?{facets}:{})});
 }
 const order=sort==='oldest'?'v.created_at ASC':sort==='title'?"json_extract(v.content_json,'$.title') COLLATE NOCASE ASC":'v.created_at DESC';
 // Card responses never transfer full questions from D1 to the Worker. A
 // public card must describe its shared version, not the author's new draft.
 const [facets,list]=await Promise.all([facetsRequest,learningDb().prepare(`SELECT q.id,q.group_id AS groupId,q.owner_id AS ownerId,q.visibility,q.shared_revision AS sharedRevision,v.created_at AS updatedAt,q.created_at AS createdAt,a.name AS creator,g.name AS organisation,q.owner_id=? AND q.group_id=? AS canEdit,json_extract(v.content_json,'$.title') AS title,json_extract(v.content_json,'$.subject') AS subject,json_extract(v.content_json,'$.exam') AS exam,json_extract(v.content_json,'$.year') AS year,json_extract(v.content_json,'$.difficulty') AS difficulty,json_array_length(v.content_json,'$.questions') AS questionCount,(SELECT coalesce(sum(json_extract(question.value,'$.points')),0) FROM json_each(v.content_json,'$.questions') question) AS totalScore,coalesce(json_extract(v.content_json,'$.bankKind'),'creator') AS bankKind,json_extract(v.content_json,'$.catalog') AS catalog_json ${from} WHERE ${where} ORDER BY ${order},q.id LIMIT 41 OFFSET ?`).bind(actor.id,actor.groupId,...values,offset).all<Card>()]);
 const items=list.results.slice(0,40).map(({catalog_json,...q})=>({...q,canDelete:quizCanDelete(actor,{group_id:q.groupId,owner_id:q.ownerId},manager),canEdit:q.canEdit&&(q.bankKind!=='platform'||actor.role==='admin')?1:0,catalog:catalog_json?JSON.parse(catalog_json) as QuizCatalog:null}));
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
  return quizResponse(await saveQuiz(actor,{id:data.id,revision:0,operationId:data.operationId,content:{...source.content,bankKind:'creator',catalog:null,title:(intent.title||source.content.title+' · Copy').slice(0,160)},keys:await quizKeys(source.v.id)},{versionId:source.v.id,request:intent,legacyMetadata:source.content}));
 }throw new QuizError('quiz.invalidFields');
 }catch(e){return quizFailure(e);}}

