// STEP M1c check (headless, changes nothing): same logic as MallManager.buildApron (no THREE): apron width and the gap apron edge -> road / rail edge. Run: npx tsx scripts/mall-apron-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { MALL_POLY, MALL_RED, MALL_APRON, MALL_ROAD_GAP, MALL_APRON_MAX } from '../src/mall/MallSite';
const T: any = new TerrainGenerator(Config.world.seed);
const inP=(P:ReadonlyArray<readonly [number,number]>,x:number,z:number)=>{let r=false;for(let a=0,b=P.length-1;a<P.length;b=a++){const [xi,zi]=P[a],[xj,zj]=P[b];if((zi>z)!==(zj>z)&&x<((xj-xi)*(z-zi))/(zj-zi)+xi)r=!r}return r};
const obs:Array<[number,number,number]>=[];const near=(x:number,z:number)=>x>-760&&x<-60&&z>-560&&z<40;
for(const r of T.roads.roads)for(let i=0;i<r.xs.length;i++)if(near(r.xs[i],r.zs[i]))obs.push([r.xs[i],r.zs[i],r.halfWidth+r.shoulder]);
for(const e of T.rail.edges)for(let j=0;j+1<e.xs.length;j++){const L=Math.hypot(e.xs[j+1]-e.xs[j],e.zs[j+1]-e.zs[j]),n=Math.max(1,Math.ceil(L/4));for(let k=0;k<=n;k++){const x=e.xs[j]+((e.xs[j+1]-e.xs[j])*k)/n,z=e.zs[j]+((e.zs[j+1]-e.zs[j])*k)/n;if(near(x,z))obs.push([x,z,6])}}
const gap=(x:number,z:number)=>{let m=1e9;for(const o of obs){const dx=o[0]-x;if(dx>m+o[2]||-dx>m+o[2])continue;m=Math.min(m,Math.hypot(dx,o[1]-z)-o[2])}return m};
const pts:Array<[number,number]>=[];for(let i=0;i<MALL_POLY.length;i++){const a=MALL_POLY[i],b=MALL_POLY[(i+1)%MALL_POLY.length];const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3));for(let k=0;k<n;k++)pts.push([a[0]+((b[0]-a[0])*k)/n,a[1]+((b[1]-a[1])*k)/n])}
const N=pts.length;const w:number[]=[],g0:number[]=[];let t0=Date.now();
for(let i=0;i<N;i++){const p=pts[(i+N-2)%N],q=pts[(i+2)%N];let tx=q[0]-p[0],tz=q[1]-p[1];const l=Math.hypot(tx,tz)||1;tx/=l;tz/=l;let ex=-tz,ez=tx;if(inP(MALL_POLY,pts[i][0]+ex*1.5,pts[i][1]+ez*1.5)){ex=-ex;ez=-ez}
let ww=0,gp=0;while(ww<MALL_APRON_MAX&&(gp=gap(pts[i][0]+ex*(ww+0.5),pts[i][1]+ez*(ww+0.5)))>=MALL_ROAD_GAP&&(gp<80||inP(MALL_RED,pts[i][0]+ex*(ww+0.5),pts[i][1]+ez*(ww+0.5))))ww+=0.5;
const hit=ww<MALL_APRON_MAX&&gp<MALL_ROAD_GAP;const W=Math.max(0,(hit?ww:Math.min(ww,MALL_APRON))-0.5);w.push(W);g0.push(gap(pts[i][0]+ex*W,pts[i][1]+ez*W));}
for(let it=0;it<6;it++){const c=w.slice();for(let i=0;i<N;i++)w[i]=Math.min(c[i],(c[(i+N-1)%N]+c[i]+c[(i+1)%N])/3)}
const s=[...w].sort((a,b)=>a-b);console.log('points',N,'time ms',Date.now()-t0,'apron width min',s[0].toFixed(1),'median',s[N>>1].toFixed(1),'max',s.at(-1)!.toFixed(1),'; points wider than 16 m:',w.filter(v=>v>16.5).length);
let mn=1e9,sum=0,cnt=0;for(let i=0;i<N;i++){const p=pts[(i+N-2)%N],q=pts[(i+2)%N];let tx=q[0]-p[0],tz=q[1]-p[1];const l=Math.hypot(tx,tz)||1;tx/=l;tz/=l;let ex=-tz,ez=tx;if(inP(MALL_POLY,pts[i][0]+ex*1.5,pts[i][1]+ez*1.5)){ex=-ex;ez=-ez}const gg=gap(pts[i][0]+ex*w[i],pts[i][1]+ez*w[i]);if(gg<MALL_ROAD_GAP+25){cnt++;sum+=gg;mn=Math.min(mn,gg)}}
console.log('where a road/rail is near (<36 m after the apron):',cnt,'points, gap apron edge -> road edge: min',mn.toFixed(1),'avg',(sum/cnt).toFixed(1),'m (want about 10-12)');
