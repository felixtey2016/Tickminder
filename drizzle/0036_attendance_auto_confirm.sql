-- Confirm complete, previously saved attendance under the recording account.
-- No times, attendance statuses, charge decisions or issued invoice sources change.
-- Pending/incomplete records without an identifiable recorder remain unresolved.
UPDATE class_sessions SET
 attendance_reviewed_at=attendance_recorded_at,
 attendance_reviewed_by=attendance_recorded_by,
 attendance_written_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 revision=revision+1,
 mutation_id='attendance-auto-confirm-v1:'||id
WHERE attendance_reviewed_at IS NULL AND status<>'cancelled'
 AND teaching_status IN('taught','not_taught','teacher_absent')
 AND attendance_recorded_at IS NOT NULL AND julianday(attendance_recorded_at) IS NOT NULL
 AND attendance_recorded_by IS NOT NULL
 AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=class_sessions.attendance_recorded_by AND a.role IN('teacher','admin'))
 AND (teaching_status<>'taught' OR (julianday(actual_end)>julianday(actual_start) AND julianday(actual_end)-julianday(actual_start)<=0.5))
 AND EXISTS(SELECT 1 FROM class_session_participants p WHERE p.group_id=class_sessions.group_id AND p.session_id=class_sessions.id)
 AND NOT EXISTS(
  SELECT 1 FROM class_session_participants p LEFT JOIN lessons l ON l.id=p.lesson_id AND l.group_id=p.group_id
  WHERE p.group_id=class_sessions.group_id AND p.session_id=class_sessions.id
   AND (l.id IS NULL OR l.reviewed_at IS NOT NULL OR l.chargeable IS NULL
    OR l.status NOT IN('completed','student_absent','teacher_absent') OR p.attendance_status='pending'
    OR (class_sessions.teaching_status<>'taught' AND p.attendance_status<>'absent')
    OR (p.attendance_status<>'absent' AND (p.arrived_at IS NULL OR p.left_at IS NULL
      OR julianday(p.arrived_at) IS NULL OR julianday(p.left_at) IS NULL
      OR p.arrived_at<class_sessions.actual_start OR p.left_at>class_sessions.actual_end OR p.arrived_at>=p.left_at)))
 )
 AND NOT EXISTS(
  SELECT 1 FROM invoice_source_locks k WHERE k.group_id=class_sessions.group_id AND
   ((k.source_type='session' AND k.source_id=class_sessions.id)
    OR (k.source_type='lesson' AND EXISTS(SELECT 1 FROM class_session_participants p WHERE p.group_id=class_sessions.group_id AND p.session_id=class_sessions.id AND p.lesson_id=k.source_id))
    OR (k.source_type='student_month' AND k.month=strftime('%Y-%m',coalesce(class_sessions.actual_start,class_sessions.planned_start),'+8 hours')
      AND EXISTS(SELECT 1 FROM class_session_participants p JOIN billing_students b ON b.group_id=p.group_id AND b.student_name=p.student_name WHERE p.group_id=class_sessions.group_id AND p.session_id=class_sessions.id AND b.id=k.student_id)))
 );

INSERT OR IGNORE INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at)
SELECT 'attendance-auto-confirm-v1:'||l.id,l.group_id,l.id,s.attendance_recorded_by,'autoConfirmAttendance',
 json_object('status',p.attendance_status,'reviewedAt',NULL,'chargeable',l.chargeable),
 json_object('status',p.attendance_status,'reviewedAt',s.attendance_reviewed_at,'chargeable',l.chargeable,
   'sessionId',s.id,'confirmationPolicy','recording_account_confirms','originalRecordedAt',s.attendance_recorded_at),
 s.attendance_written_at
FROM lessons l JOIN class_sessions s ON s.id=l.session_id AND s.group_id=l.group_id
 JOIN class_session_participants p ON p.group_id=l.group_id AND p.session_id=s.id AND p.lesson_id=l.id
WHERE s.mutation_id='attendance-auto-confirm-v1:'||s.id AND l.reviewed_at IS NULL;

UPDATE lessons SET
 reviewed_at=(SELECT s.attendance_reviewed_at FROM class_sessions s WHERE s.id=lessons.session_id AND s.group_id=lessons.group_id),
 reviewed_by=(SELECT s.attendance_reviewed_by FROM class_sessions s WHERE s.id=lessons.session_id AND s.group_id=lessons.group_id),
 updated_at=(SELECT s.attendance_written_at FROM class_sessions s WHERE s.id=lessons.session_id AND s.group_id=lessons.group_id)
WHERE reviewed_at IS NULL AND EXISTS(
 SELECT 1 FROM class_sessions s WHERE s.id=lessons.session_id AND s.group_id=lessons.group_id
 AND s.mutation_id='attendance-auto-confirm-v1:'||s.id AND s.attendance_reviewed_at IS NOT NULL
);

