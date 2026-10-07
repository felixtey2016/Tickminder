interface Env { TICKMINDER_ORIGIN:string; NOTIFICATIONS_CRON_TOKEN:string; MEET_CRON_TOKEN?:string; }
export default {
  async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext) {
    ctx.waitUntil((async()=>{
      // This clock holds no student data, usernames, PDFs or business DB.
      const origin=new URL(env.TICKMINDER_ORIGIN);
      const allowedOrigins=new Set(["https://www.tickminder.com","https://timelyo-learning-staging.zezhou2009.chatgpt.site"]);
      if(!allowedOrigins.has(origin.origin) || origin.pathname!=="/" || origin.search || origin.hash || origin.username || origin.password || env.NOTIFICATIONS_CRON_TOKEN.length<32) throw new Error("Invalid scheduler configuration");
      const reminders=fetch(new URL("/api/notifications/dispatch",origin),{
        method:"POST",headers:{Authorization:`Bearer ${env.NOTIFICATIONS_CRON_TOKEN}`},redirect:"manual",signal:AbortSignal.timeout(45_000),
      });
      // Log only status, never credentials, request headers or lesson details.
      const tasks=[reminders];
      if(env.MEET_CRON_TOKEN && env.MEET_CRON_TOKEN.length>=32) tasks.push(fetch(new URL("/api/meet/dispatch",origin),{method:"POST",headers:{Authorization:`Bearer ${env.MEET_CRON_TOKEN}`},redirect:"manual",signal:AbortSignal.timeout(90_000)}));
      const results=await Promise.allSettled(tasks);
      for(let i=0;i<results.length;i++){
        const result=results[i];
        if(result.status==="rejected" || !result.value.ok) console.error(`Tickminder ${i===0?"reminder":"Meet"} dispatch failed (${result.status==="fulfilled"?result.value.status:"network"})`);
      }
    })());
  },
  fetch() {return new Response(null,{status:404});},
};
