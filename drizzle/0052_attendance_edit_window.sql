ALTER TABLE class_sessions ADD COLUMN first_submission_at TEXT;
ALTER TABLE class_sessions ADD COLUMN first_submission_by TEXT;
ALTER TABLE class_sessions ADD COLUMN explicit_locked_at TEXT;
ALTER TABLE class_sessions ADD COLUMN explicit_locked_by TEXT;
ALTER TABLE class_sessions ADD COLUMN explicit_lock_reason TEXT;

-- Only an explicit initial pending -> recorded audit transition establishes
-- the original server submission time. Recorded/updated timestamps alone do
-- not prove which save was first. Ambiguous, invalid or absent history stays NULL.
WITH initial_events AS (
 SELECT s.id AS session_id,s.group_id,a.id,a.actor_id,a.at,julianday(a.at) AS submitted_day
 FROM class_sessions s JOIN lessons l ON l.session_id=s.id AND l.group_id=s.group_id
 JOIN audit a ON a.lesson_id=l.id AND a.group_id=l.group_id
 WHERE s.teaching_status<>'pending' AND a.actor_id IS NOT NULL AND julianday(a.at) IS NOT NULL
 AND json_valid(a.before_json) AND json_valid(a.after_json)
 AND ((a.action='saveSessionAttendance'
       AND json_extract(a.before_json,'$.teachingStatus')='pending'
       AND json_extract(a.after_json,'$.teachingStatus') IN('taught','not_taught','teacher_absent')
       AND json_extract(a.after_json,'$.sessionId')=s.id)
   OR (a.action='attendance' AND json_extract(a.before_json,'$.status')='scheduled'
       AND json_extract(a.before_json,'$.actualStart') IS NULL
       AND json_extract(a.after_json,'$.status') IN('completed','student_absent','teacher_absent')))
 AND NOT EXISTS(
  SELECT 1 FROM audit prior JOIN lessons pl ON pl.id=prior.lesson_id AND pl.group_id=prior.group_id
  WHERE pl.session_id=s.id AND pl.group_id=s.group_id
  AND prior.action IN('attendance','review','saveSessionAttendance','reviewSessionAttendance','autoConfirmAttendance')
  AND (julianday(prior.at)<julianday(a.at) OR julianday(prior.at) IS NULL)
 )
), reliable AS (
 SELECT session_id,group_id,min(submitted_day) AS submitted_day,min(actor_id) AS actor_id
 FROM initial_events GROUP BY session_id,group_id
 HAVING count(DISTINCT actor_id)=1 AND count(DISTINCT submitted_day)=1
)
UPDATE class_sessions SET
 first_submission_at=(SELECT strftime('%Y-%m-%dT%H:%M:%fZ',r.submitted_day) FROM reliable r WHERE r.session_id=class_sessions.id AND r.group_id=class_sessions.group_id),
 first_submission_by=(SELECT r.actor_id FROM reliable r WHERE r.session_id=class_sessions.id AND r.group_id=class_sessions.group_id)
WHERE EXISTS(SELECT 1 FROM reliable r WHERE r.session_id=class_sessions.id AND r.group_id=class_sessions.group_id);

CREATE TRIGGER attendance_first_submission_immutable
BEFORE UPDATE OF first_submission_at,first_submission_by ON class_sessions
WHEN OLD.first_submission_at IS NOT NULL AND
 (OLD.first_submission_at IS NOT NEW.first_submission_at OR OLD.first_submission_by IS NOT NEW.first_submission_by)
BEGIN SELECT RAISE(ABORT,'attendance_first_submission_immutable'); END;

CREATE TRIGGER attendance_first_submission_pair
BEFORE UPDATE OF first_submission_at,first_submission_by ON class_sessions
WHEN (NEW.first_submission_at IS NULL)<>(NEW.first_submission_by IS NULL)
BEGIN SELECT RAISE(ABORT,'attendance_first_submission_incomplete'); END;

CREATE TRIGGER attendance_first_submission_pair_insert BEFORE INSERT ON class_sessions
WHEN (NEW.first_submission_at IS NULL)<>(NEW.first_submission_by IS NULL)
BEGIN SELECT RAISE(ABORT,'attendance_first_submission_incomplete'); END;

CREATE TRIGGER attendance_explicit_lock_complete BEFORE UPDATE OF explicit_locked_at,explicit_locked_by,explicit_lock_reason ON class_sessions
WHEN (NEW.explicit_locked_at IS NULL AND (NEW.explicit_locked_by IS NOT NULL OR NEW.explicit_lock_reason IS NOT NULL))
 OR (NEW.explicit_locked_at IS NOT NULL AND (julianday(NEW.explicit_locked_at) IS NULL OR NEW.explicit_locked_by IS NULL OR NEW.explicit_lock_reason IS NULL OR length(trim(NEW.explicit_lock_reason))=0 OR length(NEW.explicit_lock_reason)>500))
BEGIN SELECT RAISE(ABORT,'attendance_explicit_lock_incomplete'); END;

CREATE TRIGGER attendance_explicit_lock_complete_insert BEFORE INSERT ON class_sessions
WHEN (NEW.explicit_locked_at IS NULL AND (NEW.explicit_locked_by IS NOT NULL OR NEW.explicit_lock_reason IS NOT NULL))
 OR (NEW.explicit_locked_at IS NOT NULL AND (julianday(NEW.explicit_locked_at) IS NULL OR NEW.explicit_locked_by IS NULL OR NEW.explicit_lock_reason IS NULL OR length(trim(NEW.explicit_lock_reason))=0 OR length(NEW.explicit_lock_reason)>500))
BEGIN SELECT RAISE(ABORT,'attendance_explicit_lock_incomplete'); END;
