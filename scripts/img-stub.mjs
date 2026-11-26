import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (/\\.(jpg|jpeg|png|webp|svg)(\\?.*)?$/.test(url)) return { format: 'module', shortCircuit: true, source: 'export default "stub";' };
  return next(url, ctx);
}`), import.meta.url);
