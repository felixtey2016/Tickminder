import {AsyncLocalStorage} from 'node:async_hooks';
import {diagnosticGroup,diagnosticsRoute,type DiagnosticSource} from './diagnostics-contract';
export type DiagnosticContext={bucket:R2Bucket|undefined;waitUntil:(promise:Promise<unknown>)=>void;route:string;method?:string;requestId:string;rayId?:string;buildId?:string;groupId:string|null;source:DiagnosticSource;reported:boolean;reportedOperations:Set<string>};
const storage=new AsyncLocalStorage<DiagnosticContext>();
export function currentDiagnosticContext(){return storage.getStore();}
export function withDiagnosticContext<T>(context:DiagnosticContext,run:()=>T):T{return storage.run(context,run);}
export function setDiagnosticActor(account:{groupId?:string|null;id?:string;role?:string}){
 const context=currentDiagnosticContext();if(!context)return;context.groupId=diagnosticGroup(account.groupId)?account.groupId:null;
}
export function newDiagnosticContext(request:Request|null,bindings:{DIAGNOSTICS?:R2Bucket;CF_VERSION_METADATA?:{id?:string}},waitUntil:(promise:Promise<unknown>)=>void,source:DiagnosticSource='api'):DiagnosticContext{
 const requestId=crypto.randomUUID(),rayId=request?.headers.get('cf-ray')||undefined;
 return{bucket:bindings.DIAGNOSTICS,waitUntil,route:request?diagnosticsRoute(new URL(request.url).pathname):'/other',...(request?{method:request.method}:{}),requestId,rayId,buildId:bindings.CF_VERSION_METADATA?.id,groupId:null,source,reported:false,reportedOperations:new Set()};
}
