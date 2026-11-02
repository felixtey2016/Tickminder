# Horizontal menu refinement

Test-site UI only. The shared `HorizontalMenu` applies the existing classroom interaction to other horizontally scrolling content menus: users can swipe or use left/right buttons, without a visible scrollbar. Arrows appear only when the row overflows and disable at each boundary. Existing classroom arrows remain in place.

Covered surfaces: Quiz library and moderation, teaching resources, course navigation, personnel/settings navigation, the desktop finance menu, payroll and prepayment sections, parent teaching and parent finance menus. Mobile finance/settings selectors retain their current behavior. Tables, calendars, formula blocks and vertical question lists are unchanged.

The component retains each menu's element, refs, event handlers, selection semantics and permission filtering. Arrows scroll the bounded menu rather than the document. Selecting a different item, keyboard focus and viewport resizing keep the item visible. An unrelated parent refresh does not reset a user's manual horizontal position. Dynamic children and available width update the arrow states; reduced-motion users receive immediate scrolling. Both themes use existing UI tokens.

Validation uses local fictional data at 320, 390 and 1280 pixels in Chinese/English and light/dark themes, plus type checking. It covers arrow boundaries, swipe-compatible native scrolling, focus, dynamic item removal/addition, resizing, hidden scrollbars, no document overflow and no vertical jump on arrow activation. Production and business data are not changed by these checks.
