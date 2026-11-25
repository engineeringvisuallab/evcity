import { ROAD_STATION_SITES, type RoadStationSite } from './RoadStationSites';
import { j300Active } from '../roads/junction/J300Switch';
import { J300_HIDE_SITES } from '../roads/junction/J300OldFurniture';

let cache: { on: boolean; list: readonly RoadStationSite[] } | null = null;

/** J9-d: the road-side stations / charge points that really exist. The 300 ft junction switch ON hides the two charge points that stood on the removed R6-9. OFF = the generated list as it is. */
export function roadStationSites(): readonly RoadStationSite[] {
  const on = j300Active();
  if (!cache || cache.on !== on) cache = { on, list: on ? ROAD_STATION_SITES.filter((s) => !J300_HIDE_SITES.includes(s.id)) : ROAD_STATION_SITES };
  return cache.list;
}
