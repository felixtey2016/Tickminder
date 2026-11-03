import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const output=await build({entryPoints:[fileURLToPath(new URL('../lib/workspace-page-data.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const page=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
let checks=0;const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
for(const role of ['admin','teacher','student']){
  for(const view of ['home','myAccount','notifications','quizzes','sheet','groups','teachingHub','learningHub','manageHub','myHub','billing','overview','hours','reschedule','attendance','lessons','materials','homework','classrooms','activity']) equal(page.workspacePageData(role,view),null,role+' '+view+' uses its own endpoint instead of core');
  equal(page.workspacePageData(role,'calendar'),'calendar',role+' range calendar');
}
for(const [role,view,data] of [['admin','schedule','schedule'],['teacher','schedule','schedule'],['teacher','students','teacher-plans'],['admin','students','course-options'],['admin','teachers','course-options'],['admin','list','course-options'],['admin','attention','course-options'],['admin','studentRoster','students'],['admin','teacherRoster','teachers'],['admin','subjects','subjects'],['admin','accounts','account-options'],['admin','parentRoster','account-options']])equal(page.workspacePageData(role,view),data,role+' '+view+' declares only its projection');
equal(page.workspacePageData('admin','groupInfo',false),null,'group info without term grant has no term read');
equal(page.workspacePageData('admin','groupInfo',true),'terms','term management reads only terms');
equal(page.workspacePageData('student','schedule'),null,'student has no scheduling bootstrap');
for(const role of ['parent','pending'])for(const view of ['calendar','schedule','students','accounts','groupInfo'])equal(page.workspacePageData(role,view,true),null,role+' retains separate authorization and data chain');
for(const view of ['calendar','course-options','terms',null])equal(page.workspaceDataBlocksPage(view),false,'independent content can load alongside '+view);
for(const view of ['schedule','teacher-plans','students','teachers','subjects','account-options'])equal(page.workspaceDataBlocksPage(view),true,'editable '+view+' waits for actual projection');
const actor={id:'fictional',groupId:'group-a',role:'admin',teacherName:null,studentName:null,adminPermissions:{enforced:true,grants:['lessons.view']}};
for(const patch of [{id:'different'},{groupId:'group-b'},{role:'teacher'},{teacherName:'Different Teacher'},{studentName:'Different Student'},{adminPermissions:{enforced:true,grants:[]}},{isOwner:true},{isGroupChief:true},{canManageAdministrators:true}]){assert.notEqual(page.workspaceIdentityKey(actor),page.workspaceIdentityKey({...actor,...patch}));checks++;}
equal(page.workspaceIdentityKey({...actor,teacherName:undefined,studentName:undefined,isOwner:false}),page.workspaceIdentityKey(actor),'absent null bindings and false authority normalize consistently');
console.log(JSON.stringify({passed:true,checks}));
