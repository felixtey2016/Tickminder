# Course navigation: round 2

Administrators, teachers and students now have one Courses menu entry for their
existing course views. Classroom and Quiz entries remain directly accessible.

- Administrators switch between calendar, list, timetable, attendance tasks and
  overview. Timetable has student and teacher views with separate filters.
- Teachers switch between calendar, courses and attendance, rescheduling and
  hours. Course arrangements and attendance records share one section.
- Students switch between calendar, list and rescheduling.
- Administrators and teachers arrange lessons using the primary page action.
- The Courses menu remembers the last course view while navigating elsewhere.
- Existing shortcuts, notifications and browser history retain their leaf views.
- The menu collects course task counts without counting the same task twice.
- On phones, navigation scrolls within its own row and keeps the active section
  visible. Controls remain usable without horizontal page overflow.

The change reuses existing course components and account permissions. It does
not change scheduling, attendance, rescheduling, billing or grading rules.

The standalone course-navigation verification script checks role-specific views,
aliases and task counts. Browser verification covers navigation, Back/Forward,
filter retention, role restrictions and mobile layouts using local test accounts.
