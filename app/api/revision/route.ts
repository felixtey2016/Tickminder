import { isLegacyBusinessRole } from '@/lib/legacy-business-access';
import { NextResponse } from "next/server";
import { currentBusinessAccount as currentAccount } from "@/lib/auth";
import { readRevision } from "@/lib/revision";
import { adminPermissionContext } from "@/lib/admin-permission-access";

export async function GET() {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!isLegacyBusinessRole(account.role)) return NextResponse.json({error:"没有权限执行此操作"},{status:403,headers:{"Cache-Control":"no-store"}});
  return NextResponse.json({ revision: await readRevision(account.groupId), accountId: account.id,groupId:account.groupId,...(account.role==="admin"?{adminPermissions:await adminPermissionContext(account)}:{}) }, { headers: { "Cache-Control": "no-store" } });
}
