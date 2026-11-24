# J2 CROSS-SECTIONS (numbers + sheet) for the TYPE B (B2) junction. Reads docs/J300_TYPEB.json (J1-B result). Writes docs/J300_SECTIONS.txt, docs/J300_SECTIONS.json, docs/j300_sections.png.
# Widths of M8 / M6 / M4 come from src/roads/standards/SectionTable.ts (pavement edge from the centreline: M8 22.1, M6 16.0, M4 13.8); everything marked ASSUMED is a first value, final in J3 / J7.
import json, math
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
D=json.load(open('docs/J300_TYPEB.json')); ring=D['ring']; b=D['best']; u0=b['u0']; PT=b['Ptop']
def it(key,u):
    for a,c in zip(ring,ring[1:]):
        if a['u']<=u<=c['u']: t=(u-a['u'])/(c['u']-a['u']); return a[key]+t*(c[key]-a[key])
    return ring[-1][key] if u>0 else ring[0][key]
G0=it('nat',u0); Ht=PT-G0
L=[]; out=lambda s='': (L.append(s), print(s))
chk=[]
def check(name,ok,txt): chk.append((name,ok,txt)); out(f'  {"PASS" if ok else "FAIL"}  {name}: {txt}')
# ---- element widths (m)
M8=dict(pav=22.1, median=6.0, lane=3.65, barrier=0.6, row_half=40.0)       # SECTION_M8: pavementEdge 22.1, rowHalf 22.1+0.6+1.5+7.8+8.0 = 40.0
M6=dict(pav=16.0, median=4.0, lane=3.5, barrier=0.6, row_half=33.9)
M4=dict(pav=13.8, median=4.0, lane=3.65, barrier=0.6, row_half=31.7)
WALL_T=1.0; CELL=22.1; CWALL=1.2; DECK=2.0; CLR=5.5; SOIL=1.0; RAMPW=11.7; RAMPPAV=10.5; SLOPE=2.0; MSE=0.2    # MSE wall toe offset = 0.2 x height (ASSUMED)
out('J2 CROSS-SECTIONS, TYPE B (B2). All widths in metres, from the centreline of the ring (v) unless stated. ASSUMED = first value.')
out(f'roundabout centre u0 = {u0} m, deck level {PT:.1f} m = {Ht:.1f} m above natural ground {G0:.1f} m')
out('')
out('1) RING in the UNDERPASS (box, two cells, ring surface and plan unchanged)')
box_clear=2*CELL+CWALL; box_out=box_clear+2*WALL_T
out(f'   ring pavement edge {M8["pav"]} m each side + barrier offset {M8["barrier"]} m = {M8["pav"]+M8["barrier"]:.1f} m')
out(f'   cell clear width {CELL} m = median half 2.4 + inner shoulder 1.5 + 4 lanes 14.6 + outer shoulder 3.0 + barrier offset 0.6 = {2.4+1.5+14.6+3.0+0.6:.1f}')
out(f'   2 cells + central wall {CWALL} m = clear {box_clear:.1f} m, outside walls {WALL_T} m each = {box_out:.1f} m wide, 134 m long, clear height {CLR} m, roof deck {DECK} m (ASSUMED)')
check('ring pavement kept', abs(2*(2.4+1.5+14.6+3.0)+CWALL-2*M8['pav'])<1e-6,f'2 x {2.4+1.5+14.6+3.0:.1f} + central wall {CWALL} = {2*(2.4+1.5+14.6+3.0)+CWALL:.1f} m = 2 x SECTION_M8 pavement edge ({M8["pav"]} m): lanes and shoulders unchanged, the 1.2 m wall sits inside the 6.0 m median (2.4 + 1.2 + 2.4)')
hmax=max(it('ring',u0+x) for x in range(-67,68,5)); under=PT-DECK
check('vertical clearance',under-hmax>=CLR-1e-6,f'deck underside {under:.1f} - highest ring surface {hmax:.1f} = {under-hmax:.1f} m >= {CLR} m')
check('roof span / depth',CELL/DECK<=14,f'clear span {CELL} m / deck depth {DECK} m = {CELL/DECK:.1f} (limit 14 ASSUMED, one-way slab / box girder rule of thumb 12 .. 20)')
out('')
out('2) ROUNDABOUT DECK over the box and the platform')
out(f'   outer radius 62 m, circulating carriageway 14 m (r 48 .. 62): 3 lanes x 3.65 = 10.95 + inner apron 2.0 + outer shoulder 1.05; island r 48 m (soil {SOIL} m on the roof, trees ASSUMED shallow rooted); kerb 0.8 m yellow-black; footpath outside 3.0 m + parapet 0.5 m')
check('roundabout lane width',3.65>=3.5,'3 lanes x 3.65 m (>= 3.5 m)')
out(f'   platform edge: MSE retaining wall (vertical, toe offset {MSE} x H) where H > 4 m; wall height at the roundabout {Ht:.1f} m, wall toe at r = {62+0.8+MSE*Ht:.1f} m; slope 1:{SLOPE:.0f} only below 4 m')
out('')
out('3) RAMPS (4, one-way, 2 lane, ramp V 50): lanes 2 x 3.5 = 7.0 + inner shoulder 1.0 + outer shoulder 2.5 = 10.5 m + barrier 0.6 x 2 = 11.7 m wide on top')
gap=1.5; vin=M8['pav']+M8['barrier']+gap; vout=vin+RAMPW; wall_off=MSE*Ht
out(f'   ramp inner edge at v = {vin:.1f} m (ring barrier 22.7 + gap {gap}), outer edge v = {vout:.1f} m; outer side MSE wall, max height {Ht:.1f} m, toe v = {vout+0.5+wall_off:.1f} m')
check('ROW 91.44 m (300 ft) at the ramps',vout+0.5+wall_off<=45.72,f'toe of the ramp wall at {vout+0.5+wall_off:.1f} m <= half ROW 45.72 m')
out('')
out('4) R6 ARM (6 lane, SECTION_M6): median 4.0, pavement edge 16.0, barrier 0.6 -> 16.6 m half (33.2 m top width); climbs 16.0 m at 3.5 % over 457 m')
for H in (4,8,12,Ht): out(f'   at H = {H:4.1f} m: with MSE walls half width at toe {16.6+MSE*H:.1f} m (ROW half {M6["row_half"]} m {"PASS" if 16.6+MSE*H<=M6["row_half"] else "FAIL"}); with slopes 1:{SLOPE:.0f} {16.6+SLOPE*H:.1f} m ({"PASS" if 16.6+SLOPE*H<=M6["row_half"] else "FAIL"})')
check('R6 arm inside its own ROW (walls above 4 m)',16.6+MSE*Ht<=M6['row_half'],f'wall toe {16.6+MSE*Ht:.1f} m <= {M6["row_half"]} m (slopes would need {16.6+SLOPE*Ht:.1f} m, so walls are needed above about {(M6["row_half"]-16.6)/SLOPE:.1f} m height)')
out('')
out('5) R4 ARM (SECTION_M4): pavement edge 13.8, barrier 0.6 -> 14.4 m half; level and line decided in J4 (re-route around the hill)')
out('')
out('6) RING on its EMBANKMENT (existing, unchanged, same as before): pavement 44.2 m + barriers = 45.4 m top, slopes 1:2 as built by the game ground; at u -400 (ring 32.5 m, ground 19.0 m, H 13.5 m) toe half width = 22.7 + 2 x 13.5 = 49.7 m, already outside the 40.0 m M8 ROW (existing condition, NOT changed here; at the 300 ft corridor 45.72 m only walls would keep it inside, noted for J6)')
out('')
# ---- fill with walls (rough)
def area_wall(w,H): return (w+MSE*2*H)*H if H>4 else (w+2*SLOPE*H)*H
r6L=b['r6Len']; v6=sum(area_wall(33.2,max(0,Ht*(1-d/r6L)))*10 for d in range(0,int(r6L),10))
pf=math.pi*(62+0.8)**2*Ht
rp=0
for k,r in b['ramps'].items():
    L2=r['len']; 
    for d in range(0,int(L2),5):
        H=max(0,Ht-0.05*d-G0+G0-0)  # height above ground along the ramp (ground level G0 reference)
        rp+=area_wall(RAMPW,H)*5
