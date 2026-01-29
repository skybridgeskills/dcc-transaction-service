# Phase 4: Initialize shadcn-svelte Configuration

## Scope of phase

Create the `components.json` configuration file for shadcn-svelte with Zinc color scheme and default registry.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Create components.json**
   - Create file at project root: `components.json`
   - Use the same configuration as skills-verifier:
     ```json
     {
       "$schema": "https://shadcn-svelte.com/schema.json",
       "tailwind": {
         "css": "src/routes/layout.css",
         "baseColor": "zinc"
       },
       "aliases": {
         "lib": "$lib",
         "utils": "$lib/utils",
         "components": "$lib/components",
         "ui": "$lib/components/ui",
         "hooks": "$lib/hooks"
       },
       "typescript": true,
       "registry": "https://shadcn-svelte.com/registry"
     }
     ```

2. **Verify configuration**
   - Ensure file is valid JSON
   - Verify paths match project structure
   - Note that `layout.css` doesn't exist yet (will be created in next phase)

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
cat components.json | jq .  # Verify JSON is valid
pnpm run check
```

Expected results:
- `components.json` file exists at project root
- JSON is valid
- Type checking passes (may have warnings about missing layout.css, which is expected)
