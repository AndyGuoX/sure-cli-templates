import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite 8 原生支持 tsconfig 的 paths 解析，不再需要 vite-tsconfig-paths 插件。
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
  },
});
