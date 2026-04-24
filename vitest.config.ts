import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // Node is the default; React component tests opt into jsdom via a
    // `// @vitest-environment jsdom` pragma at the top of the test file.
    environment: 'node',
  },
})
