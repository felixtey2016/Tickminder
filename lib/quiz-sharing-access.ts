import type {Account} from './auth';

// Arguments are trusted SQL expressions assembled by services, never request text.
export function quizShareTargetEligibleSql(groupSql:string,ownerIdSql:string,targetIdSql:string){
 // The outer predicate already verifies the active teacher/student profiles.
 // Keep their relationship check flat: this predicate is also embedded in
 // guarded D1 writes, whose expression depth is lower than Node SQLite's.
 const linked=`(EXISTS(SELECT 1 FROM plans share_plan WHERE share_plan.group_id=share_owner.group_id AND share_plan.teacher_name=share_owner.teacher_name AND share_plan.student=share_target.student_name AND share_plan.active=1) OR EXISTS(SELECT 1 FROM classroom_members share_member JOIN classrooms share_class ON share_class.id=share_member.classroom_id AND share_class.group_id=share_member.group_id AND share_class.archived=0 WHERE share_member.group_id=share_owner.group_id AND share_member.student_name=share_target.student_name AND share_class.teacher_name=share_owner.teacher_name))`;
 return `EXISTS(SELECT 1 FROM accounts share_target JOIN tuition_groups share_group ON share_group.id=share_target.group_id AND share_group.active=1 JOIN accounts share_owner ON share_owner.id=${ownerIdSql} AND share_owner.group_id=share_group.id AND share_owner.disabled_at IS NULL WHERE share_target.id=${targetIdSql} AND share_target.group_id=${groupSql} AND share_target.disabled_at IS NULL AND share_target.role IN ('admin','teacher','student','parent') AND (share_target.role<>'student' OR EXISTS(SELECT 1 FROM students target_student WHERE target_student.group_id=share_target.group_id AND target_student.name=share_target.student_name AND target_student.active=1)) AND (share_target.role<>'teacher' OR EXISTS(SELECT 1 FROM teachers target_teacher WHERE target_teacher.group_id=share_target.group_id AND target_teacher.name=share_target.teacher_name AND target_teacher.active=1)) AND (share_owner.role='admin' OR (share_owner.role='teacher' AND share_target.role='student' AND EXISTS(SELECT 1 FROM teachers owner_teacher WHERE owner_teacher.group_id=share_owner.group_id AND owner_teacher.name=share_owner.teacher_name AND owner_teacher.active=1) AND ${linked})))`;
}

export function quizPublicVersionSql(q='q',v='v'){
 return `(${q}.visibility='public' AND ${q}.public_blocked_at IS NULL AND EXISTS(SELECT 1 FROM quiz_share_settings direct_public WHERE direct_public.quiz_id=${q}.id AND direct_public.group_id=${q}.group_id AND direct_public.mode='public' AND direct_public.version_id=${v}.id UNION ALL SELECT 1 FROM quiz_publications approved_publication WHERE approved_publication.quiz_id=${q}.id AND approved_publication.version_id=${v}.id AND approved_publication.status='approved' AND NOT EXISTS(SELECT 1 FROM quiz_share_settings explicit_policy WHERE explicit_policy.quiz_id=${q}.id)))`;
}

export function quizSharedAccessSql({quizAlias:q='q',versionAlias:v='v',actorIdSql,actorGroupSql}:{quizAlias?:string;versionAlias?:string;actorIdSql:string;actorGroupSql:string}){
 const target=quizShareTargetEligibleSql(`${q}.group_id`,`${q}.owner_id`,'share_recipient.account_id');
 const current=`${q}.deleted_at IS NULL AND ${q}.public_blocked_at IS NULL AND ${q}.shared_revision=${v}.revision`,sameGroup=`${q}.visibility='organisation' AND ${q}.group_id=${actorGroupSql}`;
 // Independent SELECT branches keep D1's expression-depth budget bounded when
 // source access is nested inside attempt, image and transaction guards.
 return `EXISTS(SELECT 1 WHERE ${current} AND ${quizPublicVersionSql(q,v)} UNION ALL SELECT 1 WHERE ${current} AND ${sameGroup} AND NOT EXISTS(SELECT 1 FROM quiz_share_settings legacy_policy WHERE legacy_policy.quiz_id=${q}.id) UNION ALL SELECT 1 FROM quiz_share_settings selected_policy JOIN quiz_share_recipients share_recipient ON share_recipient.quiz_id=selected_policy.quiz_id AND share_recipient.group_id=selected_policy.group_id WHERE ${current} AND ${sameGroup} AND selected_policy.quiz_id=${q}.id AND selected_policy.group_id=${q}.group_id AND selected_policy.mode='selected' AND selected_policy.version_id=${v}.id AND share_recipient.account_id=${actorIdSql} AND ${target})`;
}

export function quizSharedAccess(actor:Pick<Account,'id'|'groupId'>,q='q',v='v'){
 return {sql:`EXISTS(SELECT 1 FROM (SELECT ? AS account_id,? AS group_id) share_actor WHERE ${quizSharedAccessSql({quizAlias:q,versionAlias:v,actorIdSql:'share_actor.account_id',actorGroupSql:'share_actor.group_id'})})`,args:[actor.id,actor.groupId]};
}

export function quizCreatorSql(q='q',v='v',a='a'){
 return `coalesce((SELECT published.author_name FROM quiz_share_settings published WHERE published.quiz_id=${q}.id AND published.group_id=${q}.group_id AND published.version_id=${v}.id AND published.author_name<>''),(SELECT p.author_display_name FROM quiz_publications p WHERE p.quiz_id=${q}.id AND p.version_id=${v}.id AND p.status='approved' AND p.author_display_name<>'' ORDER BY p.reviewed_at DESC,p.id DESC LIMIT 1),nullif(trim(${a}.name),''),'Quiz creator')`;
}
