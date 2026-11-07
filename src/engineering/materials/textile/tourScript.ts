import type { TourStop } from '../../core/types';
import { textileVoice, type TextileVoiceId } from '../../../i18n/voice/textile.en';

type Focus = TourStop['focus'];
const s = (id: TextileVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: textileVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/**
 * Azimuth 0 = camera on the south (+z) side looking north (the gate side; all the big buildings are open to the south), 180 = camera in the north.
 * The tour follows the material: cotton -> blowroom -> cards -> ring frames -> looms -> dyeing -> stenter -> boiler -> ETP -> cutting -> sewing -> packing -> dock.
 */
export const TEXTILE_TOUR: TourStop[] = [
  s('intro', undefined, 'The Whole Factory at a Glance', 165, 36, 380, [0, 5, 0]),
  s('gate', 'gate', 'Main Gate, Safety & Power', 0, 14, 60, [-100, 3, 92], [-124, 0, 78, -96, 9, 104]),
  s('cotton', 'cotton', '1. The Cotton Bale Store', 8, 22, 60, [-122, 2, -62], [-139, 0, -78, -105, 9, -46]),
  s('blowroom', 'spinning', '2. The Blowroom', 12, 20, 52, [-80, 2, -71], [-95, 0, -75, -66, 6, -69]),
  s('carding', 'spinning', '3. Carding', 10, 22, 52, [-48, 1.5, -62], [-67, 0, -68, -29, 4, -57]),
  s('ring', 'spinning', '4. Ring Spinning', 0, 18, 66, [-64, 1.5, -44], [-96, 0, -47, -32, 3.5, -41]),
  s('weaving', 'weaving', '5. The Weaving Shed', 8, 24, 100, [30, 1.5, -57], [-9, 0, -76, 69, 4, -36]),
  s('loom', 'weaving', '6. Inside a Loom', 10, 22, 22, [10, 1.2, -48], [-4, 0, -51, 22, 2.6, -45]),
  s('dyeing', 'dyeing', '7. Dyeing & Finishing House', 10, 24, 96, [105, 3, -62], [77, 0, -77, 133, 9, -47]),
  s('jet', 'dyeing', '8. Jet Dyeing Machines', 8, 20, 40, [106, 2.5, -55], [92, 0, -58, 121, 5, -52]),
  s('stenter', 'dyeing', '9. The Stenter', 22, 26, 46, [127, 1.5, -62], [124, 0, -76, 130, 5, -47]),
  s('boiler', 'dyeing', '10. Boiler House & Water Plant', 0, 16, 70, [78, 6, -26], [50, 0, -32, 101, 33, -20]),
  s('etp', 'etp', '11. Effluent Treatment Plant', 10, 30, 110, [110, 0, 28], [74, -4, 3, 150, 6, 52]),
  s('clarifier', 'etp', '12. Clarifier & Discharge', 0, 28, 62, [130, 0, 28], [120, -3, 10, 151, 4, 45]),
  s('cutting', 'garments', '13. The Cutting Section', 8, 24, 38, [-80, 1, 18], [-94, 0, 5, -68, 3, 32]),
  s('sewing', 'garments', '14. The Sewing Lines', 0, 28, 78, [-40, 1, 27], [-67, 0, 8, -14, 2.4, 45]),
  s('packing', 'garments', '15. Finishing & Packing', 14, 24, 44, [2, 1, 26], [-11, 0, 8, 17, 4, 40]),
  s('dock', 'garments', '16. Store, Dock & Solar Roof', 0, 22, 76, [35, 3, 28], [15, 0, 5, 56, 9, 58]),
  s('outro', undefined, 'Summary', 195, 36, 380, [0, 5, 0]),
];
