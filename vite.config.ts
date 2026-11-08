import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import type { Plugin } from 'vite';

/**
 * rapier3d-compat embeds its 3 MB WASM as a 4 MB base64 string inside the JS (slow to download, parse and decode, no caching of the WASM
 * on its own, no streaming compile). Build only: cut the string out, emit it as a hashed .wasm file and let Rapier fetch it
 * (WebAssembly.instantiateStreaming). The dev server keeps the original package behaviour.
 */
function rapierWasmAsFile(): Plugin {
  return {
    name: 'evcity-rapier-wasm-file',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/rapier3d-compat[\\/]dist[\\/]rapier\.mjs/.test(id)) return null;
      const re = /(\w+)\.toByteArray\("([A-Za-z0-9+/=]{100000,})"\)\.buffer/;
      const m = re.exec(code);
      if (!m) {
        this.warn('rapier wasm base64 not found: left inline');
        return null;
      }
      const ref = this.emitFile({ type: 'asset', name: 'rapier.wasm', source: Buffer.from(m[2], 'base64') });
      const name = basename(this.getFileName(ref));
      return { code: code.replace(re, `fetch(new URL(/* @vite-ignore */ ${JSON.stringify(name)}, import.meta.url))`), map: null };
    },
  };
}

export default defineConfig({
  // './' = relative paths, so the build works from any URL, e.g. https://<user>.github.io/<repo-name>/
  base: './',
  worker: { format: 'es' },
  plugins: [rapierWasmAsFile()],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700, // was 2000; the biggest chunks (three, engine) are now ~600 KB
    rolldownOptions: {
      output: {
        // Stable, separately cached vendor chunks (three / rapier change rarely, the game code changes often) that download in parallel.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 30 },
            { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]/, priority: 30 },
            { name: 'vehicles', test: /[\\/]src[\\/]vehicles[\\/]/, priority: 20 },
            { name: 'buildings', test: /[\\/]src[\\/]buildings[\\/]/, priority: 20 },
            { name: 'rail-trains', test: /[\\/]src[\\/](rail|trains)[\\/]/, priority: 20 },
          ],
        },
      },
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        mall: fileURLToPath(new URL('./mall.html', import.meta.url)),
        agro: fileURLToPath(new URL('./agro.html', import.meta.url)),
        farm: fileURLToPath(new URL('./farm.html', import.meta.url)),
      },
    },
  },
});
