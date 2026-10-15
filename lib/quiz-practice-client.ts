import {groupFetch} from '@/lib/group-client';
import {readApiJson} from '@/lib/action-feedback';
export async function practiceApi<T>(params:string|Record<string,string>={},body?:Record<string,unknown>):Promise<T>{
 const suffix=typeof params==='string'?params:new URLSearchParams(params).toString();
 const response=await groupFetch('/api/quiz-practice'+(suffix?'?'+suffix:''),body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);
 const data=await readApiJson<T&{error?:string}>(response);if(!response.ok)throw new Error(data.error||'quiz.practiceUnavailable');return data;
}
export function practiceError(error:unknown){return error instanceof Error&&error.message.startsWith('quiz.')?error.message:error instanceof TypeError?'quiz.network':'quiz.practiceUnavailable';}
