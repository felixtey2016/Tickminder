# Custom selection panels

Test-site UI change based on the approved teacher-picker preview. Production deployment is excluded.

`AppSelectHost` presents existing single-choice select fields in a shared custom panel: a bottom sheet on narrow screens and an anchored panel on desktop. Long lists include local search. Selected rows use the established theme color, a restrained background, and a check. Titles, close controls, empty states, grouped options and keyboard focus use the current language and appearance.

The original form controls stay in place. Their values, names, required checks, disabled fieldsets and existing React change handlers remain authoritative. Selection dispatches input/change only when the value actually changes; dismissing the panel keeps the current value. Related-field updates refresh the open list, and removed or disabled controls close it. Multi-selects, listboxes and explicitly opted-out fields retain their original interaction. Existing asynchronous person-search components are unaffected.

Nested Radix dialogs and native financial dialogs retain their own state when the selection panel closes. Native-dialog portals stay inside the top-layer dialog. Escape is handled by the active selector before the enclosing form; focus returns to the original control when it remains available. Mobile search accounts for the visual viewport when the keyboard opens. Pointer selection uses the approved soft highlight; keyboard navigation also shows a focus outline.

Mobile bottom navigation returns after the panel closes, even when focus is restored to the select. Text entry, the software keyboard and active editing forms continue to hide it. Input-method composition confirms search text without accidentally selecting an option.

The approved refinement gives every option a rounded border with 8px spacing; selected options retain a restrained purple border, background and check. Closed single-choice fields use a round-stroke SVG chevron, inset 18px from the edge with reserved text space. Compact language fields use a smaller icon and enough width for their labels. Light/dark themes, existing field backgrounds, disabled states and focus styles are preserved. Multi-selects, listboxes and opted-out fields retain their indicators; native-select components keep their existing SVG without a duplicate. Forced-colors mode restores the native indicator.

No API, database, permission, billing, authentication or external-service configuration changes are included. Validation uses fictional local data and covers controlled/uncontrolled forms, dependent fields, mobile touch, keyboard navigation, required/reset behavior, nested dialogs, labels, light/dark themes and narrow/desktop layouts. Browser simulations do not replace physical-device testing.
