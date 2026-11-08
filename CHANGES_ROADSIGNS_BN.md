# রোড সাইন বোর্ড — Step 6 (গোছানো): কী বদলালো

Step 1–5 ছিল: লেখা, কিমি, পরিকল্পনা, gantry, পুরো ম্যাপ। Step 6 এ coverage ভরা হলো, খুঁটিতে ধাক্কা, Quality সেটিং, DebugPanel, টেস্ট বোর্ড সরানো।

## ১. কী বদলালো (সংক্ষেপে)

| কাজ | কী হলো |
|---|---|
| টেস্ট বোর্ড | স্পনের কাছের ৩টা নকল বোর্ড (`addStep1TestSigns`) Engine.ts ও RoadSignLayer.ts থেকে সরানো |
| (a) ছোট ব্লক | ৭৫ মি-র বেশি লম্বা কিন্তু advance-এর জন্য ছোট ব্লকে **শুধু side বোর্ড** (আগের মোড় থেকে ৩০ মি পরে)। ৭৫ মি-র কম ব্লকে বোর্ড নেই |
| (b) T-মোড় | pad নেই এমন মোড় (এক রাস্তা আরেকটাতে শেষ, দুই রাস্তা মুখোমুখি জোড়া, বা সমতলে ক্রসিং) এখন **virtual pad**: আসল ম্যাপে ৩২টা। সেতুর ওপরের ক্রসিং ধরা হয় না, মাটির (earth) রাস্তা ধরা হয় না |
| (c) লম্বা রাস্তা | confirm বোর্ড এখন ১৫০ মি পরে, তারপর প্রতি ১৫০০ মি-এ (পরের মোড়ের ৫০০ মি আগ পর্যন্ত)। যে রাস্তা শেষ মোড়ের পরে শেষ হয়ে গেছে (stub) সেখানেও হয় |
| (d) ৪+ লেন local | ১১০ মি-র সংযোগ রাস্তা, এখন ছোট ব্লক নিয়মে side বোর্ড পায় (১৪টার ১৩টায়) |
| গাড়ির ধাক্কা | gantry-র দুই খুঁটি + কংক্রিট বেস, side বোর্ডের দুই খুঁটি + বোর্ড: Rapier collider, শুধু খেলোয়াড়ের ৩০০ মি + আকারের মধ্যে |
| সেতু / সুড়ঙ্গ | বোর্ড সেতুর ৩০ মি-র মধ্যে বসে না (আগে থেকেই)। gantry-র খুঁটি অন্য রাস্তা বা মোড়ের ওপর পড়লে বোর্ড রাস্তা বরাবর সরে যায় (আগে ১টা ছিল, এখন ০)। **সড়ক সুড়ঙ্গ এই গেমে নেই** (সুড়ঙ্গ শুধু রেলের), তাই সুড়ঙ্গের জন্য আলাদা কোড নেই |
| Quality | `Q.signRadiusMul` (Low 0.6, Medium 0.8, High 1) = SIGN_FIELD-এর show/paint/unpaint দূরত্বের গুণক। `Q.signPaintPerFrame` (Low 1, Medium 2, High 3) |
| DebugPanel | নতুন সারি: সাইন বোর্ড (দেখা / লেখা আঁকা / মোট), টেক্সচার সংখ্যা, খুঁটি-বডি সংখ্যা |
| Texture | একই লেখা + রং + মাপের বোর্ড **একটা texture ভাগ করে** (`texCache`, গোনা হয়, শেষ বোর্ড ছাড়লে মুছে যায়) |

## ২. ফাইল

নতুন:

- `src/signs/SignSolids.ts` — খুঁটি/বেস/বোর্ডের collider-এর মাপ (three বা Rapier লাগে না, টেস্ট করা যায়)
- `src/signs/SignPhysics.ts` — Rapier fixed body, শুধু কাছে (PortPhysics-এর মতো, 5 Hz)
- `CHANGES_ROADSIGNS_BN.md` (এই ফাইল)

বদলানো:

- `src/signs/SignPlan.ts` — `findVirtualPads`, ছোট ব্লক নিয়ম, লম্বা রাস্তায় বারবার confirm, gantry খুঁটির জায়গা যাচাই, `PlannedSign.short`, `SignPlanResult.pads / virtualPads`। নতুন `SIGN_RULES`: `shortBlockMinM 75`, `shortBlockFromBehindM 30`, `confirmEveryM 1500`, `confirmEndKeepM 500`, `virtualPadMinGapM 45`, `virtualPadTouchM 8`
- `src/signs/RoadSignLayer.ts` — টেস্ট বোর্ড মুছে ফেলা, texture ভাগ, Quality গুণক, `solidGroups`, `fieldStats` এ `textures` ও `solids`
- `src/core/Quality.ts` — ২টা নতুন ঘর, ৩ presets এ
- `src/core/Engine.ts` — টেস্ট বোর্ডের লাইন মুছে, `SignPhysics` তৈরি/update/dispose, DebugPanel-এ stats (**CRLF রাখা আছে**)
- `src/ui/DebugPanel.ts`, `src/i18n/bn.ts` — নতুন সারি (CRLF রাখা)
- `scripts/signs-plan-test.ts` — coverage রিপোর্ট + Step 6 নিয়মের চেক
- `scripts/signs-gantry-test.ts` — collider মাপের চেক, খুঁটি এখন FAIL (আগে WARN), texture মেমরির হিসাব
- `ROAD_SIGNS_HANDOFF_BN.md` — Step 6 অবস্থা ও লগ

