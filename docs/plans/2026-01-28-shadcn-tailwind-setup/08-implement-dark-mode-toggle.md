# Phase 8: Implement Dark Mode Toggle Component

## Scope of phase

Create the ThemeToggle component that allows users to switch between light, dark, and system themes.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Create ThemeToggle component directory**
   - Create `src/lib/components/theme-toggle/` directory

2. **Create ThemeToggle.svelte**
   - Copy the ThemeToggle component from skills-verifier
   - Component should:
     - Support three states: 'light', 'dark', 'system'
     - Toggle between states on click
     - Show appropriate icon (sun/moon) based on resolved theme
     - Use the Button component from shadcn-ui
     - Store preference in localStorage
     - Listen for system preference changes when theme is 'system'

3. **Create index.ts**
   - Export the ThemeToggle component:
     ```typescript
     export { default as ThemeToggle } from './ThemeToggle.svelte';
     ```

4. **Verify component functionality**
   - Component should apply `.dark` class to `<html>` element
   - Component should persist theme preference
   - Component should respond to system preference changes

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm run check
```

Expected results:
- `ThemeToggle.svelte` exists in `src/lib/components/theme-toggle/`
- Component can be imported successfully
- Type checking passes
- Component uses Button component from shadcn-ui
- No linting errors
