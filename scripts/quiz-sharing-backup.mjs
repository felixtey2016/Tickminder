export const QUIZ_SHARING_TABLES=['quiz_share_settings','quiz_share_recipients'];
export const OFFBOARDING_TABLES=['student_offboarding','classroom_retirements'];
export const QUIZ_SHARING_REPLAY_TRIGGERS=['quiz_share_settings_insert','quiz_share_recipient_insert'];
export function checkRestoredQuizSharing(db){
 const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 if(QUIZ_SHARING_TABLES.some(t=>tables.has(t))&&!QUIZ_SHARING_TABLES.every(t=>tables.has(t)))throw Error('Incomplete restored quiz sharing');
 if(!tables.has('quiz_share_settings'))return;
 if(db.prepare("SELECT 1 FROM quiz_share_settings s LEFT JOIN quizzes q ON q.id=s.quiz_id LEFT JOIN quiz_versions v ON v.id=s.version_id LEFT JOIN accounts a ON a.id=s.updated_by WHERE q.id IS NULL OR q.group_id<>s.group_id OR q.owner_id<>s.updated_by OR a.id IS NULL OR (s.mode='private' AND s.version_id IS NOT NULL) OR (s.mode<>'private' AND (v.id IS NULL OR v.group_id<>s.group_id OR v.quiz_id<>s.quiz_id)) LIMIT 1").get())throw Error('Invalid restored quiz sharing identity');
 if(db.prepare("SELECT 1 FROM quiz_share_recipients r LEFT JOIN quiz_share_settings s ON s.quiz_id=r.quiz_id LEFT JOIN accounts a ON a.id=r.account_id WHERE s.quiz_id IS NULL OR s.mode<>'selected' OR s.group_id<>r.group_id OR a.id IS NULL OR a.group_id<>r.group_id LIMIT 1").get())throw Error('Invalid restored quiz recipients');
}
