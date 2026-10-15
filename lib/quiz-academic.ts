import {catalogueGradeValid,findCatalogueGrade,findCatalogueSyllabus,findCatalogueSubject,type AcademicCatalogue} from './academic-catalogue';
import {QuizError,type QuizContent} from './quiz';

export function quizAcademicSelection(catalogue:AcademicCatalogue,content:Pick<QuizContent,'exam'|'subject'|'syllabusId'|'subjectId'>){
 const syllabus=findCatalogueSyllabus(catalogue,content.syllabusId||content.exam);
 const subject=syllabus?findCatalogueSubject(syllabus,content.subjectId||content.subject):null;
 return syllabus&&subject?{syllabus,subject}:null;
}

// Legacy saved metadata may remain unchanged after an option is retired. New
// papers and changed classifications must use this catalogue, not the roster's.
export function checkQuizAcademic(catalogue:AcademicCatalogue,content:QuizContent,previous?:QuizContent|null,validate=true){
 const unchanged=Boolean(previous&&content.exam===previous.exam&&content.subject===previous.subject&&content.syllabusId===previous.syllabusId&&content.subjectId===previous.subjectId&&content.catalog?.level===previous.catalog?.level);
 if(unchanged)return content;
 const selected=quizAcademicSelection(catalogue,content);
 if(!selected){if(!validate)return content;throw new QuizError('quiz.catalogueSelection');}
 if(validate&&(!selected.syllabus.active||!selected.subject.active))throw new QuizError('quiz.catalogueSelection');
 if(validate&&content.catalog&&!catalogueGradeValid(selected.syllabus,content.catalog.level))throw new QuizError('quiz.invalidCatalog');
 return {...content,exam:selected.syllabus.name,subject:selected.subject.name,syllabusId:selected.syllabus.id,subjectId:selected.subject.id,...(content.catalog?{catalog:{...content.catalog,level:findCatalogueGrade(selected.syllabus,content.catalog.level)||content.catalog.level}}:{})};
}
