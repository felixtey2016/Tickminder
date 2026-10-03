import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { hashToken } from "@/lib/auth";
import { learningDb } from "@/lib/learning-server";
import { cleanupPendingAccounts } from "@/lib/pending-cleanup";

export async function POST(request:Request) {
  if (!env.PENDING_CLEANUP_TOKEN) return NextResponse.json({error:"自动清理尚未配置"},{status:503});
  const provided = request.headers.get("authorization")?.replace(/^Bearer /,"") || "";
  if (provided.length > 256 || await hashToken(provided) !== await hashToken(env.PENDING_CLEANUP_TOKEN)) return NextResponse.json({error:"没有权限执行此操作"},{status:403});
  try {
    return NextResponse.json({ok:true,...await cleanupPendingAccounts(learningDb())});
  } catch {
    return NextResponse.json({error:"清理未完成，请稍后重试"},{status:503});
  }
}
