# Phase 7: Add Initial shadcn Components

## Scope of phase

Install the initial set of shadcn-svelte components: Button, Card, Input, Label, and Badge.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Install shadcn-svelte CLI** (if needed)
   - The components will be installed using the shadcn-svelte CLI
   - Ensure npx is available or install the CLI globally

2. **Install Button component**
   ```bash
   npx shadcn-svelte@latest add button
   ```
   - This will create `src/lib/components/ui/button/button.svelte` and `index.ts`

3. **Install Card component**
   ```bash
   npx shadcn-svelte@latest add card
   ```
   - This will create card component files in `src/lib/components/ui/card/`

4. **Install Input component**
   ```bash
   npx shadcn-svelte@latest add input
   ```
   - This will create `src/lib/components/ui/input/input.svelte` and `index.ts`

5. **Install Label component**
   ```bash
   npx shadcn-svelte@latest add label
   ```
   - This will create `src/lib/components/ui/label/label.svelte` and `index.ts`

6. **Install Badge component**
   ```bash
   npx shadcn-svelte@latest add badge
   ```
   - This will create `src/lib/components/ui/badge/badge.svelte` and `index.ts`

7. **Verify component structure**
   - Check that all components are in `src/lib/components/ui/`
   - Verify each component has its `.svelte` file and `index.ts` export
   - Ensure components use the `cn()` utility from `$lib/utils`

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm run check
```

Expected results:
- All five components exist in `src/lib/components/ui/`
- Each component can be imported successfully
- Type checking passes
- Components use Tailwind classes correctly
