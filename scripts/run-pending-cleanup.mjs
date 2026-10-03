// Dedicated, least-privilege cleanup credential; never use backup/export tokens.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw Error('Missing '+name);return args[i+1];};
const path=resolve(option('--token-file'));
if(path.toLowerCase().startsWith(root.toLowerCase()+'\\'))throw Error('Credential must be outside source');
function dpapi(method,bytes){const script=['$ErrorActionPreference="Stop"','Add-Type -AssemblyName System.Security','$bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',`$out=[System.Security.Cryptography.ProtectedData]::${method}($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,'[Console]::Out.Write([Convert]::ToBase64String($out))'].join('; ');return Buffer.from(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:bytes.toString('base64'),encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim(),'base64');}
if(args.includes('--store')){
  // Stdin is hidden; the token never enters arguments or a plaintext file.
  if(process.stdin.isTTY)process.stdin.setRawMode(true);
  console.log('Ready for cleanup configuration on stdin (input hidden).');
  let input='';for await(const chunk of process.stdin){input+=chunk;if(/[\r\n]/.test(input))break;}
  const config=JSON.parse(input.trim());if(typeof config.token!=='string'||config.token.length<32)throw Error('Invalid cleanup credential');
  mkdirSync(dirname(path),{recursive:true});writeFileSync(path,dpapi('Protect',Buffer.from(config.token)));
  console.log('Encrypted cleanup credential stored.');process.exit(0);
}
const url=new URL(option('--url'));if(url.origin!=='https://www.tickminder.com')throw Error('Production cleanup origin required');
const secret=dpapi('Unprotect',readFileSync(path)).toString('utf8');
const statusPath=resolve(option('--status-file'));if(statusPath.toLowerCase().startsWith(root.toLowerCase()+'\\'))throw Error('Status must be outside source');
try{
  let deleted=0,checked=0;
  for(let page=0;page<20;page++){
    const response=await fetch(new URL('/api/pending-cleanup',url),{method:'POST',headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(60000),redirect:'error'});
    if(!response.ok)throw Error('Cleanup request failed: HTTP '+response.status);
    const result=await response.json();if(!result.ok)throw Error('Cleanup was not confirmed');deleted+=result.deleted;checked+=result.checked;if(result.checked<50)break;
  }
  const status={success:true,at:new Date().toISOString(),deleted,checked};writeFileSync(statusPath,JSON.stringify(status,null,2));console.log(JSON.stringify(status));
}catch(error){writeFileSync(statusPath,JSON.stringify({success:false,at:new Date().toISOString(),error:error.message},null,2));console.error(error.message);process.exitCode=1;}
