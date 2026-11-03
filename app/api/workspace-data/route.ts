import {currentBusinessAccount} from '@/lib/auth';
import {workspaceData} from '@/lib/workspace-data-server';
import {CourseQueryError} from '@/lib/course-query';
import {adminPermissionFailure} from '@/lib/admin-permission-access';
import {reportUnexpectedError} from '@/lib/diagnostics-server';

const json = (value: unknown, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'private, no-store', Vary: 'Cookie, x-tickminder-group'}});
export async function GET(request: Request) {
  const actor = await currentBusinessAccount();
  if (!actor) return json({error: '请先登录'}, 401);
  try { return json(await workspaceData(actor, new URL(request.url).searchParams)); }
  catch (error) {
    const denied = adminPermissionFailure(error);
    if (denied || /workspace_actor_changed/.test(String(error))) return json({error: '账号或权限已改变，请刷新重试'}, 403);
    if (error instanceof CourseQueryError) return json({error: error.message}, error.status);
    reportUnexpectedError(error, {operation: 'workspace-data'});
    return json({error: '页面资料暂时无法加载，请重试'}, 503);
  }
}
