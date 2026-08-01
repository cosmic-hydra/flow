import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@flow/contracts': `${root}packages/contracts/src/index.ts`,
      '@flow/config': `${root}packages/config/src/index.ts`,
      '@flow/core': `${root}packages/core/src/index.ts`,
      '@flow/db': `${root}packages/db/src/index.ts`,
      '@flow/providers': `${root}packages/providers/src/index.ts`,
      '@flow/ai': `${root}packages/ai/src/index.ts`,
      '@flow/runtime': `${root}packages/runtime/src/index.ts`,
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
