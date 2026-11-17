# CHANGES - PERF STEP 1: marineFish (সামুদ্রিক মাছ) - ১.১৮ M triangle থেকে প্রায় ০ / ৪ k

## সমস্যা (F2 রিপোর্টে মাপা)
`Scene > WorldRoot > marineFish`: **1,178,496 triangle**, 1 mesh, 528 instance, সব জায়গায় সবসময় আঁকা (মোট triangle-এর প্রায় ১/৩)।

কারণ দুটো (কোড পড়ে + স্ক্রিপ্টে মেপে নিশ্চিত):
1. **প্রতিটা মাছে 2232 triangle**: শরীর (loft) মাত্র 312, কিন্তু চোখ/পাখনার ১০টা ছোট "ball" প্রতিটা 12x9 segment = 10 x 192 = 1920 triangle।
2. **মরা slot-ও আঁকা হতো**: 22 school x 24 slot = 528 instance সবসময় mesh-এ, মরা/নেই এমন মাছ `scale 0` করা থাকত, কিন্তু GPU vertex shader সবগুলোর জন্য চালাত। mesh `visible` থাকত, এমনকি ডাঙায়/পানির কাছে না থাকলেও (`MarineLife.update` তখন ডাকা হয় না, তাই সব frozen অবস্থায় আঁকা থেকে যেত)।

## কী বদলেছে
- `src/water/ReefFish.ts`: মাছের model এখন **৩ স্তরে**: কাছে (~840 tri: মসৃণ শরীর, চোখ, সব পাখনা), মাঝারি (~208: মোটা শরীর, ৪ পাখনা, চোখ নেই), দূরে (~130: spindle + পিঠের পাখনা + লেজ)। তিনটার আকার একই (দৈর্ঘ্য/উচ্চতা ~11% এর মধ্যে; দূরের দুই স্তরে বুকের পাখনা নেই বলে প্রস্থ ৩৭% কম = ~৫ সেমি, চোখে পড়ে না)।
- `src/animals/Loft.ts`: `ball()` এ ঐচ্ছিক `ws, hs` (default 12, 9 = আগের মতো, প্রাণীর model বদলায়নি)।
- `src/water/MarineLife.ts`:
  - ৩টা InstancedMesh (`marineFish`, `marineFishMid`, `marineFishFar`), একই material। simulation আগের মতো (CPU, 528 slot), কিন্তু **আঁকার জন্য প্রতি frame-এ শুধু জীবিত + camera-র view-তে থাকা + কাছের মাছ** পরপর সাজিয়ে `mesh.count` সেট করা হয়। মরা slot, পেছনের মাছ, দূরের মাছ = GPU-তে ০ খরচ।
  - দূরত্ব অনুযায়ী স্তর বাছা (বড় মাছ = কাছের মতো ধরা, `min(2.5, max(1, 2 x দৈর্ঘ্য))` দিয়ে ভাগ); preset-এর cap ভরে গেলে সস্তা স্তরে নামে, তারপর আঁকা হয় না।
  - frustum culling মাছ ধরে ধরে (floating origin ধরে)।
  - **`idle()`**: কাছে পানি না থাকলে (Underwater `else` শাখা) সব fish/jellyfish/turtle mesh `visible=false`, count 0।
  - preset অনুযায়ী school সংখ্যা সীমা (`Q.marineSchools`), পানির মান বাটনের সীমার সাথে দুটোর কমটা।
- `src/core/Quality.ts`: নতুন ৭টা field, low/medium/high তিনটাতেই (PERFORMANCE_RULES 2.1):

| field | low | medium | high |
|---|---|---|---|
| marineSchools | 8 | 14 | 22 |
| marineFishHi / Mid / Far (cap) | 32 / 64 / 120 | 64 / 110 / 200 | 160 / 240 / 528 |
| marineFishNear / MidDist / FarDist (m) | 14 / 38 / 75 | 20 / 55 / 100 | 30 / 80 / 150 |

- `src/water/Underwater.ts`: `life.update(..., camera)` আর `else life.idle()`।
- `src/ui/PerfOverlay.ts`: F2 রিপোর্টে নতুন লাইন `marine fish (preset ...)` (সীমাগুলো)।
- নতুন টেস্ট `scripts/marine-fish-lod-test.ts` (`npm run test:marine-fish`, `npx tsx scripts/marine-fish-lod-test.ts [low|medium|high] [waterQuality 0|1|2]`)।

