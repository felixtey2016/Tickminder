"use client";

import dynamic from "next/dynamic";
import {useEffect} from "react";
import {reportClientException} from "@/lib/diagnostics-client";
import { BRAND_NAME } from "@/lib/brand";

// This workspace loads its authenticated data in the browser. Avoid rendering
// the full management component tree in each fresh Worker isolate.
const Workspace = dynamic(() => import("./scheduler").then(module => module.Scheduler), {
  ssr: false,
  loading: ({ error }) => <WorkspaceStartup error={error}/>,
});
function WorkspaceStartup({error}:{error?:Error|null}){
 useEffect(()=>{if(error)reportClientException(error,"render_failure");},[error]);
 return (
    <main className="workspace-startup" aria-busy={!error}>
      <img src="/tickminder-logo-192.png" alt="" width={56} height={56}/>
      <h1>{BRAND_NAME}</h1>
      {error ? <><p role="alert">页面暂时无法加载 / Unable to load the page</p><button type="button" onClick={() => window.location.reload()}>重新加载 / Reload</button></> : <p role="status">正在加载… / Loading…</p>}
    </main>
  );
}

export function SchedulerEntry({initialQuizId}:{initialQuizId?:string}={}) {
  return <Workspace initialQuizId={initialQuizId}/>;
}
