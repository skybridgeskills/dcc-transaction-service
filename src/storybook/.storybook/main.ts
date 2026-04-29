import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../../ui/**/*.stories.@(ts|tsx)'],
  framework: '@storybook/react-vite',
  core: {
    disableTelemetry: true
  }
}

export default config
