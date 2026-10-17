import { UI_FONT } from './theme';
import { bn, bnNum } from '../i18n';

export type MarkerIcon = 'car' | 'heli' | 'boat' | 'tour-car' | 'tour-heli';

const CSS = `
@keyframes evcSpin { to { transform: rotate(360deg); } }
@keyframes evcPulse { 0% { box-shadow: 0 0 0 0 rgba(255,210,31,0.65); } 100% { box-shadow: 0 0 0 16px rgba(255,210,31,0); } }
`;

const ICONS: Record<MarkerIcon, string> = {
  car: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M5 11l1.6-4.2A2 2 0 018.5 5.5h7a2 2 0 011.9 1.3L19 11h1a1 1 0 011 1v4a1 1 0 01-1 1h-1a2 2 0 01-4 0H9a2 2 0 01-4 0H4a1 1 0 01-1-1v-4a1 1 0 011-1zm2.7-.1h8.6l-1-2.6a.5.5 0 00-.5-.3H9.2a.5.5 0 00-.5.3z"/></svg>',
  heli: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M2 5h20v1.6H13v1.8c2.6.3 4.5 2.2 4.5 4.6 0 .3 0 .6-.1.9L21 12v2l-4.8 1.2A5 5 0 0112.5 17H11v2h4v1.6H6V19h3.4v-2H8a4 4 0 01-4-4c0-2.4 1.9-4.3 4.4-4.6V6.6H2z"/></svg>',
  boat: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M3 14l2-7h14l2 7-9 5-9-5zm4-5l-1.2 4.2 6.2 3.5 6.2-3.5L17 9H7z"/></svg>',
  'tour-car': '<svg viewBox="0 0 24 24" width="22" height="22" fill="#ffd21f"><path d="M5 11l1.6-4.2A2 2 0 018.5 5.5h7a2 2 0 011.9 1.3L19 11h1a1 1 0 011 1v4a1 1 0 01-1 1h-1a2 2 0 01-4 0H9a2 2 0 01-4 0H4a1 1 0 01-1-1v-4a1 1 0 011-1zm2.7-.1h8.6l-1-2.6a.5.5 0 00-.5-.3H9.2a.5.5 0 00-.5.3z"/><path d="M12 1.5l1.3 2.6 2.9.4-2.1 2 .5 2.9L12 8l-2.6 1.4.5-2.9-2.1-2 2.9-.4z"/></svg>',
  'tour-heli': '<svg viewBox="0 0 24 24" width="22" height="22" fill="#ffd21f"><path d="M2 5h20v1.6H13v1.8c2.6.3 4.5 2.2 4.5 4.6 0 .3 0 .6-.1.9L21 12v2l-4.8 1.2A5 5 0 0112.5 17H11v2h4v1.6H6V19h3.4v-2H8a4 4 0 01-4-4c0-2.4 1.9-4.3 4.4-4.6V6.6H2z"/><path d="M12 0l1.3 2.5 2.8.4-2 2 .5 2.8L12 6.4 9.5 7.7 10 4.9l-2-2 2.8-.4z"/></svg>',
};

/**
 * The always-clean screen: no instruction text at all.
 * - crosshair while the mouse is captured; a play icon while it is not (click anywhere)
 * - a small spinner while the world loads
 * - a pulsing icon over a vehicle / helicopter you can get into (F)
 * Everything else on screen is real game data (speed gauge, flight instruments, the site map).
 */
