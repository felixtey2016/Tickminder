"use client";
import {useEffect} from "react";
import {reportClientException} from "@/lib/diagnostics-client";
import {DiagnosticsReporter} from "@/components/diagnostics-reporter";
import {AppearanceProvider} from "@/components/appearance-toggle";

// The root error boundary replaces layout.tsx, so it must also work without its CSS.
const fallbackStyles=`
.global-error-page{margin:0;min-height:100svh;font-family:Arial,sans-serif;line-height:1.5;background:var(--ui-bg,#f4f3f7);color:var(--ui-text,#252334)}
:root.dark .global-error-page{background:var(--ui-bg,#17191f);color:var(--ui-text,#dfe3eb)}
.global-error-content{box-sizing:border-box;max-width:648px;margin:0 auto;padding:15svh 24px 32px;overflow-wrap:anywhere}
.global-error-content h1{font-size:24px;line-height:1.4;margin:0 0 24px}
.global-error-actions{display:flex;flex-wrap:wrap;gap:12px}
.global-error-actions button{min-height:44px;max-width:100%;padding:12px 18px;border:1px solid var(--ui-border,#dddfe7);border-radius:6px;background:var(--ui-surface,#fff);color:inherit;font:inherit;cursor:pointer}
.global-error-actions button:first-child{background:var(--ui-primary,#6547c6);color:var(--ui-primary-text,#fff);border-color:transparent}
:root.dark .global-error-actions button{background:var(--ui-surface,#20232b);border-color:var(--ui-border,#414653)}
:root.dark .global-error-actions button:first-child{background:var(--ui-primary,#c1aaff);color:var(--ui-primary-text,#211735);border-color:transparent}
.global-error-actions button:focus-visible{outline:2px solid var(--ui-accent,#6547c6);outline-offset:3px}
:root.dark .global-error-actions button:focus-visible{outline-color:var(--ui-accent,#c1aaff)}
`;
export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{reportClientException(error,"render_failure");},[error]);
 return <html lang="en" suppressHydrationWarning><head><style>{fallbackStyles}</style></head><body className="global-error-page"><AppearanceProvider><DiagnosticsReporter/><main className="global-error-content"><h1>页面暂时无法加载 / Unable to load this page</h1><div className="global-error-actions"><button type="button" onClick={reset}>重试 / Retry</button><button type="button" onClick={()=>window.location.reload()}>重新加载 / Reload</button></div></main></AppearanceProvider></body></html>;
}
