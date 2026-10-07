import { currentBusinessAccount } from "@/lib/auth";
import { accessibleMeetLesson, disconnectMeet, meetLessonState, meetSettings, startMeetOAuth, syncMeetLesson } from "@/lib/meet-server";
import { MeetError, meetMessage } from "@/lib/meet-provider";
import { cookies } from "next/headers";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail=(e:unknown)=>Response.json({error:meetMessage(e instanceof MeetError?e.code:"unavailable")},{status:e instanceof MeetError?e.status:503,headers});
export async function GET(request:Request){
 const account=await currentBusinessAccount();if(!account)return Response.json({error:"登录已过期，请重新登录"},{status:401,headers});
 try{const id=new URL(request.url).searchParams.get("lessonId");return Response.json(id?await meetLessonState(account,await accessibleMeetLesson(account,id)):await meetSettings(account),{headers});}catch(e){return fail(e);}
}
export async function POST(request:Request){
 const account=await currentBusinessAccount();if(!account)return Response.json({error:"登录已过期，请重新登录"},{status:401,headers});
 if(request.headers.get("origin")!==new URL(request.url).origin)return fail(new MeetError("forbidden",403));
 try{
  const text=await request.text();if(text.length>2048)throw new MeetError("invalid",413);let body;
  try{body=JSON.parse(text);}catch{throw new MeetError("invalid");}
  if(body?.action==="connect"){
   const start=await startMeetOAuth(account,new URL(request.url).origin);
   (await cookies()).set("tickminder_meet_state",start.state,{httpOnly:true,secure:true,sameSite:"lax",maxAge:600,path:"/api/meet/callback"});
   return Response.json({url:start.url},{headers});
  }
  if(body?.action==="disconnect"){await disconnectMeet(account);return Response.json({ok:true},{headers});}
  if(body?.action==="sync"){
   if(!["teacher","admin"].includes(account.role))throw new MeetError("forbidden",403);
   const l=await accessibleMeetLesson(account,body.lessonId);await syncMeetLesson(l,true);return Response.json({ok:true,...await meetLessonState(account,l)},{headers});
  }
  throw new MeetError("invalid");
 }catch(e){return fail(e);}
}
