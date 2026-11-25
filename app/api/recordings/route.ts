import { isLegacyBusinessRole } from '@/lib/legacy-business-access';
import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {adminPermissionFailure} from '@/lib/admin-permission-access';
import {RecordingError,recordingText} from '@/lib/recordings';
import {listRecordings,recordingContext,recordingDetail,saveRecording} from '@/lib/recordings-server';
function failed(error:unknown){const permission=adminPermissionFailure(error);return NextResponse.json(permission?{error:permission.error}:{error:error instanceof RecordingError?error.message:'暂时无法处理课堂录影，请刷新后重试'},{status:permission?.status||(error instanceof RecordingError?error.status:503)});}
export async function GET(request:Request){
 const actor=await currentBusinessAccount();if(!actor)return NextResponse.json({error:'请先登录'},{status:401});
 if(!isLegacyBusinessRole(actor.role))return NextResponse.json({error:'没有课堂录影操作权限'},{status:403,headers:{'cache-control':'private, no-store'}});
 try{const params=new URL(request.url).searchParams,id=recordingText(params.get('id'));return NextResponse.json(id?await recordingDetail(actor,id):params.get('view')==='context'?await recordingContext(actor,params):await listRecordings(actor,params),{headers:{'cache-control':'private, no-store'}});}catch(error){return failed(error);}
}
export async function POST(request:Request){
 if(new URL(request.url).origin!==request.headers.get('origin'))return NextResponse.json({error:'Origin mismatch'},{status:403});
 const actor=await currentBusinessAccount();if(!actor)return NextResponse.json({error:'请先登录'},{status:401});
 if(!isLegacyBusinessRole(actor.role))return NextResponse.json({error:'没有课堂录影操作权限'},{status:403,headers:{'cache-control':'private, no-store'}});
 try{if(Number(request.headers.get('content-length'))>65536)throw new RecordingError('录影资料过长',413);let data:unknown;try{const raw=await request.text();if(raw.length>65536)throw new RecordingError('录影资料过长',413);data=JSON.parse(raw);}catch(error){throw error instanceof RecordingError?error:new RecordingError('请求格式无效');}if(!data||typeof data!=='object'||Array.isArray(data))throw new RecordingError('请求格式无效');return NextResponse.json(await saveRecording(actor,data as Record<string,unknown>));}catch(error){return failed(error);}
}
