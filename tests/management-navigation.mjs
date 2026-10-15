import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/management-navigation.ts',import.meta.url),'utf8');
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {managementArea,managementTabs,defaultManagementView,normalizeManagementView}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

for(const [area,leaves] of Object.entries({people:['studentRoster','teacherRoster','accounts'],settings:['groupInfo','myAccount','sheet','activity']})){
 assert.deepEqual(managementTabs(area).map(item=>item.view),leaves);
 assert.equal(defaultManagementView(area),leaves[0]);
 assert.equal(normalizeManagementView('admin',area),leaves[0]);
 for(const leaf of leaves){
  assert.equal(managementArea('admin',leaf),area);
  assert.equal(normalizeManagementView('admin',leaf),leaf,'Existing leaf history and data scopes must not change');
  for(const role of ['teacher','student','pending'])assert.equal(managementArea(role,leaf),null,'Management navigation is restricted to administrators');
 }
 for(const role of ['teacher','student','pending'])assert.equal(normalizeManagementView(role,area),area,'An alias must not grant a non-admin a management destination');
}
for(const view of ['groups','home','quizzes','calendar','students','teachers',null,undefined])assert.equal(managementArea('admin',view),null);
console.log('PASS management navigation: stable leaves, aliases, defaults and role boundaries');
