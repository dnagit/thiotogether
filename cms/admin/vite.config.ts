import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import path from 'node:path';

export default defineConfig({
  plugins: [
    vue(),
    // Auto-import Vue APIs + Element Plus components (tree-shaken, on-demand).
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@cms/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  build: {
    // Vendor chunking for long-term caching.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia', 'axios'],
          element: ['element-plus'],
        },
      },
    },
  },
});
