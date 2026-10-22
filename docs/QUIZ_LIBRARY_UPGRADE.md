# Quiz selection, analysis and public review (Parts 18–20)

This release extends the existing Quiz hub. The approved destination is production on www.tickminder.com / tickminder.com, with local validation and source backup to the existing GitHub branch.

## Questions and versions

Teachers and authorised administrators can choose questions from up to ten accessible quizzes, with at most 150 questions in one new draft. Selected sources must have the same syllabus and subject. Question and option IDs are remapped; marking keys follow those IDs. The server validates the selected immutable source versions and rechecks their access in the write transaction. Images are referenced rather than copied. `quiz_question_sources` retains each derived question's original version and question ID, including through later draft edits.

An ordinary sharing withdrawal or author deletion stops new browsing, copying and allocation. An existing assignment retains its saved version, subject to current recipient/classroom eligibility. A platform takedown additionally stops new attempts for that source, including a source the author already deleted. Historical attempts, answers, scores and legitimate image access remain available. Deleted content cannot be restored by changing the takedown flag.

## Sampling and analysis

Quiz settings optionally specify a question count and eligible types. The server selects without replacement and stores the fixed subset, question order and option order with the attempt. Existing unsampled attempts retain their original full-paper order. Resuming, saving, marking, mandatory-answer checks and time expiry all use the selected subset. Total marks are calculated from that subset; question marks are not silently made equal.

Assignment analysis is limited to its fixed version. The default is each student's latest submitted, fully marked attempt; first, best and all-attempt views are available. Pending marking and incomplete work are counted separately. Percentages allow attempts with different raw totals to be compared. A question's denominator includes selected, eligible submitted attempts that actually received it. Manual items show mean score percentage rather than a binary error rate. Twenty question metrics are returned per page; aggregation runs in the database, without transferring all answer payloads to the browser.

## Publication and reports

Organisation sharing remains within its existing scope. Cross-organisation public access requires approval of the specific immutable version by the platform Owner. A group chief cannot approve global publication. Applications retain the public author name, original/licensed source type, source URL when licensed, permission statement and explicit rights confirmation. Approval validates the content and grading keys. A later draft does not replace an approved version; a new version needs review.

Review supports approval, return, rejection, withdrawal, platform takedown, problem reports and appeals. Changes retain a reason, actor, time and version, and use operation IDs and revision checks. Authors changing to private/organisation sharing or deleting a quiz also withdraw pending publication requests. Reports are visible only to the reporter and the platform Owner. Public cards omit internal account/group IDs and display the reviewed author name. Student responses never receive marking keys before their configured release.

Migration `0039` records existing public versions as `legacy_pending`, without treating the old share as an approval. They are excluded from new public browsing, copying and starts. Existing assignments retain their saved grant. Their metadata is not automatically assigned a syllabus or grade.

## Original starter content

Migration `0041` installs one private 40-question original mathematics foundations draft for the existing platform Owner in Next Genn Edu. It is labelled SPM / Mathematics / Form 5, medium, overall Set 1; this is a foundation practice set, not a complete syllabus assessment. It contains no third-party paper text or images. It remains a draft for the Owner to review and submit through the normal publication process. The Owner-only seed action opens/recreates the corresponding draft idempotently.

## Schema, backup and validation

Additive migrations `0039`, `0040` and `0041` add six tables, a nullable platform-takedown timestamp, a narrowly revised deletion guard and the starter draft. Existing accounts, lessons, fees, invoices, files and attempt IDs are preserved. D1 backup format v24 includes 81 core tables plus the three optional external Bot tables when present; restore keeps prior formats and validates sampling, provenance and review relationships. The encrypted native full-database snapshot also retains external Bot schema objects.

Release evidence is retained privately outside the public repository: focused fictional API/database checks, isolated built-Worker and browser checks, migration rehearsal, encrypted production snapshots, deployment version and GitHub commit. Existing unsupported historical question-type records are not rewritten by this release to make a strict semantic backup check pass.

Code rollback must account for public moderation: old code does not enforce approval. Keep the additive schema and saved history; prefer correcting or redeploying the current release rather than exposing legacy unreviewed shares through an old public reader.
