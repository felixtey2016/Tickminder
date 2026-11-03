import assert from "node:assert/strict";
import {build} from "esbuild";
const output=await build({entryPoints:[new URL("../lib/workspace-route.ts",import.meta.url).pathname.replace(/^\/([A-Za-z]:\/)/,"$1")],bundle:true,write:false,platform:"node",format:"esm",logLevel:"silent"});
const route=await import("data:text/javascript;base64,"+Buffer.from(output.outputFiles[0].text).toString("base64"));
let checks=0;const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
for(const [path,role,view] of [
 ["/","admin","home"],["/settings","admin","myAccount"],["/settings","teacher","myAccount"],["/settings","student","myAccount"],["/settings","parent","account"],
 ["/account","admin","myAccount"],["/account","teacher","myHub"],["/account","parent","mineHub"],
 ["/teaching","admin","teachingHub"],["/teaching","teacher","teachingHub"],["/learning","student","learningHub"],["/learning","parent","learnHub"],
 ["/finance","admin","billing"],["/finance","parent","finance"],["/manage","admin","manageHub"],["/manage/group","admin","groupInfo"],
 ["/manage/parents","admin","parentRoster"],["/manage/accounts","admin","accounts"],["/platform/groups","admin","groups"],
 ["/courses","student","calendar"],["/courses/calendar","teacher","calendar"],["/courses/attendance","parent","attendance"],["/courses/lessons","parent","lessons"],
 ["/learning/progress","parent","learning"],["/recordings","parent","recordings"],["/notifications","parent","notifications"],["/settings/","student","myAccount"],
])equal(route.workspaceViewFromPath(path,role),view,role+" "+path);
for(const role of ["admin","teacher","student","parent"]){
 for(const path of ["/unknown","//settings","/settings/other","/api/auth","https://evil.invalid/settings","/%73ettings","/settings//"])equal(route.workspaceViewFromPath(path,role),null,"unknown route "+path);
 equal(route.legacyWorkspaceView("?view=notifications",role),"notifications","legacy notifications");
 equal(route.legacyWorkspaceView("?view=quizBank",role),"quizzes","legacy Quiz bank");
 equal(route.legacyWorkspaceView("?view=quizzes",role),"quizzes","legacy Quiz");
 equal(route.legacyWorkspaceView("?view=settings",role),null,"internal settings alias is not a public URL");
 equal(route.workspaceUrl(role==="parent"?"account":"myAccount",role,"?lang=en&assignment=old&view=quizBank&parentNotice=old"),"/settings?lang=en","settings URL removes stale intent");
}
for(const [view,path] of Object.entries(route.WORKSPACE_PATHS)){
 equal(route.isWorkspacePath(path),true,"known route "+path);
 equal(route.workspacePath(view,"teacher"),path,"stable leaf URL "+view);
}
equal(route.workspacePath("settings","admin"),null,"settings alias cannot become group info implicitly");
equal(route.workspacePath("groupInfo","admin"),"/manage/group","group settings separate");
equal(route.workspacePath("financeHub","admin"),"/finance","finance primary resolves to existing leaf");
for(const view of ["home","myAccount","notifications","quizzes","sheet","groups","teachingHub","learningHub","manageHub","myHub"])equal(route.workspaceNeedsCore(view),false,"light page "+view);
for(const view of ["calendar","list","schedule","attendance","studentRoster","teacherRoster","parentRoster","accounts","classrooms","groupInfo","billing"])equal(route.workspaceNeedsCore(view),true,"heavy page "+view);
const quiz="abcdefghijklmnop",assignment="qrstuvwxyz123456";
equal(route.workspaceViewFromPath("/quiz/"+quiz,"student"),"quizzes","deep Quiz entry");
equal(route.workspaceViewFromPath("/quiz/short","student"),null,"invalid Quiz id");
equal(route.safeWorkspaceReturnPath("/quiz/"+quiz,"?assignment="+assignment+"&lang=zh&returnTo=https://evil.invalid","en"),"/quiz/"+quiz+"?assignment="+assignment+"&lang=en","assigned Quiz survives login");
equal(route.safeWorkspaceReturnPath("/quiz/"+quiz,"?assignment=bad&assignment=duplicate","en"),"/quiz/"+quiz+"?assignment=bad&assignment=duplicate&lang=en","invalid assignment presence preserved");
equal(route.safeWorkspaceReturnPath("/quiz/"+quiz,"?assignment="+"x".repeat(255),"zh"),"/quiz/"+quiz+"?assignment=invalid&lang=zh","bounded malicious assignment");
equal(route.safeWorkspaceReturnPath("/settings","?lang=zh&returnTo=https://evil.invalid","en"),"/settings?lang=en","settings return survives login");
equal(route.safeWorkspaceReturnPath("//evil.invalid","?lang=en","zh"),"/?lang=zh","external redirect rejected");
equal(route.safeWorkspaceReturnPath("/not-a-page","","zh"),"/?lang=zh","unknown return rejected");
console.log(JSON.stringify({passed:true,checks}));

