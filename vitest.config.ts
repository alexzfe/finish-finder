import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/lib/utils/**/*',
        'src/lib/database/validation.ts'
      ],
      exclude: [
        'src/lib/**/*.test.ts',
        'src/lib/**/*.spec.ts',
        'src/lib/**/__tests__/**',
        'src/lib/**/__mocks__/**'
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})