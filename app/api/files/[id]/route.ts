import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/auth";
import { first, pdfMayRead } from "@/lib/learning-server";
import { pdfBucket } from "@/lib/pdf-storage";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await currentAccount();
  if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (await first("SELECT 1 AS mustChange FROM local_credentials WHERE account_id = ? AND must_change_password = 1", actor.id)) return NextResponse.json({ error: "请先修改初始密码" }, { status: 403 });
  const { id } = await context.params;
  try {
    const file = await pdfMayRead(actor, id);
    if (!file) return NextResponse.json({ error: "文件不存在或无权访问" }, { status: 404 });
    const object = await pdfBucket().get(file.objectKey);
    if (!object) return NextResponse.json({ error: "PDF 文件暂时不可用" }, { status: 503 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(object.body, { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="document.pdf"`,
      "Content-Length": String(file.bytes),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF 暂时不可用" }, { status: 503 });
  }
}
