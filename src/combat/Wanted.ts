import { Config } from '../core/Config';

/**
 * "Wanted" level (like GTA): crimes add heat, heat fades with time. Stars = how many police come for the player.
 * 0 stars = nobody is looking for you.
 */
export class Wanted {
  heat = 0;

  add(h: number): void {
    this.heat = Math.min(Config.combat.wanted.maxHeat, this.heat + h);
  }

  update(dt: number): void {
    this.heat = Math.max(0, this.heat - Config.combat.wanted.decay * dt);
  }

  get stars(): number {
    return this.heat < 0.25 ? 0 : Math.min(5, Math.ceil(this.heat));
  }

  /** How many police officers should be around the player. */
  get policeTarget(): number {
    return this.stars * Config.combat.wanted.policePerStar;
  }

  clear(): void {
    this.heat = 0;
  }
}
