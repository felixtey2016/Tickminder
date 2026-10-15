# Academic catalogues and annual promotion

## Scope

- Quiz platform topics, creator lists and topic sets load at most 40 entries per page. “Load more” requests the next page. Topic totals are computed before pagination.
- Two independent, globally stored menus live in `academic_catalogues`: `student` and `quiz`. Each has its own revision.
- Student menus start with SPM, IGCSE, STPM and A-Level. Quiz menus start with SPM and IGCSE.
- SPM uses Form 1–5; IGCSE tuition uses Year 1–11; STPM uses Semester 1–3; A-Level uses AS Level and A2.
- Only the platform owner can add or disable syllabuses and subjects, or append grades, through **Platform console → Classification menus**.
- Existing names and IDs are stable. Disabling an option does not delete historical records. Ordinary administrators cannot create arbitrary subjects through free text.
- Catalogue reads are authenticated but have no role allowlist. A future parent role receives the same menus through the same API. Open catalogue views refresh on focus and every 60 seconds.

## Profiles, pairing and classes

Students carry `syllabus_id`, optional `grade` and optional integer `age` (0–100). Pairings carry a canonical `subject_id`. Existing subject strings and plan keys are retained because historical lessons and file permissions use them.

New students and pairings choose centrally defined values. Profile edits remap pairings using subject IDs or case-insensitive aliases. Classes have syllabus, subject ID and grade; live membership, materials, homework and scheduling use compatible classifications while retaining historical labels.

Initial classification is planned by the pure `scripts/academic-metadata.mjs` helper. Operator-supplied profile overrides and generated SQL stay outside the public repository. Unknown ages and unspecified student grades are never inferred. Existing classes receive a grade only when member profiles unambiguously agree.

## Annual promotion

Administrators open **Student subject pairing → Annual grade promotion**, select an academic year, review proposed next grades and deselect exceptions before confirming.

- Promotion follows the configured grade order within the same syllabus.
- STPM semesters are changed manually rather than advanced once per calendar year. A-Level can advance from AS Level to A2 after confirmation.
- Missing grades, inactive syllabuses, final grades and students already promoted for that year are excluded.
- No automatic switch from SPM/IGCSE into another syllabus.
- No automatic age increment, timetable change, class transfer or rewrite of historical lessons and marks.
- The batch checks current student details, catalogue revision, active administrator and organisation. A stale selection rejects the whole batch.
- `student_grade_promotions` records each confirmation; a student cannot be promoted twice for the same or an earlier academic year.

## Backups and migration

Migration `0029_academic_catalogues.sql` adds metadata and the two new tables without rebuilding existing business tables. Backups use v18 (53 tables), including both global menu revisions and promotion history. Restore retains prior snapshot compatibility and checks academic references.

Do not blanket-apply restored historical migrations. Execute only the audited new migration and the reviewed metadata plan, then verify profiles, classifications, foreign keys, encrypted restore and existing file checksums.

## Subject seed references

The initial menus contain common tuition subjects, not an exhaustive list of examination entries or a promise of specific exam codes. General Science remains available for tuition before the final examination years. The owner may extend the menus.

- [Cambridge IGCSE subjects](https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-upper-secondary/cambridge-igcse/subjects/)
- [MPM STPM subject choices](https://portal.mpm.edu.my/soalan-lazim/soalan-lazim-stpm/pemilihan-matapelajaran)
- [KPM core and elective subject packages](https://www.moe.gov.my/pakej-mata-pelajaran-bagi-setiap-bidang)
