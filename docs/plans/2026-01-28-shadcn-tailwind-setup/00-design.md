# shadcn-svelte and Tailwind CSS Setup Design

## Scope of Work

Install and configure Tailwind CSS v4 and shadcn-svelte in the `dcc-transaction-service` app with dark mode support, following the same approach used in the `skills-verifier` app.

## File Structure

```
dcc-transaction-service/
├── components.json                                    # NEW: shadcn-svelte configuration
├── package.json                                       # UPDATE: Add Tailwind and shadcn dependencies
├── pnpm-lock.yaml                                     # NEW: pnpm lockfile (migrate from npm)
├── vite.config.ts                                     # UPDATE: Add @tailwindcss/vite plugin
├── eslint.config.js                                   # UPDATE: Add ESLint exception for shadcn components
├── .storybook/
│   └── preview.ts                                     # UPDATE: Import layout.css and add dark mode init
└── src/
    ├── routes/
    │   ├── +layout.svelte                             # UPDATE: Add dark mode init and ThemeToggle
    │   └── layout.css                                  # NEW: Tailwind v4 config with theme variables
    └── lib/
        ├── utils.ts                                    # NEW: cn() utility function
        └── components/
            ├── theme-toggle/
            │   ├── ThemeToggle.svelte                  # NEW: Dark mode toggle component
            │   └── index.ts                            # NEW: Export
            └── ui/                                      # NEW: shadcn components directory
                ├── button/
                │   ├── button.svelte                   # NEW: Button component
                │   └── index.ts                        # NEW: Export
                ├── card/
                │   ├── card.svelte                     # NEW: Card component
                │   ├── card-action.svelte              # NEW: Card action component
                │   ├── card-content.svelte             # NEW: Card content component
                │   ├── card-description.svelte         # NEW: Card description component
                │   ├── card-footer.svelte              # NEW: Card footer component
                │   ├── card-header.svelte              # NEW: Card header component
                │   ├── card-title.svelte               # NEW: Card title component
                │   └── index.ts                        # NEW: Export
                ├── input/
                │   ├── input.svelte                    # NEW: Input component
                │   └── index.ts                        # NEW: Export
                ├── label/
                │   ├── label.svelte                    # NEW: Label component
                │   └── index.ts                        # NEW: Export
                └── badge/
                    ├── badge.svelte                    # NEW: Badge component
                    └── index.ts                        # NEW: Export
```

## Conceptual Architecture

### Tailwind CSS v4 Integration
- Uses `@tailwindcss/vite` plugin for Vite integration
- Configuration via CSS file (`layout.css`) using Tailwind v4's new CSS-first approach
- Plugins: `@tailwindcss/forms`, `@tailwindcss/typography`, `@iconify/tailwind4`
- Custom dark mode variant using `@custom-variant dark (&&:is(.dark *))`

### Theme System
```
┌─────────────────────────────────────┐
│  System Preference / localStorage   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  ThemeToggle Component              │
│  - Manages theme state              │
│  - Applies .dark class to <html>    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Layout Component                    │
│  - Initializes theme on mount        │
│  - Prevents flash with inline script │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  CSS Variables (:root / .dark)      │
│  - Zinc color scheme                 │
│  - Theme-aware colors                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Tailwind Theme Config              │
│  - Maps CSS vars to Tailwind colors │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  shadcn Components                  │
│  - Use Tailwind classes              │
│  - Theme-aware styling              │
└─────────────────────────────────────┘
```

### Component Structure
- **shadcn-svelte components**: Installed via CLI, placed in `src/lib/components/ui/`
- **Each component**: Has its own directory with `.svelte` file and `index.ts` export
- **Utility functions**: `cn()` helper in `src/lib/utils.ts` for class merging
- **Theme toggle**: Standalone component that can be placed anywhere

### Storybook Integration
- Imports `layout.css` in `preview.ts` to load Tailwind styles
- Initializes dark mode based on system preference
- Ensures components render correctly with proper styling

## Main Components and Interactions

1. **Vite Configuration**: Adds `@tailwindcss/vite` plugin to process CSS
2. **Layout CSS**: Contains Tailwind imports, plugins, theme variables, and base styles
3. **Layout Component**: Initializes theme and prevents flash of unstyled content
4. **ThemeToggle**: User-facing component to switch between light/dark/system themes
5. **shadcn Components**: Reusable UI components that use Tailwind classes and theme variables
6. **Utility Functions**: `cn()` helper for conditional class merging
7. **Storybook**: Configured to load styles and support dark mode in stories

## Dependencies

### Core Dependencies
- `clsx`: Class name utility
- `tailwind-merge`: Merge Tailwind classes intelligently
- `tw-animate-css`: Tailwind animation utilities

### Tailwind & Plugins
- `tailwindcss`: ^4.1.17
- `@tailwindcss/vite`: ^4.1.17
- `@tailwindcss/forms`: ^0.5.11
- `@tailwindcss/typography`: ^0.5.19
- `@iconify/tailwind4`: ^1.2.1
- `tailwind-variants`: ^3.2.2 (used by shadcn components)

### Component Libraries
- `bits-ui`: ^2.15.4 (headless UI primitives used by shadcn-svelte)

### Icon Sets
- `@iconify-json/material-symbols-light`: ^1.2.53
- `@iconify-json/mdi-light`: ^1.2.2

### Package Manager
- Migrate from npm to pnpm
