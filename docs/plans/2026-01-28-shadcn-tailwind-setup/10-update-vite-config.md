# Phase 10: Update Vite Configuration

## Scope of phase

Add the `@tailwindcss/vite` plugin to the Vite configuration so Tailwind CSS is processed correctly.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Update vite.config.ts**
   - Import `tailwindcss` from `@tailwindcss/vite`
   - Add `tailwindcss()` plugin to the plugins array
   - Ensure it's added before `sveltekit()` plugin (order matters)
   - Example:
     ```typescript
     import tailwindcss from '@tailwindcss/vite';
     import { sveltekit } from '@sveltejs/kit/vite';
     import { defineConfig } from 'vite';

     export default defineConfig({
       plugins: [tailwindcss(), sveltekit()]
     });
     ```

2. **Verify configuration**
   - Ensure plugin is imported correctly
   - Ensure plugin order is correct
   - Check that vite.config.ts still exports a valid config

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm run check
pnpm run build  # Verify build works with Tailwind
```

Expected results:
- `vite.config.ts` includes `tailwindcss()` plugin
- Build completes successfully
- Tailwind styles are processed correctly
- Type checking passes
