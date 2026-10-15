import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';
const compiled=ts.transpileModule(fs.readFileSync(new URL('../lib/course-completion.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {courseIsCompleted,matchesCourseCompletion}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const cases=[
 [{status:'completed',sessionType:'one_to_one'},true],
 [{status:'scheduled',sessionType:'one_to_one'},false],
 [{status:'student_absent',sessionType:'one_to_one'},false],
 [{status:'student_absent',sessionType:'group',teachingStatus:'taught'},true],
 [{status:'scheduled',sessionType:'group',teachingStatus:'completed'},true],
 [{status:'completed',sessionType:'group',teachingStatus:'not_taught'},false],
 [{status:'scheduled',sessionType:'group',teachingStatus:'teacher_absent'},false],
 [{status:'completed',sessionType:'group'},true],
 [{status:'student_absent',sessionType:'group',sessionStatus:'completed',teachingStatus:'pending'},true],
 [{status:'scheduled',sessionType:'group',teachingStatus:'pending'},false],
];
let count=0;for(const [course,completed]of cases){assert.equal(courseIsCompleted(course),completed);assert.equal(matchesCourseCompletion(course,'completed'),completed);assert.equal(matchesCourseCompletion(course,'incomplete'),!completed);assert.equal(matchesCourseCompletion(course,'all'),true);assert.equal(matchesCourseCompletion(course,'stale_saved_filter'),true);count+=5;}
console.log(count+' course completion classification checks passed');
