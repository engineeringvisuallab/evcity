# J0 picture: ring profile vs natural ground along the 1400 m zone (reads docs/J300_SITE.json made by scripts/j300-site-check.ts)
import json, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
d=json.load(open('docs/J300_SITE.json')); st=d['st']; u=[p['s'] for p in st]
fig,ax=plt.subplots(figsize=(13,5.6))
ax.fill_between(u,[p['nat'] for p in st],0,color='#a98f6b',label='natural ground'); ax.plot(u,[p['ring'] for p in st],color='#222',lw=2.5,label='ring surface (design profile)')
ax.fill_between(u,[p['nat'] for p in st],[p['ring'] for p in st],where=[p['ring']>p['nat'] for p in st],color='#e8c27a',alpha=.7,label='ring embankment (fill)')
ax.axvspan(540,680,color='#4a90d9',alpha=.35,label='water on ROW (ring bridge at ring st 8150-8200)')
ax.axvline(-600,color='#c0392b',lw=2,ls='--'); ax.text(-595,66,'rail crosses ring\n(u about -600)',color='#c0392b',fontsize=9)
ax.axvline(0,color='g',lw=2,ls=':'); ax.text(8,66,'R6-9 / R4-9 meet the ring (u=0)',color='g',fontsize=9)
ax.annotate('ring 9.7 m above ground\nat the crossing',(0,28.5),(-250,52),arrowprops=dict(arrowstyle='->'),fontsize=9)
ax.annotate('hill (natural 72 m)',(690,71),(380,63),arrowprops=dict(arrowstyle='->'),fontsize=9)
ax.set_xlim(-700,700); ax.set_ylim(10,75); ax.set_xlabel('u = metres along the ring from the crossing (+ = towards PI4)'); ax.set_ylabel('height (m)')
ax.set_title('J0: ring is on a 8-20 m EMBANKMENT over the whole junction zone (game data, ring station 7594 at u=0)'); ax.legend(loc='upper left',fontsize=8); ax.grid(alpha=.3)
fig.savefig('docs/j300_site_profile.png',dpi=110,bbox_inches='tight')
