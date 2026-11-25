// Plan an additive classification migration. Callers keep snapshots, rules and
// generated SQL outside source control; this module contains no student data.
const key = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const literal = value => value == null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
export function planAcademicMetadata(snapshot, catalogue, rules) {
 const tables = snapshot.tables, statements = [], unresolved = [], classExceptions = [];
 const studentRows = tables.students.rows, planRows = tables.plans.rows;
 const syllabus = id => catalogue.syllabuses.find(s => s.id === id);
 const subject = (s, value) => s?.subjects.find(x => [x.id, x.name, ...x.aliases].some(a => key(a) === key(value)));
 if (!syllabus(rules.defaultSyllabusId)) throw Error('Unknown default syllabus');
 const profiles = new Map();
 let knownGrades = 0, pairedSubjects = 0, classifiedClasses = 0, gradedClasses = 0;
 for (const student of studentRows) {
  const matching = (rules.overrides || []).filter(r => key(r.name) === key(student.name) && (!r.groupId || r.groupId === student.group_id));
  if (matching.length > 1) throw Error('Ambiguous profile override');
  const override = matching[0], syllabusId = override?.syllabusId || rules.defaultSyllabusId, s = syllabus(syllabusId);
  const grade = override?.grade || null;
  if (!s || grade && !s.grades.includes(grade)) throw Error('Unknown configured syllabus or grade');
  profiles.set(student.group_id + '\0' + student.name, {syllabusId, grade, active: student.active});
  if (grade) knownGrades++;
  // The schema migration defaults old rows to SPM. CAS avoids overwriting any
  // administrator correction made after the source snapshot.
  if (syllabusId !== 'spm' || grade !== null) statements.push(`UPDATE students SET syllabus_id=${literal(syllabusId)},grade=${literal(grade)} WHERE group_id=${literal(student.group_id)} AND name=${literal(student.name)} AND syllabus_id='spm' AND grade IS NULL;`);
 }
 const planSubjects = new Map();
 for (const p of planRows) {
  const profile = profiles.get(p.group_id + '\0' + p.student), selected = subject(syllabus(profile?.syllabusId), p.subject);
  if (!selected) { unresolved.push({groupId:p.group_id,subject:p.subject}); continue; }
  pairedSubjects++;
  planSubjects.set(p.group_id + '\0' + p.key, selected.id);
  statements.push(`UPDATE plans SET subject_id=${literal(selected.id)} WHERE group_id=${literal(p.group_id)} AND key=${literal(p.key)} AND subject=${literal(p.subject)} AND subject_id IS NULL AND EXISTS(SELECT 1 FROM students s WHERE s.group_id=${literal(p.group_id)} AND s.name=${literal(p.student)} AND s.syllabus_id=${literal(profile.syllabusId)});`);
 }
 for (const c of tables.classrooms.rows) {
  const members = tables.classroom_members.rows.filter(m => m.group_id === c.group_id && m.classroom_id === c.id);
  const memberProfiles = members.map(m => profiles.get(c.group_id + '\0' + m.student_name));
  const syllabusIds = new Set(memberProfiles.map(p => p?.syllabusId));
  const syllabusId = members.length && syllabusIds.size === 1 && memberProfiles.every(Boolean) ? memberProfiles[0].syllabusId : null;
  const selected = subject(syllabus(syllabusId), c.subject);
  const aligned = selected && members.every(m => planRows.some(p => p.active && p.group_id === c.group_id && p.student === m.student_name && p.teacher_name === c.teacher_name && planSubjects.get(p.group_id + '\0' + p.key) === selected.id));
  const grades = new Set(memberProfiles.map(p => p?.grade));
  const grade = aligned && grades.size === 1 && memberProfiles.every(p => p?.grade) ? memberProfiles[0].grade : null;
  if (aligned) {
   classifiedClasses++; if (grade) gradedClasses++;
   const liveProfiles=members.map((m,index)=>`EXISTS(SELECT 1 FROM classroom_members m JOIN students s ON s.group_id=m.group_id AND s.name=m.student_name JOIN plans p ON p.group_id=s.group_id AND p.student=s.name AND p.teacher_name=${literal(c.teacher_name)} AND p.active=1 AND p.subject_id=${literal(selected.id)} WHERE m.group_id=${literal(c.group_id)} AND m.classroom_id=${literal(c.id)} AND m.student_name=${literal(m.student_name)} AND s.syllabus_id=${literal(memberProfiles[index].syllabusId)} AND s.grade IS ${literal(memberProfiles[index].grade)})`).join(' AND ');
   statements.push(`UPDATE classrooms SET syllabus_id=${literal(syllabusId)},subject_id=${literal(selected.id)},grade=${literal(grade)} WHERE id=${literal(c.id)} AND group_id=${literal(c.group_id)} AND teacher_name=${literal(c.teacher_name)} AND subject=${literal(c.subject)} AND syllabus_id IS NULL AND subject_id IS NULL AND grade IS NULL AND (SELECT count(*) FROM classroom_members m WHERE m.group_id=${literal(c.group_id)} AND m.classroom_id=${literal(c.id)})=${members.length} AND ${liveProfiles};`);
  } else classExceptions.push({id:c.id,reason:!members.length?'no-members':syllabusIds.size!==1?'mixed-syllabus':'unmatched-pairing'});
 }
 return {sql:statements.join('\n')+'\n',summary:{students:studentRows.length,knownGrades,plans:planRows.length,pairedSubjects,classrooms:tables.classrooms.rows.length,classifiedClasses,gradedClasses,unresolvedSubjects:[...new Set(unresolved.map(x=>x.subject))],classExceptions}};
}