## মাপ (স্ক্রিপ্টে; F2 HEAVIEST-এর একই সূত্র: triangle = index/3 x mesh.count, শুধু visible mesh)
| অবস্থা | আগে | এখন (low) | এখন (medium / high) |
|---|---|---|---|
| ডাঙায় / পানি কাছে নেই | 1,178,496 | **0** (draw call 0) | 0 |
| খোলা সাগর, সাধারণ দৃষ্টি | 1,178,496 | **4,160** | worst 22,208 |
| ডুবুরি school-এর ভেতরে, school-এর দিকে তাকিয়ে (worst) | 1,178,496 | 24,304 | 47,880 |
| কোনো view-culling ছাড়া (সবদিক, worst) | 1,178,496 | 39,204 | 71,822 / 85,460 |
| preset cap-এর তাত্ত্বিক সর্বোচ্চ | - | 55,792 | 102,640 / 252,960 |

Low-এ target <= 100 k: **পূরণ** (worst 39 k, cap-এর সর্বোচ্চ 56 k)।
Draw call: মাছের আগে সবসময় 1, এখন 0 (ডাঙায়) থেকে সর্বোচ্চ 3। Geometry: +2 (৩টা মাছের geometry)।

## টেস্ট
- `npx tsc --noEmit` পাস, `npm run build` পাস।
- `scripts/marine-fish-lod-test.ts`: low / medium / high সবগুলোতে সব PASS (geometry বাজেট, আকার, preset ক্রম, ডাঙায় ০, cap, view culling, idle, রঙ/pattern পৌঁছানো)।
- `animals-test` (মাছ 120 max, পানির বাইরে 0), `bird-test`, `shadow-quality-test` পাস।
- `quality-density-test` আগেও একইভাবে fail করত (grassSet-এ `toFixed`, HANDOFF-এর পুরনো FAIL তালিকায় আছে; আসল Quality.ts দিয়ে চালিয়ে মিলিয়েছি) - এই কাজের সাথে সম্পর্ক নেই।

## ব্রাউজারে মাপা হয়েছে? না
এই পরিবেশে GPU / ব্রাউজার নেই। সংখ্যাগুলো হেডলেস স্ক্রিপ্টের (F2-র একই সূত্র)। আপনার PC-তে F2 -> Copy report আবার নিয়ে HEAVIEST তালিকায় `marineFish` লাইন মেলান: ডাঙায় লাইনটা থাকবেই না; পানির কাছে low-এ প্রায় 5 k - 40 k। আগের রিপোর্টগুলো থেকে 1.18 M বাদ দিলে আনুমানিক মোট: 3.65 -> ~2.47 M, 3.59 -> ~2.41 M, 2.78 -> ~1.60 M (গুণফল নয়, বিয়োগ করে হিসাব, মাপা নয়)।
চোখে দেখা হয়নি: কাছের মাছের চোখ/পাখনা আগের চেয়ে একটু কম মসৃণ (ball 12x9 -> 8x5 / 6x4)। কাছ থেকে কোণা কোণা লাগলে `ReefFish.ts`-এ `fw / fh` বাড়ান।

## লোডের উপর প্রভাব: কম (অনেক কমেছে)
- নতুন draw call: ডাঙায় -1, পানির কাছে 1 -> সর্বোচ্চ 3; triangle: -1.18 M (ডাঙায়), low-এ পানির কাছে ~-1.14 M।
- Low tier এ কী কমানো হয়েছে: school 8, মাছ cap 32/64/120, দূরত্ব 14/38/75 m, model ৩ স্তর।
- Shadow: মাছ `castShadow` আগের মতো false (default), কোনো নতুন light নেই।
- lazy/dispose: পানি কাছে না থাকলে mesh লুকানো (`idle`), dispose-এ ৩টা geometry + ৩টা mesh।
- ব্রাউজারে মাপা হয়েছে? না (উপরে দেখুন)।

## পরের ধাপ
Step 2: গাছ (`vegetation > trees kind0..17`, 1.5-2 M triangle, target <= 400 k at low)।
