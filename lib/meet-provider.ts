import type { MeetConference, MeetParticipant, MeetSession } from "@/lib/meet";
export class MeetError extends Error { constructor(public code: string, public status=400) { super(code); } }
const messages: Record<string,string> = {
 not_configured:"Google Meet 检测尚未配置，请联系管理员", denied:"此 Google 账号无权读取会议，请连接创建会议的账号",
 reconnect:"Google Meet 授权已失效，请重新连接", network:"无法连接 Google Meet，请稍后重试",
 quota:"Google Meet 请求过多，请稍后再试", provider:"Google Meet 暂未提供完整记录，请稍后重试",
 busy:"会议记录正在更新，请稍后查看", invalid:"请求格式无效", forbidden:"没有权限执行此操作",
 unavailable:"会议记录暂时无法载入，请稍后重试", expired:"会议记录超过 Google 可读取期限，无法补取",
 oauth:"Google Meet 授权未完成，请重新连接", duplicate:"此 Google 会议账号已连接其他 Tickminder 账号，请联系管理员",
 api_disabled:"Google Meet API 尚未启用，请联系管理员完成配置",
};
export function meetMessage(code: string) { return messages[code] || messages.unavailable; }
export async function googleFetch(url: string, init: RequestInit = {}) {
  let response:Response;
  try {response=await fetch(url,{...init,redirect:"error",signal:AbortSignal.timeout(12_000)});}
  catch {throw new MeetError("network",503);}
  if(!response.ok){
    const status=response.status;
    if(status===401)throw new MeetError("reconnect",409);
    if(status===403){
      const body=await response.json().catch(()=>null) as {error?:{details?:Array<{reason?:string}>}}|null;
      const reasons=body?.error?.details?.map(d=>d.reason)||[];
      if(reasons.includes("SERVICE_DISABLED"))throw new MeetError("api_disabled",503);
      if(reasons.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT"))throw new MeetError("reconnect",409);
      if(reasons.some(r=>/QUOTA|RATE_LIMIT/.test(r||"")))throw new MeetError("quota",429);
      throw new MeetError("denied",403);
    }
    if(status===429)throw new MeetError("quota",429);
    throw new MeetError(status===400?"oauth":"provider",503);
  }
  try { return await response.json() as Record<string,unknown>; } catch {throw new MeetError("provider",503);}
}
function timestamp(value: unknown, nullable=false): string | null {
  if(nullable && (value===undefined || value===null))return null;
  if(typeof value!=="string" || !Number.isFinite(Date.parse(value)))throw new MeetError("provider",503);
  return new Date(value).toISOString();
}
// Bounded pagination: an incomplete response is an error, never a false absence.
export async function fetchMeetConferences(accessToken:string,code:string,from:string,until:string,knownUsers?:Set<string>) {
  let requests=0;const deadline=Date.now()+25_000;
  async function list(path:string,key:string,filter?:string):Promise<Record<string,unknown>[]>{
    const result:Record<string,unknown>[]=[];let token="";const seen=new Set<string>();
    do {
      if(++requests>40)throw new MeetError("quota",429);
      if(Date.now()>deadline)throw new MeetError("network",503);
      const url=new URL(`https://meet.googleapis.com/v2/${path}`);url.searchParams.set("pageSize","250");
      if(filter)url.searchParams.set("filter",filter);if(token)url.searchParams.set("pageToken",token);
      const data=await googleFetch(url.href,{headers:{Authorization:`Bearer ${accessToken}`}});
      if(data[key]!==undefined && !Array.isArray(data[key]))throw new MeetError("provider",503);
      for(const item of (data[key]||[]) as unknown[]){if(!item || typeof item!=="object" || Array.isArray(item))throw new MeetError("provider",503);result.push(item as Record<string,unknown>);}
      const next=data.nextPageToken||"";
      if(typeof next!=="string" || next.length>4096 || (next && seen.has(next)))throw new MeetError("provider",503);token=next;seen.add(token);
    }while(token);return result;
  }
  // A conference may start before the lesson, including on the previous day.
  const records=await list("conferenceRecords","conferenceRecords",`space.meeting_code = "${code}" AND start_time < "${until}" AND (end_time IS NULL OR end_time > "${from}")`);
  const conferences:MeetConference[]=[];
  for(const record of records){
    if(typeof record.name!=="string" || !/^conferenceRecords\/[\w-]+$/.test(record.name))throw new MeetError("provider",503);
    const participants:MeetParticipant[]=[];
    for(const p of await list(`${record.name}/participants`,"participants")){
      if(typeof p.name!=="string" || !new RegExp(`^${record.name}/participants/[\\w-]+$`).test(p.name))throw new MeetError("provider",503);
      const signed=p.signedinUser as {user?:unknown;displayName?:unknown}|undefined,anonymous=p.anonymousUser as {displayName?:unknown}|undefined,phone=p.phoneUser as {displayName?:unknown}|undefined;
      const googleUser=typeof signed?.user==="string" && /^users\/[\w-]+$/.test(signed.user)?signed.user:null;
      // Avoid retrieving unrelated students' sessions in a shared meeting. Exact
      // Google identifiers are required; display names/emails are never guessed.
      const sessionRows=!knownUsers || (googleUser && knownUsers.has(googleUser))?await list(`${p.name}/participantSessions`,"participantSessions"):[];
      const sessions:MeetSession[]=sessionRows.map(s=>{
        if(typeof s.name!=="string" || !new RegExp(`^${p.name}/participantSessions/[\\w-]+$`).test(s.name))throw new MeetError("provider",503);
        const startTime=timestamp(s.startTime)!,endTime=timestamp(s.endTime,true);
        if(endTime && Date.parse(endTime)<Date.parse(startTime))throw new MeetError("provider",503);
        return {name:s.name,startTime,endTime};
      });
      participants.push({name:p.name,displayName:String(signed?.displayName||anonymous?.displayName||phone?.displayName||"" ).slice(0,160),
        googleUser,active:p.latestEndTime===undefined || p.latestEndTime===null,sessions});
    }
    conferences.push({name:record.name,startTime:timestamp(record.startTime)!,endTime:timestamp(record.endTime,true),participants});
  }
  return conferences;
}
