import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import ts from 'typescript';

// Actual retired handler: no identity, database, credentials or network available.
const source=readFileSync(new URL('../app/api/sheet-sync/route.ts',import.meta.url),'utf8');
assert.doesNotMatch(source,/\bimport\s*(?:\(|[{'"*])|\b(?:learningDb|groupFetch|fetch)\s*\(/,'No runtime/database dependencies');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
let networkRequests=0,requestReads=0,checks=1;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{networkRequests++;throw Error('Network forbidden');};
try{
 const route=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 for(const method of ['GET','POST']){
  // Reading any identity, group, cookie, body or legacy secret is a failure.
  const request=new Proxy({},{get(){requestReads++;throw Error('Retired endpoint must not inspect request state');}});
  const response=await route[method](request);
  assert.equal(response.status,410);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{error:'This integration has been removed. Use CSV export.',code:'integration_retired'});checks+=3;
 }
 assert.equal(networkRequests,0);assert.equal(requestReads,0);checks+=2;
 for(const file of ['app/sheet-sync-panel.tsx','lib/sheet-sync.ts','integrations/GoogleSheetLessonSync.gs']){assert.equal(existsSync(new URL('../'+file,import.meta.url)),false,file+' is retired');checks++;}
 for(const file of ['app/scheduler.tsx','lib/management-navigation.ts','lib/four-entry-navigation.ts','lib/workspace-route.ts','lib/admin-permission-client.ts']){assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/SheetSyncPanel|sheetSync|sheet-sync|sheetImport/,file+' has no active Sheet entry');checks++;}
 // Independent Drive authorization and CSV content have dedicated suites.
 assert.match(readFileSync(new URL('../app/google-drive-import.tsx',import.meta.url),'utf8'),/export function GoogleDriveImport/);
 assert.match(readFileSync(new URL('../app/finance-round2-shared.tsx',import.meta.url),'utf8'),/export async function downloadFinanceCsv[\s\S]*?view:'export'[\s\S]*?text\/csv/);checks+=2;
 console.log(JSON.stringify({suite:'sheet-sync-retired',ok:true,checks,databaseQueries:0,networkRequests,productionWrites:false}));
}finally{globalThis.fetch=originalFetch;}
