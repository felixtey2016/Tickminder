# Quiz hub, drafts and platform catalog

Current student practice, teacher ZIP import and deletion behaviour is described in [QUIZ_PRACTICE.md](QUIZ_PRACTICE.md). The publication versions and evidence below describe the preceding Part 16 releases.

## Scope

The teaching menu has one **Quiz** entry. It opens **题库 / Question bank** by default, with **我的测验 / My quizzes** as a second tab in the same page. A small **＋ 创作测验 / Create quiz** button opens authoring. Existing draft creation, editing, duplication, image/math rendering and a student-style **preview** are retained. Student practice, teacher practice allocation, attempts, result recording and duration enforcement are now available; see QUIZ_PRACTICE.md. Formal homework/exam scheduling remains separate. The preview does not submit answers or create student results.

The unified hub was published to both production domains on **2026-10-15**, Worker `6d29bea2-a9b8-4016-9ba9-c5dd14ca026d`. The original Part 16 publication and its historical acceptance evidence remain recorded below.

The latest maintenance release is Worker `28a9c5a3-cd5f-4fb7-92af-0fa5f7f6baa2` (2026-10-15), fixing literal title/subject searches containing underscores, percent signs and other punctuation. The first four mathematics paper archives were explicitly imported and shared to the public creator bank: 160 original questions and 125 images, without Form/topic/subtopic grouping. Their content and answer keys were read back against the original packages. Other concurrent private imports/copies were preserved separately. See the corresponding entry in RELEASES.md; actual graded student attempts remain Part 17.

The user's instruction authorises production publication and local isolated QA, overriding the attachment's original staging-only instructions. The public test site is not updated. Existing classrooms, attendance, homework, PDF access and accounts are preserved.

## Unified navigation and catalog

- Bank sources: **全部题库 / All question banks**, **平台题库 / Platform bank** and **创作者题库 / Creator bank**. Existing records without a bank-kind field remain creator quizzes; no published question content is silently reclassified.
- Subject is a dropdown populated from accessible saved/shared data. Search matches title or subject. Selecting a subject reveals Form 1–5 and chapter filters only where corresponding real catalog metadata exists. Chapters are scoped by subject and form; the same chapter number in two forms is not treated as one selection.
- There is **no year filter** in bank browsing. Exam year remains optional source metadata in authoring. Source year does not decide a question's curricular form; an SPM source can contain Form 1–3 topics.
- Platform browsing proceeds **topic or Overall → easy / medium / hard → Set 1 / Set 2 / …**. Each platform Set contains exactly 40 questions of one difficulty. Chapter Overall and Form Overall use distinct catalog kinds and are not merged into one ambiguous topic. Missing difficulty sets have an honest unavailable state, not a fabricated quiz.
- Creator quizzes remain flexible 1–150-question quizzes and retain private, organisation-only and public sharing. They can optionally record a Form/chapter/subtopic classification without becoming a 40-question platform Set. Own drafts stay under My quizzes; shared versions are previewable/copyable according to access.
- Each quiz card displays its saved immutable version's real update time, including the year in Malaysia time (GMT+8). Topic cards aggregate the latest accessible shared Set's time. **最新题目 / Newest quizzes** is the default; **Oldest quizzes** and **Title A–Z** use actual server sorting. Missing dates are omitted rather than generated from the browser clock.
- Platform topic counts are aggregated before the 40-item list pagination. Opening a topic/difficulty loads its matching Sets with pagination. A catalogue with more than 40 Sets is not truncated into an incomplete topic group.
- Existing quiz menu aliases resolve to this hub. Authoring, image/math rendering and versioned sharing continue to use the existing editor and player; students now use the real practice workflow described in QUIZ_PRACTICE.md.

## Authoring and answer rules

- Title and subject required; instructions, exam system, year, state/source, paper code, level, chapter and source question ID supported. Classification is editable. Interface Chinese/English; question content supports a primary language (Chinese, English or Bahasa Melayu) plus an English version.
- Single-choice (2–6 options), true/false, fill-in-the-blank, numeric math and written responses. Each question has positive points with at most two decimal places; each draft has 1–150 questions. Questions/options can have private PNG/JPEG/WebP images, up to 5 MiB each, with a separate enlarged view.
- Blank answers trim/collapse whitespace; optional case sensitivity and multiple explicitly accepted strings. Numeric answers accept finite integers, decimals and fractions with a nonzero denominator, absolute tolerance and separately displayed units. No expression is executed. Algebraic derivations and written answers use a manual-grading rubric. These rules were confirmed by the user.
- Save uses a revision comparison and stable operation ID. Stale saves return 409 and keep local edits. Successful retries return their committed result. Reordering, deletion and type changes are explicit; destructive question changes require confirmation. Before leaving, unsaved edits are warned about.
- Optional 1–360 minute limit and question/option shuffle are stored and demonstrated in preview. The practice workflow now enforces the inherited duration on the server and persists the shuffled order.

## Sharing and data boundaries

