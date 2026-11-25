// A missing date is represented by the original unpaid absence. Scheduling a
// linked, active replacement removes it from the queue without losing history.
export function makeupEligibleSql(alias = 'l') {
  return `${alias}.status IN ('student_absent','teacher_absent') AND coalesce(${alias}.chargeable,0)=0 AND NOT EXISTS (SELECT 1 FROM lessons replacement WHERE replacement.group_id=${alias}.group_id AND replacement.replacement_for=${alias}.id AND replacement.status<>'cancelled')`;
}
