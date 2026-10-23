import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

// Run the real history helper with D1's five-term compound SELECT ceiling.
// Local SQLite accepts the old six-term query and would miss this regression.
const db=new DatabaseSync(':memory:');
const references=[['quizzes','owner_id'],['quiz_images','owner_id'],['quiz_versions','actor_id'],['quiz_practice_assignments','created_by'],['quiz_practice_attempts','account_id'],['quiz_practice_operations','actor_id']];
for(const [table,column]of references)db.exec(`CREATE TABLE ${table}(group_id TEXT,${column} TEXT)`);
let reads=0;
globalThis.__quizAccountHistory={first:async(sql,...args)=>{
  reads++;
  if((sql.match(/\bUNION(?:\s+ALL)?\s+SELECT\b/gi)||[]).length>=5)throw Error('too many terms in compound SELECT: SQLITE_ERROR');
  return db.prepare(sql).get(...args)||null;
},learningDb:()=>{throw Error('History checks must not write');},accountSessionPredicate:()=>({sql:'1',args:[]}),authorityGuard:()=>{throw Error('History checks must not mutate accounts');}};
const stub='data:text/javascript;base64,'+Buffer.from('export const {first,learningDb,authorityGuard,accountSessionPredicate}=globalThis.__quizAccountHistory;').toString('base64');
let source=ts.transpileModule(readFileSync(new URL('../lib/account-merge.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
source=source.replace(/from ["']@\/lib\/(learning-server|admin-authority|account-session)["']/g,`from "${stub}"`);
const {hasQuizAccountHistory}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
try{
  assert.equal(await hasQuizAccountHistory('no-history'),false);
  for(const [index,[table,column]]of references.entries()){
    const account='history-'+index;
    db.prepare(`INSERT INTO ${table}(group_id,${column}) VALUES(?,?)`).run('another-group',account);
    const before=reads;
    assert.equal(await hasQuizAccountHistory(account),true,table+' alone protects the account, including history in another group');
    assert.equal(reads,before+1,'History remains a single database read');
    assert.equal(await hasQuizAccountHistory('no-history'),false,'Unrelated history does not block an empty account');
  }
  assert.equal(db.prepare('SELECT count(*) n FROM quizzes').get().n,1,'History check keeps records');
  console.log('PASS account quiz history: D1 query ceiling, all six reference paths, unrelated accounts, cross-group history and read-only checks.');
}finally{db.close();delete globalThis.__quizAccountHistory;}
