import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/auth";
import { readRevision } from "@/lib/revision";

export async function GET() {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ revision: await readRevision(), accountId: account.id }, { headers: { "Cache-Control": "no-store" } });
}