The user selected three visibility levels: private, organisation-only and public across tuition groups. An explicit action shares the **currently saved immutable version** after the author confirms they may share the content/images. Later draft edits do not replace that version until shared again. Public access means authenticated students can practise and teachers/administrators can view and duplicate it; this is not an anonymous public file directory.

Private drafts belong to their author. Same-group administrators may inspect a known draft; changing its content remains author-only. Ordinary accounts cannot change group context. Students may browse shared question content and their authorised practice, never author drafts or retrieve grading keys before completion. Grading keys/rubrics live in a different table from public question content. Preview responses never contain them.

Duplicates refer to an immutable source version. A server-created image grant preserves a legitimate duplicate after its source is withdrawn. Guessing a private image ID or forging an image reference does not grant access. Image bytes stay in private R2 and are returned through authenticated endpoints with no-store, nosniff and a restrictive content policy. No images are copied from the commercial screenshot.

## Teacher and administrator imports

Teachers, the platform owner and ordinary **administrators** see **导入 ZIP / Import ZIP**. Students have no import or authoring permission. Teachers import only creator quizzes; platform Sets remain administrator-only. Ordinary administrators import only into their active authorised tuition group; this does not grant cross-group account or private-content access.

An import first opens a private, reviewable creator draft, so mixed difficulties or a raw source paper are not incorrectly advertised as a complete platform Set. An administrator can organise a valid 40-question, single-difficulty selection into a platform topic/Overall Set and choose sharing explicitly. Reopening an owned imported draft preserves its source hash and maintenance capability. Normal manual creation and legitimate quiz duplication do not gain administrator import privileges.

The 20 MiB compressed-file limit is checked before reading the browser File into memory, then all existing archive/content limits below are enforced. Importing is an authenticated teacher/administrator authoring action; opening this hub does not import the user's sample or publish any content automatically.

## ZIP import contract

Use UTF-8 and the following layout:

```text
paper.zip
  questions.txt
  images/
    qb0001_q01_box.png
```

Example question block (repeat with distinct question/source IDs):

```text
[Q01]
题目编码：MATH-QB0001-Q01
原题号：1
所属年级：Form 4
所属章节：Bab 2: Asas Nombor / Chapter 2: Number Bases
所属子章节：2.1 Asas Nombor / Number Bases
难度等级：easy
题干 (BM)：Nyatakan nilai digit...
题干 (EN)：State the digit value...
图片入口：images/qb0001_q01_box.png
选项 A (BM)：50
选项 A (EN)：50
选项 A 图片入口：NONE
选项 B (BM)：100
选项 B (EN)：100
选项 B 图片入口：NONE
选项 C (BM)：200
选项 C (EN)：200
选项 C 图片入口：NONE
选项 D (BM)：250
选项 D (EN)：250
选项 D 图片入口：NONE
选项合图入口：NONE
标准答案：D
```

- Image paths are case-sensitive and relative to the ZIP root. Use `NONE` for absent images. Difficulty must be `easy`, `medium` or `hard`; MCQ keys must be A–D. Both individual option images and composite option diagrams are retained.
- Import rejects missing prompts/options/answers/images, duplicate question/source identifiers, unsafe/duplicate paths, invalid image signatures, invalid UTF-8 and oversized archives. Limits: 20 MiB compressed, 60 MiB declared/actual unpacked data, 300 entries and 150 questions. `questions.txt` has a 1 MiB limit; each image 5 MiB.
- Source text, answers and mathematical notation are preserved; importing does not verify the educational correctness of supplied answers or infer LaTeX from ambiguous plain text. To typeset math, use `$...$` inline and `$$...$$` for a separate formula.
- Import opens a private reviewable draft. Confirm subject/year/classification, inspect diagrams and answer keys, then save. Exact ZIP SHA256 is retained per author/group; importing the same ZIP again opens that owned draft instead of duplicating it. Changing an existing source bank does not silently overwrite used versions.
- The attached Kedah sample contains **40 questions / 39 images**, with **16 easy / 23 medium / 1 hard**. It is used as a local QA fixture; it is not automatically published to the production creator library.

## Future bank preparation: two stages

The user is still preparing the large source ZIP collection. **No real question package is imported by this follow-up.** The agreed future workflow is separate from the currently available single-ZIP review/import tool:

1. **Local preparation:** retain the original ZIPs; programmatically index subject, Form 1–5, chapter, subtopic, difficulty, stable source question ID and referenced image paths. Save a question index, Set manifest, exception report and resumable progress. Report ambiguous classification, missing assets/answers and suspected duplicates instead of guessing. The model reviews summaries and exceptional matches rather than printing every question into chat.
2. **Reviewed batch import:** use the saved manifests to upload an approved subject/chapter/Set batch, verify counts and image references, and record completed source IDs. Repeated runs should resume from recorded progress and not create duplicate question imports.

