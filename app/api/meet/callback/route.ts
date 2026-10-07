import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { currentBusinessAccount } from "@/lib/auth";
import { finishMeetOAuth, meetConfigured } from "@/lib/meet-server";
import { MeetError } from "@/lib/meet-provider";
export async function GET(request:Request){
 const url=new URL(request.url);
 if(!meetConfigured() || `${url.origin}${url.pathname}`!==env.MEET_OAUTH_REDIRECT_URI)return new Response(null,{status:403});
 let result="oauth";
 try{
  const account=await currentBusinessAccount(),jar=await cookies(),state=url.searchParams.get("state")||"",saved=jar.get("tickminder_meet_state")?.value;
  jar.set("tickminder_meet_state","",{httpOnly:true,secure:true,sameSite:"lax",maxAge:0,path:"/api/meet/callback"});
  if(!account || !saved || !state || saved!==state || url.searchParams.has("error"))throw new MeetError("oauth");
  await finishMeetOAuth(account,state,url.searchParams.get("code")||"");result="connected";
 }catch(e){if(e instanceof MeetError && ["duplicate","denied","reconnect","network"].includes(e.code))result=e.code;}
 // Never reflect Google's code, state, token or raw error into HTML/query/logs.
 const target=new URL("/",url.origin);target.searchParams.set("view","meet");target.searchParams.set("meetResult",result);
 return new Response(null,{status:303,headers:{Location:target.href,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
