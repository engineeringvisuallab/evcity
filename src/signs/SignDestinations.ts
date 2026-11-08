// ROAD SIGNS - Step 2: the places that appear on the boards, with SHORT names in English and Bangla.
// (The long Bangla names of bn.worldZones.names do not fit on a board.) Positions are NOT typed in by hand: they come from the game's own data
// (WORLD_ZONES seeds, facility sub-areas, the engineering campus), so a place never drifts away from the map.
// rank 1 = shown on boards far away, 2 = shown within a medium range, 3 = only on boards close to it (Step 3 uses this to choose what to list).
import { WORLD_ZONES, AIRPORT, AIRPORT_SEA, SEAPORT, type Facility } from '../city/WorldZones';
import { ENGINEERING_BY_ID } from '../city/EngineeringZones';

export type DestRank = 1 | 2 | 3;

export interface Destination {
  id: string;
  en: string;
  bn: string;
  rank: DestRank;
  /** The point roads lead to (world metres). */
  x: number;
  z: number;
}

const zone = (id: string): { x: number; z: number } => {
  const z = WORLD_ZONES.find((q) => q.id === id);
  if (!z) throw new Error(`SignDestinations: unknown zone id "${id}"`);
  return { x: z.x, z: z.z };
};
const area = (f: Facility, id: string): { x: number; z: number } => {
  const a = f.areas.find((q) => q.id === id);
  if (!a) throw new Error(`SignDestinations: unknown facility area "${id}"`);
  return { x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2 };
};
const campus = (): { x: number; z: number } => {
  const a = ENGINEERING_BY_ID.get('eng-campus');
  if (!a) throw new Error('SignDestinations: eng-campus missing');
  return { x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2 };
};
const D = (id: string, en: string, bn: string, rank: DestRank, p: { x: number; z: number }): Destination => ({ id, en, bn, rank, x: p.x, z: p.z });

export const DESTINATIONS: readonly Destination[] = [
  // --- rank 1: the big ones, visible from far away ---
  D('metro-core', 'Central City', 'কেন্দ্রীয় শহর', 1, zone('metro-core')),
  D('airport', 'Airport', 'বিমানবন্দর', 1, area(AIRPORT, 'airport-parking')),
  D('seaport', 'Seaport', 'সমুদ্রবন্দর', 1, area(SEAPORT, 'seaport-admin')),
  D('north-heavy', 'North Industrial City', 'উত্তর শিল্পনগর', 1, zone('north-heavy')),
  // --- rank 2 ---
  D('airport-sea', 'Sea Airport', 'সমুদ্র বিমানবন্দর', 2, area(AIRPORT_SEA, 'airport-sea-parking')),
  D('north-admin', 'Government District', 'সরকারি এলাকা', 2, zone('north-admin')),
  D('ne-business', 'North-East Business Hub', 'উত্তর-পূর্ব বাণিজ্যিক কেন্দ্র', 2, zone('ne-business')),
  D('nw-university', 'University City', 'বিশ্ববিদ্যালয় নগর', 2, zone('nw-university')),
  D('nw-town', 'North-West Township', 'উত্তর-পশ্চিম উপশহর', 2, zone('nw-town')),
  D('eng-campus', 'Engineering Campus', 'ইঞ্জিনিয়ারিং ক্যাম্পাস', 2, campus()),
  D('east-works', 'East Industrial Zone', 'পূর্ব শিল্পাঞ্চল', 2, zone('east-works')),
  D('south-bazaar', 'South Bazaar', 'দক্ষিণ বাজার', 2, zone('south-bazaar')),
  D('sw-newtown', 'New Town', 'নতুন শহর', 2, zone('sw-newtown')),
  D('sw-medical', 'Medical City', 'চিকিৎসা নগর', 2, zone('sw-medical')),
  D('south-beach', 'South Beach', 'দক্ষিণ সৈকত', 2, zone('south-beach')),
  D('safari-park', 'Safari Park', 'সাফারি পার্ক', 2, zone('safari-park')),
  // --- rank 3: local places, only on boards near them ---
  D('east-logistics', 'East Logistics Hub', 'পূর্ব লজিস্টিক হাব', 3, zone('east-logistics')),
  D('north-logistics', 'North Logistics Hub', 'উত্তর লজিস্টিক হাব', 3, zone('north-logistics')),
  D('port-industry', 'Port Industrial Area', 'বন্দর শিল্প এলাকা', 3, zone('port-industry')),
  D('west-bazaar', 'West Bazaar', 'পশ্চিম বাজার', 3, zone('west-bazaar')),
  D('east-mall', 'East Shopping Area', 'পূর্ব শপিং এলাকা', 3, zone('east-mall')),
  D('east-suburb', 'East Suburb', 'পূর্ব উপশহর', 3, zone('east-suburb')),
  D('south-suburb', 'South Suburb', 'দক্ষিণ উপশহর', 3, zone('south-suburb')),
  D('west-suburb', 'West Suburb', 'পশ্চিম উপশহর', 3, zone('west-suburb')),
  D('nw-solar', 'Solar Farm', 'সোলার ফার্ম', 3, zone('nw-solar')),
  D('sw-beach', 'South-West Beach', 'দক্ষিণ-পশ্চিম সৈকত', 3, zone('sw-beach')),
  D('east-beach', 'East Beach', 'পূর্ব সৈকত', 3, zone('east-beach')),
];
