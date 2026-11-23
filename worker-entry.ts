import handler from 'vinext/server/fetch-handler';
import {runParentNotificationTick} from './lib/parent-delivery';
import {maintainNotificationHistory,NOTIFICATION_MAINTENANCE_CRON} from './lib/notification-maintenance';
import {newDiagnosticContext,withDiagnosticContext} from './lib/diagnostics-context';
import {reportUnexpectedError} from './lib/diagnostics-server';
import {watchPreviewBranding,watchPreviewConfig,watchPreviewLegacyLocation,type WatchPreviewBindings} from './lib/watch-preview-config';
const sources=new Set(['/api/action','/api/class-sessions','/api/invoices','/api/invoice-finance','/api/invoice-attendance-corrections','/api/parents','/api/manage','/api/groups']);
const watchPaths=new Set([
 '/api/watch-preview/catalog','/api/watch-preview/playlists','/api/watch-preview/playlist-editor','/api/watch-preview/social','/api/watch-preview/facets','/api/watch-preview/academic-options','/api/watch-preview/redeem',
 '/watch-preview.css','/watch-preview.js','/watch-playlists.js','/watch-social.js','/watch-more.js',watchPreviewBranding.logo,watchPreviewBranding.favicon,
]);
const app=handler as ExportedHandler;
type DiagnosticsBindings={DIAGNOSTICS?:R2Bucket;CF_VERSION_METADATA?:{id?:string}};
export default {
 async fetch(request:Parameters<NonNullable<ExportedHandler['fetch']>>[0],bindings:unknown,ctx:ExecutionContext){
  const context=newDiagnosticContext(request,bindings as DiagnosticsBindings,promise=>ctx.waitUntil(promise));
  return withDiagnosticContext(context,async()=>{
   let response:Response;
   try{
    if(!app.fetch)throw new Error('Application handler unavailable');
    const watch=watchPreviewConfig(bindings as WatchPreviewBindings);
    if(watch){
      const url=new URL(request.url);
      if(url.origin===watch.legacyWatch){
        const destination=['GET','HEAD'].includes(request.method) ? watchPreviewLegacyLocation(watch,url) : null;
        const headers=new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
        if(destination)headers.set('Location',destination);
        return new Response(null,{status:destination?302:404,headers});
      }
      if(url.origin===watch.watch){
        const basePath=watch.entryPath.replace(/\/$/,'');
        const videoPrefix=basePath+'/videos/';
        const playlistPath=basePath+'/playlists';
        const personal=new Map([['/account','account'],['/account/videos','my-videos'],['/favorites','favorites'],['/notifications','notifications']]);
        const section=personal.get(url.pathname.slice(basePath.length).replace(/\/$/,''));
        if(url.pathname===watch.entryPath||(!watch.splitOrigin&&url.pathname==='/watch/')){
          url.pathname='/api/watch-preview/view';
          request=new Request(url,request) as typeof request;
        }else if(section&&url.pathname.startsWith(basePath+'/')){
          url.pathname='/api/watch-preview/'+section;
          request=new Request(url,request) as typeof request;
        }else if(url.pathname===playlistPath || url.pathname===playlistPath+'/'){
          url.pathname='/api/watch-preview/playlists';
          request=new Request(url,request) as typeof request;
        }else if(url.pathname.startsWith(playlistPath+'/')){
          url.searchParams.set('playlist',url.pathname.slice(playlistPath.length+1));
          url.pathname='/api/watch-preview/playlist';
          request=new Request(url,request) as typeof request;
        }else if(url.pathname.startsWith(videoPrefix)){
          url.searchParams.set('video',url.pathname.slice(videoPrefix.length));
          url.pathname='/api/watch-preview/video';
          request=new Request(url,request) as typeof request;
        }else if(watch.splitOrigin&&!watchPaths.has(url.pathname)){
          return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
        }
      }
    }
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