## ৩. আসল ম্যাপের ফল (আমার চালানো)

- বোর্ড: ২৫৬ → **৪৮৩** (advance ৪০২, confirm ৮১; gantry ১৪০, side ৩৪৩)। মোড় ১৫৬ (১২৭ ছিল), এর মধ্যে virtual ৩২। প্ল্যান বানাতে ~৫০০ ms (আগে ~১২০ ms, গেম শুরুতে একবার)
- ছোট ব্লকে side বোর্ড ১৩৮, এখনো খুব ছোট (৭৫ মি-র কম) ৩৩
- highway ৮/৮ ও arterial ১৮/১৮ রাস্তায় বোর্ড আছে, collector ৩১/৩৪ (আগে ২৫), local ৯২/২৬৭ (আগে ১৩)
- ৫০০ মি-র বেশি বোর্ডহীন stretch: ৪৯ → ২০ (এক দিকে)
- **এখনো বোর্ড নেই:** ১২৭টা earth (কাঁচা) রাস্তা (ইচ্ছাকৃত, গ্রাফের বাইরে), collector S29 (১৫৩৯ মি, pad নেই), S17 (২২৯১ মি) ও S20 (১২৫৯ মি) (শেষ হয়ে যাওয়া রাস্তা, লেখার মতো জায়গা নেই), ৪৯টা local ছোট রাস্তা। Sea Airport এর কাছের রাস্তা এখনো ~৯৫০ মি দূরে (সংযোগ সেতু জালের বাইরে), এটা ঠিক করা হয়নি
- Texture মেমরি (আমার হিসাব, RGBA + mip, সবচেয়ে খারাপ জায়গা, `unpaint` সীমা ধরে): Low ~৯৫ MB (৩২টা), Medium ~১৫৯ MB (৫৮টা), High ~২৩২ MB (৮২টা)। ভাগ করে ৭২১ মুখের ৩১টা বাঁচে (লেখা প্রায় সব আলাদা, কিমি আলাদা)। **এটা গেমে মাপা হয়নি**

## ৪. কীভাবে চেক করবে

```
npm run typecheck
npx tsx scripts/signs-plan-test.ts       # শেষে ALL PASS, উপরে coverage রিপোর্ট
npx tsx scripts/signs-gantry-test.ts     # ALL PASS, texture মেমরির লাইন
npx tsx scripts/signs-distance-test.ts   # ALL PASS (WARN: Sea Airport, জানা)
npm run dev
```

গেমে:

1. F12 → Console: `[RoadSigns] Step 3 plan: 483 boards ... (32 virtual)` ও `Step 5: ...` লাইন। স্পনের কাছে আর ৩টা নকল বোর্ড থাকবে না
2. F3 (DebugPanel): "সাইন বোর্ড" সারি, বোর্ডের দিকে গেলে "লেখা আঁকা" বাড়বে, দূরে গেলে কমবে
3. গাড়ি নিয়ে gantry-র খুঁটি ও side বোর্ডের খুঁটিতে ধাক্কা দাও: আটকাবে। বোর্ডের নিচ দিয়ে (gantry) যাওয়া যাবে। হেঁটেও দেখো
4. ছোট মোড়ের আগে (collector / local) side বোর্ড, লম্বা collector-এ প্রতি ~১.৫ কিমিতে confirm
5. Settings → Quality: Low = বোর্ড কাছে এলে তবেই লেখা, High = আগেই। (Quality বদলে reload লাগে)
6. FPS: শহরের ঘন অংশ, highway, আর Low/High দুটোতে দেখো

## ৫. সীমা

- collider: gantry-র ওপরের বিম ও বোর্ডে নেই (৫.৬ মি উঁচু, গাড়ি পৌঁছায় না)। বিমান/হেলিকপ্টার ধাক্কা খাবে না
- virtual pad আন্দাজে ধরা: দুই রাস্তার শেষ বিন্দু ৮ মি-র মধ্যে লাগা, বা সমতলে ক্রস করা। ভুল মোড় ধরলে বলো কোথায়
- ছোট ব্লকের side বোর্ড আসলে advance বোর্ড (একাধিক সারি হতে পারে), ৭৫–১৩০ মি ব্লকে। খুব ঘন লাগলে `shortBlockMinM` বাড়াও
- আমি ব্রাউজারে গেম চালাতে পারিনি: collider ঠিক জায়গায় বসছে কি না, FPS, লেখা জ্বলে-নিভে কি না, texture মেমরি, এসব তোমার চেক