out('7) REVISED FILL with MSE walls above 4 m (rough, replaces the 855 000 m3 slope figure of J1-B): platform %.0f m3, R6 arm %.0f m3, 4 ramps %.0f m3, total about %.0f m3 (R4 arm in J4)'%(pf,v6,rp,pf+v6+rp))
out('')
out('8) 300 ft (91.44 m) ROW BUDGET at the ramps and the underpass portals (from the ring centreline, one side): ring pavement 22.1 | barrier 0.6 | gap 1.5 | ramp 11.7 | wall 0.5 + toe %.1f | footway / lights / fence to 45.72 (spare %.1f m)'%(wall_off,45.72-(vout+0.5+wall_off)))
out('')
out('CHECKS: %d PASS, %d FAIL'%(sum(1 for c in chk if c[1]),sum(1 for c in chk if not c[1])))
out('NOT RUN: structural design, deck loads from the island soil, drainage details, wall design (MSE type, reinforcement), crossfall / superelevation (J3 / J5), R4 arm section levels (J4).')
open('docs/J300_SECTIONS.txt','w').write('\n'.join(L)+'\n'); json.dump(dict(u0=u0,Ptop=PT,Ht=Ht,box_clear=box_clear,box_out=box_out,vin=vin,vout=vout,fill=dict(platform=pf,r6=v6,ramps=rp),checks=[dict(name=n,ok=o,txt=t) for n,o,t in chk]),open('docs/J300_SECTIONS.json','w'),indent=1)
# ---- sheet
fig,axs=plt.subplots(3,2,figsize=(15,13)); axs=axs.ravel()
def base(ax,title,xl=(-60,60),yl=(-2,40)):
    ax.axhline(0,color='#8b7355',lw=1); ax.fill_between([xl[0],xl[1]],[-2,-2],[0,0],color='#a98f6b'); ax.set_xlim(*xl); ax.set_ylim(*yl); ax.set_aspect('equal'); ax.set_title(title,fontsize=10); ax.grid(alpha=.25)
    ax.axvline(45.72,color='#c0392b',ls='--',lw=.8); ax.axvline(-45.72,color='#c0392b',ls='--',lw=.8)
