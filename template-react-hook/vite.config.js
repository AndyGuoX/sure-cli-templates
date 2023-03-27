import path from 'path';
import { defineConfig, loadEnv, splitVendorChunkPlugin } from 'vite';
import react from '@vitejs/plugin-react';
import vitePluginImp from 'vite-plugin-imp';
import legacy from '@vitejs/plugin-legacy';
import { getBabelOutputPlugin } from '@rollup/plugin-babel';
import eslint from '@rollup/plugin-eslint';

/**
 * 修改html title
 * @param {String} title
 * @returns
 */
const htmlTitlePlugin = (title) => ({
  name: 'html-transform',
  transformIndexHtml(html) {
    return html.replace(/<title>(.*?)<\/title>/, `<title>${title}</title>`);
  }
});

// https://vitejs.dev/config/

// eslint-disable-next-line no-unused-vars
export default defineConfig(({ command, mode }) => {
  const VITE_ENV = loadEnv(mode, process.cwd());
  const isProduction = mode === 'production';
  const basePath = isProduction ? '/' : './';

  return {
    // 设置CDN路径
    base: basePath,
    build: {
      manifest: false,
      outDir: 'dist',
      assetsDir: 'assets',
      commonjsOptions: {
        transformMixedEsModules: true
      },
      rollupOptions: {
        output: {
          manualChunks() {
            return 'index';
          },
          entryFileNames: `assets/[name].js`,
          chunkFileNames: `assets/[name].js`,
          assetFileNames: `assets/[name].[ext]`
        }
      }
    },
    server: {
      host: '0.0.0.0'
    },
    // 设置别名
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    plugins: [
      {
        ...eslint({
          include: '**/*.+(js|jsx|ts|tsx)' // FIX:https://github.com/vitejs/vite/issues/1549
        }),
        enforce: 'pre'
      },
      react(),
      //设置兼容性
      legacy({
        targets: ['> 1%', 'last 2 versions', 'ie >= 11'],
        additionalLegacyPolyfills: ['regenerator-runtime/runtime']
      }),
      vitePluginImp({
        libList: [
          {
            libName: 'antd',
            style: (name) => `antd/es/${name}/style`
          }
        ]
      }),
      // 设置babel插件
      getBabelOutputPlugin({
        allowAllFormats: true,
        configFile: path.resolve(__dirname, 'babel.config.js')
      }),
      // 修改title
      htmlTitlePlugin(VITE_ENV.VITE_APP_TITLE),
      splitVendorChunkPlugin()
    ]
  };
});
