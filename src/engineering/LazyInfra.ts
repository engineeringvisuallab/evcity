import type * as THREE from 'three';
import type { InfraManager, InfraDeps } from './InfraManager';

type Tour = ReturnType<InfraManager['listTours']>;

/**
 * Stand-in for InfraManager while its code (all 13 engineering sites, ~0.5 MB) is still downloading. The Engine creates this at start-up
 * (it only needs the site list, which is tiny) and calls load() once the game is running: the real InfraManager is imported then, so the
 * first picture does not wait for code that is only needed when the player gets near a site.
 * Everything the Engine / Tour menu call is forwarded; before the real manager exists those calls are harmless no-ops.
 */
export class LazyInfra {
  private real: InfraManager | null = null;
  private loading: Promise<void> | null = null;
  private wantTour: string | null = null;
  onTour: (active: boolean) => void = () => {};

  /** `deps` are the usual InfraManager options; `total` is the number of sites (for the performance overlay). */
  constructor(private deps: InfraDeps, readonly total: number, private sites: Tour) {}

  get ready(): boolean {
    return this.real !== null;
  }

  /** Starts the download of the engineering code (once). Failure is reported but never stops the game. */
  load(): Promise<void> {
    this.loading ??= import('./InfraManager')
      .then(({ InfraManager }) => {
        const m = new InfraManager(this.deps);
        m.onTour = (a) => this.onTour(a);
        this.real = m;
        if (this.wantTour) {
          const id = this.wantTour;
          this.wantTour = null;
          m.startById(id);
        }
      })
      .catch((e) => console.warn('[EVCity] engineering sites failed to load:', e));
    return this.loading;
  }

  get touring(): boolean {
    return this.real ? this.real.touring : false;
  }

  get builtCount(): number {
    return this.real ? this.real.builtCount : 0;
  }

  update(dt = 0): void {
    this.real?.update(dt);
  }

  applyCamera(dt: number, camera: THREE.PerspectiveCamera): void {
    this.real?.applyCamera(dt, camera);
  }

  nameAt(x: number, z: number): { id: string; name: string; color: string } | null {
    return this.real ? this.real.nameAt(x, z) : this.siteAt(x, z);
  }

  private siteAt(x: number, z: number): { id: string; name: string; color: string } | null {
    for (const s of this.deps.terrain.infra) if (s.inside(x, z, 6)) return { id: s.id, name: s.nameBn, color: s.color };
    return null;
  }

  listTours(): Tour {
    return this.real ? this.real.listTours() : this.sites;
  }

  startById(id: string): 'started' | 'unknown' | 'blocked' | 'busy' {
    if (this.real) return this.real.startById(id);
    if (!(this.deps.canStart?.() ?? true)) return 'blocked';
    this.wantTour = id; // started as soon as the code has arrived
    void this.load();
    return 'started';
  }

  stopTour(): void {
    this.real?.stopTour();
  }

  dispose(): void {
    this.real?.dispose();
    this.real = null;
  }
}
