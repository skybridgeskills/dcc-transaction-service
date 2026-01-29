# shadcn-svelte and Tailwind CSS Setup Plan

## Scope of Work

Install and configure Tailwind CSS v4 and shadcn-svelte in the `dcc-transaction-service` app with dark mode support, following the same approach used in the `skills-verifier` app. This includes:

1. Installing Tailwind CSS v4 and required dependencies
2. Installing Tailwind plugins (@tailwindcss/forms, @tailwindcss/typography, @iconify/tailwind4)
3. Installing icon sets (@iconify-json/material-symbols-light, @iconify-json/mdi-light)
4. Installing shadcn-svelte core dependencies (clsx, tailwind-merge, tw-animate-css)
5. Configuring shadcn-svelte with components.json
6. Setting up Tailwind CSS v4 configuration in layout.css with dark mode theme variables
7. Creating utility functions (cn helper)
8. Adding initial shadcn components (Button, Card, Input, Label, Badge)
9. Implementing dark mode toggle component
10. Integrating dark mode initialization into layout to prevent flash
11. Updating Vite config to include Tailwind plugin
12. Configuring ESLint exceptions for shadcn-svelte components

## Current State of Codebase

### Project Structure
- **Framework**: SvelteKit (using Svelte 5)
- **Build tool**: Vite
- **Package manager**: npm (based on package.json, no pnpm-lock.yaml visible)
- **Current dependencies**: No Tailwind or shadcn dependencies installed
- **Layout**: Basic `+layout.svelte` with minimal content
- **No CSS framework**: No existing CSS framework or styling system detected

### Key Files
- `vite.config.ts`: Basic Vite config with sveltekit plugin only
- `svelte.config.js`: Basic SvelteKit config with adapter-node
- `src/routes/+layout.svelte`: Minimal layout component
- `src/app.html`: Basic HTML template
- No `layout.css` file exists yet
- No `components.json` file exists yet
- No `src/lib/utils.ts` file exists yet

### Component Structure
- Components are located in `src/lib/components/`
- Uses Storybook for component testing
- Components include: CredentialPreview, ErrorDisplay, ExchangeStatusPoll, LoadingIndicator, WalletSelector

### Reference Implementation
The `skills-verifier` app has a complete shadcn-svelte setup with:
- Tailwind CSS v4 via `@tailwindcss/vite` plugin
- shadcn-svelte components configured with Zinc color scheme
- Dark mode support with system preference detection
- Theme toggle component
- Layout CSS with theme variables and Tailwind v4 configuration
- Utility functions in `src/lib/utils.ts`

## Questions

### Q1: Package Manager
**Question**: Should we use npm or pnpm for this project? The `skills-verifier` uses pnpm, but `dcc-transaction-service` appears to use npm (no pnpm-lock.yaml visible).

**Context**: The reference implementation uses pnpm, but we should match the existing project's package manager preference.

**Answer**: Use pnpm to match the reference implementation and for consistency across projects.

### Q2: Component Registry
**Question**: Should we use the default shadcn-svelte registry (`https://shadcn-svelte.com/registry`) or a custom one?

**Context**: The reference implementation uses the default registry. The user mentioned "same default component registry as that project."

**Answer**: Use the default registry: `https://shadcn-svelte.com/registry`

### Q3: Initial Components
**Question**: Which shadcn components should we install initially? The reference implementation includes Button, Card, Input, Label, and Badge.

**Context**: We should start with a core set that matches the reference, but may want to add more based on existing components in the project.

**Answer**: Install Button, Card, Input, Label, and Badge initially to match the reference implementation. We can add more components as needed.

### Q4: Color Scheme
**Question**: Should we use the Zinc color scheme (as in the reference) or a different one?

**Context**: The reference uses Zinc, which is a neutral gray color scheme that works well for most applications.

**Answer**: Use Zinc color scheme to match the reference implementation.

### Q5: Dark Mode Toggle Placement
**Question**: Where should the dark mode toggle component be placed? Should it be added to the layout immediately or created as a separate component first?

**Context**: The reference has a ThemeToggle component that can be placed anywhere. We may want to add it to the layout or create it for future use.

**Answer**: Create the ThemeToggle component and add it to the layout immediately.

### Q6: ESLint Configuration
**Question**: Should we add ESLint exceptions for shadcn-svelte components navigation rule, similar to the reference?

**Context**: The reference adds an exception for `@typescript-eslint/naming-convention` to allow shadcn component naming patterns.

**Answer**: Yes, add the ESLint exception to match the reference implementation.

### Q7: Storybook Integration
**Question**: Should we update Storybook configuration to support Tailwind CSS and dark mode?

**Context**: The project uses Storybook for component testing. We should ensure Storybook can render components with Tailwind styles.

**Answer**: Yes, update Storybook preview.ts to:
- Import `layout.css` to load Tailwind styles
- Add dark mode initialization based on system preference (matching skills-verifier approach)
- Keep the existing `viteFinal` hook in main.ts as it's project-specific

### Q8: Existing Components
**Question**: Should we migrate existing components (CredentialPreview, ErrorDisplay, LoadingIndicator, etc.) to use Tailwind/shadcn styles, or leave them as-is for now?

**Context**: The scope is to set up the infrastructure. Migrating existing components could be a separate task.

**Answer**: Leave existing components as-is for now. Focus on setting up the infrastructure. Add a phase to upgrade existing components after the basic shadcn components are set up.
