# Phase 11: Update Storybook Configuration

## Scope of phase

Update Storybook's preview.ts to import layout.css and initialize dark mode so components render correctly in stories.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Update .storybook/preview.ts**
   - Import `layout.css` at the top:
     ```typescript
     import '../src/routes/layout.css';
     ```
   - Add dark mode initialization function (copy from skills-verifier):
     - Function should check localStorage for theme preference
     - Should apply `.dark` class to `<html>` based on theme
     - Should handle 'system' theme by checking `prefers-color-scheme`
   - Add immediate initialization (before preview config):
     - Use `typeof window !== 'undefined'` check
     - Call initialization function immediately
     - Set up listener for system preference changes
   - Keep existing preview configuration (decorators, parameters, etc.)

2. **Verify Storybook setup**
   - Ensure layout.css is imported
   - Ensure dark mode initialization works
   - Ensure existing Storybook config is preserved

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm run check
pnpm run storybook  # Start Storybook and verify components render with styles
```

Expected results:
- Storybook preview.ts imports layout.css
- Dark mode initialization works in Storybook
- Components render with Tailwind styles
- Dark mode can be toggled in Storybook
- Type checking passes
