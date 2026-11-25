-- Existing attempts remain valid; a missing position resumes at the first unanswered question.
-- Quiz ordering stays immutable. Only the learner's navigation position is mutable.
ALTER TABLE quiz_practice_attempts ADD COLUMN current_question_id TEXT;
