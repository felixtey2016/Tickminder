import { currentBusinessAccount } from '@/lib/auth';
import { homeSummary } from '@/lib/home-summary-server';
import { CourseQueryError } from '@/lib/course-query';
import { adminPermissionFailure } from '@/lib/admin-permission-access';

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, x-tickminder-group' } });
export async function GET(request?: Request) {
  const actor = await currentBusinessAccount();
  if (!actor) return json({ error: '请先登录' }, 401);
  const scopes=request?new URL(request.url).searchParams.getAll('scope'):[];
  if(scopes.length>1||(scopes.length&&!['home','navigation'].includes(scopes[0])))return json({error:'无效的主页请求'},400);
  try { return json(await (scopes[0]==='navigation'?homeSummary(actor,'navigation'):homeSummary(actor))); }
  catch (error) {
    const denied = adminPermissionFailure(error);
    return json({ error: denied?.error || (error instanceof CourseQueryError ? error.message : '主页暂时无法加载，请重试') }, denied?.status || (error instanceof CourseQueryError ? error.status : 503));
  }
}
