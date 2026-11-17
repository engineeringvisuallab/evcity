import { FLOORS, levelLabel } from './EVLabTowerLayout';

// EVLab Tower v1.3: the lift floor panel (all floors listed by name) and the little prompt pill. Plain DOM, created on demand.

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

export class LiftUI {
  private pill: HTMLDivElement;
  private panel: HTMLDivElement;
  private list: HTMLDivElement;
  private title: HTMLDivElement;
  private rows: HTMLDivElement[] = [];
  private sel = 0;
  private pillText = '';
  private relock = false;
  open = false;
  private onPick: ((level: number) => void) | null = null;

  constructor(private lockTarget?: HTMLElement) {
    this.pill = document.createElement('div');
    Object.assign(this.pill.style, {
      position: 'fixed', bottom: '112px', left: '50%', transform: 'translateX(-50%)', padding: '9px 20px', borderRadius: '999px',
      background: 'rgba(8,12,22,0.82)', color: '#f4e7c0', font: `600 16px/1.45 ${FONT}`, pointerEvents: 'none', display: 'none', zIndex: '40',
      border: '1px solid rgba(212,175,55,0.6)', whiteSpace: 'pre', textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, 92vw)', maxHeight: '82vh', display: 'none',
      flexDirection: 'column', background: 'rgba(10,12,18,0.94)', border: '1px solid #d4af37', borderRadius: '14px', zIndex: '60', color: '#f4e7c0', font: `15px ${FONT}`,
      boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
    } satisfies Partial<CSSStyleDeclaration>);
    this.title = document.createElement('div');
    Object.assign(this.title.style, { padding: '12px 16px', font: `700 17px ${FONT}`, borderBottom: '1px solid rgba(212,175,55,0.4)' } satisfies Partial<CSSStyleDeclaration>);
    this.list = document.createElement('div');
    Object.assign(this.list.style, { overflowY: 'auto', padding: '6px' } satisfies Partial<CSSStyleDeclaration>);
    const foot = document.createElement('div');
    foot.textContent = 'Up / Down + Enter, or click.  Esc = close';
    Object.assign(foot.style, { padding: '8px 16px', font: `12px ${FONT}`, color: '#b9a878', borderTop: '1px solid rgba(212,175,55,0.25)' } satisfies Partial<CSSStyleDeclaration>);
    // top floor first, like a real panel
    for (let i = FLOORS.length - 1; i >= 0; i--) {
      const f = FLOORS[i];
      const row = document.createElement('div');
      row.textContent = `${levelLabel(f.level).padStart(2, ' ')}   ${f.name}`;
      row.dataset.level = String(f.level);
      Object.assign(row.style, { padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'pre' } satisfies Partial<CSSStyleDeclaration>);
      row.addEventListener('click', () => this.pick(f.level));
      row.addEventListener('mouseenter', () => this.select(f.level));
      this.list.appendChild(row);
      this.rows[f.level] = row;
    }
    this.panel.append(this.title, this.list, foot);
    document.body.append(this.pill, this.panel);
    window.addEventListener('keydown', this.onKey, true);
  }

  prompt(text: string): void {
    if (text === this.pillText) return;
    this.pillText = text;
    this.pill.textContent = text;
    this.pill.style.display = text ? 'block' : 'none';
  }

  show(current: number, label: string, onPick: (level: number) => void): void {
    this.onPick = onPick;
    this.title.textContent = label;
    this.relock = !!document.pointerLockElement;
    if (document.pointerLockElement) document.exitPointerLock();
    this.panel.style.display = 'flex';
    this.open = true;
    this.select(current, true);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.panel.style.display = 'none';
    if (this.relock) {
      const t = this.lockTarget as (HTMLElement & { requestPointerLock(): Promise<void> | void }) | undefined;
      try { const p = t?.requestPointerLock(); if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => undefined); } catch { /* the user clicks to lock again */ }
    }
  }

  private select(level: number, scroll = false): void {
    this.rows[this.sel]?.style.setProperty('background', 'transparent');
    this.sel = level;
    const r = this.rows[level];
    if (r) {
      r.style.background = 'rgba(212,175,55,0.28)';
      if (scroll) r.scrollIntoView({ block: 'center' });
    }
  }

  private pick(level: number): void {
    const cb = this.onPick;
    this.close();
    cb?.(level);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.open) return;
    e.stopPropagation();
    if (e.code === 'Escape' || e.code === 'KeyG') { e.preventDefault(); this.close(); return; }
    if (e.code === 'ArrowUp') { e.preventDefault(); this.select(Math.min(FLOORS.length - 1, this.sel + 1), true); }
    else if (e.code === 'ArrowDown') { e.preventDefault(); this.select(Math.max(0, this.sel - 1), true); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.pick(this.sel); }
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.pill.remove();
    this.panel.remove();
  }
}
