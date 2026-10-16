import { currentBusinessAccount } from "@/lib/auth";
import { adminPermissionsFailure, readAdminPermissions, saveAdminPermissionDraft,changeSavedAdminPermissionDraft } from "@/lib/admin-permissions-server";

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
    // Lifecycle actions never accept inline grants or enable deployment flags.
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 16_384) return json({error: "permissions.invalidFields"}, 400);
    let body: Record<string, unknown>;
    try { const value: unknown = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); body = value as Record<string, unknown>; }
    catch { return json({error: "permissions.invalidFields"}, 400); }
    const accountId = body.accountId ?? body.userId;
    const action=body.action===undefined?'saveDraft':body.action,saving=action==='saveDraft';
    if (!validId(accountId) || body.accountId !== undefined && body.userId !== undefined && body.accountId !== body.userId || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || Number(body.expectedRevision) >= Number.MAX_SAFE_INTEGER || typeof action!=='string' || !['saveDraft','applyDraft','discardDraft'].includes(action) || Object.keys(body).some(key => !(saving?["accountId","userId","expectedRevision","grants","action"]:["accountId","userId","expectedRevision","action"]).includes(key))) return json({error: "permissions.invalidFields"}, 400);
    return json(saving?await saveAdminPermissionDraft(actor,accountId,Number(body.expectedRevision),body.grants):await changeSavedAdminPermissionDraft(actor,accountId,Number(body.expectedRevision),action as 'applyDraft'|'discardDraft'));
  } catch (error) { const failure = adminPermissionsFailure(error); return json({error: failure.error}, failure.status); }
}