The planned assembly rule is: complete 40-question Sets within the same subtopic/difficulty first; pool the remainder into a suitable Chapter/Form Overall; if an Overall is short, reuse matching subtopic questions as references to fill it. A question may appear in both a subtopic Set and an Overall, but not twice in the same Overall. Across Overall Set 1 / Set 2 / … of the same scope/difficulty, prioritise unused questions. Stop and retain the remainder when fewer than 40 eligible distinct questions remain; do not fabricate content or duplicate questions just to reach 40.

Overall selection must respect its subject, curricular scope and difficulty. Published Sets and their future attempt versions remain stable when later source batches arrive. These preparation/assembly rules are agreed requirements for future data work, **not a claim that an automatic bulk assembler or student assignments are already implemented**.

## Storage, schema and recovery

Additive migration `0024_quiz_drafts.sql` creates five tables: `quizzes`, `quiz_versions`, `quiz_answer_keys`, `quiz_images`, `quiz_version_images`. It does not update or rebuild existing business tables. Future assignment/attempt schemas can refer to a fixed version ID and stable question IDs; no inactive mock assignment buttons are exposed.

Group storage enforcement includes existing reserved PDF bytes plus quiz-image bytes. Existing `storage_quota.used_bytes` retains its PDF-only meaning to preserve earlier backups; images are summed separately, not double-counted. Content-hash image uploads deduplicate per author/group. An interrupted upload retains metadata that can be resumed; incomplete objects cannot be attached as ready images. Immutable image/version references are retained for future released attempts and safe copies.

Current database backups are v16 (49 tables; see QUIZ_PRACTICE.md), with encrypted image objects alongside PDFs. Ready images must have matching size, MIME and SHA256; incomplete uploading rows do not claim a complete object. Backups validate image-version relationships. Existing v1–v14 D1 and PDF backup formats remain readable. Large text columns are restored in bounded chunks to respect D1 statement sizes.

Before applying migration 0024, take an encrypted database+files backup. For code rollback, the preceding Part 09 build can run while the additive tables remain intact; avoid dropping new tables or restoring a whole old snapshot over ongoing user changes. Full restore scripts default to local dry run. A destructive restore needs a separately approved recovery plan.

## Dependencies and sources

- [KaTeX 0.19.0](https://github.com/KaTeX/KaTeX), [MIT license](https://github.com/KaTeX/KaTeX/blob/main/LICENSE). [Security](https://katex.org/docs/security), [options](https://katex.org/docs/options), [browser integration](https://katex.org/docs/browser.html). Rendering uses `trust:false`, bounded expansion/size and fresh macros; raw text/errors are React-escaped. CSS/fonts are bundled locally. Formula rendering is loaded with the quiz editor/player, rather than the initial dashboard.
- [fflate 0.8.3](https://github.com/101arrowz/fflate), [MIT license](https://github.com/101arrowz/fflate/blob/master/LICENSE). Named ZIP functions are loaded when importing an archive. No cloud conversion service or new paid service is used.

Installed package licenses are preserved in their packages and included as copies in `docs/licenses/`.

## Original Part 16 validation evidence (historical)

The original Part 16 release was published on **2026-10-15** as Worker `64780359-9624-445b-ad96-4d95841aeb8c` to both canonical domains. Final acceptance: 14 parser/rule checks, 27 built-Worker API checks, 37 browser assertions and 31 production read-only checks passed. Chinese/English 390×844 and desktop 1366×900 screenshots were inspected; all 39 sample diagrams decoded in the browser. Production backups restored 45 tables and the original ten PDFs (11,467,300 bytes); all original business rows and PDF hashes matched the preceding snapshot. Remote foreign-key validation returned no errors.

Local evidence lives outside the application repository in `../../work/part16-release/`: parser/rule assertions, actual built Worker API assertions, browser screenshots/checks, synthetic full-backup restoration and production verification. Production IDs and final verification results are recorded in `RELEASES.md` after publication. Physical phone OS notifications, real Google re-login and actual student attempts are not part of this quiz-editor acceptance.

## Unified-hub follow-up release status

Published on **2026-10-15** as Worker `6d29bea2-a9b8-4016-9ba9-c5dd14ca026d`, retaining runtime settings and all existing storage bindings. TypeScript, guarded production build, catalogue rules, **39 isolated API checks**, **41 browser checks** and **33 read-only production checks** passed. Chinese/English 390×844 and English 1366×900 previews were inspected, including administrator import controls. Duplicate/concurrent platform Set submissions are rejected without empty quiz records. No browser runtime errors occurred; intentional failure/retry fixtures produced the expected 503 responses.

Encrypted pre/post snapshots restored locally with **45 tables, ten PDFs and 11,467,300 PDF bytes**. All business rows, quiz records, subscription identities/keys and original PDF hashes match. Only one push-subscription refresh timestamp and the notification dispatcher timestamp advanced. Production foreign-key checks returned zero violations, and published Quiz bundles/CSS match the locally tested build. Evidence: `../../work/quiz-unified-release/`. No real question ZIP was imported, no public test site was updated, and no GitHub upload was performed. Actual student assignments/attempts remain Part 17; real Google re-login and physical-phone OS push were not retested in this UI release.
