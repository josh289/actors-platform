import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'node_modules/**',
      'dist/**',
      // Exclude component tests that require testing libraries
      'src/tests/components/**',
    ],
  },
});