def poly(ax,pts,col): ax.fill([p[0] for p in pts],[p[1] for p in pts],color=col)
# S1 ring embankment u=-400
a=axs[0]; base(a,'S1 ring on its embankment (unchanged), u -400: H 13.5 m'); H=it('ring',-400)-it('nat',-400); H1=H
poly(a,[(-22.7-2*H,0),(-22.7,H),(22.7,H),(22.7+2*H,0)],'#e8c27a'); poly(a,[(-22.1,H),(22.1,H),(22.1,H+.3),(-22.1,H+.3)],'#3f3f42'); poly(a,[(-3,H),(3,H),(3,H+1),(-3,H+1)],'#9a9a95')
a.text(0,H+3,'ring pavement 44.2 m, median 6.0 m',ha='center',fontsize=8)
# S2 ramp mid (x = 125 rel)
a=axs[1]; x=125; Hr=it('ring',u0+x)-G0; Hp=Ht-0.05*(x-70); base(a,'S2 ring + ramp (ramp mid length, u0+125): ramp %.1f m, ring %.1f m'%(Hp,Hr))
poly(a,[(-22.7-2*Hr,0),(-22.7,Hr),(22.7,Hr),(22.7+2*Hr,0)],'#e8c27a'); poly(a,[(-22.1,Hr),(22.1,Hr),(22.1,Hr+.3),(-22.1,Hr+.3)],'#3f3f42')
for s in(-1,1):
    poly(a,[(s*vin,0),(s*vout,0),(s*(vout+.5+MSE*Hp),0),(s*(vout+.5),Hp),(s*vin,Hp)],'#c9c3b5') ; poly(a,[(s*vin,Hp),(s*vout,Hp),(s*vout,Hp+.3),(s*vin,Hp+.3)],'#505053')
