import type { TourStop } from '../../../core/types';
import { stpVoice, type StpVoiceId } from '../../../../i18n/voice/stp.bn';

type Focus = TourStop['focus'];
const s = (id: StpVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: stpVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/** Tour order = the journey of the sewage, then of the sludge. */
export const STP_TOUR: TourStop[] = [
  s('intro', undefined, 'পুরো প্ল্যান্ট - এক নজরে', -30, 40, 340, [0, 0, -5]),
  s('gate', 'gate', 'মূল ফটক ও নিরাপত্তা', 20, 14, 50, [-8, 3, 96]),
  s('inlet', 'inlet', '১. ইনলেট পাম্প স্টেশন (স্ক্রু পাম্প)', 25, 26, 44, undefined, [-138, -6, -52, -119, 8.5, -38]),
  s('screen', 'inlet', '২. ফাইন স্ক্রিন', 30, 24, 36, undefined, [-122, 0, -50, -96, 8.5, -38]),
  s('grit', 'grit', '৩. গ্রিট চেম্বার', 25, 32, 42),
  s('primary', 'primary', '৪. প্রাইমারি ক্ল্যারিফায়ার', 20, 42, 78, undefined, [-71, -3.5, -62, -15, 4, -32]),
  s('aeration', 'aeration', '৫. এয়ারেশন ট্যাংক', 12, 40, 96, undefined, [0, -5, -58, 71, 4.5, -32]),
  s('blower', 'aeration', '৬. ব্লোয়ার হাউস', 15, 24, 36, undefined, [24, 0, -28, 46, 6, -18]),
  s('secondary', 'secondary', '৭. সেকেন্ডারি ক্ল্যারিফায়ার', 20, 42, 78, undefined, [78, -4, -58, 130, 4, -26]),
  s('disinfection', 'disinfection', '৮. ক্লোরিন কন্টাক্ট ট্যাংক', 20, 38, 58, undefined, [84, -4, -9, 130, 5, 19]),
  s('outfall', 'disinfection', '৯. নদীতে ছাড়া (আউটফল)', -50, 28, 60, [158, -1, 14], [124, -4.5, 6, 183, 2, 24]),
  s('thickener', 'thickener', '১০. স্লাজ থিকেনার', 20, 36, 44),
  s('digester', 'digester', '১১. অ্যানারোবিক ডাইজেস্টার', 30, 24, 62, undefined, [-47, 0, 34, -16, 21, 56]),
  s('gas', 'digester', '১২. বায়োগ্যাস ও ফ্লেয়ার', 20, 26, 40, undefined, [-53, 0, 58, -29, 8, 73]),
  s('dewatering', 'dewatering', '১৩. ডিওয়াটারিং (বেল্ট প্রেস)', 20, 28, 48, undefined, [2, 0, 40, 30, 7.5, 66]),
  s('electrical', 'electrical', 'বিদ্যুৎ - সাবস্টেশন ও জেনারেটর', 20, 28, 55, undefined, [88, 0, 54, 134, 12, 72]),
  s('lab', 'lab', 'কন্ট্রোল রুম ও ল্যাবরেটরি', 15, 26, 55),
  s('outro', undefined, 'সারসংক্ষেপ', 35, 40, 340, [0, 0, -5]),
];
