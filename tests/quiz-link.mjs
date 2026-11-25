import assert from 'node:assert/strict';
import {validQuizLinkId,isQuizLinkId,quizLinkPath,quizLinkIdFromPath,quizAssignmentFromSearch} from '../lib/quiz-link.ts';
let checks=0;function check(fn){fn();checks++;}
const ids=['A'.repeat(16),'z'.repeat(80),'a1234567-b123-4123-a123-123456789abc','quiz_0123456789_ABC-def'];
for(const id of ids){check(()=>assert.equal(validQuizLinkId(id),true));check(()=>assert.equal(isQuizLinkId(id),true));check(()=>assert.equal(quizLinkPath(id),'/quiz/'+id));check(()=>assert.equal(quizLinkIdFromPath('/quiz/'+id),id));check(()=>assert.equal(quizLinkIdFromPath('/quiz/'+id+'/'),id));}
const invalid=['','a'.repeat(15),'a'.repeat(81),'https://evil.test/quiz/id','//evil.test','../quiz/a123456789012345','a123456789012345/extra','a123456789012345?x=1','a123456789012345#x','a123456789012345%2f','a123456789012345\\test','a123456789012345\n','学生名字学生名字学生名字学生名字',null,undefined,12];
for(const id of invalid){check(()=>assert.equal(validQuizLinkId(id),false));check(()=>assert.throws(()=>quizLinkPath(id)));}
for(const pathname of ['//quiz/'+ids[0],'/quiz/'+ids[0]+'?next=https://evil.test','/quiz/'+ids[0]+'#x','/quiz/'+ids[0]+'/extra','/Quiz/'+ids[0],'/quiz/%2F'+ids[0],'/quiz/'+ids[0]+'//'])check(()=>assert.equal(quizLinkIdFromPath(pathname),null));
// Assignment intent must survive unrelated login/invitation parameters. Invalid
// or repeated values must remain distinguishable from an ordinary practice URL.
for(const assignmentId of ids){
 check(()=>assert.equal(quizLinkPath(ids[0],assignmentId),'/quiz/'+ids[0]+'?assignment='+encodeURIComponent(assignmentId)));
 check(()=>assert.deepEqual(quizAssignmentFromSearch('?assignment='+encodeURIComponent(assignmentId)),{present:true,id:assignmentId}));
 check(()=>assert.deepEqual(quizAssignmentFromSearch('?group=fixture&assignment='+encodeURIComponent(assignmentId)+'&view=quizzes'),{present:true,id:assignmentId}));
 check(()=>assert.deepEqual(quizAssignmentFromSearch('?assignment='+assignmentId+'&assignment='+assignmentId),{present:true,id:null}));
}
for(const assignmentId of invalid.filter(value=>value!==undefined))check(()=>assert.throws(()=>quizLinkPath(ids[0],assignmentId)));
for(const search of ['', '?group=fixture', '?view=quizzes&other=1'])check(()=>assert.deepEqual(quizAssignmentFromSearch(search),{present:false,id:null}));
for(const search of ['?assignment=','?assignment','?assignment=bad','?assignment=https%3A%2F%2Fevil.test','?assignment=%2F%2Fevil.test','?assignment='+ids[0]+'%2Fextra','?assignment='+ids[0]+'%0A','?assignment='+ids[0]+'&assignment=','?assignment=&assignment='+ids[0]])check(()=>assert.deepEqual(quizAssignmentFromSearch(search),{present:true,id:null}));
check(()=>assert.equal(quizLinkPath(ids[0],undefined),'/quiz/'+ids[0]));
console.log(JSON.stringify({suite:'quiz-link-path-and-assignment-intent',checks,networkRequests:0,productionWrites:false}));
