'use client';

import {lazy, Suspense, useEffect} from 'react';
import {t} from '@/lib/i18n';
import {PageState} from '@/components/page-state';
import {useWorkspaceData} from '@/lib/use-workspace-data';
import type {WorkspaceReadIdentity} from '@/lib/workspace-page-data';
import type {WorkspaceDataMap} from '@/lib/workspace-data-types';
import type {Homework, LearningMutate, LearningState} from './learning-portal';

const AdminLearning = lazy(() => import('./admin-learning').then(module => ({default: module.AdminLearning})));
const TeacherLearning = lazy(() => import('./learning-portal').then(module => ({default: module.TeacherLearning})));
const StudentLearning = lazy(() => import('./learning-portal').then(module => ({default: module.StudentLearning})));

/** Only a local adapter for one visible consumer; never marks a global scope loaded. */
export function scopedLearningState(value: WorkspaceDataMap['materials'] | WorkspaceDataMap['homework'] | null): LearningState {
  return {materials: [], homework: [], submissions: [], studyBlocks: [], eligible: [], ...value};
}
export function ScopedLearningWorkspace({role, view, account, identityKey, mutate, busy, onPlan, onCalendar, onHomeworkSubjects}: {
  role: 'admin' | 'teacher' | 'student'; view: 'materials' | 'homework'; account: WorkspaceReadIdentity; identityKey?: string;
  mutate: LearningMutate; busy: boolean; onPlan?: (homework: Homework) => void; onCalendar?: () => void; onHomeworkSubjects?: (subjects: string[]) => void;
}) {
  const query = useWorkspaceData(view, account), learning = scopedLearningState(query.data);
  useEffect(()=>{if(view==='homework'&&query.data&&'homework' in query.data)onHomeworkSubjects?.([...new Set(query.data.homework.map(item=>item.subject))]);},[view,query.data,onHomeworkSubjects]);
  if (!query.data) return <PageState kind={query.error ? 'error' : 'loading'} title={query.error ? '页面加载失败' : '正在加载…'} description={query.error} action={query.error ? '重试' : undefined} onAction={query.reload}/>;
  return <>{query.loading&&<p role="status" className="muted">{t('正在加载…')}</p>}{query.error && <PageState kind="error" title="页面加载失败" description={query.error} action="重试" onAction={query.reload}/>}<Suspense fallback={<PageState kind="loading" title="正在加载…"/>}>
    {role === 'admin' ? <AdminLearning key={identityKey} learning={learning} view={view} onChanged={query.reload}/>
      : role === 'teacher' ? <TeacherLearning key={identityKey} learning={learning} view={view} mutate={mutate} busy={busy} onChanged={query.reload}/>
        : <StudentLearning key={identityKey} learning={learning} view={view} mutate={mutate} busy={busy} onPlan={onPlan || (() => onCalendar?.())} onCalendar={onCalendar}/>}
  </Suspense></>;
}
