import {emptyQuiz, newQuestion} from '@/lib/quiz';
import type {Language} from '@/lib/i18n';
import type {LocalQuiz} from './quiz-editor';

export function newQuizDraft(language: Language): LocalQuiz {
  const next = newQuestion('mcq', 'multilingual');
  const content = emptyQuiz();
  content.primaryLanguage = language;
  content.questions = [next.question];
  return {id: crypto.randomUUID(), revision: 0, visibility: 'private', sharedRevision: null, canEdit: true, content, keys: [next.key]};
}

export async function importedQuizDraft(file: File): Promise<LocalQuiz> {
  if (file.size > 20 * 1024 * 1024) throw new Error('ZIP maximum: 20 MB');
  const {importQuizZip} = await import('@/lib/quiz-import');
  const result = await importQuizZip(new Uint8Array(await file.arrayBuffer()), file.name);
  return {
    id: crypto.randomUUID(), revision: 0, visibility: 'private', sharedRevision: null,
    canEdit: true, maintenanceImport: true, content: result.content, keys: result.keys,
    sourceKey: result.sourceKey, pendingImages: result.images, importWarnings: result.warnings,
  };
}
