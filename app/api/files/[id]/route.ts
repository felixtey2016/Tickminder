import { NextResponse } from "next/server";
import { currentBusinessAccount as currentAccount } from "@/lib/auth";
import { first, pdfMayRead } from "@/lib/learning-server";
import { pdfBucket } from "@/lib/pdf-storage";
import { translate } from "@/lib/i18n";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const language = url.searchParams.get("lang") === "en" ? "en" : "zh";
  const failure = (message: string, status: number) => NextResponse.json(
    { error: translate(message, language) },
    { status, headers: { "Cache-Control": "private, no-store", "Content-Language": language } },
  );
  const actor = await currentAccount();
  if (!actor) return failure("请先登录", 401);
  if (await first("SELECT 1 AS mustChange FROM local_credentials WHERE account_id = ? AND must_change_password = 1", actor.id)) return failure("请先修改初始密码", 403);
  const { id } = await context.params;
  try {
    const file = await pdfMayRead(actor, id);
    if (!file) return failure("文件不存在或无权访问", 404);
    const object = await pdfBucket().get(file.objectKey);
    if (!object) return failure("PDF 文件暂时不可用", 503);
    const download = url.searchParams.get("download") === "1";
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
  } catch {
    return failure("PDF 暂时不可用", 503);
  }
}
