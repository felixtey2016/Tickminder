import { currentBusinessAccount } from "@/lib/auth";
import { isOwnerAccount, OWNER_EMAIL } from "@/lib/owner";
import { learningDb } from "@/lib/learning-server";
import { readAcademicCatalogue } from "@/lib/academic-catalogue-server";
import { CatalogueValidationError, isCatalogueScope, validateCatalogueSyllabuses } from "@/lib/academic-catalogue";

const json = (value: unknown, status = 200) => Response.json(value, {status, headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});

// The shared menus are the same for every authenticated role and group. New
// account roles do not need a separate catalogue endpoint or hardcoded list.
export async function GET(request: Request) {
  const actor = await currentBusinessAccount();
  if (!actor) return json({error:"请先登录并完成账号设置"}, 401);
  const scope = new URL(request.url).searchParams.get("scope");
  if (!isCatalogueScope(scope)) return json({error:"课程菜单类别无效"}, 400);
  try { return json({...await readAcademicCatalogue(scope), canManage:isOwnerAccount(actor)}); }
  catch { return json({error:"课程菜单暂时不可用，请重试"}, 503); }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({error:"没有权限执行此操作"}, 403);
  const actor = await currentBusinessAccount();
  if (!actor || !isOwnerAccount(actor)) return json({error:"只有平台最高管理员可以管理全站菜单"}, 403);
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 512 * 1024) return json({error:"菜单内容过大"}, 413);
    let input: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      input = parsed as Record<string, unknown>;
    } catch { return json({error:"菜单格式无效"}, 400); }
    if (!isCatalogueScope(input.scope) || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) return json({error:"菜单类别或版本无效"}, 400);
    const previous = await readAcademicCatalogue(input.scope);
    if (previous.revision !== input.expectedRevision) return json({error:"菜单已更新，请刷新后再保存"}, 409);
    const syllabuses = validateCatalogueSyllabuses(input.syllabuses, previous.syllabuses), now = new Date().toISOString();
    const next = JSON.stringify({syllabuses});
    if (JSON.stringify(previous.syllabuses) === JSON.stringify(syllabuses)) return json({...previous, canManage:true});
    const db = learningDb();
    const result = await db.batch([
      db.prepare(`UPDATE academic_catalogues SET content_json=?,revision=revision+1,updated_at=?,updated_by=?
        WHERE scope=? AND revision=? AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=? AND a.role='admin'
          AND a.disabled_at IS NULL AND substr(a.id,1,6)<>'local:' AND lower(trim(a.email))=?)`)
        .bind(next,now,actor.id,input.scope,input.expectedRevision,actor.id,OWNER_EMAIL),
      db.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,'catalogue.update',?,?,? WHERE changes()=1")
        .bind(actor.groupId,crypto.randomUUID(),`catalogue:${input.scope}`,actor.id,JSON.stringify({scope:input.scope,revision:previous.revision,syllabuses:previous.syllabuses}),JSON.stringify({scope:input.scope,revision:previous.revision+1,syllabuses}),now),
    ]);
    if (!result[0].meta.changes) return json({error:"菜单已更新或权限已变更，请刷新后再试"}, 409);
    return json({scope:input.scope,revision:previous.revision+1,syllabuses,canManage:true});
  } catch (error) {
    return error instanceof CatalogueValidationError ? json({error:error.message}, 400) : json({error:"菜单未能保存，请刷新检查后再试"}, 503);
  }
}
