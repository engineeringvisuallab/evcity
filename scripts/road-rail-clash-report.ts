// REPORT (not a pass/fail test): which engineering areas / plant pads / the agro pad lie on a road or the railway. Run: npx tsx scripts/road-rail-clash-report.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { ENGINEERING_AREAS } from '../src/city/EngineeringZones';
const gen = new TerrainGenerator(Config.world.seed);
const roads = gen.roads.roads;
const rail = gen.rail.edges;
function segDist(px:number,pz:number,ax:number,az:number,bx:number,bz:number){const dx=bx-ax,dz=bz-az,L=dx*dx+dz*dz;const t=L===0?0:Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/L));return Math.hypot(px-(ax+t*dx),pz-(az+t*dz));}
// rect-vs-polyline: sample rect interior grid and boundary; count samples within w of the polyline
function hitRoad(x0:number,z0:number,x1:number,z1:number){
  const out:{name:string;id:number;w:number;len:number}[]=[];
  for(const r of roads){
    const w=r.halfWidth+r.shoulder;
    let len=0;
    for(let k=0;k+1<r.xs.length;k++){
      const ax=r.xs[k],az=r.zs[k],bx=r.xs[k+1],bz=r.zs[k+1];
      if(Math.max(ax,bx)<x0-w||Math.min(ax,bx)>x1+w||Math.max(az,bz)<z0-w||Math.min(az,bz)>z1+w)continue;
      const mx=(ax+bx)/2,mz=(az+bz)/2;
      if(mx>=x0&&mx<=x1&&mz>=z0&&mz<=z1) len+=Math.hypot(bx-ax,bz-az);
    }
    if(len>0) out.push({name:(r as any).name??'',id:(r as any).id,w,len});
  }
  return out;
}
function hitRail(x0:number,z0:number,x1:number,z1:number){
  const out:{id:string;len:number}[]=[];
  for(const e of rail){let len=0;for(let k=0;k+1<e.xs.length;k++){const mx=(e.xs[k]+e.xs[k+1])/2,mz=(e.zs[k]+e.zs[k+1])/2;if(mx>=x0&&mx<=x1&&mz>=z0&&mz<=z1)len+=Math.hypot(e.xs[k+1]-e.xs[k],e.zs[k+1]-e.zs[k]);}if(len>0)out.push({id:e.id,len});}
  return out;
}
console.log('roads',roads.length,'rail edges',rail.length);
for(const a of ENGINEERING_AREAS){
  const hr=hitRoad(a.x0,a.z0,a.x1,a.z1), hl=hitRail(a.x0,a.z0,a.x1,a.z1);
  if(hr.length||hl.length) console.log(a.id,'| roads:',hr.map(h=>`${h.name||h.id}(${h.len.toFixed(0)}m)`).join(', '),'| rail:',hl.map(h=>`${h.id}(${h.len.toFixed(0)}m)`).join(', '));
}

import { INFRA_PLACEMENTS } from '../src/engineering/InfraSites';
import { AGRO_POS, AGRO_PAD } from '../src/agro/AgroSite';
function minClear(pts:{x:number;z:number}[]){
  let bestR=1e9,nameR='',bestL=1e9,nameL='';
  for(const p of pts){
    for(const r of roads){const w=r.halfWidth+r.shoulder;for(let k=0;k+1<r.xs.length;k++){const d=segDist(p.x,p.z,r.xs[k],r.zs[k],r.xs[k+1],r.zs[k+1])-w;if(d<bestR){bestR=d;nameR=String((r as any).name??(r as any).id);}}}
    for(const e of rail){for(let k=0;k+1<e.xs.length;k++){const d=segDist(p.x,p.z,e.xs[k],e.zs[k],e.xs[k+1],e.zs[k+1]);if(d<bestL){bestL=d;nameL=e.id;}}}
  }
  return {bestR,nameR,bestL,nameL};
}
console.log('--- plant pads (min clearance, m; negative = on the road / rail strip)');
for(const p of INFRA_PLACEMENTS){
  const pts:{x:number;z:number}[]=[];
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  for(let lx=p.rect.x0;lx<=p.rect.x1;lx+=12)for(let lz=p.rect.z0;lz<=p.rect.z1;lz+=12){pts.push({x:p.x+lx*c+lz*s,z:p.z-lx*s+lz*c});}
  const m=minClear(pts);
  console.log(p.id.padEnd(9),`road ${m.bestR.toFixed(0).padStart(6)} (${m.nameR})  rail ${m.bestL.toFixed(0).padStart(6)} (${m.nameL})`);
}
{
  const pts:{x:number;z:number}[]=[];
  for(let lx=AGRO_PAD.x0;lx<=AGRO_PAD.x1;lx+=12)for(let lz=AGRO_PAD.z0;lz<=AGRO_PAD.z1;lz+=12)pts.push({x:AGRO_POS.x+lx,z:AGRO_POS.z+lz});
  const m=minClear(pts);console.log('agro pad  ',`road ${m.bestR.toFixed(0)} (${m.nameR})  rail ${m.bestL.toFixed(0)} (${m.nameL})`);
}
