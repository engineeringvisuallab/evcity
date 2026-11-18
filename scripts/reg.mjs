import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\\.[a-z]+$/.test(spec) && ctx.parentURL) {
    const u = new URL(spec + '.ts', ctx.parentURL);
    if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
    const d = new URL(spec + '/index.ts', ctx.parentURL);
    if (existsSync(fileURLToPath(d))) return next(d.href, ctx);
  }
  return next(spec, ctx);
}`), import.meta.url);
