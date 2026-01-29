# Phase 1: Migrate to pnpm

## Scope of phase

Set up pnpm as the package manager for the project and migrate from npm.

## Code Organization Reminders

- Prefer a granular file structure, one concept per file.
- Place more abstract things, entry points, and tests **first**
- Place helper utility functions **at the bottom** of files.
- Keep related functionality grouped together
- Any temporary code should have a TODO comment so we can find it later.

## Implementation Details

1. **Install pnpm** (if not already installed globally)

   - Verify pnpm is available: `pnpm --version`
   - If not installed, install it: `npm install -g pnpm`

2. **Initialize pnpm in the project**

   - Run `pnpm install` to create `pnpm-lock.yaml`
   - This will read existing `package.json` and create the lockfile

3. **Update .gitignore** (if needed)

   - Ensure `pnpm-lock.yaml` is tracked (it should be committed and removed from gitignore)
   - Ensure `node_modules/` is ignored

4. **Remove npm artifacts** (if any)

   - Remove `package-lock.json` if it exists
   - Remove `node_modules/` and reinstall with pnpm

5. **Add packageManager field to package.json**

   - Add `"packageManager": "pnpm@10.22.0"` to match skills-verifier

6. **Verify installation**
   - Run `pnpm install` to ensure everything works
   - Verify `pnpm-lock.yaml` was created

## Validate

Run the following commands to validate:

```bash
cd /Users/notto/Projects/skybridgeskills/dcc/dcc-transaction-service
pnpm install
pnpm run check
```

Expected results:

- `pnpm-lock.yaml` file exists
- `package.json` includes `packageManager` field
- No `package-lock.json` file
- All dependencies install successfully
- Type checking passes
