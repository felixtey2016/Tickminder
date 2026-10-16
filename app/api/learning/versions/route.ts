import {adminPermissionFailure} from "@/lib/admin-permission-access";
import { NextResponse } from "next/server";
import { currentBusinessAccount } from "@/lib/auth";
import { LearningEditError, editPublishedContent, versionHistory } from "@/lib/learning-versions";
import { translate } from "@/lib/i18n";

function failure(request:Request,error:unknown) {
  const denied=adminPermissionFailure(error);if(denied)return Response.json({error:translate(denied.error,new URL(request.url).searchParams.get("lang")==="en"?"en":"zh")},{status:denied.status,headers:{"cache-control":"private, no-store"}});
  const lang=new URL(request.url).searchParams.get("lang")==="en"?"en":"zh";
  return NextResponse.json({error:translate(error instanceof LearningEditError?error.message:"内容操作失败，请稍后重试",lang)}, {status:error instanceof LearningEditError?error.status:503,headers:{"cache-control":"private, no-store"}});
}
export async function GET(request:Request) {
  try {
    const actor=await currentBusinessAccount();if(!actor)throw new LearningEditError("请先登录",401);
    const url=new URL(request.url),kind=url.searchParams.get("kind"),id=url.searchParams.get("id") || "";
    if(!["material","homework"].includes(kind||"") || !id)throw new LearningEditError("请求格式无效");
    return NextResponse.json(await versionHistory(actor,kind as "material"|"homework",id),{headers:{"cache-control":"private, no-store"}});
  } catch(error){return failure(request,error);}
}
export async function POST(request:Request) {
  try {
    if(new URL(request.url).origin!==request.headers.get("origin"))throw new LearningEditError("Origin mismatch",403);
    const actor=await currentBusinessAccount();if(!actor)throw new LearningEditError("请先登录",401);
    const value:unknown=await request.json();if(!value || typeof value!=="object" || Array.isArray(value))throw new LearningEditError("请求格式无效");
    const data=value as Record<string,unknown>;if(!["material","homework"].includes(String(data.kind)))throw new LearningEditError("请求格式无效");
    return NextResponse.json(await editPublishedContent(actor,data.kind as "material"|"homework",data));
  } catch(error){return failure(request,error);}
}
