import type {Difficulty,QuizBankKind,QuizCatalog} from './quiz';

export type QuizCatalogTopic=Omit<QuizCatalog,'setNumber'>;
export type QuizCatalogItem={id:string;subject:string;exam?:string;syllabusId?:string;subjectId?:string;difficulty:Difficulty;bankKind?:QuizBankKind;catalog?:QuizCatalog|null};
export type QuizCatalogGroup<T extends QuizCatalogItem=QuizCatalogItem>={key:string;bankKind:QuizBankKind;subject:string;catalog:QuizCatalogTopic|null;items:T[];difficulties:{easy:number;medium:number;hard:number};setCount:number};
export function quizBankKind(content:{bankKind?:unknown}):QuizBankKind{return content.bankKind==='platform'?'platform':'creator';}
// JSON tuples keep topic identifiers unambiguous even when titles contain a
// separator. Year and Set number deliberately do not identify a topic.
export function quizCatalogGroupKey(item:Pick<QuizCatalogItem,'id'|'subject'|'exam'|'syllabusId'|'subjectId'|'bankKind'|'catalog'>){
 const c=item.catalog;return quizBankKind(item)==='platform'&&c?JSON.stringify(['platform',(item.exam||'').trim().toLowerCase(),item.subject.trim().toLowerCase(),c.level,c.kind,c.chapterCode,c.subtopicCode]):JSON.stringify(['creator',item.id]);
}
export function groupQuizCatalog<T extends QuizCatalogItem>(items:T[]):QuizCatalogGroup<T>[] {
 const groups=new Map<string,QuizCatalogGroup<T>>();
 for(const item of items){const key=quizCatalogGroupKey(item),c=item.catalog;let group=groups.get(key);
  if(!group){group={key,bankKind:quizBankKind(item),subject:item.subject,catalog:c?{kind:c.kind,level:c.level,chapterCode:c.chapterCode,chapterTitle:c.chapterTitle,subtopicCode:c.subtopicCode,subtopicTitle:c.subtopicTitle}:null,items:[],difficulties:{easy:0,medium:0,hard:0},setCount:0};groups.set(key,group);}
  group.items.push(item);group.setCount++;if(item.difficulty!=='mixed')group.difficulties[item.difficulty]++;
 }
 for(const group of groups.values())group.items.sort((a,b)=>(a.catalog?.setNumber||0)-(b.catalog?.setNumber||0)||a.id.localeCompare(b.id));
 return [...groups.values()];
}

export type QuizWritePolicy={administrator:boolean;teacher?:boolean;maintenance:boolean;sourceKey:string|null;bankKind:QuizBankKind;previous?:{sourceKey:string|null;bankKind:QuizBankKind};copied:boolean};
// Teachers can import their own creator quizzes. Platform maintenance remains
// administrative, and an import cannot change an existing source identity.
export function quizWriteForbidden(input:QuizWritePolicy):boolean{
 if(input.maintenance&&(!(input.administrator||input.teacher)||!input.sourceKey||input.copied))return true;
 if((input.bankKind==='platform'||input.previous?.bankKind==='platform')&&(!input.administrator||!input.maintenance))return true;
 if(!input.previous&&input.sourceKey&&!input.maintenance)return true;
 if(input.previous&&input.sourceKey!==input.previous.sourceKey)return true;
 return false;
}
