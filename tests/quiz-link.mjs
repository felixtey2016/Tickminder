import assert from 'node:assert/strict';
import {validQuizLinkId,isQuizLinkId,quizLinkPath,quizLinkIdFromPath} from '../lib/quiz-link.ts';
let checks=0;function check(fn){fn();checks++;}
const ids=['A'.repeat(16),'z'.repeat(80),'a1234567-b123-4123-a123-123456789abc','quiz_0123456789_ABC-def'];
for(const id of ids){check(()=>assert.equal(validQuizLinkId(id),true));check(()=>assert.equal(isQuizLinkId(id),true));check(()=>assert.equal(quizLinkPath(id),'/quiz/'+id));check(()=>assert.equal(quizLinkIdFromPath('/quiz/'+id),id));check(()=>assert.equal(quizLinkIdFromPath('/quiz/'+id+'/'),id));}
const invalid=['','a'.repeat(15),'a'.repeat(81),'https://evil.test/quiz/id','//evil.test','../quiz/a123456789012345','a123456789012345/extra','a123456789012345?x=1','a123456789012345#x','a123456789012345%2f','a123456789012345\\test','a123456789012345\n','学生名字学生名字学生名字学生名字',null,undefined,12];
for(const id of invalid){check(()=>assert.equal(validQuizLinkId(id),false));check(()=>assert.throws(()=>quizLinkPath(id)));}
for(const pathname of ['//quiz/'+ids[0],'/quiz/'+ids[0]+'?next=https://evil.test','/quiz/'+ids[0]+'#x','/quiz/'+ids[0]+'/extra','/Quiz/'+ids[0],'/quiz/%2F'+ids[0],'/quiz/'+ids[0]+'//'])check(()=>assert.equal(quizLinkIdFromPath(pathname),null));
console.log(JSON.stringify({suite:'quiz-link-path',checks,networkRequests:0,productionWrites:false}));
