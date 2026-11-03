type Item={id:string;dueAt:string;startsAt:string;resubmitGrantId?:string|null};
type Submission={homeworkId:string};
export type HomeworkFilter="todo"|"submitted"|"all";

/** Submission presence is not completion when the teacher reopened this work. */
export function studentHomeworkList<T extends Item>(items:T[],submissions:Submission[],filter:HomeworkFilter,now:string):T[]{
  const submitted=new Set(submissions.map(item=>item.homeworkId));
  const pending=(item:T)=>Boolean(item.resubmitGrantId)||!submitted.has(item.id);
  const priority=(item:T)=>item.resubmitGrantId?0:!pending(item)?4:now<item.startsAt?3:now>item.dueAt?1:2;
  return items.filter(item=>filter==="all"||(filter==="todo"?pending(item):!pending(item))).sort((a,b)=>priority(a)-priority(b)||a.dueAt.localeCompare(b.dueAt)||a.id.localeCompare(b.id));
}
