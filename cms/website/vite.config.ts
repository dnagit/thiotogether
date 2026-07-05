import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
      dts: 'src/auto-imports.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@cms/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['vue', 'vue-router', 'pinia', 'axios'] },
      },
    },
  },
});
