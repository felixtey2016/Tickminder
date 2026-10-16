import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Real dependency modules are emitted once instead of recursively embedding
// their entire transitive source in data URLs. This keeps permission-heavy
// regression fixtures bounded while retaining their real SQL and services.
export function createFixtureLoader({runtimeUrl,environmentUrl,runtimeFiles,transform=(file,code)=>code}){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-fixture-modules-')),compiled=new Map(),loaded=new Map();
 const fixtureFiles=new Set(runtimeFiles||['lib/auth.ts','lib/learning-server.ts','lib/owner.ts','lib/learning-operations.ts','lib/pdf-storage.ts']);
 process.once('exit',()=>{const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-fixture-modules-'))fs.rmSync(resolved,{recursive:true,force:true});});
 function compile(file){
  if(compiled.has(file))return compiled.get(file);
  const output=path.join(temporary,file.replace(/\.ts$/,'.mjs')),url=pathToFileURL(output).href;compiled.set(file,url);
  let code=transform(file,ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  for(const [,spec] of [...code.matchAll(/from ['"]([^'"]+)['"]/g)]){
   const resolved=spec.startsWith('@/')?spec.slice(2)+'.ts':spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec+'.ts')):null;
   const replacement=resolved&&fixtureFiles.has(resolved)?runtimeUrl:spec==='cloudflare:workers'?environmentUrl:resolved?compile(resolved):import.meta.resolve(spec);
   code=code.replaceAll(`'${spec}'`,`'${replacement}'`).replaceAll(`"${spec}"`,`"${replacement}"`);
  }
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,code);return url;
 }
 return async file=>{if(!loaded.has(file)){const url=compile(file);loaded.set(file,{url,module:await import(url)});}return loaded.get(file);};
}
