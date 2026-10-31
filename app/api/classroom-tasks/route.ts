import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {ClassroomTaskError} from '@/lib/classroom-tasks';
import {mutateClassroomTask, readClassroomTasks} from '@/lib/classroom-tasks-server';

const headers = {'cache-control': 'private, no-store'};
const response = (body: unknown, status = 200) => NextResponse.json(body, {status, headers});
function failed(error: unknown) {
  return response({error: error instanceof ClassroomTaskError ? error.message : '暂时无法处理班级任务，请刷新后重试'}, error instanceof ClassroomTaskError ? error.status : 503);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const limit = 16384, length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new ClassroomTaskError('任务资料过长', 413);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ClassroomTaskError('请求格式无效');
  const reader = request.body?.getReader();
  if (!reader) throw new ClassroomTaskError('请求格式无效');
  try {
    const decoder = new TextDecoder('utf-8', {fatal: true});
    let bytes = 0, text = '';
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new ClassroomTaskError('任务资料过长', 413); }
      text += decoder.decode(chunk.value, {stream: true});
    }
    const data: unknown = JSON.parse(text + decoder.decode());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ClassroomTaskError('请求格式无效');
    return data as Record<string, unknown>;
  } catch (error) { throw error instanceof ClassroomTaskError ? error : new ClassroomTaskError('请求格式无效'); }
  finally { reader.releaseLock(); }
}

export async function GET(request: Request) {
  const actor = await currentBusinessAccount();
  if (!actor) return response({error: '请先登录'}, 401);
  try { return response(await readClassroomTasks(actor, new URL(request.url).searchParams)); }
  catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get('origin')) return response({error: '请求来源不符'}, 403);
  const actor = await currentBusinessAccount();
  if (!actor) return response({error: '请先登录'}, 401);
  try { return response(await mutateClassroomTask(actor, await readBody(request))); }
  catch (error) { return failed(error); }
}
