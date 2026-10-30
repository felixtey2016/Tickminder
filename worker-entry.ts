import handler from 'vinext/server/fetch-handler';
import {runParentNotificationTick} from './lib/parent-delivery';
import {maintainNotificationHistory,NOTIFICATION_MAINTENANCE_CRON} from './lib/notification-maintenance';
import {newDiagnosticContext,withDiagnosticContext} from './lib/diagnostics-context';
import {reportUnexpectedError} from './lib/diagnostics-server';
const sources=new Set(['/api/action','/api/class-sessions','/api/invoices','/api/invoice-finance','/api/invoice-attendance-corrections','/api/parents','/api/manage','/api/groups']);
const app=handler as ExportedHandler;
type DiagnosticsBindings={DIAGNOSTICS?:R2Bucket;CF_VERSION_METADATA?:{id?:string}};
export default {
 async fetch(request:Parameters<NonNullable<ExportedHandler['fetch']>>[0],bindings:unknown,ctx:ExecutionContext){
  const context=newDiagnosticContext(request,bindings as DiagnosticsBindings,promise=>ctx.waitUntil(promise));
  return withDiagnosticContext(context,async()=>{
   let response:Response;
   try{
    if(!app.fetch)throw new Error('Application handler unavailable');
    response=await app.fetch(request,bindings,ctx);
   }catch(error){
    reportUnexpectedError(error,{source:'worker',status:500});
    // Preserve framework/Cloudflare failure semantics and native exception reporting.
    throw error;
   }
   if(response.status>=500&&context.route!=='/diagnostics'&&!context.reported)reportUnexpectedError(null,{code:'api_5xx',status:response.status});
   if(request.method==='POST'&&response.ok&&sources.has(new URL(request.url).pathname))ctx.waitUntil(runParentNotificationTick().catch(error=>{reportUnexpectedError(error,{source:'background',code:'background_failure',operation:'parent-reminders'});}));
   if(context.reported&&response.status>=500){
    try{const headers=new Headers(response.headers);headers.set('x-tickminder-error-id',context.requestId);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}catch{/* Diagnostics must not replace a business response. */}
   }
   return response;
  });
 },
 async scheduled(event:ScheduledController,bindings:unknown,ctx:ExecutionContext){
  const context=newDiagnosticContext(null,bindings as DiagnosticsBindings,promise=>ctx.waitUntil(promise),'cron');
  ctx.waitUntil(withDiagnosticContext(context,async()=>{try{await(event.cron===NOTIFICATION_MAINTENANCE_CRON?maintainNotificationHistory(event.scheduledTime):runParentNotificationTick(event.scheduledTime));}catch(error){reportUnexpectedError(error,{source:'cron',code:'cron_failure',operation:'parent-reminders'});throw error;}}));
 },
} satisfies ExportedHandler;
