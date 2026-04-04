import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/mcp-integration.vitest.ts'],
    testTimeout: 15000,
    bail: 1,
  },
});
