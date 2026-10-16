import { currentBusinessAccount } from "@/lib/auth";
import { adminPermissionsFailure, readAdminPermissions, saveAdminPermissionDraft } from "@/lib/admin-permissions-server";

const json = (value: unknown, status = 200) => Response.json(value, {status, headers: {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}});
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\p{Cc}\p{Cf}]/u.test(value);

export async function GET(request: Request) {
  try {
    const actor = await currentBusinessAccount();
    if (!actor) return json({error: "permissions.signInRequired"}, 401);
    const params = new URL(request.url).searchParams, accountId = params.get("accountId") ?? params.get("userId");
    if (!validId(accountId)) return json({error: "permissions.invalidFields"}, 400);
    return json(await readAdminPermissions(actor, accountId));
  } catch (error) { const failure = adminPermissionsFailure(error); return json({error: failure.error}, failure.status); }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({error: "permissions.invalidOrigin"}, 403);
  try {
    const actor = await currentBusinessAccount();
    if (!actor) return json({error: "permissions.signInRequired"}, 401);
    // Keep this endpoint a bounded draft editor; it cannot activate a profile.
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 16_384) return json({error: "permissions.invalidFields"}, 400);
    let body: Record<string, unknown>;
    try { const value: unknown = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); body = value as Record<string, unknown>; }
    catch { return json({error: "permissions.invalidFields"}, 400); }
    const accountId = body.accountId ?? body.userId;
    if (!validId(accountId) || body.accountId !== undefined && body.userId !== undefined && body.accountId !== body.userId || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || Number(body.expectedRevision) >= Number.MAX_SAFE_INTEGER || body.action !== undefined && body.action !== "saveDraft" || Object.keys(body).some(key => !["accountId", "userId", "expectedRevision", "grants", "action"].includes(key))) return json({error: "permissions.invalidFields"}, 400);
    return json(await saveAdminPermissionDraft(actor, accountId, Number(body.expectedRevision), body.grants));
  } catch (error) { const failure = adminPermissionsFailure(error); return json({error: failure.error}, failure.status); }
}
