import type { HallPage, HallSoonTopic, HallTopic } from './HallTypes';

/** Topic 1: Islamic Life. Simple sentences, so they are easy to read aloud. 6 slides x 6 lines = 12 pages of 3 lines. */
export const ISLAMIC_LIFE: HallTopic = {
  id: 'islamic-life',
  title: 'Islamic Life',
  icon: '🕌',
  blurb: 'Faith, daily practice and character',
  slides: [
    {
      title: 'Welcome: What Is Islam?',
      icon: '🕌',
      bullets: ['Islam: peaceful submission to God', 'One God: Allah', 'Guidance: the Quran and the Sunnah'],
      script: [
        'Assalamu alaikum, and good morning to everyone in this hall.',
        'Today I will talk about the Islamic way of life.',
        'Islam is an Arabic word that means peaceful submission to God.',
        'Muslims believe in one God, whom they call Allah.',
        'Their guidance comes from the Quran, the holy book of Islam.',
        'It also comes from the Sunnah, the teachings of Prophet Muhammad, peace be upon him.',
      ],
    },
    {
      title: 'The Five Pillars',
      icon: '🕋',
      bullets: ['Shahada: faith', 'Salah: prayer', 'Zakat: charity', 'Sawm: fasting', 'Hajj: pilgrimage'],
      script: [
        'Islamic life stands on five basic pillars.',
        'The first is Shahada, the declaration of faith in one God and His messenger.',
        'The second is Salah, which is prayer five times every day.',
        'The third is Zakat, giving a fixed share of savings to people in need.',
        'The fourth is Sawm, fasting from dawn to sunset in the month of Ramadan.',
        'The fifth is Hajj, the pilgrimage to Makkah, once in a lifetime, if able.',
      ],
    },
    {
      title: 'Daily Prayer and Cleanliness',
      icon: '🤲',
      bullets: ['Fajr, Dhuhr, Asr, Maghrib, Isha', 'Wudu: washing before prayer', 'Friday prayer at the mosque'],
      script: [
        'The five daily prayers are Fajr, Dhuhr, Asr, Maghrib and Isha.',
        'Prayer keeps a believer connected to God throughout the day.',
        'Before prayer, a Muslim performs wudu, which is washing with clean water.',
        'Cleanliness of the body, clothes and place is an important part of faith.',
        'On Fridays, Muslims gather at the mosque for the special Jumuah prayer.',
        'These routines bring discipline, calm and a strong sense of community.',
      ],
    },
    {
      title: 'Character and Manners',
      icon: '🤝',
      bullets: ['Honesty and keeping promises', 'Respect for parents', 'Rights of neighbours', 'Patience and gratitude'],
      script: [
        'Islam teaches that good character is part of worship.',
        'A Muslim should always speak the truth and keep every promise.',
        'Kindness and respect to parents is one of the highest duties.',
        'Neighbours, relatives, and even strangers have rights over us.',
        'Muslims greet each other with salam, which means peace be upon you.',
        'Patience, gratitude and forgiveness are values that Muslims try to practise every day.',
      ],
    },
    {
      title: 'Halal Living and Social Duty',
      icon: '🌿',
      bullets: ['Honest, lawful income', 'No cheating or bribery', 'Charity and care', 'Family and community'],
      script: [
        'Islamic life asks for honest work and a halal, lawful income.',
        'Cheating, bribery and harming others are not allowed.',
        'Halal food means food that is lawful and pure for a Muslim.',
        'Charity is encouraged, because wealth is a trust from God.',
        'Family is the heart of society, and every member has duties and rights.',
        'Caring for the poor, the sick and the weak is the duty of the whole community.',
      ],
    },
    {
      title: 'Celebrations and Conclusion',
      icon: '🌙',
      bullets: ['Eid al-Fitr', 'Eid al-Adha', 'Balance of faith, character and service'],
      script: [
        'Muslims celebrate two main festivals every year.',
        'Eid al-Fitr comes after Ramadan, and Eid al-Adha is celebrated at the time of the Hajj.',
        'Both festivals are times of prayer, charity, family and joy.',
        'In summary, Islamic life is a balance of faith, character and service.',
        'It guides a person in worship, in work and in dealing with others.',
        'Thank you all for listening. Now I am happy to answer any question.',
      ],
    },
  ],
};

export const HALL_TOPICS: readonly HallTopic[] = [ISLAMIC_LIFE];

/** Announced, not written yet: shown greyed out with "Coming soon". */
export const HALL_SOON: readonly HallSoonTopic[] = [
  { id: 'water-supply', title: 'Water Supply Engineering', icon: '💧' },
  { id: 'sewerage', title: 'Sewerage and Drainage', icon: '🚰' },
  { id: 'highway', title: 'Highway Engineering', icon: '🛣️' },
  { id: 'structural', title: 'Structural Engineering', icon: '🏗️' },
  { id: 'geotech', title: 'Geotechnical Engineering', icon: '⛰️' },
  { id: 'surveying', title: 'Surveying', icon: '📐' },
  { id: 'power', title: 'Power Systems', icon: '⚡' },
  { id: 'mechanical', title: 'Mechanical Design', icon: '⚙️' },
  { id: 'chemical', title: 'Chemical Process', icon: '🧪' },
  { id: 'environment', title: 'Environmental Engineering', icon: '🌱' },
];

/** The pages (3 lines each) of a topic, in order. */
export function pagesOf(t: HallTopic): HallPage[] {
  const out: HallPage[] = [];
  t.slides.forEach((s, slide) => {
    for (let i = 0; i < s.script.length; i += 3) out.push({ slide, lines: s.script.slice(i, i + 3) });
  });
  return out;
}
