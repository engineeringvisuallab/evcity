import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/500.css';
import '@fontsource/noto-sans-bengali/700.css';
import { Engine } from './core/Engine';
import { bn } from './i18n';

const container = document.getElementById('app');
if (!container) throw new Error('#app element not found');

Engine.create(container)
  .then((engine) => {
    engine.start();
    // Dev only: handy in the browser console, e.g. __engine.camera.position.set(0, 300, 0)
    if (import.meta.env.DEV) (window as unknown as { __engine: Engine }).__engine = engine;
  })
  .catch((err) => {
    console.error(err);
    container.innerHTML = `<pre style="color:#f88;padding:16px">${bn.errors.engineFailed}:\n${String(err)}</pre>`;
  });
