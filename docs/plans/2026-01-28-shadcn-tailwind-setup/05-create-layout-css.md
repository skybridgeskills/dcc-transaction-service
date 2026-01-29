# Phase 5: Create layout.css with Tailwind v4 Config

## Scope of phase

Create the `src/routes/layout.css` file with Tailwind CSS v4 configuration, theme variables, and base styles.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Create layout.css file**
   - Create `src/routes/layout.css`
   - Copy the complete layout.css from skills-verifier (from commit e99cc23)
   - File should include:
     - Tailwind imports (`@import 'tailwindcss'`, `@import 'tw-animate-css'`)
     - Plugin imports (`@plugin` directives)
     - Custom dark variant definition
     - CSS variables for light theme (`:root`)
     - CSS variables for dark theme (`.dark`)
     - Tailwind theme configuration (`@theme inline`)
     - Base layer styles (`@layer base`)

2. **Verify the file structure**
   - Ensure all imports are correct
   - Verify Zinc color scheme values match reference
   - Check that dark mode variables are properly defined

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm run check
```

Expected results:
- `src/routes/layout.css` file exists
- File contains all required Tailwind imports and theme variables
- Type checking passes
- No syntax errors in CSS
