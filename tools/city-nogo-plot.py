# Picture of docs/city_nogo.json -> docs/city_nogo.png (run: python3 tools/city-nogo-plot.py)
import json, base64, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MP
D=json.load(open('docs/city_nogo.json')); I=json.load(open('docs/city_plots_input.json'))
m=np.frombuffer(base64.b64decode(D['mask']),dtype=np.uint8).reshape(D['nz'],D['nx'])
img=np.ones((D['nz'],D['nx'],3))
for bit,col in((128,(.97,.88,.82)),(64,(1,.93,.7)),(16,(.55,.75,1)),(8,(1,.6,.2)),(32,(.9,.5,.5)),(4,(.6,.35,.15)),(2,(.8,.8,.8)),(1,(.2,.2,.2))):
    img[(m&bit)>0]=col
x0,z0,c=D['x0'],D['z0'],D['cell']
th=np.linspace(0,6.2832,200);fig,ax=plt.subplots(figsize=(18,14),dpi=80)
ax.imshow(img,extent=(x0,x0+D['nx']*c,z0+D['nz']*c,z0),origin='upper')
for s in I['streets']:
    p=s['pts'];ax.plot([a[0] for a in p],[a[1] for a in p],'r-',lw=.8);ax.text(p[len(p)//2][0],p[len(p)//2][1],s['name'],fontsize=6,color='#900')
for b in I['hand']:
    if x0<b['x']<x0+D['nx']*c and z0<b['z']<z0+D['nz']*c: ax.text(b['x'],b['z'],b['id'],fontsize=5,color='k')
ax.plot(1500*np.cos(th),1500*np.sin(th),'b--',lw=1)
ax.set_title('NO-GO MAP  white=free  black=road  grey=17 streets(12m)  brown=rail  orange=library/proto/mall/EVLab/infra  blue=water(+30m)  red=hand building  cream=steep')
ax.set_xlim(-1500,1500);ax.set_ylim(1500,-1500);ax.set_aspect('equal');fig.savefig('docs/city_nogo.png',bbox_inches='tight')
