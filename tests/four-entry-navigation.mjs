import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/four-entry-navigation.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {primaryEntries,primaryArea,isPrimaryHub,hubGroups}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const layouts={admin:['home','teachingHub','financeHub','manageHub'],teacher:['home','courses','teachingHub','myHub'],student:['home','courses','learningHub','myHub']};
for(const [role,expected] of Object.entries(layouts)){
 assert.deepEqual(primaryEntries(role).map(x=>x.id),expected);
 for(const entry of primaryEntries(role)){assert(entry.label.zh&&entry.label.en);assert.equal(primaryArea(role,entry.id),entry.id);}
 assert.equal(isPrimaryHub(role,'unknownHub'),false);
}
const leaves={
 admin:{teachingHub:['calendar','list','schedule','attention','overview','students','teachers','subjects','classrooms','homework','materials','quizzes'],manageHub:['groups','studentRoster','teacherRoster','accounts','groupInfo','myAccount','sheet','activity','notifications'],financeHub:['billing']},
 teacher:{courses:['calendar','lessons','attendance','reschedule','hours','schedule'],teachingHub:['classrooms','homework','materials','quizzes','students'],myHub:['myAccount','notifications']},
 student:{courses:['calendar','list','reschedule'],learningHub:['classrooms','homework','materials','quizzes'],myHub:['myAccount','notifications']},
};
let assertions=0;
for(const [role,areas] of Object.entries(leaves))for(const [area,ids] of Object.entries(areas))for(const id of ids){assert.equal(primaryArea(role,id),area,role+'/'+id);assertions++;}
for(const role of Object.keys(layouts)){
 const shortcuts=primaryEntries(role).flatMap(entry=>hubGroups(role,entry.id).flatMap(group=>group.ids));
 for(const id of Object.values(leaves[role]).flat().filter(id=>!['calendar','list','schedule','attention','overview','teachers','lessons','attendance','reschedule','hours','billing'].includes(id)&&!(role==='admin'&&id==='students'))){assert(shortcuts.includes(id),role+' missing '+id);}
 if(role!=='admin')for(const id of ['billing','accounts','groups','teacherRoster','studentRoster','activity','sheet'])assert(!shortcuts.includes(id),role+' exposes '+id);
}
// Permissions can remove any leaf without losing the main account/home paths.
const allowed=new Set(['home','myAccount','notifications','accounts']);
const restricted=hubGroups('admin','manageHub').flatMap(x=>x.ids).filter(id=>allowed.has(id));
assert.deepEqual(restricted,['accounts','myAccount','notifications']);
assert.equal(hubGroups('admin','teachingHub').flatMap(x=>x.ids).filter(id=>allowed.has(id)).length,0);
assert(!isPrimaryHub('student','manageHub'));
assert(!isPrimaryHub('teacher','financeHub'));
assert.equal(primaryArea('teacher','students'),'teachingHub');
assert.equal(primaryArea('admin','students'),'teachingHub');
assert.equal(primaryArea('admin','studentRoster'),'manageHub');
console.log('PASS four primary entries, '+assertions+' leaf mappings, all existing destinations and role isolation');
