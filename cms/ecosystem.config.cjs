/**
 * pm2 process definition for the API.
 *
 * `.cjs` on purpose: pm2 loads this file with `require()`, and it must stay CommonJS
 * even though `api/` is an ES module package.
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'cms-api',
      // Absolute, and derived from this file's own location so `pm2 start` works from
      // any directory. The API reads api/.env through dotenv and resolves UPLOAD_DIR
      // relative to the working directory — both break if cwd is anything but api/.
      cwd: path.join(__dirname, 'api'),
      script: 'dist/api/src/server.js',
      // Single instance: sharp and tesseract are memory-hungry, so scale by raising this
      // only after watching RAM. The API itself is stateless (sessions live in PostgreSQL),
      // so exec_mode 'cluster' with more instances is safe when the box can take it.
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_memory_restart: '512M',
      // server.ts drains connections on SIGTERM and force-exits at 10s; pm2's default
      // 1.6s SIGKILL would cut that short and drop in-flight uploads.
      kill_timeout: 12000,
      merge_logs: true,
      time: true,
    },
  ],
};
