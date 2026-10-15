# Interface polish: round 1

This round refines the existing administrator, teacher and student interfaces.

- Use distinct page and section headings and remove repeated learning headings.
- Use consistent bordered controls, filter spacing and readable action buttons.
- Keep classroom refresh beside the classroom selector.
- Expand routine scheduling guidance on request while keeping validation visible.
- Shorten bilingual lesson labels, material publishing and submission guidance.
- Keep one calendar action for adding a personal study plan.
- Use a readable solid red confirmation for destructive actions.

The navigation structure, permissions and business rules are unchanged. Course
navigation, classroom structure and Quiz presentation are separate planned rounds.

Verification included TypeScript, a production build, 23 local browser scenarios
across three roles, two languages and mobile/desktop sizes, plus live asset and
access-boundary checks. Browser checks used Chromium emulation rather than
physical phones; no new live sign-in test was claimed.
