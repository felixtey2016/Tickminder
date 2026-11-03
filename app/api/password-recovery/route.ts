import { env, waitUntil } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { recoveryConfig, RecoveryError, requestPasswordRecovery, verifyPasswordRecovery, resetVerifiedPassword, resetRecoveredPassword } from "@/lib/password-recovery";

const noStore = { "Cache-Control": "no-store, max-age=0" };
const messages: Record<string, string> = {
  NOT_CONFIGURED: "邮箱找回暂未启用，请联系管理员重置密码。",
  RATE_LIMITED: "请求过于频繁，请稍后再试。",
  INVALID_CODE: "验证码无效或已过期，请重新获取。",
  INVALID_PASSWORD: "新密码需为 8–128 个字符。",
  PASSWORD_UNCHANGED: "新密码不能与当前密码相同。",
  INVALID_REQUEST: "请检查输入后重试。",
  SERVER_ERROR: "暂时无法处理请求，请稍后再试。",
};
function failure(error: RecoveryError) {
  return NextResponse.json({ error: messages[error.code] || messages.SERVER_ERROR, code: error.code, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) }, {
    status: error.status, headers: { ...noStore, ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) },
  });
}
export async function GET() {
  return NextResponse.json({ available: Boolean(recoveryConfig(env)) }, { headers: noStore });
}
export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin")) return failure(new RecoveryError("INVALID_REQUEST", 403));
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) return failure(new RecoveryError("INVALID_REQUEST"));
  try {
    // Bound streamed input as well as Content-Length; Workers can receive
    // chunked requests without a length header.
    const reader = request.body?.getReader();
    if (!reader) return failure(new RecoveryError("INVALID_REQUEST"));
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4096) { await reader.cancel(); return failure(new RecoveryError("INVALID_REQUEST")); } chunks.push(part.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body: Record<string, unknown>;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return failure(new RecoveryError("INVALID_REQUEST")); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure(new RecoveryError("INVALID_REQUEST"));
    const config = recoveryConfig(env);
    if (!config) return failure(new RecoveryError("NOT_CONFIGURED", 503));
    if (body.action === "request") {
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      return NextResponse.json(await requestPasswordRecovery(config, body.identifier, ip, body.language === "en" ? "en" : "zh", waitUntil), { headers: noStore });
    }
    if (body.action === "verify") {
      return NextResponse.json(await verifyPasswordRecovery(config, body.challenge, body.code), { headers: noStore });
    }
    if (body.action === "reset") {
      // Presence of a grant selects the new contract, even when malformed;
      // never fall back from an invalid grant to another credential in the body.
      const result = "resetToken" in body
        ? await resetVerifiedPassword(config, body.resetToken, body.newPassword)
        : await resetRecoveredPassword(config, body.challenge, body.code, body.newPassword);
      const response = NextResponse.json(result, { headers: noStore });
      response.cookies.set("tuition_session", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
      return response;
    }
    return failure(new RecoveryError("INVALID_REQUEST"));
  } catch (error) {
    if (error instanceof RecoveryError) return failure(error);
    // Never log input, challenge, code, password, recipient or provider response.
    console.error("Password recovery request failed");
    return failure(new RecoveryError("SERVER_ERROR", 503));
  }
}