a.text(0,Hr+4,'ramps 11.7 m on both sides (outer MSE wall), inside the 91.44 m ROW (red)',ha='center',fontsize=8)
# S3 portal x=-67 : elevation of box portal
a=axs[2]; x=-67; Hr=it('ring',u0+x)-G0; base(a,'S3 underpass portal (u0-67): 2 cells 22.1 m, clear 5.5 m, deck 2.0 m',(-40,40),(-2,40))
poly(a,[(-box_out/2,0),(box_out/2,0),(box_out/2,Hr),(-box_out/2,Hr)],'#e8c27a'); poly(a,[(-40,0),(-28,0),(-28,Ht),(-40,Ht)],'#c9c3b5'); poly(a,[(40,0),(28,0),(28,Ht),(40,Ht)],'#c9c3b5')
poly(a,[(-box_out/2,Hr),(box_out/2,Hr),(box_out/2,Ht-DECK),(-box_out/2,Ht-DECK)],'#101012'); poly(a,[(-box_out/2,Ht-DECK),(box_out/2,Ht-DECK),(box_out/2,Ht),(-box_out/2,Ht)],'#9a9a95')
poly(a,[(-CWALL/2,Hr),(CWALL/2,Hr),(CWALL/2,Ht-DECK),(-CWALL/2,Ht-DECK)],'#9a9a95')
for s in(-1,1): poly(a,[(s*(box_clear/2),Hr),(s*(box_clear/2+WALL_T),Hr),(s*(box_clear/2+WALL_T),Ht-DECK),(s*(box_clear/2),Ht-DECK)],'#9a9a95')
a.text(0,Ht+2,'roundabout deck %.1f m'%PT,ha='center',fontsize=8); a.text(0,Hr+2,'ring (unchanged)',color='w',ha='center',fontsize=8)
# S4 through the box + platform (section across the roundabout, plane x=0)
a=axs[3]; base(a,'S4 through the box (x=0): ring cells under the roundabout deck, platform fill and MSE walls',(-80,80),(-2,42)); Hr=it('ring',u0)-G0
poly(a,[(-62,0),(62,0),(62,Ht),(-62,Ht)],'#e8c27a')
poly(a,[(-box_out/2,Hr),(box_out/2,Hr),(box_out/2,Ht-DECK),(-box_out/2,Ht-DECK)],'#101012'); poly(a,[(-62,Ht-DECK),(62,Ht-DECK),(62,Ht),(-62,Ht)],'#9a9a95')
poly(a,[(-48,Ht),(48,Ht),(48,Ht+1),(-48,Ht+1)],'#68a352')
for s in(-1,1): poly(a,[(s*62,0),(s*(62+.8+MSE*Ht),0),(s*62.8,Ht)],'#c9c3b5')
a.text(0,Ht+4,'island (soil 1.0 m, trees) r 48 | carriageway 14 m | walls',ha='center',fontsize=8)
# S5 R6 arm
a=axs[4]; d=100; H=Ht*(1-d/r6L); base(a,'S5 R6 arm, 100 m from the roundabout: H %.1f m, M6 section 33.2 m'%H,(-50,50),(-2,30))
poly(a,[(-16.6-MSE*H,0),(-16.6,H),(16.6,H),(16.6+MSE*H,0)],'#c9c3b5'); poly(a,[(-16,H),(16,H),(16,H+.3),(-16,H+.3)],'#4b4b4e'); poly(a,[(-2,H),(2,H),(2,H+.8),(-2,H+.8)],'#9a9a95')
a.axvline(33.9,color='#2874a6',ls=':'); a.axvline(-33.9,color='#2874a6',ls=':'); a.text(0,H+3,'blue dotted = M6 ROW half 33.9 m',ha='center',fontsize=8)
# S6 ROW budget bar
a=axs[5]; a.set_xlim(0,50); a.set_ylim(0,6); a.set_title('S6 300 ft ROW budget (from the ring centreline, one side, m)',fontsize=10)
parts=[('ring pavement',22.1,'#3f3f42'),('barrier',0.6,'#9a9a95'),('gap',1.5,'#ffffff'),('ramp',RAMPW,'#505053'),('wall + toe',0.5+wall_off,'#c9c3b5'),('spare (walkway, lights, fence)',45.72-(vout+0.5+wall_off),'#8fa56c')]
x=0
for n,w,c in parts: a.barh(3,w,left=x,height=1.4,color=c,edgecolor='k'); a.text(x+w/2,3,'%s\n%.1f'%(n,w),ha='center',va='center',fontsize=6.5,color='k' if c!='#3f3f42' else 'w'); x+=w
a.axvline(45.72,color='#c0392b',lw=2); a.text(45.72,5,'half ROW 45.72',color='#c0392b',ha='right',fontsize=8); a.set_yticks([])
fig.suptitle('J2 cross-sections TYPE B (B2) - ASSUMED sizes, concept sheet, same scale in x and y',fontsize=12)
fig.savefig('docs/j300_sections.png',dpi=95,bbox_inches='tight')
