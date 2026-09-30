import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5176';
async function call(token,path,body){for(let attempt=0;attempt<4;attempt++){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{origin,cookie:'tuition_session='+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const text=await r.text();if(r.status===503&&text.includes('Your worker restarted mid-request'))continue;return {status:r.status,data:JSON.parse(text)};}throw Error('Local Worker restarted');}
const admin='class-admin-token',teacher='class-teacher-a-token',otherTeacher='class-teacher-b-token',student='class-student-a-token',otherStudent='class-student-b-token';
const state=async token=>(await call(token,'/api/state')).data;
const action=async(token,body)=>call(token,'/api/action',body);
async function create(day,who='A'){const body={action:'create',student:'Demo Student '+who,subject:'Science',teacherName:'Demo Teacher '+who,start:day+'T19:00',end:day+'T20:00'};assert.equal((await action(admin,body)).status,200);return (await state(admin)).lessons.find(l=>l.student===body.student&&l.plannedStart===day+'T11:00:00.000Z');}
const lesson=await create('2036-03-01');
const proposalBody={action:'proposeReschedule',id:lesson.id,start:'2036-03-02T19:00',end:'2036-03-02T20:00',note:'Student request'};
assert.equal((await action(otherStudent,proposalBody)).status,403);
assert.equal((await action(otherTeacher,proposalBody)).status,403);
assert.equal((await action(admin,proposalBody)).status,403);
assert.equal((await call(otherStudent,'/api/conflicts',proposalBody)).status,403);
assert.equal((await call(student,'/api/conflicts',proposalBody)).data.available,true);
assert.equal((await action(student,{...proposalBody,requestedRole:'teacher'})).status,200);
let request=(await state(teacher)).proposals.find(p=>p.lessonId===lesson.id&&p.status==='pending');assert.equal(request.requestedRole,'student');assert.equal(request.requestedBy,'class-student-a');
assert.equal((await state(student)).lessons.find(l=>l.id===lesson.id).plannedStart,lesson.plannedStart,'Pending keeps original schedule');
assert.notEqual((await action(teacher,proposalBody)).status,200,'One pending request');
const respond={action:'respondReschedule',id:lesson.id,requestId:request.id,decision:'accept'};
for(const token of [student,otherStudent,otherTeacher,admin])assert.equal((await action(token,respond)).status,403);
assert.equal((await action(teacher,respond)).status,200);
assert.equal((await state(student)).lessons.find(l=>l.id===lesson.id).plannedStart,'2036-03-02T11:00:00.000Z');
assert.notEqual((await action(teacher,respond)).status,200,'Cannot respond twice');
assert.equal((await action(teacher,{...proposalBody,start:'2036-03-03T19:00',end:'2036-03-03T20:00'})).status,200);
request=(await state(student)).proposals.find(p=>p.lessonId===lesson.id&&p.status==='pending');assert.equal(request.requestedRole,'teacher');
assert.equal((await action(teacher,{...respond,requestId:request.id})).status,403);
assert.equal((await action(student,{...respond,requestId:request.id,decision:'reject'})).status,200);
assert.equal((await state(student)).lessons.find(l=>l.id===lesson.id).plannedStart,'2036-03-02T11:00:00.000Z');
assert.equal((await action(teacher,{...proposalBody,start:'2036-03-04T19:00',end:'2036-03-04T20:00'})).status,200);
request=(await state(student)).proposals.find(p=>p.lessonId===lesson.id&&p.status==='pending');
assert.equal((await action(student,{...respond,requestId:request.id})).status,200);
assert.equal((await state(student)).lessons.find(l=>l.id===lesson.id).plannedStart,'2036-03-04T11:00:00.000Z');
// Recheck conflicts when accepted: the proposal does not reserve the new slot.
assert.equal((await action(student,{...proposalBody,start:'2036-03-05T19:00',end:'2036-03-05T20:00'})).status,200);
request=(await state(teacher)).proposals.find(p=>p.lessonId===lesson.id&&p.status==='pending');
await create('2036-03-05');
const collision=await action(teacher,{...respond,requestId:request.id});assert.equal(collision.status,409);assert.equal('student' in collision.data.conflict,false);assert.equal('teacherName' in collision.data.conflict,false);
assert.equal((await state(student)).lessons.find(l=>l.id===lesson.id).plannedStart,'2036-03-04T11:00:00.000Z');
assert.equal((await action(teacher,{...respond,requestId:request.id,decision:'reject'})).status,200);
const adjacent={...proposalBody,start:'2036-03-05T20:00',end:'2036-03-05T21:00'};assert.equal((await call(student,'/api/conflicts',adjacent)).data.available,true);assert.equal((await action(student,adjacent)).status,200);
request=(await state(teacher)).proposals.find(p=>p.lessonId===lesson.id&&p.status==='pending');assert.equal((await action(teacher,{...respond,requestId:request.id})).status,200);
assert.equal((await action(student,{...proposalBody,start:'2020-01-01T19:00',end:'2020-01-01T20:00'})).status,400);
const foreign=await create('2036-03-07','B');assert.equal((await call(student,'/api/lesson-history?lessonId='+foreign.id)).status,403);assert.equal((await state(student)).proposals.some(p=>p.lessonId===foreign.id),false);
const history=await call(student,'/api/lesson-history?lessonId='+lesson.id);assert.equal(history.status,200);assert.ok(JSON.stringify(history.data).includes('rejected'));assert.ok(JSON.stringify(history.data).includes('accepted'));
// UI tests reuse the following pending outgoing request.
assert.equal((await action(student,{...proposalBody,start:'2036-03-08T19:00',end:'2036-03-08T20:00'})).status,200);
console.log('PASS: both directions; requester, foreign users and admin denied; direction spoof ignored; original time unchanged pending/rejected; accepted updates same lesson; duplicate/expired guards; acceptance conflicts rechecked; adjacent slots; privacy and history');
