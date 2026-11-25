# Classroom and teaching presentation: round 3

This round simplifies classroom, homework and teaching material pages for
administrators, teachers and students.

- A selected classroom uses a compact expandable directory, one identity header
  and a single scrolling row of accessible content tabs.
- Classroom management groups edit, archive and delete actions behind one
  disclosure. Existing permissions, warnings and confirmations remain in place.
- Teaching cards show title, context, dates and instructions before their actions.
- File actions, editing actions, submission history and publishing controls have
  explicit layout groups rather than adjacent ungrouped controls.
- Classroom folder content avoids redundant nested surfaces and empty folder hints.
- Timetable reset controls are separated from summary chips and empty states.

## Spacing for future changes

Use the shared teaching layout rules when adding controls and content:

- Keep ordinary action rows at least 12px apart in either direction, including
  when buttons wrap onto another line. Use `learning-action-row` or existing
  shared action-row classes.
- Separate controls from the next information group by about 20px. Avoid placing
  a button directly beside the following paragraph, statistic or status group.
- Keep related navigation tabs at least 8px apart and touch targets at least 44px.
- Put title and metadata in `learning-record-head`; place actions in their own row.
- Check real populated and empty states on mobile and desktop, including long
  names, translated labels and wrapped controls. Measure gaps and overlap rather
  than relying on an initial loading-screen screenshot.

These changes do not alter course rules, file access, grading or submission logic.
