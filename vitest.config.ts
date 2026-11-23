import { defineConfig } from 'vitest/config'

// Les tests contre la pile locale ont leur propre configuration (pnpm test:stack).
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/stack/**'], testTimeout: 120_000, hookTimeout: 300_000 },
})
