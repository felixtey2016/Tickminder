import {quizLinkIdFromPath, validQuizLinkId} from './quiz-link';

const sections = ['bank', 'mine', 'assigned', 'history', 'manage', 'moderation', 'new', 'import', 'compose'] as const;
const details = ['assigned', 'edit', 'preview', 'play', 'results'] as const;
type Section = typeof sections[number];
type Detail = typeof details[number];

export type TikQuizRoute =
  | {section: 'home' | Section; id?: undefined}
  | {section: Detail | 'shared'; id: string};

export function tikQuizRoute(pathname: string): TikQuizRoute | null {
  const path = pathname.replace(/\/$/, '');
  if (!path.startsWith('/') || path.endsWith('/')) return null;
  const shared = quizLinkIdFromPath(path);
  if (shared) return {section: 'shared', id: shared};
  if (path === '/quizzes') return {section: 'home'};
  const [, base, section, id, ...rest] = path.split('/');
  if (base !== 'quizzes' || rest.length) return null;
  if (!id && sections.some(value => value === section)) return {section: section as Section};
  if (validQuizLinkId(id) && details.some(value => value === section)) return {section: section as Detail, id};
  return null;
}

export function tikQuizPath(section: Section | 'home'): string;
export function tikQuizPath(section: Detail, id: string): string;
export function tikQuizPath(section: Section | Detail | 'home', id?: string): string {
  if (section === 'home') return '/quizzes';
  return '/quizzes/' + section + (id ? '/' + encodeURIComponent(id) : '');
}