export class HUD {
  private cross = document.createElement('div');
  private play = document.createElement('div');
  private spinner = document.createElement('div');
  private marker = document.createElement('div');
  private markerIcon: MarkerIcon | null = null;
  /** STAGE 10: the city area you are standing in (colour dot + name + zone kind). */
  private area = document.createElement('div');
  private areaDot = document.createElement('span');
  private areaName = document.createElement('div');
  private areaKind = document.createElement('div');
  private areaKey = '';
  /** Guns: weapon chip, wanted stars, red hit flash, hit marker, aim ring. */
  private weaponChip = document.createElement('div');
  private chipName = document.createElement('div');
  private chipAmmo = document.createElement('div');
  private stars = document.createElement('div');
  private vignette = document.createElement('div');
  private hitMark = document.createElement('div');
  private ring = document.createElement('div');
  private starsShown = -1;
  private hitTimer = 0;

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    Object.assign(this.cross.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: '6px',
      height: '6px',
      margin: '-3px 0 0 -3px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.8)',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '10',
    });

    Object.assign(this.play.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: '76px',
      height: '76px',
      margin: '-38px 0 0 -38px',
      borderRadius: '50%',
      background: 'rgba(0,0,0,0.45)',
      border: '2px solid rgba(255,255,255,0.7)',
      pointerEvents: 'none',
      zIndex: '10',
    });
    this.play.innerHTML =
      '<svg viewBox="0 0 24 24" width="76" height="76"><path d="M9.5 7.5v9l7.5-4.5z" fill="#fff"/></svg>';

    Object.assign(this.spinner.style, {
      position: 'fixed',
      left: '50%',
      top: '20px',
      width: '26px',
      height: '26px',
      marginLeft: '-13px',
      borderRadius: '50%',
      border: '3px solid rgba(255,255,255,0.25)',
      borderTopColor: '#ffd21f',
      animation: 'evcSpin 0.9s linear infinite',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '12',
    });

    Object.assign(this.marker.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '38px',
      height: '38px',
      marginLeft: '-19px',
      marginTop: '-19px',
      borderRadius: '50%',
      background: 'rgba(20,28,40,0.75)',
      border: '2px solid #ffd21f',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'evcPulse 1.3s ease-out infinite',
      pointerEvents: 'none',
      zIndex: '12',
    });

    Object.assign(this.area.style, {
      position: 'fixed',
      left: '14px',
      bottom: '14px',
      display: 'none',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 14px 8px 12px',
      borderRadius: '12px',
      background: 'rgba(14,22,34,0.72)',
      border: '1px solid rgba(255,255,255,0.28)',
      color: '#fff',
      fontFamily: UI_FONT,
      pointerEvents: 'none',
      zIndex: '11',
    });
    Object.assign(this.areaDot.style, { width: '14px', height: '14px', borderRadius: '50%', flex: '0 0 auto', border: '2px solid #fff' });
    Object.assign(this.areaName.style, { fontSize: '15px', fontWeight: '700', lineHeight: '1.25' });
    Object.assign(this.areaKind.style, { fontSize: '12px', opacity: '0.8', lineHeight: '1.25' });
    const col = document.createElement('div');
    col.append(this.areaName, this.areaKind);
    this.area.append(this.areaDot, col);

    Object.assign(this.weaponChip.style, {
      position: 'fixed', right: '14px', bottom: '14px', display: 'none', padding: '8px 16px', borderRadius: '12px',
      background: 'rgba(14,22,34,0.72)', border: '1px solid rgba(255,255,255,0.28)', color: '#fff', fontFamily: UI_FONT,
      fontSize: '15px', fontWeight: '700', pointerEvents: 'none', zIndex: '11',
    });
    Object.assign(this.chipName.style, { fontSize: '15px', fontWeight: '700' });
    Object.assign(this.chipAmmo.style, { fontSize: '20px', fontWeight: '800', marginTop: '2px', textAlign: 'right' });
    this.weaponChip.append(this.chipName, this.chipAmmo);
    Object.assign(this.stars.style, {
      position: 'fixed', left: '50%', top: '56px', transform: 'translateX(-50%)', display: 'none', gap: '4px', alignItems: 'center',
      padding: '4px 12px', borderRadius: '10px', background: 'rgba(14,22,34,0.6)', fontFamily: UI_FONT, color: '#fff',
      fontSize: '22px', letterSpacing: '2px', pointerEvents: 'none', zIndex: '11',
    });
    Object.assign(this.vignette.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', opacity: '0', zIndex: '9',
      background: 'radial-gradient(ellipse at center, rgba(180,0,0,0) 40%, rgba(180,0,0,0.75) 100%)',
    });
    Object.assign(this.hitMark.style, {
      position: 'fixed', left: '50%', top: '50%', width: '26px', height: '26px', margin: '-13px 0 0 -13px', display: 'none',
      pointerEvents: 'none', zIndex: '12',
    });
    this.hitMark.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26" stroke-linecap="round"><path d="M4 4l7 7M22 4l-7 7M4 22l7-7M22 22l-7-7" stroke="currentColor" stroke-width="2.6"/></svg>';
    Object.assign(this.ring.style, {
      position: 'fixed', left: '50%', top: '50%', width: '22px', height: '22px', margin: '-11px 0 0 -11px', borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.9)', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)', display: 'none', pointerEvents: 'none', zIndex: '10',
    });

    parent.append(this.vignette, this.cross, this.ring, this.hitMark, this.play, this.spinner, this.marker, this.area, this.weaponChip, this.stars);
  }

  /** Weapon in hand (null = hidden). */
  setWeapon(id: string | null): void {
    this.weaponChip.style.display = id ? 'block' : 'none';
    if (id) this.chipName.textContent = bn.combat.weapon[id] ?? id;
  }

  /** Bullets in the magazine / spare bullets. `reload` = 0..1 while reloading, -1 otherwise. */
  setAmmo(mag: number, reserve: number, reload: number): void {
    if (reload >= 0) {
      this.chipAmmo.innerHTML = `<span style="font-size:14px;color:#ffd21f">${bn.combat.reloading} ${bnNum(Math.round(reload * 100))}%</span>`;
      return;
    }
    const dry = mag <= 0 && reserve <= 0;
    const low = mag <= 0 || mag <= 2;
    const reserveLabel = !Number.isFinite(reserve) || reserve >= 999999 ? '∞' : bnNum(reserve);
    this.chipAmmo.innerHTML = dry
      ? `<span style="color:#ff6b5b;font-size:15px">${bn.combat.noAmmo}</span>`
      : `<span style="color:${low ? '#ff6b5b' : '#fff'}">${bnNum(mag)}</span><span style="opacity:.65;font-size:15px"> / ${reserveLabel}</span>`;
  }

  /** Gun drawn: ring crosshair instead of the dot. */
  setAimMode(on: boolean): void {
    this.ring.style.display = on ? 'block' : 'none';
    this.cross.style.opacity = on ? '0' : '1';
  }

  /** 0-5 wanted stars (0 hides them). */
  setWanted(n: number): void {
    if (n === this.starsShown) return;
    this.starsShown = n;
    this.stars.style.display = n > 0 ? 'flex' : 'none';
    let h = `<span style="font-size:13px;letter-spacing:0;margin-right:6px;opacity:.9">${bn.combat.wanted}</span>`;
    for (let i = 0; i < 5; i++) h += `<span style="color:${i < n ? '#ffd21f' : 'rgba(255,255,255,0.25)'}">★</span>`;
    this.stars.innerHTML = h;
  }

  /** Red edge flash (somebody hit the player - the player cannot die). */
  flashDamage(strength: number): void {
    const v = this.vignette.style;
    v.transition = 'none';
    v.opacity = String(Math.min(0.9, strength + 0.25));
    void this.vignette.offsetWidth;
    v.transition = 'opacity 0.6s ease-out';
    v.opacity = '0';
  }

  /** Little X on the crosshair when your bullet hits somebody (red = kill). */
  hitMarker(kill: boolean): void {
    this.hitMark.style.color = kill ? '#ff3b30' : '#ffffff';
    this.hitMark.style.display = 'block';
    window.clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => (this.hitMark.style.display = 'none'), 160);
  }

  /** Show the city area you are in (null = outside every city -> hidden). */
  setArea(info: { key: string; name: string; kind: string; color: string } | null): void {
    if (!info) {
      this.areaKey = '';
      this.area.style.display = 'none';
      return;
    }
    if (info.key !== this.areaKey) {
      this.areaKey = info.key;
      this.areaName.textContent = info.name;
      this.areaKind.textContent = info.kind;
      this.areaDot.style.background = info.color;
    }
    this.area.style.display = 'flex';
  }

  /** Mouse captured: crosshair; not captured: play icon. */
  setLocked(locked: boolean): void {
    this.play.style.display = locked ? 'none' : 'block';
    this.cross.style.display = locked ? 'block' : 'none';
  }

  setLoading(on: boolean): void {
    this.spinner.style.display = on ? 'block' : 'none';
  }

  /** Icon over something you can enter. null hides it. `screen` is in CSS pixels. */
  setMarker(screen: { x: number; y: number } | null, icon: MarkerIcon): void {
    if (!screen) {
      this.marker.style.display = 'none';
      return;
    }
    if (this.markerIcon !== icon) {
      this.marker.innerHTML = ICONS[icon];
      this.markerIcon = icon;
    }
    this.marker.style.display = 'flex';
    this.marker.style.transform = `translate(${screen.x.toFixed(0)}px, ${screen.y.toFixed(0)}px)`;
  }

  hideMarker(): void {
    this.marker.style.display = 'none';
  }
}
