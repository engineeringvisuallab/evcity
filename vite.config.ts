import { defineConfig } from 'vite';

export default defineConfig({
  // './' = relative paths, so the build works from any URL, e.g. https://<user>.github.io/<repo-name>/
  base: './',
  worker: { format: 'es' },
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
