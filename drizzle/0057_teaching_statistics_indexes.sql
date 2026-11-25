-- Monthly publication cohorts, teacher ownership, and effective-deadline history.
CREATE INDEX homework_statistics_month ON homework(group_id,julianday(starts_at),id);
CREATE INDEX homework_statistics_owner_month ON homework(group_id,owner_id,julianday(starts_at),id);
CREATE INDEX homework_statistics_due ON homework(group_id,julianday(due_at),id);
-- A recipient contributes once, using its latest authorised attempt.
CREATE INDEX homework_statistics_latest_submission ON homework_submissions(group_id,homework_id,student_name,attempt DESC,submitted_at DESC,id DESC);
CREATE INDEX homework_statistics_submission_grade ON homework_score_history(group_id,submission_id,score);
