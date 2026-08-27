import { defineConfig } from 'vite';

export default defineConfig({
  // Относительная база: собранную папку dist можно открыть откуда угодно.
  base: './',
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
