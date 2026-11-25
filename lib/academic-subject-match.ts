// SQL identifiers are trusted internal constants, never request values.
// Existing labels remain usable until metadata can be resolved without ambiguity.
export function classPlanSubjectSql(plan='p',classroom='c',student='s'){
 return `((${classroom}.subject_id IS NOT NULL AND ${plan}.subject_id=${classroom}.subject_id AND (${classroom}.syllabus_id IS NULL OR ${student}.syllabus_id=${classroom}.syllabus_id)) OR (${classroom}.subject_id IS NULL AND ${planSubjectLabelSql(plan,student,classroom+'.subject')}))`;
}
export function planSubjectLabelSql(plan='p',student='s',label='requested.subject'){
 return `(lower(trim(${plan}.subject))=lower(trim(${label})) OR (${plan}.subject_id IS NOT NULL AND EXISTS(SELECT 1 FROM academic_catalogues academic_menu JOIN json_each(academic_menu.content_json,'$.syllabuses') academic_syllabus JOIN json_each(academic_syllabus.value,'$.subjects') academic_subject WHERE academic_menu.scope='student' AND json_extract(academic_syllabus.value,'$.id')=${student}.syllabus_id AND json_extract(academic_subject.value,'$.id')=${plan}.subject_id AND (lower(trim(json_extract(academic_subject.value,'$.name')))=lower(trim(${label})) OR lower(trim(json_extract(academic_subject.value,'$.id')))=lower(trim(${label})) OR EXISTS(SELECT 1 FROM json_each(academic_subject.value,'$.aliases') academic_alias WHERE lower(trim(academic_alias.value))=lower(trim(${label})))))))`;
}
