import { env } from "cloudflare:workers";
import { hashToken } from "@/lib/auth";
import { dispatchMeet } from "@/lib/meet-server";
export async function POST(request:Request){
 const header=request.headers.get("Authorization"),expected=env.MEET_CRON_TOKEN;
 if(!expected || expected.length<32 || !header?.startsWith("Bearer ") || await hashToken(header.slice(7))!==await hashToken(expected))return new Response(null,{status:404});
 try{return Response.json({ok:true,...await dispatchMeet()},{headers:{"Cache-Control":"no-store"}});}
 catch{return Response.json({error:"Meet synchronization unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
