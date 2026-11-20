// Step 3 check: water + ground range under every plot (13 x 13 points). Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/city-plots-water.ts
import { readFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
const gen: any = new TerrainGenerator(Config.world.seed);
const sc: any = {};
const plots = JSON.parse(readFileSync('docs/city_plots_proposal.json','utf8'));
let bad=0;
for (const p of plots) {
  const q = p.poly; let wet=0,n=0,mn=1e9,mx=-1e9,near=0;
  for (let i=0;i<=12;i++) for (let j=0;j<=12;j++) {
    const u=i/12,v=j/12;
    const x=(1-u)*((1-v)*q[0][0]+v*q[3][0])+u*((1-v)*q[1][0]+v*q[2][0]);
    const z=(1-u)*((1-v)*q[0][1]+v*q[3][1])+u*((1-v)*q[1][1]+v*q[2][1]);
    gen.sample(x,z,sc); n++;
    if (sc.water===sc.water && sc.h < sc.water + 0.3) wet++;
    if (sc.water===sc.water && sc.h < sc.water + 3) near++;
    mn=Math.min(mn,sc.h);mx=Math.max(mx,sc.h);
  }
  const ok = wet===0;
  if(!ok)bad++;
  console.log((ok?'ok  ':'WET ')+p.prog.padEnd(40)+' wet '+wet+'/'+n+' lowland(<3m over water) '+near+' ground range '+(mx-mn).toFixed(1)+' m  centre('+p.c[0].toFixed(0)+','+p.c[1].toFixed(0)+')');
}
console.log('plots with wet ground:',bad,'of',plots.length);
