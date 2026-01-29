# Phase 12: Update ESLint Configuration

## Scope of phase

Add ESLint exception for shadcn-svelte component naming conventions to match the reference implementation.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Read current eslint.config.js**
   - Check the current ESLint configuration structure
   - Identify where to add the exception

2. **Add naming convention exception**
   - Add exception for `@typescript-eslint/naming-convention` rule
   - Exception should allow shadcn component naming patterns
   - Pattern should match: `src/lib/components/ui/**/*.svelte`
   - Example (from skills-verifier):
     ```javascript
     {
       files: ['src/lib/components/ui/**/*.svelte'],
       rules: {
         '@typescript-eslint/naming-convention': 'off'
       }
     }
     ```

3. **Verify ESLint configuration**
   - Ensure exception is correctly formatted
   - Ensure it doesn't break existing rules
   - Check that shadcn components won't trigger naming convention errors

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm run lint
pnpm run check
```

Expected results:
- ESLint config includes exception for shadcn components
- Linting passes without naming convention errors for shadcn components
- Existing linting rules still work
- Type checking passes
