# Phase 14: Cleanup and Validation

## Scope of phase

Remove any temporary code, run full validation, fix warnings, and prepare for commit.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Search for temporary code**
   - Grep for TODO comments related to this work
   - Search for console.log statements
   - Look for commented-out code
   - Check for debug code

2. **Remove temporary code**
   - Remove any TODO comments that are no longer relevant
   - Remove debug statements
   - Clean up commented code
   - Remove any test files that were temporary

3. **Run full validation**
   - Run type checking: `pnpm run check`
   - Run linting: `pnpm run lint`
   - Run tests: `pnpm run test`
   - Run build: `pnpm run build`
   - Run Storybook build: `pnpm run build:storybook`

4. **Fix warnings and errors**
   - Fix any TypeScript errors
   - Fix any linting errors
   - Fix any test failures
   - Fix any build errors
   - Address any warnings that should be fixed

5. **Verify dark mode works**
   - Test theme toggle functionality
   - Verify no flash of unstyled content
   - Test system preference detection
   - Verify theme persists across reloads

6. **Verify Storybook works**
   - Start Storybook and verify components render
   - Test dark mode in Storybook
   - Verify all stories work correctly

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm run check
pnpm run lint
pnpm run test
pnpm run build
pnpm run build:storybook
```

Expected results:
- No TypeScript errors
- No linting errors
- All tests pass
- Build completes successfully
- Storybook build completes successfully
- No temporary code remains
- Dark mode works correctly
- All components render correctly
