import { defineConfig, loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import path from 'node:path';

/**
 * Substitute the `%SITE_*%` placeholders in index.html.
 *
 * Vite's own `%VITE_X%` interpolation leaves the literal placeholder in the
 * output when the variable is unset, which would ship `%SITE_NAME%` as the page
 * title. Doing it here keeps a defined default for every placeholder.
 */
function siteMeta(env: Record<string, string>): Plugin {
  const values: Record<string, string> = {
    SITE_NAME: env.VITE_SITE_NAME || 'THI-O TOGETHER',
    SITE_DESCRIPTION: env.VITE_SITE_DESCRIPTION || '',
    SITE_IMAGE: env.VITE_SITE_IMAGE || '',
    SITE_URL: env.VITE_SITE_URL || '',
  };
  return {
    name: 'cms-site-meta',
    transformIndexHtml(html) {
      return (
        html
          .replace(/%(SITE_[A-Z_]+)%/g, (match, key: string) =>
            key in values ? escapeAttr(values[key]) : match,
          )
          // An unset value must drop its tag, not ship `content=""`: scrapers
          // read an empty og:image as "there is an image" and render a blank
          // thumbnail rather than falling back to their own default.
          .replace(/^\s*<meta [^>]*content=""\s*\/?>\r?\n/gm, '')
      );
    },
  };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  return {
    plugins: [
      vue(),
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
        dts: 'src/auto-imports.d.ts',
      }),
      siteMeta(env),
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
  };
});
