// Provider-neutral calculations. Meeting evidence never writes attendance or fees.
export type MeetSession = { name: string; startTime: string; endTime: string | null };
export type MeetParticipant = { name: string; displayName: string; googleUser: string | null; active?: boolean; sessions: MeetSession[] };
export type MeetConference = { name: string; startTime: string; endTime: string | null; participants: MeetParticipant[] };
export type MeetEvidence = { conferences: MeetConference[]; observedAt: string; teacherUsers?: string[]; studentUsers?: string[] };
export function meetCode(link: unknown): string | null {
  if (typeof link !== "string") return null;
  try {
    const url = new URL(link);
    if (url.protocol !== "https:" || url.hostname !== "meet.google.com" || url.port || url.username || url.password) return null;
    return /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/.exec(url.pathname)?.[1] || null;
  } catch { return null; }
}
export type Interval = [number, number];
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter(([s,e]) => Number.isFinite(s) && Number.isFinite(e) && e > s).sort((a,b) => a[0]-b[0]);
  const result: Interval[] = [];
  for (const [s,e] of sorted) {
    const last = result.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(e,last[1]); else result.push([s,e]);
  }
  return result;
}
export function overlapSeconds(a: Interval[], b: Interval[]): number {
  let i=0,j=0,total=0;
  const left=mergeIntervals(a),right=mergeIntervals(b);
  while(i<left.length && j<right.length){total+=Math.max(0,Math.min(left[i][1],right[j][1])-Math.max(left[i][0],right[j][0]));if(left[i][1]<right[j][1])i++;else j++;}
  return Math.floor(total/1000);
}
export function participantIntervals(participants: MeetParticipant[], ids: Set<string>, start: number, end: number, observed: number): Interval[] {
  return mergeIntervals(participants.filter(p=>p.googleUser && ids.has(p.googleUser)).flatMap(p=>p.sessions.map(s=>[
    Math.max(start,Date.parse(s.startTime)),Math.min(end,observed,s.endTime ? Date.parse(s.endTime) : observed),
  ] as Interval)));
}
export function summarizeMeet(evidence: MeetEvidence, start: string, end: string, teacherIds: Set<string>, studentIds: Set<string>, now=Date.now()) {
  const from=Date.parse(start),until=Date.parse(end),observed=Date.parse(evidence.observedAt);
  const participants=evidence.conferences.flatMap(c=>c.participants);
  const teacher=participantIntervals(participants,teacherIds,from,until,observed),student=participantIntervals(participants,studentIds,from,until,observed);
  const relevant=evidence.conferences.filter(c=>Date.parse(c.startTime)<until && (!c.endTime || Date.parse(c.endTime)>from));
  const active=relevant.filter(c=>!c.endTime).flatMap(c=>c.participants).filter(p=>p.active || p.sessions.some(s=>!s.endTime)).map(p=>p.googleUser || p.name);
  return { status: relevant.some(c=>!c.endTime) ? (now-observed>120_000?"stale":"in_class") : relevant.length ? "ended" : "not_observed",
    observedAt:evidence.observedAt, activeCount:new Set(active).size,
    teacherSeconds:teacher.length ? Math.floor(teacher.reduce((n,[s,e])=>n+e-s,0)/1000) : null,
    studentSeconds:student.length ? Math.floor(student.reduce((n,[s,e])=>n+e-s,0)/1000) : null,
    commonSeconds:teacher.length && student.length ? overlapSeconds(teacher,student) : null,
    matchedTeacher:teacher.length>0,matchedStudent:student.length>0,
  };
}
