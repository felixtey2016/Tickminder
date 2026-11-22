'use client';

import {lazy, Suspense, useEffect, useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {readApiJson} from '@/lib/action-feedback';
import {groupFetch} from '@/lib/group-client';
import {t, type Language} from '@/lib/i18n';
import {useAdminAction} from './admin-permission-context';
import {newQuizDraft, importedQuizDraft} from './quiz-drafts';
import type {LocalQuiz} from './quiz-editor';

const Editor = lazy(() => import('./quiz-editor'));
const Preview = lazy(() => import('@/components/quiz-player'));
const Import = lazy(() => import('./quiz-import-dialog'));
const Compose = lazy(() => import('./quiz-compose-dialog'));

export default function TikQuizAuthorPage({section, id, bank, language, onClose, onSave, onEdit}: {
  section: 'new' | 'edit' | 'preview' | 'import' | 'compose';
  id?: string;
  bank: boolean;
  language: Language;
  onClose: () => void;
  onSave: () => void;
  onEdit: (id: string) => void;
}) {
  const can = useAdminAction();
  const permitImport = can('quizzes.import');
  const canEdit = can('quizzes.edit');
  const canShare = can('quizzes.share');
  const canDuplicate = can('quizzes.duplicate');
  const canCreate = can('quizzes.create');
  const preview = section === 'preview';
  const [draft, setDraft] = useState<LocalQuiz | null>(() => section === 'new' && canCreate ? newQuizDraft(language) : null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!id || (section !== 'edit' && !preview) || (!preview && !canEdit && !canShare && !canDuplicate)) return;
    const controller = new AbortController();
    const params = new URLSearchParams({id});
    if (bank) params.set('bank', '1');
    if (preview) params.set('preview', '1');
    setError('');
    void groupFetch('/api/quizzes?' + params, {signal: controller.signal}).then(async response => {
      const data = await readApiJson<LocalQuiz & {error?: string}>(response);
      if (!response.ok) throw Error(data.error || 'quiz.unavailable');
      if (!controller.signal.aborted) setDraft({...data, bank: false, maintenanceImport: Boolean(permitImport && data.sourceKey)});
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error && failure.message.startsWith('quiz.') ? failure.message : 'quiz.unavailable');
    });
    return () => controller.abort();
  }, [id, bank, section, preview, retry, permitImport, canEdit, canShare, canDuplicate]);

  const loading = <p className="tikquiz-loading" role="status">{t('quiz.loading')}</p>;
  const forbidden = (section === 'new' && !canCreate) ||
    (section === 'edit' && !canEdit && !canShare && !canDuplicate) ||
    (section === 'import' && !permitImport) ||
    (section === 'compose' && !canDuplicate);
  if (forbidden || error) return <section className="tikquiz-route-state">
    <Button variant="outline" onClick={onClose}><ArrowLeft size={17} aria-hidden="true"/>{t('quiz.back')}</Button>
    <p className="quiz-error" role="alert">{t(forbidden ? 'quiz.forbidden' : error)}</p>
    {!forbidden && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>{t('quiz.retry')}</Button>}
  </section>;

  return <Suspense fallback={loading}>
    {draft
      ? preview
        ? <Preview key={draft.id} content={draft.content} creator={draft.creator} onClose={onClose} presentation="page"/>
        : <Editor key={draft.id} initial={draft} onBack={onClose} onSaved={(saved, reason) => {
          if (reason === 'draft') onSave();
          else if (section !== 'edit') onEdit(saved.id);
        }}/>
      : section === 'import'
        ? <Import language={language} presentation="page" onClose={onClose} onImport={async file => { setDraft(await importedQuizDraft(file)); return true; }}/>
        : section === 'compose'
          ? <Compose onClose={onClose} onCreated={onEdit} presentation="page"/>
          : loading}
  </Suspense>;
}
