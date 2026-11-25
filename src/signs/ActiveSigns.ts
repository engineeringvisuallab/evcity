import { ROAD_SIGN_SPOTS, type RoadSignSpot } from './RoadSignData';
import { j300Active } from '../roads/junction/J300Switch';
import { J300_HIDE_SIGNS } from '../roads/junction/J300OldFurniture';

/** J9-d: the sign gantries that really exist. The 300 ft junction switch ON hides sign-17 (it hung over the removed R6-9). OFF = the generated list. */
export function roadSignSpots(): readonly RoadSignSpot[] {
  return j300Active() ? ROAD_SIGN_SPOTS.filter((s) => !J300_HIDE_SIGNS.includes(s.id)) : ROAD_SIGN_SPOTS;
}
