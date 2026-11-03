export const CLASSROOM_TASK_TITLE_MAX = 120;
export const CLASSROOM_TASK_DESCRIPTION_MAX = 2000;
export const CLASSROOM_TASK_PAGE_SIZE = 50;
export const CLASSROOM_TASK_REASON_MAX = 1000;
export type ClassroomTaskStatus = 'pending' | 'awaiting_review' | 'needs_redo' | 'completed' | 'legacy_completed';
export type ClassroomTaskHistory = {eventId:string;action:'submit'|'approve'|'return'|'complete';at:string;actorName:string;reason:string};
export type ClassroomTaskStudent = {
  studentName:string;status:ClassroomTaskStatus;stateVersion:string|null;completedAt:string|null;
  submittedAt:string|null;reviewedAt:string|null;reason:string;history:ClassroomTaskHistory[];
};

export type ClassroomTaskProgress = {
  completed: number;
  awaitingReview: number;
  needsRedo: number;
  legacyCompleted: number;
  total: number;
  students: ClassroomTaskStudent[];
};

export type ClassroomTask = {
  id: string;
  title: string;
  description: string;
  revision: 1;
  archived: boolean;
  createdAt: string;
  completedAt?: string | null;
  studentState?: ClassroomTaskStudent;
  progress?: ClassroomTaskProgress;
};

export type ClassroomTasksState = {
  classroomId: string;
  readOnly: boolean;
  canCreate: boolean;
  canArchive: boolean;
  canComplete: boolean;
  canReview: boolean;
  tasks: ClassroomTask[];
  nextCursor: string | null;
};

export type ClassroomTaskMutationResult = {ok: true; id: string; replayed?: boolean};
export type ClassroomTaskInboxItem = {taskId:string;classroomId:string;classroomTitle:string;title:string;status:ClassroomTaskStatus;awaitingReview:number;at:string};
export type ClassroomTaskInbox = {items:ClassroomTaskInboxItem[];nextCursor:string|null};

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
