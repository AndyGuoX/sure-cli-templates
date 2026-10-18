import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // @/ → src/。必须与 tsconfig.app.json 的 compilerOptions.paths 保持一致。
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    // xfwd：代理时补上 X-Forwarded-For，否则后端 @Ip() 看到的是 vite 自己（回环）。
    proxy: { '/api': { target: 'http://localhost:3100', xfwd: true } },
  },
});
