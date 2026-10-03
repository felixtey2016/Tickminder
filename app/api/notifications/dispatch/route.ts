import { env } from "cloudflare:workers";
import { dispatchReminders } from "@/lib/notifications-server";
export async function POST(request:Request) {
  const expected=env.NOTIFICATIONS_CRON_TOKEN,provided=request.headers.get("Authorization")?.slice(7);
  if(!expected || expected.length<32 || !request.headers.get("Authorization")?.startsWith("Bearer ") || !provided) return new Response(null,{status:404});
  const hash=async(value:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([hash(expected),hash(provided)]);let diff=0;for(let i=0;i<a.length;i++) diff|=a[i]^b[i];
  if(diff) return new Response(null,{status:404});
  try {return Response.json({ok:true,...await dispatchReminders()},{headers:{"Cache-Control":"no-store"}});}
  catch {return Response.json({error:"Notification dispatch unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
