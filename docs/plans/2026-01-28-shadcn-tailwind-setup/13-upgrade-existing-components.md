# Phase 13: Upgrade Existing Components

## Scope of phase

Migrate existing components (CredentialPreview, ErrorDisplay, LoadingIndicator, WalletSelector, etc.) to use Tailwind CSS and shadcn-svelte components where appropriate.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Review existing components**
   - List all components that need updating:
     - `CredentialPreview`
     - `ErrorDisplay`
     - `LoadingIndicator`
     - `WalletSelector`
     - `ExchangeStatusPoll`
     - `OpenBadge` (in credentials folder)
   - Identify which components can use shadcn components (Card, Button, Badge, etc.)
   - Identify which components need Tailwind styling

2. **Update components one by one**
   - Start with simpler components first
   - Replace inline styles or CSS classes with Tailwind classes
   - Use shadcn components where appropriate (e.g., Card for containers, Button for buttons)
   - Ensure components work in both light and dark modes
   - Update component stories if needed

3. **Update component stories**
   - Ensure stories still work after migration
   - Add dark mode variants if helpful
   - Verify components render correctly in Storybook

4. **Test components**
   - Verify visual appearance matches or improves upon original
   - Verify functionality is preserved
   - Verify dark mode support works correctly

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm run check
pnpm run test
pnpm run storybook  # Verify all stories still work
```

Expected results:
- All components use Tailwind classes
- Components use shadcn components where appropriate
- Components support dark mode
- All tests pass
- All stories render correctly
- Type checking passes
- No linting errors
