import {reportUnexpectedError} from '@/lib/diagnostics-server';
import { env } from "cloudflare:workers";
import {dispatchLearningNotifications} from "@/lib/learning-delivery";
import { dispatchReminders } from "@/lib/notifications-server";
export async function POST(request:Request) {
  const expected=env.NOTIFICATIONS_CRON_TOKEN,provided=request.headers.get("Authorization")?.slice(7);
  if(!expected || expected.length<32 || !request.headers.get("Authorization")?.startsWith("Bearer ") || !provided) return new Response(null,{status:404});
  const hash=async(value:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([hash(expected),hash(provided)]);let diff=0;for(let i=0;i<a.length;i++) diff|=a[i]^b[i];
  if(diff) return new Response(null,{status:404});
  // The application's minute cron owns parent reminders. This clock continues
  // to deliver lessons/homework without doing the same parent pass a second time.
  try {const reminders=await dispatchReminders();const learning=await dispatchLearningNotifications();return Response.json({ok:true,...reminders,learning,parents:{skipped:true}},{headers:{"Cache-Control":"no-store"}});}
  catch(error) {reportUnexpectedError(error,{operation:'notifications-dispatch',source:'background'});return Response.json({error:"Notification dispatch unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
