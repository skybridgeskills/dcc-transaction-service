# Phase 6: Create Utility Functions

## Scope of phase

Create the `src/lib/utils.ts` file with the `cn()` helper function and type utilities.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Create src/lib/utils.ts**
   - Create the file if it doesn't exist
   - Add the `cn()` function that combines `clsx` and `tailwind-merge`:
     ```typescript
     import { clsx, type ClassValue } from 'clsx';
     import { twMerge } from 'tailwind-merge';

     export function cn(...inputs: ClassValue[]) {
       return twMerge(clsx(inputs));
     }
     ```

2. **Add type utilities** (matching skills-verifier)
   - Add type utilities for component props:
     ```typescript
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
     export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
     export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
     ```

3. **Verify exports**
   - Ensure all functions and types are exported
   - Check that imports work correctly

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm run check
```

Expected results:
- `src/lib/utils.ts` file exists
- `cn()` function is exported and can be imported
- Type utilities are exported
- Type checking passes
- No linting errors
