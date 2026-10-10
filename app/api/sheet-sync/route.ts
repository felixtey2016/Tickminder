import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { lessons, plans } from "@/db/schema";
import { currentBusinessAccount as currentAccount } from "@/lib/auth";
import { monthlySheetPairs, serializeSheetPayload, type SyncMode } from "@/lib/sheet-sync";

type BridgeResponse = {
  ok: boolean;
  error?: string;
  month?: string;
  displayMonth?: string;
  previewToken?: string;
  changes?: Array<{ row: number; student: string; subject: string; before: number | string; after: number }>;
  skipped?: Array<{ student: string; subject: string; reason: string }>;
  written?: number;
};

async function bridge(payload: Record<string, unknown>): Promise<BridgeResponse> {
  const url = env.SHEET_SYNC_URL;
  const secret = env.SHEET_SYNC_SECRET;
  if (!url || !secret) throw new Error("尚未配置 Google Sheet 课时导入。");
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) throw new Error("Google Sheet 接口网址无效。");
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const body = serializeSheetPayload(payload);
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, bytes.encode(`${timestamp}.${nonce}.${body}`));
  const signature = [...new Uint8Array(signed)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ timestamp, nonce, body, signature }),
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Google Sheet 连接失败（${response.status}）。`);
  const content = await response.text();
  let result: BridgeResponse;
  try {
    result = JSON.parse(content) as BridgeResponse;
  } catch {
    if (/Script function not found:\s*doPost/i.test(content)) {
      throw new Error("Google Apps Script 的当前部署版本没有 doPost。请保存配套脚本，并在「管理部署」中选择新版本后更新。");
    }
    throw new Error("Google Apps Script 返回网页而不是数据。请检查网络应用的访问权限和部署版本。");
  }
  if (!result.ok) throw new Error(result.error || "Google Sheet 导入失败。");
  return result;
}

export async function POST(request: Request) {
  const actor = await currentAccount();
  if (!actor) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  if (actor.role !== "admin") return NextResponse.json({ error: "只有管理员可以导入课时。" }, { status: 403 });
  try {
    const input = await request.json() as { action?: string; mode?: string; month?: string; previewToken?: string };
    if (!['preview', 'commit'].includes(input.action || '') || !['billable', 'all_completed'].includes(input.mode || '')) {
      return NextResponse.json({ error: "导入请求无效。" }, { status: 400 });
    }
    const mode = input.mode as SyncMode;
    const selected = await bridge({ action: "month" });
    if (!selected.month || !selected.displayMonth) throw new Error("无法读取表格当前月份。");
    if (input.action === "commit" && (input.month !== selected.month || !input.previewToken)) {
      return NextResponse.json({ error: "表格月份已变化，请重新预览。" }, { status: 409 });
    }
    const db = getDb();
    const [planRows, lessonRows] = await Promise.all([db.select().from(plans).all(), db.select().from(lessons).all()]);
    const pairs = monthlySheetPairs(planRows, lessonRows, selected.month, mode);
    const result = await bridge({ action: input.action, month: selected.month, mode, pairs, previewToken: input.previewToken });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheet 导入失败。";
    const status = /月份已变化|重新预览|Month changed|Preview again|data changed/.test(message) ? 409 : /尚未配置|not configured/.test(message) ? 503 : 502;
    return NextResponse.json({ error: status === 409 ? "表格月份或数据已变化，请重新预览。" : status === 503 ? "Google Sheet 导入尚未配置，请联系管理员。" : "Google Sheet 导入结果未确认，请先检查表格，再重新预览。" }, { status });
  }
}
