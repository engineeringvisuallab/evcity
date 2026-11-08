// Only the two subsets the game really uses (Bengali + basic Latin) of the three weights: no latin-ext / math / symbol faces and no unused unicode-range rules.
import '@fontsource/noto-sans-bengali/bengali-400.css';
import '@fontsource/noto-sans-bengali/bengali-500.css';
import '@fontsource/noto-sans-bengali/bengali-700.css';
import '@fontsource/noto-sans-bengali/latin-400.css';
import '@fontsource/noto-sans-bengali/latin-500.css';
import '@fontsource/noto-sans-bengali/latin-700.css';
import type { Engine } from './core/Engine';
import { bn } from './i18n';
import { Splash } from './ui/Splash';
import { Watermark } from './ui/Watermark';
import { initQuality } from './core/Quality';
import { trackAudioContexts } from './core/Lifecycle';

const container = document.getElementById('app');
if (!container) throw new Error('#app element not found');

// Graphics preset (phone / tablet / PC, Chrome / Safari): must run BEFORE the engine modules are imported (they read LOD, shadow and fog numbers).
initQuality();

// Logo splash shows immediately and stays until the engine is ready.
const splash = new Splash();

// Remember every AudioContext the game creates (so they can be paused while the tab is hidden); must run before any game code.
trackAudioContexts();

// The regular weight is used by the HUD: start loading it now (500 / 700 are loaded by Engine.prepare()).
void document.fonts.load('400 16px "Noto Sans Bengali"', 'কখগ').catch(() => undefined);

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 30)); // lets the browser paint the new splash progress

// The engine chunk starts downloading at once (overlapping with the logo intro; the splash animation is CSS-only and keeps running), and as soon as it has
// arrived Engine.prepare() starts the Rapier WASM, fonts and catalog. The heavy part (renderer, world) waits for the intro to finish.
const prepared = import('./core/Engine').then(({ Engine }) => {
  splash.setStage(0.3, 'ফিজিক্স ও ফন্ট লোড হচ্ছে…');
  return { Engine, prep: Engine.prepare() };
});

Promise.all([prepared, splash.introDone])
  .then(async ([{ Engine, prep }]) => {
    await prep.ready;
    splash.setStage(0.45, 'শহর তৈরি হচ্ছে…');
    await tick();
    const engine = await Engine.create(container, prep);
    splash.setStage(0.65, 'শেডার কম্পাইল হচ্ছে…');
    await tick();
    await engine.warmUp().catch(() => undefined); // compile the vehicle / person shaders behind the splash
    splash.setStage(0.82, 'মানচিত্র লোড হচ্ছে…');
    engine.start();
    await engine.firstChunksReady(); // the terrain around the player is in before the splash fades (max 12 s)
    new Watermark();
    void splash.finish();
    return engine;
  })
  .then((engine) => {
    // Dev only: handy in the browser console, e.g. __engine.camera.position.set(0, 300, 0)
    if (import.meta.env.DEV) (window as unknown as { __engine: Engine }).__engine = engine;
  })
  .catch((err) => {
    splash.dispose();
    console.error(err);
    container.innerHTML = `<pre style="color:#f88;padding:16px">${bn.errors.engineFailed}:\n${String(err)}</pre>`;
  });
