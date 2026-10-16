-- Preparation only: active business authorization is unchanged by this table.
-- Explicit snapshots preserve the Part 02 ordinary-admin scope and never grow
-- automatically when a future catalogue module/action is introduced.
CREATE TABLE admin_permission_profiles (
 group_id TEXT NOT NULL REFERENCES tuition_groups(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 grants_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(grants_json) AND json_type(grants_json)='array'),
 draft_grants_json TEXT CHECK(draft_grants_json IS NULL OR (json_valid(draft_grants_json) AND json_type(draft_grants_json)='array')),
 origin TEXT NOT NULL CHECK(origin IN ('legacy','new')),
 updated_by TEXT,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(group_id,account_id)
);
CREATE INDEX admin_permission_profiles_account_idx ON admin_permission_profiles(account_id);
-- Include chief profiles so future handovers retain their legacy baseline.
-- Owner profiles are always ignored/protected by live identity guards.
INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,draft_grants_json,origin,updated_by,updated_at)
 SELECT a.group_id,a.id,1,'["accounts.view","accounts.create","accounts.assign","accounts.disable","accounts.restore","accounts.delete","accounts.activate","accounts.resetPassword","teachers.view","teachers.create","teachers.disable","teachers.restore","teachers.delete","students.view","students.create","students.edit","students.disable","students.restore","students.delete","students.promote","plans.view","plans.create","plans.edit","plans.disable","plans.restore","plans.delete","lessons.view","lessons.create","lessons.edit","lessons.cancel","lessons.delete","attendance.view","attendance.edit","attendance.review","reschedules.view","reschedules.create","reschedules.respond","classrooms.view","classrooms.create","classrooms.edit","classrooms.archive","classrooms.restore","classrooms.delete","terms.view","terms.create","terms.edit","announcements.view","announcements.create","announcements.edit","announcements.delete","folders.view","folders.create","folders.edit","folders.delete","folders.placeContent","materials.view","homework.view","homework.delete","quizzes.view","quizzes.create","quizzes.edit","quizzes.delete","quizzes.import","quizzes.share","quizzes.duplicate","quizAssignments.view","quizAssignments.assign","quizAssignments.grade","quizAssignments.withdraw","quizAssignments.release","quizAssignments.accommodate","statistics.view","sheetSync.view","sheetSync.preview","sheetSync.commit","audit.view"]',NULL,'legacy',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now')
 FROM accounts a JOIN tuition_groups g ON g.id=a.group_id WHERE a.role='admin';
-- Admins created after this migration have no row and a future configured scope
-- of []. Round 1 may save their draft without changing this empty stored basis.
