import type { WeaponId } from './Weapons';

/** English names shown on the weapon wheel. */
export const GUN_NAME_EN: Record<WeaponId, string> = {
  pistol: 'Pistol',
  combatPistol: 'Combat Pistol',
  heavyPistol: 'Heavy Pistol',
  revolver: 'Revolver',
  microSmg: 'Micro SMG',
  smg: 'SMG',
  ak47: 'AK-47',
  carbineRifle: 'Carbine Rifle',
  shotgun: 'Shotgun',
  sniperRifle: 'Sniper Rifle',
};

/**
 * Side-view silhouettes (muzzle to the right), one filled shape per gun, drawn in `currentColor`.
 * All share one 160 x 60 box so the sizes stay comparable: pistols are short, rifles fill the width.
 */
const BODY: Record<WeaponId, string> = {
  pistol: `
    <rect x="45" y="14" width="68" height="13" rx="2"/>
    <rect x="107" y="11" width="4" height="4"/><rect x="48" y="11" width="5" height="4"/>
    <path d="M52 27H100L96 33H74L70 36H52Z"/>
    <polygon points="52,27 75,27 69,56 47,56"/>
    <path d="M80 29V37Q80 43 74 43H70" fill="none" stroke="currentColor" stroke-width="3"/>`,
  combatPistol: `
    <rect x="40" y="14" width="76" height="13" rx="2"/>
    <rect x="110" y="11" width="4" height="4"/><rect x="43" y="11" width="5" height="4"/>
    <path d="M47 27H104L100 33H76L72 36H47Z"/>
    <rect x="88" y="27" width="24" height="5" rx="1"/>
    <polygon points="48,27 74,27 68,57 44,57"/>
    <path d="M80 29V38Q80 44 74 44H70" fill="none" stroke="currentColor" stroke-width="3"/>`,
  heavyPistol: `
    <rect x="36" y="12" width="80" height="17" rx="3"/>
    <rect x="116" y="15" width="8" height="8" rx="1"/>
    <rect x="40" y="9" width="6" height="4"/><rect x="110" y="9" width="4" height="4"/>
    <path d="M44 29H102L98 36H74L70 39H44Z"/>
    <polygon points="44,29 76,29 70,58 40,58"/>
    <path d="M82 31V39Q82 46 75 46H70" fill="none" stroke="currentColor" stroke-width="3.5"/>`,
  revolver: `
    <rect x="62" y="12" width="64" height="8" rx="1"/>
    <rect x="70" y="21" width="36" height="6" rx="1"/>
    <rect x="122" y="8" width="4" height="5"/>
    <rect x="50" y="10" width="24" height="20" rx="5"/>
    <rect x="36" y="11" width="18" height="8"/>
    <polygon points="36,11 31,4 41,9"/>
    <path d="M40 24H60L56 40L48 40Q44 44 36 56L28 52Q36 42 40 24Z"/>
    <path d="M66 29V37Q66 43 60 43H56" fill="none" stroke="currentColor" stroke-width="3"/>`,
  microSmg: `
    <rect x="38" y="12" width="64" height="15" rx="2"/>
    <rect x="102" y="15" width="22" height="6" rx="1"/>
    <rect x="122" y="13" width="4" height="10"/>
    <rect x="46" y="9" width="30" height="3"/><rect x="96" y="9" width="4" height="4"/>
    <path d="M38 14H18L14 18H38" /> <rect x="12" y="16" width="26" height="3"/>
    <polygon points="50,27 64,27 60,52 45,52"/>
    <rect x="72" y="27" width="11" height="30" rx="1"/>
    <path d="M70 28V36Q70 41 65 41" fill="none" stroke="currentColor" stroke-width="3"/>`,
  smg: `
    <rect x="34" y="13" width="82" height="14" rx="2"/>
    <rect x="92" y="15" width="34" height="14" rx="3"/>
    <rect x="126" y="18" width="12" height="4"/><rect x="134" y="13" width="3" height="6"/>
    <rect x="40" y="9" width="26" height="4"/>
    <polygon points="34,15 8,17 8,30 34,26"/>
    <path d="M62 27H76L84 55L72 56Z"/>
    <polygon points="44,27 57,27 53,51 40,51"/>
    <path d="M86 28V36Q86 41 80 41H76" fill="none" stroke="currentColor" stroke-width="3"/>`,
  ak47: `
    <polygon points="4,19 36,19 36,31 14,41 5,38"/>
    <rect x="36" y="17" width="46" height="13" rx="1"/>
    <rect x="80" y="19" width="36" height="11" rx="2"/>
    <rect x="84" y="13" width="34" height="3"/>
    <rect x="114" y="18" width="30" height="4"/>
    <rect x="138" y="11" width="3" height="8"/><rect x="112" y="14" width="6" height="9"/>
    <path d="M56 30H72Q74 44 88 57L77 59Q60 46 56 30Z"/>
    <polygon points="36,30 48,30 45,49 33,47"/>
    <path d="M52 31V37Q52 42 46 42H44" fill="none" stroke="currentColor" stroke-width="3"/>`,
  carbineRifle: `
    <rect x="4" y="20" width="14" height="14" rx="2"/><rect x="16" y="22" width="22" height="7"/>
    <rect x="34" y="18" width="44" height="14" rx="2"/>
    <rect x="36" y="13" width="42" height="5" rx="1"/>
    <rect x="76" y="19" width="42" height="12" rx="2"/>
    <rect x="118" y="21" width="26" height="4"/><rect x="108" y="13" width="4" height="7"/><rect x="144" y="19" width="6" height="8" rx="1"/>
    <polygon points="54,32 67,32 65,56 52,56"/>
    <polygon points="34,32 45,32 41,52 30,50"/>
    <path d="M50 33V39Q50 44 44 44H42" fill="none" stroke="currentColor" stroke-width="3"/>`,
  shotgun: `
    <polygon points="6,22 42,18 42,32 15,45 6,39"/>
    <rect x="40" y="16" width="26" height="15" rx="2"/>
    <rect x="64" y="16" width="86" height="6"/>
    <rect x="64" y="24" width="68" height="5"/>
    <rect x="86" y="23" width="30" height="11" rx="4"/>
    <rect x="146" y="12" width="3" height="5"/>
    <path d="M52 31V39Q52 45 58 45H62" fill="none" stroke="currentColor" stroke-width="3"/>`,
  sniperRifle: `
    <polygon points="4,21 42,19 42,35 13,46 4,40"/>
    <rect x="40" y="18" width="38" height="13" rx="2"/>
    <rect x="76" y="21" width="74" height="4"/>
    <rect x="146" y="19" width="10" height="8" rx="1"/>
    <rect x="50" y="7" width="48" height="9" rx="4"/>
    <rect x="46" y="8" width="6" height="11" rx="1"/><rect x="94" y="8" width="6" height="11" rx="1"/>
    <rect x="57" y="15" width="4" height="4"/><rect x="85" y="15" width="4" height="4"/>
    <polygon points="56,31 66,31 66,44 56,44"/>
    <path d="M118 25L108 46M124 25L134 46" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <path d="M50 32V40Q50 45 56 45H60" fill="none" stroke="currentColor" stroke-width="3"/>`,
};

export function gunIconSvg(id: WeaponId): string {
  return `<svg viewBox="0 0 160 60" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true" style="display:block;width:100%;height:100%">${BODY[id]}</svg>`;
}
