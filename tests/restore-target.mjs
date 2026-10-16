import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Execute the real recovery script with fictional config/target files. Replace
// child-process functions with a recorder that cannot run cloud or local tools.
// Matching targets reach only this recorder; rejected targets must not reach it.
const repo=path.resolve(import.meta.dirname,'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-restore-target-'));
const checkout=path.join(temporary,'checkout'),snapshot=path.join(temporary,'snapshot');
fs.mkdirSync(checkout);fs.mkdirSync(snapshot);
const approved={accountId:'a'.repeat(32),databaseId:'11111111-2222-4333-8444-555555555555',bucketName:'fictional-restore-bucket'};
fs.writeFileSync(path.join(checkout,'wrangler.recovery.json'),JSON.stringify({account_id:approved.accountId,d1_databases:[{database_id:approved.databaseId}],r2_buckets:[{bucket_name:approved.bucketName}]}));
const source=fs.readFileSync(path.join(repo,'scripts','restore-cloudflare-backup.mjs'),'utf8');
let checks=0,sequence=0;
const check=fn=>{fn();checks++;};
const dataUrl=value=>'data:text/javascript;base64,'+Buffer.from(value).toString('base64');
async function execute(args){
 const key='__restoreTargetFixture'+sequence++,calls=[];globalThis[key]=calls;
 const childStub=dataUrl(`const calls=globalThis[${JSON.stringify(key)}];export function spawnSync(...args){calls.push(args);return{status:99,stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)};}export function execFileSync(...args){calls.push(args);throw Error('Real processes are forbidden in restore-target tests');}`);
 const code=source.replace("const root = resolve(import.meta.dirname, '..');",'const root = '+JSON.stringify(checkout)+';')
  .replace('const args = process.argv.slice(2);','const args = '+JSON.stringify(args)+';')
  .replace("'node:child_process'",JSON.stringify(childStub))
  .replace("'./backup-order.mjs'",JSON.stringify(pathToFileURL(path.join(repo,'scripts','backup-order.mjs')).href));
 const previousError=console.error,previousExitCode=process.exitCode;let error=null;const printed=[];
 console.error=(...values)=>printed.push(values.join(' '));
 try{await import(dataUrl(code));}catch(caught){error=caught;}finally{console.error=previousError;process.exitCode=previousExitCode;delete globalThis[key];}
 return{calls,error,printed};
}
function privateTarget(name,contents){const file=path.join(temporary,name+'.json');fs.writeFileSync(file,JSON.stringify(contents));return file;}
async function rejected(args,pattern){const result=await execute(args);check(()=>assert.match(result.error?.message||'',pattern));check(()=>assert.equal(result.calls.length,0,'guard rejects before any child/cloud command'));return result;}
try{
 await rejected(['--in',snapshot,'--apply'],/private --expected-target/);
 await rejected(['--in',snapshot,'--expected-target'],/private --expected-target/);
 const inside=path.join(checkout,'expected-target.json');fs.writeFileSync(inside,JSON.stringify(approved));
 await rejected(['--in',snapshot,'--expected-target',inside,'--apply'],/outside source/);
 const misleading=path.join(checkout,'..private');fs.mkdirSync(misleading);const misleadingFile=path.join(misleading,'expected-target.json');fs.writeFileSync(misleadingFile,JSON.stringify(approved));
 await rejected(['--in',snapshot,'--expected-target',misleadingFile,'--apply'],/outside source/);
 for(const [key,value]of [['accountId','b'.repeat(32)],['databaseId','66666666-7777-4888-8999-000000000000'],['bucketName','fictional-other-bucket']]){
  const file=privateTarget('mismatch-'+key,{...approved,[key]:value});
  await rejected(['--in',snapshot,'--expected-target',file,'--apply'],/Unexpected recovery target/);
 }
 const invalid=privateTarget('invalid-target',{...approved,databaseId:'invalid-id'});
 await rejected(['--in',snapshot,'--expected-target',invalid,'--apply'],/Unexpected recovery target/);
 const approvedFile=privateTarget('approved-target',approved),accepted=await execute(['--in',snapshot,'--expected-target',approvedFile,'--apply']);
 await rejected(['--in',checkout,'--expected-target',approvedFile,'--apply'],/Snapshot must be outside source/);
 await rejected(['--in',misleading,'--expected-target',approvedFile,'--apply'],/Snapshot must be outside source/);
 check(()=>assert.equal(accepted.error,null,'independent matching target passes the early guard'));
 check(()=>assert.equal(accepted.calls.length,1,'execution stops at the fake first child command'));
 check(()=>assert.equal(accepted.calls[0][1][1],'verify','snapshot verification is the first requested child command'));
 check(()=>assert.ok(accepted.printed.some(value=>value.includes('Recovery command failed')),'fake process failure remains fail closed'));
 check(()=>assert.equal(fs.readdirSync(snapshot).length,0,'no cloud restore or snapshot write occurred'));
 console.log(JSON.stringify({suite:'restore-target',checks,network:'disabled',childProcesses:'recorded stubs only',coverage:'actual restore-script early refusal for absent/private-inside-source/target mismatches, and matching-target verification boundary'}));
}finally{
 const resolved=path.resolve(temporary);
 if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-restore-target-'))fs.rmSync(resolved,{recursive:true,force:true});
}
