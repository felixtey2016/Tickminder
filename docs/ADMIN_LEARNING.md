# Administrator homework and PDF access

## Scope

Both the owner administrator and ordinary administrators can read all teachers' published homework and teaching materials, including individual assignments and classroom content.

- Menu: **Teaching → Homework overview / PDF teaching materials**.
- Classroom: **Homework / Teaching materials** tabs.
- Homework shows recipients, submission status, latest submission time, late status, existing scores and PDF submission history.
- Teaching materials show the responsible teacher, subject, classroom when applicable, assigned students and existing PDF open/download links.
- Global lists can be filtered by teacher and subject.

Published teaching, homework attachment and student submission PDFs are authorized on the server for `role = admin`. Files must be attached and referenced by a published learning record. Unpublished staged or unreferenced files are not included. Student personal study blocks remain private.

Administrator learning views are read-only. Existing teacher publication/deletion/scoring rules and student submission permissions are retained. No schema migration or stored business-data changes are required.

## Loading and presentation

Learning data is fetched when entering the relevant menu or classroom tab. It is not added to the scoped core startup request. Classroom tabs show loading/error/retry states while that request is pending. Compatible unscoped full-state responses include administrator learning data.

The implementation reuses current deep-purple styling, Lucide icons, file links, filters and page states, with Chinese/English navigation and year-inclusive Malaysia timestamps.

## Verification

- TypeScript `--noEmit`, guarded Cloudflare recovery build and Git whitespace checks passed.
- Isolated built-Worker D1/R2 checks used synthetic accounts and valid PDF uploads: two teachers published classroom/individual materials and homework; a student submitted and replaced a PDF; the teacher scored it.
- Both administrator roles retrieved all learning records and opened/downloaded identical PDF bytes, including submission history. Staged-file access and administrator publish/score operations were denied.
- Unrelated teacher/student, pending and anonymous PDF access remained denied. Student private-study isolation passed.
- Real Chromium navigation at 390×844 passed Chinese/English global views, teacher filters, read-only controls, classroom learning fetched on demand and no horizontal overflow or page JavaScript errors. Mobile checks use viewport emulation, not physical Android hardware.
- Local QA uses the installed Workerd-supported compatibility date `2026-05-22`; production retains `2026-10-10`. Two denied administrator score checks each required one retry after the development proxy returned its explicit restart message. Accepted writes and application errors were not retried.

## Production publication

- Published 2026-10-12 Malaysia time to the owner-controlled `tickminder-recovery` Worker, serving both `www.tickminder.com` and `tickminder.com`.
- Tested application source: `3934c3c`; Worker version: `789278d7-81cd-4d42-82de-108d878a63ff`.
- Both canonical homepages returned 200. Deployed administrator, classroom and scheduler client assets matched the tested local build by SHA-256. Anonymous learning/PDF access returned 401; login configuration, manifest and notification service worker remained available.
- Authenticated administrator and PDF checks were performed in isolated local storage. Production verification used read-only public requests; creating a temporary production administrator was rejected by automatic approval review, so no production verification account was created.
- Dashboard secrets were retained with `--keep-vars`. No database migration, business-record update or PDF upload occurred during publication.
