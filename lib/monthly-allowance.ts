/** Pure allowance accounting. No money is inferred from a monthly price. */
export type AllowanceLesson={id:string;plannedStart:string;status:string;sessionStatus?:string|null;teachingStatus?:string|null;replacementFor:string|null};
export type MonthlyAllowance={includedSessions:number;scheduledSessions:number;extraSessions:number;lessonIds:string[];rateVersionIds:string[];reviewRequired:boolean;reviewReasons:string[]};
const localMonth=(value:string)=>new Date(Date.parse(value)+8*3600000).toISOString().slice(0,7);
export function monthlyAllowance(month:string,includedSessions:number,rows:AllowanceLesson[],rateVersionIds:string[],partial=false):MonthlyAllowance{
 const byId=new Map(rows.map(row=>[row.id,row])),slots=new Set<string>(),lessonIds=new Set<string>(),reasons=new Set<string>();
 if(partial||new Set(rateVersionIds).size!==1)reasons.add('monthly_allowance_period_review');
 for(const row of rows){
  if(localMonth(row.plannedStart)!==month||row.status==='cancelled'||row.sessionStatus==='cancelled'||row.status==='teacher_absent'||row.teachingStatus==='teacher_absent')continue;
  lessonIds.add(row.id);let root=row;const visited=new Set([row.id]);
  while(root.replacementFor){const parent=byId.get(root.replacementFor);if(!parent||visited.has(parent.id)){reasons.add('monthly_allowance_replacement_review');break;}visited.add(parent.id);root=parent;}
  // A make-up consumes its original slot, including when delivered in a later month.
  if(localMonth(root.plannedStart)===month)slots.add(root.id);
 }
 const scheduledSessions=slots.size;
 return{includedSessions,scheduledSessions,extraSessions:Math.max(0,scheduledSessions-includedSessions),lessonIds:[...lessonIds].sort(),rateVersionIds:[...new Set(rateVersionIds)].sort(),reviewRequired:reasons.size>0,reviewReasons:[...reasons].sort()};
}
