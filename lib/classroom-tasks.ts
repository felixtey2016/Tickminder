export const CLASSROOM_TASK_TITLE_MAX = 120;
export const CLASSROOM_TASK_DESCRIPTION_MAX = 2000;
export const CLASSROOM_TASK_PAGE_SIZE = 50;

export type ClassroomTaskProgress = {
  completed: number;
  total: number;
  students: Array<{studentName: string; completedAt: string | null}>;
};

export type ClassroomTask = {
  id: string;
  title: string;
  description: string;
  revision: 1;
  archived: boolean;
  createdAt: string;
  completedAt?: string | null;
  progress?: ClassroomTaskProgress;
};

export type ClassroomTasksState = {
  classroomId: string;
  readOnly: boolean;
  canCreate: boolean;
  canArchive: boolean;
  canComplete: boolean;
  tasks: ClassroomTask[];
  nextCursor: string | null;
};

export type ClassroomTaskMutationResult = {ok: true; id: string; replayed?: boolean};

export class ClassroomTaskError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function classroomTaskId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(value)) {
    throw new ClassroomTaskError('任务或班级编号无效');
  }
  return value;
}

export function classroomTaskFields(data: Record<string, unknown>): {title: string; description: string} {
  if (typeof data.title !== 'string' || data.description !== undefined && typeof data.description !== 'string') {
    throw new ClassroomTaskError('请填写任务标题和有效的任务说明');
  }
  const title = data.title.trim(), description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!title || title.length > CLASSROOM_TASK_TITLE_MAX) throw new ClassroomTaskError('任务标题须为 1 至 120 个字符');
  if (description.length > CLASSROOM_TASK_DESCRIPTION_MAX) throw new ClassroomTaskError('任务说明不能超过 2000 个字符');
  return {title, description};
}
