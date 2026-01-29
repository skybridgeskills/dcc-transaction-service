# Phase 3: Install Tailwind CSS v4 and Plugins

## Scope of phase

Install Tailwind CSS v4, the Vite plugin, and all required Tailwind plugins and dependencies.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Install Tailwind CSS v4 and Vite plugin**
   ```bash
   pnpm add -D tailwindcss@^4.1.17 @tailwindcss/vite@^4.1.17
   ```

2. **Install Tailwind plugins**
   ```bash
   pnpm add -D @tailwindcss/forms@^0.5.11 @tailwindcss/typography@^0.5.19 @iconify/tailwind4@^1.2.1
   ```

3. **Install component dependencies**
   ```bash
   pnpm add -D tailwind-variants@^3.2.2 bits-ui@^2.15.4
   ```

4. **Install icon sets**
   ```bash
   pnpm add -D @iconify-json/material-symbols-light@^1.2.53 @iconify-json/mdi-light@^1.2.2
   ```

5. **Verify installation**
   - Check `package.json` includes all new devDependencies
   - Verify versions match skills-verifier

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm install
pnpm run check
```

Expected results:
- All dependencies are listed in `package.json` under `devDependencies`
- Installation completes without errors
- Type checking passes
