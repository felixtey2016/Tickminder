import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const root=resolve(import.meta.dirname,'..');
const ui=await build({
 stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {AdminPermissionContext} from './app/admin-permission-context';import {AccountDirectory} from './app/account-directory';import {ParentChildrenManager} from './app/parent-children-manager';import {setLanguage} from './lib/i18n';export function directory(actor,users,roleFilter='parent',language='en'){setLanguage(language);return renderToStaticMarkup(<AdminPermissionContext.Provider value={actor}><AccountDirectory actor={actor} users={users} roleFilter={roleFilter} teachers={[]} students={[]} mutate={async()=>true} busy={false} createForm={<p>Create form</p>}/></AdminPermissionContext.Provider>);}export function manager(canManage){return renderToStaticMarkup(<ParentChildrenManager accountId="parent-active" accountName="Ada Parent" canManage={canManage} onClose={()=>{}}/>);}`,loader:'tsx',resolveDir:root,sourcefile:'parent-roster-fixture.tsx'},
 bundle:true,platform:'node',format:'cjs',external:['react','react-dom/server'],loader:{'.css':'empty'},write:false,
 plugins:[{name:'parent-roster-browser-fixtures',setup(api){
  api.onLoad({filter:/[\\/]lib[\\/]filter-preferences\.tsx$/},()=>({contents:`export function useFilterPreference(key,initial){return [globalThis.__parentRosterFilters?.[key]??initial,()=>{}];}`,loader:'js'}));
  // Supply response data only; the real manager still decides which actions to show.
  api.onLoad({filter:/[\\/]app[\\/]parents-ui-shared\.tsx$/},()=>({contents:`import React from 'react';export function useParentResource(){return {data:globalThis.__parentRosterLinks,loading:false,failed:false};}export function useParentFocusReload(){}export const parentDate=()=>"2026-11-03";export const ParentLoadState=({children})=><>{children}</>;export const ParentPagination=()=>null;export const parentApi=async()=>{throw Error('Unexpected mutation');};export class ParentApiError extends Error{}`,loader:'tsx'}));
  // Expose dialog content during static rendering so the real read-only controls can be asserted.
  api.onLoad({filter:/[\\/]components[\\/]ui[\\/]dialog\.tsx$/},()=>({contents:`import React from 'react';export const Dialog=({open,children})=>open?<div>{children}</div>:null;export const DialogContent=({children})=><div>{children}</div>;export const DialogHeader=DialogContent;export const DialogTitle=({children})=><h2>{children}</h2>;export const DialogDescription=({children})=><p>{children}</p>;`,loader:'tsx'}));
 }}]
});
const fixture={exports:{}};new Function('require','module','exports',ui.outputFiles[0].text)(require,fixture,fixture.exports);
const {directory,manager}=fixture.exports;
let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++;};
const actor=(grants=[],extra={})=>({id:'admin-reader',role:'admin',groupId:'test-group',adminPermissions:{enforced:true,grants,privileged:false},...extra});
const users=[
 {id:'parent-active',name:'Ada Parent',username:'ada.parent',email:'ada@example.test',role:'parent',parentChildren:['Private Child']},
 {id:'parent-disabled',name:'Disabled Parent',username:'disabled.parent',role:'parent',disabledAt:'2026-11-01'},
 {id:'student',name:'Student Account',role:'student'},
 {id:'teacher',name:'Teacher Account',role:'teacher'},
 {id:'pending',name:'Pending Account',role:'pending'},
];
const rows=html=>[...html.matchAll(/data-account-id="([^"]+)"/g)].map(match=>match[1]);
const reader=actor(['accounts.view']);
let html=directory(reader,users);
check(html.includes('<h2>Parent roster</h2>'),'the parent route has its own translated title');
check(html.includes('account-role-group" open=""'),'the sole parent group is expanded on entry');
assert.deepEqual(rows(html),['parent-active']);checks++;
check(!html.includes('Private Child')&&!html.includes('Manage linked children'),'basic account readers never see child names or child-link controls');
check(!html.includes('Create parent account')&&!html.includes('Deactivate account'),'basic reading does not grant account mutations');
check(!html.includes('linked child'),'search hint does not advertise inaccessible children');
check(directory(actor(),users)==='','the new parent route requires accounts.view');
check(directory(actor(['parents.view']),users)==='','parent viewing alone does not bypass account viewing');
check(directory(actor([],{canManageAdministrators:true}),users)==='','identity-management exception does not grant the new parent route');
html=directory(actor(['accounts.view','parents.view']),users);
check(html.includes('Private Child')&&html.includes('Manage linked children'),'parent viewers retain existing linked children and manager entry');
check(!html.includes('Create parent account')&&!html.includes('Deactivate account'),'parent viewing is read-only without management grants');
html=directory(reader,users,undefined,'zh');
check(html.includes('家长名单')&&html.includes('搜索家长')&&html.includes('1 位家长'),'parent roster is translated in Chinese');
html=directory(actor(['accounts.view','accounts.create','accounts.disable','accounts.assign','accounts.resetPassword']),users);
check(!html.includes('Create parent account')&&!html.includes('Deactivate account')&&!html.includes('Reset password'),'account mutation grants cannot mutate parent accounts without parents.manage');
html=directory(actor(['accounts.view','parents.view','parents.manage','accounts.create','accounts.disable','accounts.assign']),users);
check(html.includes('Create parent account')&&html.includes('Deactivate account'),'parent managers retain their existing permitted account actions');
globalThis.__parentRosterFilters={'parent-accounts-removed':true};
assert.deepEqual(rows(directory(reader,users)),['parent-disabled']);checks++;
globalThis.__parentRosterFilters={'parent-accounts-search':'ADA.PARENT'};
assert.deepEqual(rows(directory(reader,users)),['parent-active']);checks++;
globalThis.__parentRosterFilters={'parent-accounts-search':'Private Child'};
assert.deepEqual(rows(directory(reader,users)),[]);checks++;
assert.deepEqual(rows(directory(actor(['accounts.view','parents.view']),users)),['parent-active']);checks++;
globalThis.__parentRosterFilters={'accounts-search':'Teacher Account'};
assert.deepEqual(rows(directory(reader,users)),['parent-active']);checks++;
// Explicit null disables the optional role filter in this JS fixture.
assert.deepEqual(rows(directory(reader,users,null)),['teacher']);checks++;
globalThis.__parentRosterFilters={};
html=directory(reader,users,null);
check(!html.includes('Private Child'),'the existing all-account directory also suppresses inaccessible child data');
assert.deepEqual(rows(html),['pending','student','teacher','parent-active']);checks++;
globalThis.__parentRosterLinks={parent:{disabled:false},canManage:false,links:[{id:'link',studentId:'student',student:'Child',active:true,revision:1,updatedAt:'2026-11-03'}],page:1,pages:1};
html=manager(false);
check(!html.includes('Unlink child')&&!html.includes('>Link child<'),'existing manager hides link modifications for readers');
html=manager(true);
check(!html.includes('Unlink child')&&!html.includes('>Link child<'),'server read-only response also prevents link modifications');
globalThis.__parentRosterLinks.canManage=true;
html=manager(false);
check(!html.includes('Unlink child')&&!html.includes('>Link child<'),'missing local parents.manage still prevents link modifications');
html=manager(true);
check(html.includes('Unlink child')&&html.includes('>Link child<'),'link modifications require both local and server management permission');
delete globalThis.__parentRosterFilters;delete globalThis.__parentRosterLinks;
console.log(JSON.stringify({checks,status:'passed',scope:'parent roster actual component render, filters, languages and permission boundaries'}));
