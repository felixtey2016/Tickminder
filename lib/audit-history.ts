export type AuditSummaryField={field:string;value:string|number|boolean|null};
export type AuditHistoryEntry={id:string;lessonId:string;lessonName:string;actorId:string;actorName:string;action:string;at:string;beforeSummary:AuditSummaryField[];afterSummary:AuditSummaryField[]};
export type AuditHistoryResponse={entries:AuditHistoryEntry[];total:number;page:number;pages:number;pageSize:number;snapshot:string;operators:{id:string;name:string}[];actions:string[]};
export class AuditHistoryError extends Error{constructor(message:string,readonly status=400){super(message);}}
