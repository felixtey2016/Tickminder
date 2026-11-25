# Shared control and section refinements

Scope: the existing UI preview branch and `tuition.tickminder.com`. No production release, API changes, database migration, or business-record changes.

- Course completion and filter controls share a 48px height and bottom alignment. The old completion-label margin is removed inside the shared toolbar; narrow layouts wrap rather than squeeze controls.
- Mobile lesson cards retain grid layout and 12px between their date divider and lesson content. Long titles and status badges can wrap without touching each other.
- Sidebar destinations have subtle rounded borders; navigation groups have separators. Existing permissions, destinations, badges, and keyboard focus remain intact.
- Finance drilldowns separate the heading/scope from a bordered totals section. Programmatic pointer focus no longer makes a heading look like a form control; keyboard focus remains visible.
- The shared month field opens a themed twelve-month picker: a bottom sheet on phones and a centered dialog on desktops. Year arrows and numeric entry support distant months. Selecting a month applies it; cancel leaves the value unchanged; optional fields can be cleared. The original month input retains form values, validation, and React change handlers.

Validation covers English/Chinese, light/dark themes, narrow phone and desktop layouts, custom-select regression, keyboard/touch interaction, month constraints and form reset, and isolated Worker pages for admin, teacher, student, and parent roles. Tests use fictional data; release verification checks the test Worker and published asset hashes.
