/** Per-mounted-reader scheduling only: no response, identity or permission cache. */
export type ReadRefreshReason = 'change' | 'foreground' | 'resume' | 'timer' | 'manual';
export function createReadRefresh(options: {
  load: () => Promise<number | undefined>;
  canRun: () => boolean;
  onError: (error: unknown) => void;
  cancelled?: (error: unknown) => boolean;
  maxAgeMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const now=options.now||Date.now,setTimer=options.setTimer||setTimeout,clearTimer=options.clearTimer||clearTimeout;
  const maxAge=options.maxAgeMs??300_000;
  let stopped=false,pending=false,dirty=true,manual=false,lastStart=-Infinity,lastSuccess:number|null=null,nextAt=0,retryAt=0,failures=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const clear=()=>{if(timer!==undefined){clearTimer(timer);timer=undefined;}};
  const schedule=()=>{
    clear();if(stopped||pending||!options.canRun())return;
    const due=dirty||lastSuccess===null?now():Math.min(nextAt,lastSuccess+maxAge);
    const at=manual?now():Math.max(due,retryAt,lastStart+250);
    // A short trailing window combines focus/visible and synchronous mutation events.
    timer=setTimer(()=>{timer=undefined;void run();},Math.max(manual?0:50,at-now()));
  };
  const run=async()=>{
    if(stopped||pending||!options.canRun())return;
    pending=true;dirty=false;manual=false;lastStart=now();
    try{
      const boundary=await options.load();if(stopped)return;
      lastSuccess=now();failures=0;retryAt=0;
      nextAt=Number.isFinite(boundary)?Math.max(lastSuccess+100,Math.min(boundary!,lastSuccess+maxAge)):lastSuccess+Math.min(maxAge,60_000);
    }catch(error){
      if(stopped)return;dirty=true;
      if(!options.cancelled?.(error)){failures++;retryAt=now()+Math.min(300_000,15_000*2**Math.min(failures-1,5));options.onError(error);}
    }finally{pending=false;if(!stopped)schedule();}
  };
  return {
    request(reason:ReadRefreshReason='change'){
      if(stopped)return;
      if(reason==='change'||reason==='manual')dirty=true;
      if(reason==='manual'){manual=true;retryAt=0;}
      schedule();
    },
    stop(){stopped=true;clear();},
    freshness:()=>({lastSuccess,nextAt,retryAt,failures,pending,dirty}),
  };
}
