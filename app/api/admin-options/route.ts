import { currentBusinessAccount } from "@/lib/auth";
import { adminPermissionContext, adminPermissionFailure } from "@/lib/admin-permission-access";
import { adminCoreOptions } from "@/lib/admin-permission-state";
export async function GET(request:Request) {
  const actor=await currentBusinessAccount();
  const headers={"Cache-Control":"private, no-store"};
  if(!actor)return Response.json({error:"登录已过期，请重新登录"},{status:401,headers});
  if(actor.role!=="admin")return Response.json({error:"没有权限执行此操作"},{status:403,headers});
  const purpose=new URL(request.url).searchParams.get("purpose");
  if(purpose&&!['lesson','plan','classroom','quizAssignment','account','promotion','learning'].includes(purpose))return Response.json({error:"请求格式无效"},{status:400,headers});
  try {
    const access=await adminPermissionContext(actor),options=await adminCoreOptions(actor,access);
    return Response.json(options,{headers});
  } catch(error) {const failure=adminPermissionFailure(error);return Response.json({error:failure?.error||"资料暂时无法载入，请稍后刷新"},{status:failure?.status||503,headers});}
}
