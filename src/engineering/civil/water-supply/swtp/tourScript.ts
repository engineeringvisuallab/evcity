import type { TourStop } from '../../../core/types';
import { swtpVoice, type SwtpVoiceId } from '../../../../i18n/voice/swtp.bn';

const s = (
  id: SwtpVoiceId,
  partId: string | undefined,
  titleBn: string,
  azimuthDeg: number,
  elevationDeg: number,
  distance: number,
  target?: [number, number, number],
  focus?: TourStop['focus'],
): TourStop => ({ id, partId, titleBn, voiceId: id, text: swtpVoice[id], shot: { azimuthDeg, elevationDeg, distance, target }, focus });

/** Tour order = the journey of the water. azimuth 0 = camera south of the target, 90 = east, -90 = west. */
export const SWTP_TOUR: TourStop[] = [
  s('intro', undefined, 'পুরো প্ল্যান্ট - এক নজরে', -35, 38, 360, [-5, 0, 0]),
  s('gate', 'gate', 'মূল ফটক ও নিরাপত্তা', 25, 14, 52, [-34, 3, 106]),
  s('intake', 'intake', '১. ইনটেক - নদী থেকে পানি গ্রহণ', -60, 24, 60, [-170, -1, -40], [-190, -7.4, -47, -141, 4.2, -33]),
  s('intakePump', 'intakePump', '২. ইনটেক পাম্প হাউস', 15, 24, 46),
  s('rawMain', 'rawMain', '৩. কাঁচা পানির রাইজিং মেইন', 20, 22, 62),
  s('rapidMix', 'rapidMix', '৪. পার্শাল ফ্লুম ও র‍্যাপিড মিক্সিং', 35, 28, 42),
  s('chemical', 'chemical', '৫. কেমিক্যাল হাউস', 10, 24, 50, undefined, [-102, 0, -14, -78, 6, -2]),
  s('flocculation', 'flocculation', '৬. ফ্লকুলেশন বেসিন', 20, 42, 74),
  s('sedimentation', 'sedimentation', '৭. সেডিমেন্টেশন ট্যাংক', 20, 40, 100),
  s('filtration', 'filtration', '৮. র‍্যাপিড স্যান্ড ফিল্টার', 25, 42, 100),
  s('backwash', 'backwash', '৯. ব্যাকওয়াশ ট্যাংক', 40, 22, 52, undefined, [57, 0, -13, 72, 19.6, -3]),
  s('disinfection', 'disinfection', '১০. ক্লোরিন কন্টাক্ট ট্যাংক', 20, 42, 88, undefined, [96, -4.4, -72, 126, 4.9, -28]),
  s('reservoir', 'reservoir', '১১. পরিষ্কার পানির জলাধার', 15, 34, 84),
  s('highLift', 'highLift', '১২. হাই-লিফট পাম্প হাউস', 15, 26, 46, undefined, [30, 0, 8, 52, 6.4, 20]),
  s('delivery', 'delivery', '১৩. ডেলিভারি মেইন', 70, 32, 125),
  s('sludge', 'sludge', 'স্লাজ লেগুন', 35, 38, 80, undefined, [-145, -3.4, 60, -115, 2.1, 100]),
  s('electrical', 'electrical', 'বিদ্যুৎ - সাবস্টেশন ও জেনারেটর', -25, 28, 80, undefined, [34, 0, 55, 100, 12, 77]),
  s('lab', 'lab', 'কন্ট্রোল রুম ও ল্যাবরেটরি', 12, 24, 52),
  s('outro', undefined, 'সারসংক্ষেপ', 35, 40, 380, [-5, 0, 0]),
];
