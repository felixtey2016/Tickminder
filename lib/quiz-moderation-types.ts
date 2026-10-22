export type QuizPublicationStatus='legacy_pending'|'pending'|'approved'|'returned'|'rejected'|'withdrawn'|'taken_down';
export type QuizSourceType='original'|'licensed'|'unknown';
export type QuizPublicationSource={authorDisplayName:string;sourceType:Exclude<QuizSourceType,'unknown'>;sourceUrl:string;authorization:string;rightsConfirmed:boolean};
export type QuizPublication={id:string;quizId:string;versionId:string;quizRevision:number;title:string;subject:string;exam:string;status:QuizPublicationStatus;revision:number;authorDisplayName:string;sourceType:QuizSourceType;sourceUrl:string;authorization:string;rightsConfirmed:boolean;reason:string;createdAt:string;updatedAt:string;reviewedAt:string|null};
export type QuizModerationSummary={latest:QuizPublication|null;publicVersionId:string|null;blockedAt:string|null};
export type QuizPublicationReport={id:string;quizId:string;versionId:string;category:'content'|'rights';reason:string;status:'open'|'in_review'|'resolved'|'dismissed';revision:number;resolution:string;createdAt:string;updatedAt:string};
export type QuizPublicationAppeal={id:string;publicationId:string;quizId:string;reason:string;status:'open'|'resolved'|'rejected';revision:number;resolution:string;createdAt:string;updatedAt:string};

// Public access always names the specific reviewed immutable version. A draft,
// unreviewed legacy share or platform takedown never grants public access.
export function quizApprovedPublicSql(quizAlias='q',versionAlias='v'){
 return `${quizAlias}.public_blocked_at IS NULL AND EXISTS(SELECT 1 FROM quiz_publications approved_publication WHERE approved_publication.quiz_id=${quizAlias}.id AND approved_publication.version_id=${versionAlias}.id AND approved_publication.status='approved')`;
}
