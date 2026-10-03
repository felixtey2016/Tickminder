interface Env { TICKMINDER_ORIGIN:string; NOTIFICATIONS_CRON_TOKEN:string; }
export default {
  async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext) {
    ctx.waitUntil((async()=>{
      // This clock holds no student data, usernames, PDFs or business DB.
      const origin=new URL(env.TICKMINDER_ORIGIN);
      if(origin.origin!=="https://www.tickminder.com" || origin.pathname!=="/" || origin.search || origin.hash || env.NOTIFICATIONS_CRON_TOKEN.length<32) throw new Error("Invalid scheduler configuration");
      const response=await fetch(new URL("/api/notifications/dispatch",origin),{
        method:"POST",headers:{Authorization:`Bearer ${env.NOTIFICATIONS_CRON_TOKEN}`},redirect:"manual",signal:AbortSignal.timeout(45_000),
      });
      // Log only status, never credentials, request headers or lesson details.
      if(!response.ok) throw new Error(`Tickminder reminder dispatch failed (${response.status})`);
    })());
  },
  fetch() {return new Response(null,{status:404});},
};
