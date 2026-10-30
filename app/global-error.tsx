"use client";
import {useEffect} from "react";
import {reportClientException} from "@/lib/diagnostics-client";
import {DiagnosticsReporter} from "@/components/diagnostics-reporter";
export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{reportClientException(error,"render_failure");},[error]);
 return <html lang="en"><body style={{margin:0,fontFamily:"Arial,sans-serif",background:"#f7f6fc",color:"#292338"}}><DiagnosticsReporter/><main style={{maxWidth:600,margin:"15vh auto",padding:24}}><h1 style={{fontSize:24}}>页面暂时无法加载 / Unable to load this page</h1><button type="button" onClick={reset} style={{padding:"12px 18px",marginRight:12}}>重试 / Retry</button><button type="button" onClick={()=>window.location.reload()} style={{padding:"12px 18px"}}>重新加载 / Reload</button></main></body></html>;
}