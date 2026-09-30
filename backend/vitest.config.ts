import { defineConfig } from 'vitest/config';

// Unit tests: live next to the code, never touch the database.
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});
