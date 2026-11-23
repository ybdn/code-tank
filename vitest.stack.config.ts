import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['tests/stack/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 120_000, fileParallelism: false } })
