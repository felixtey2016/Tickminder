export function quizDurationSeconds(startedAt: string, endedAt: string | number): number | null {
  const start = Date.parse(startedAt);
  const end = typeof endedAt === 'number' ? endedAt : Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function formatQuizDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const rest = seconds % 60;
  return (hours ? hours + ':' : '') + String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
}
