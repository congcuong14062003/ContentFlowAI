import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } },
  test: { include: ['apps/**/*.spec.ts', 'packages/**/*.spec.ts'], testTimeout: 15000 }
});
