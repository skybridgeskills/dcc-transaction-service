/// <reference types="vitest/browser" />

// Extend Vitest's expect with DOM matchers for Storybook tests
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): void
    toHaveTextContent(text: string | RegExp): void
    toHaveAttribute(attr: string, value?: string | RegExp): void
    toBeVisible(): void
    toBeDisabled(): void
    toBeEnabled(): void
    toBeRequired(): void
    toHaveValue(value?: string | number | string[]): void
    toHaveFocus(): void
    toBeChecked(): void
    toBePartiallyChecked(): void
    toHaveClass(...classNames: string[]): void
    toHaveAccessibleName(name?: string | RegExp): void
    toHaveAccessibleDescription(description?: string | RegExp): void
    toHaveFormValues(values: Record<string, any>): void
    toHaveDisplayValue(value: string | RegExp | (string | RegExp)[]): void
    toHaveStyle(css: string | Record<string, any>): void
    toBeInvalid(): void
    toBeValid(): void
    toBeEmptyDOMElement(): void
    toContainElement(element: HTMLElement | null): void
    toContainHTML(html: string): void
    toHaveAccessibleErrorMessage(message?: string | RegExp): void
  }
}
