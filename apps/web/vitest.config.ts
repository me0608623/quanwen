import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // Force NODE_ENV=test so React uses development build (required for act() in @testing-library/react).
    // Paperclip agent shell runs with NODE_ENV=production which otherwise breaks all React component tests.
    env: { NODE_ENV: 'test' },
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
