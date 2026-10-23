import handler from 'vinext/server/fetch-handler';
import {runParentNotificationTick} from './lib/parent-delivery';
// A minute clock keeps parent reminders independent of page visits. Successful
// source mutations also request a background pass without delaying the form.
const sources=new Set(['/api/action','/api/class-sessions','/api/invoices','/api/invoice-finance','/api/invoice-attendance-corrections','/api/parents','/api/manage','/api/groups']);
const app=handler as ExportedHandler;
export default {
 async fetch(request:Parameters<NonNullable<ExportedHandler['fetch']>>[0],bindings:unknown,ctx:ExecutionContext){
  if(!app.fetch)throw new Error('Application handler unavailable');
  const response=await app.fetch(request,bindings,ctx);
  if(request.method==='POST'&&response.ok&&sources.has(new URL(request.url).pathname))ctx.waitUntil(runParentNotificationTick().catch(()=>{console.error('Parent notification background pass failed');}));
  return response;
 },
 async scheduled(event:ScheduledController,_bindings:unknown,ctx:ExecutionContext){ctx.waitUntil(runParentNotificationTick(event.scheduledTime));},
} satisfies ExportedHandler;
