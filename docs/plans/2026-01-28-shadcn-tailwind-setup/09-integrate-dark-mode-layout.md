# Phase 9: Integrate Dark Mode into Layout

## Scope of phase

Update the `src/routes/+layout.svelte` file to initialize dark mode and include the ThemeToggle component.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Update +layout.svelte**
   - Import `layout.css` at the top
   - Import ThemeToggle component
   - Add dark mode initialization logic:
     - Use `onMount` to initialize theme from localStorage or system preference
     - Apply `.dark` class to `<html>` element based on theme
   - Add inline script in `<svelte:head>` to prevent flash of unstyled content:
     - Script should run immediately (before page render)
     - Should check localStorage for theme preference
     - Should apply `.dark` class if needed
   - Add ThemeToggle component to the layout (can be placed in a header or navigation area)

2. **Verify layout structure**
   - Ensure `layout.css` is imported
   - Ensure theme initialization happens before render
   - Ensure ThemeToggle is visible and functional

3. **Test dark mode functionality**
   - Verify no flash of unstyled content on page load
   - Verify theme persists across page reloads
   - Verify system preference detection works
   - Verify ThemeToggle changes theme correctly

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm run check
pnpm run dev  # Start dev server and manually test dark mode
```

Expected results:
- Layout imports `layout.css`
- Layout includes ThemeToggle component
- Theme initialization works correctly
- No flash of unstyled content
- Type checking passes
