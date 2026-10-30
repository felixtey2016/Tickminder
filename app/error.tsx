"use client";
import {useEffect} from "react";
import {reportClientException} from "@/lib/diagnostics-client";
export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{reportClientException(error,"render_failure");},[error]);
 return <main className="workspace-startup"><h1>页面暂时无法加载 / Unable to load this page</h1><button type="button" onClick={reset}>重试 / Retry</button><button type="button" onClick={()=>window.location.reload()}>重新加载 / Reload</button></main>;
}