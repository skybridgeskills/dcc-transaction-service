# Phase 2: Install Core Dependencies

## Scope of phase

Install the core utility dependencies required for shadcn-svelte: clsx, tailwind-merge, and tw-animate-css.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Install dependencies**
   ```bash
   pnpm add clsx tailwind-merge tw-animate-css
   ```

2. **Verify installation**
   - Check `package.json` includes the new dependencies
   - Verify versions match skills-verifier:
     - `clsx`: ^2.1.1
     - `tailwind-merge`: ^3.4.0
     - `tw-animate-css`: ^1.4.0

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm install
pnpm run check
```

Expected results:
- Dependencies are listed in `package.json`
- Installation completes without errors
- Type checking passes
