import type { TourStop } from '../../core/types';
import { thermalVoice, type ThermalVoiceId } from '../../../i18n/voice/thermal.bn';

type Focus = TourStop['focus'];
const s = (id: ThermalVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: thermalVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/** Tour order = the fuel and the water/steam cycle (Rankine cycle), then the electricity. Camera azimuth 0 = camera on the south (+z) side looking north. */
export const THERMAL_TOUR: TourStop[] = [
  s('intro', undefined, 'পুরো কেন্দ্র - এক নজরে', 25, 38, 430, [0, 10, -10]),
  s('gate', 'gate', 'মূল ফটক ও নিরাপত্তা', 15, 14, 48, [0, 3, 104], [-8, 0, 100, 12, 7, 114]),
  s('gas', 'gas', '১. গ্যাস রিসিভিং ও মিটারিং স্টেশন', 20, 24, 46, undefined, [-162, 0, 10, -138, 5, 30]),
  s('boiler', 'boiler', '২. বয়লার - তাপে পানি থেকে বাষ্প', 55, 20, 105, [-95, 22, -30], [-110, 0, -43, -82, 46, -16]),
  s('burner', 'boiler', '৩. বার্নার ও শিখা', 65, 12, 34, [-95, 9, -26], [-103, 5, -40, -85, 14, -16]),
  s('stack', 'stack', '৪. ফ্লু গ্যাস ফ্যান ও চিমনি', 40, 20, 80, [-120, 28, -30], [-132, 0, -34, -108, 72, -26]),
  s('steam', 'turbine', '৫. মেইন স্টিম লাইন', -30, 22, 120, [-65, 30, -34], [-104, 0, -37, -38, 49, -31]),
  s('turbine', 'turbine', '৬. স্টিম টারবাইন (HP ও LP)', 20, 22, 52, [-8, 9, -30], [-27, 5, -35, 3, 17, -25]),
  s('generator', 'turbine', '৭. জেনারেটর', 30, 18, 42, [16, 10, -30], [8, 6, -34, 26, 15, -26]),
  s('condenser', 'condenser', '৮. কনডেনসার - বাষ্প থেকে আবার পানি', -35, 20, 36, [-2, 3, -30], [-9, 0, -37, 5, 6, -23]),
  s('cooling', 'cooling', '৯. কুলিং টাওয়ার', 160, 20, 150, [105, 28, -66], [82, 0, -90, 128, 70, -42]),
  s('feedwater', 'feedwater', '১০. ডিঅ্যারেটর ও ফিডওয়াটার পাম্প', 25, 24, 56, [-62, 5, 8], [-84, 0, -2, -44, 12, 18]),
  s('dm', 'dm', '১১. ডিএম প্ল্যান্ট - খাঁটি পানি', 25, 26, 70, [-118, 4, 58], [-152, 0, 46, -88, 12, 78]),
  s('transformer', 'electrical', '১২. জেনারেটর ট্রান্সফর্মার (১১ → ১৩২ কেভি)', 35, 24, 52, [43, 6, -30], [29, 0, -36, 52, 14, -23]),
  s('switchyard', 'electrical', '১৩. সুইচইয়ার্ড ও ট্রান্সমিশন লাইন', 30, 22, 105, [110, 7, -15], [66, 0, -26, 182, 21, -3]),
  s('control', 'control', '১৪. কন্ট্রোল রুম', 15, 24, 40, undefined, [6, 0, 0, 38, 12, 16]),
  s('outro', undefined, 'সারসংক্ষেপ - শক্তির রূপান্তর', -35, 38, 430, [0, 10, -10]),
];
