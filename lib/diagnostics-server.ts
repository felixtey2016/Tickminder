import {currentDiagnosticContext} from './diagnostics-context';
import {diagnosticsRoute,type DiagnosticCode,type DiagnosticSource,type DiagnosticInput} from './diagnostics-contract';
import {writeDiagnosticEvent} from './diagnostics-store';
export function classifyDiagnosticError(error:unknown):DiagnosticCode{
 let message='';try{message=error instanceof Error?error.message:typeof error==='string'?error:'';}catch{return'runtime_exception';}
 if(/D1|SQLITE|database/i.test(message)){if(/exceed|limit|quota/i.test(message))return'database_limit';if(/timeout|timed out|overloaded/i.test(message))return'database_timeout';return'database_failure';}
 if(/R2|bucket|storage/i.test(message))return'storage_failure';
 if(/CPU|memory|resource limit/i.test(message))return'resource_limit';
 return'runtime_exception';
}
export function reportUnexpectedError(error:unknown,options:{operation?:string;code?:DiagnosticCode;source?:DiagnosticSource;status?:number;route?:string}={}):string|null{
 try{
  const context=currentDiagnosticContext(),code=options.code||classifyDiagnosticError(error),source=options.source||context?.source||'api';
  if(!context){console.error(JSON.stringify({source:'diagnostics',code,route:diagnosticsRoute(options.route)}));return null;}
  const key=options.operation||source+':'+code;
  if(context.route==='/diagnostics'||context.reportedOperations.has(key))return context.requestId;
  context.reportedOperations.add(key);
  context.reported=true;
  let frame:DiagnosticInput['frame'];try{if(error instanceof Error&&typeof error.stack==='string'){const match=error.stack.slice(0,4000).split('\n').slice(1).filter(line=>/^\s+at\s/.test(line)).join('\n').match(/(?:\/|\\|\s)([A-Za-z0-9_.-]{1,100}\.(?:js|mjs)):(\d+):(\d+)/);if(match)frame={asset:match[1],line:Number(match[2]),column:Number(match[3])};}}catch{/* No raw error data is required for a report. */}
  const input={source,code,route:options.route||context.route,method:context.method,status:options.status??503,operation:options.operation,...(frame?{frame}:{})};
  context.waitUntil(writeDiagnosticEvent(context.bucket,input,context).then(()=>{}).catch(()=>{console.error(JSON.stringify({source:'diagnostics',code:'diagnostics_sink_unavailable',requestId:context.requestId}));}));
  return context.requestId;
 }catch{console.error(JSON.stringify({source:'diagnostics',code:'diagnostics_capture_failed'}));return null;}
}
