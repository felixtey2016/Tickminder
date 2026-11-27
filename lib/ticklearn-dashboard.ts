import {learningDb} from './learning-server';
import {malaysiaDayStart,tickLearnFreeDailyLimit,tickLearnFreeQuizLimit,tickLearnFreeUnlimited} from './ticklearn-free';
import {quizActor,readQuiz} from './quiz-server';
import {QuizError} from './quiz';
import {validQuizLinkId} from './quiz-link';

type RecentPractice = {
  id: string;
  quizId: string;
  title: string;
  status: 'in_progress' | 'submitted';
  score: number | null;
  canRetry: boolean;
};

export type TickLearnDashboardData = {
  plan: {unlimited:true} | {unlimited?:false; daily:number; remaining:number; quizzes:number} | null;
  completed: number;
  accuracy: number | null;
  streak: number;
  recent: RecentPractice | null;
  spm: {days: number; inProgress: boolean} | null;
};

const dayMs = 86_400_000;
const mytOffset = 28_800_000;

export function spmPeriod(at: number) {
  const today = Date.parse(malaysiaDayStart(at));
  const start = Date.parse('2026-11-23T00:00:00+08:00');
  const end = Date.parse('2026-12-17T00:00:00+08:00');
  if (today > end) return null;
  return {days: Math.max(0, (start - today) / dayMs), inProgress: today >= start};
}

export async function readTickLearnDashboard(at = Date.now()): Promise<TickLearnDashboardData> {
  const actor = await quizActor(true);
  const db = learningDb();
  const scope = 'group_id=? AND account_id=? AND assignment_id IS NULL';
  const group = actor.groupId;
  const today = malaysiaDayStart(at);
  const iso = new Date(at).toISOString();
  const scopeArgs = [group, actor.id];
  const [counts, days, latest] = await Promise.all([
    db.prepare(practiceCounts(scope)).bind(...scopeArgs,today)
      .first<{used:number;completed:number;correct:number|null;graded:number|null}>(),
    db.prepare('SELECT DISTINCT date(submitted_at,\'+8 hours\') AS day FROM quiz_practice_attempts WHERE ' + scope +
      " AND status='submitted' AND discarded_at IS NULL AND submitted_at<=? ORDER BY day DESC")
      .bind(...scopeArgs,iso).all<{day:string}>(),
    db.prepare('SELECT p.id,p.quiz_id AS quizId,p.status,p.score,p.total_score AS total,p.pending_manual AS pending,' +
      "json_extract(v.content_json,'$.title') AS title FROM quiz_practice_attempts p JOIN quiz_versions v ON v.id=p.version_id" +
      " WHERE p.group_id=? AND p.account_id=? AND p.assignment_id IS NULL AND p.discarded_at IS NULL" +
      " AND (p.status='submitted' OR p.deadline_at IS NULL OR p.deadline_at>?)" +
      " ORDER BY p.updated_at DESC,p.id DESC LIMIT 1").bind(...scopeArgs,iso)
      .first<Omit<RecentPractice,'canRetry'> & {total:number;pending:number}>(),
  ]);

  let cursor = Date.parse(today);
  const localDate = (time: number) => new Date(time + mytOffset).toISOString().slice(0,10);
  if (days.results[0]?.day !== localDate(cursor)) cursor -= dayMs;
  let streak = 0;
  for (const {day} of days.results) {
    if (day !== localDate(cursor)) break;
    streak++;
    cursor -= dayMs;
  }

  let recent: RecentPractice | null = null;
  if (latest && validQuizLinkId(latest.id) && validQuizLinkId(latest.quizId)) {
    let canRetry = false;
    if (latest.status === 'submitted') {
      try { await readQuiz(actor,latest.quizId,true); canRetry = true; }
      catch (error) { if (!(error instanceof QuizError) || error.status !== 404) throw error; }
    }
    recent = {
      id: latest.id,
      quizId: latest.quizId,
      title: latest.title,
      status: latest.status,
      score: latest.status === 'submitted' && latest.score !== null && latest.total > 0 && !latest.pending
        ? Math.round(100 * latest.score / latest.total) : null,
      canRetry,
    };
  }
  const daily = tickLearnFreeDailyLimit();
  return {
    plan: actor.role === 'learner'
      ? tickLearnFreeUnlimited() ? {unlimited:true}
        : {daily,remaining:Math.max(0,daily-(counts?.used ?? 0)),quizzes:tickLearnFreeQuizLimit()}
      : null,
    completed: counts?.completed ?? 0,
    accuracy: counts?.graded ? Math.round(100 * (counts.correct ?? 0) / counts.graded) : null,
    streak,
    recent,
    spm: spmPeriod(at),
  };
}

function practiceCounts(scope: string) {
  return 'WITH own AS (SELECT started_at,status,discarded_at,results_json FROM quiz_practice_attempts WHERE ' +
    scope + "), completed AS (SELECT results_json FROM own WHERE status='submitted' AND discarded_at IS NULL)" +
    ' SELECT (SELECT count(*) FROM own WHERE started_at>=?) AS used,' +
    ' (SELECT count(*) FROM completed) AS completed,' +
    " sum(json_extract(r.value,'$.status')='correct') AS correct, count(r.value) AS graded" +
    " FROM completed c, json_each(CASE WHEN json_valid(c.results_json) THEN c.results_json ELSE '[]' END) r" +
    " WHERE json_extract(r.value,'$.status') IN ('correct','incorrect')";
}
