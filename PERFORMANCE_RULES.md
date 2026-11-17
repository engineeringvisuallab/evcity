# EVCity — Performance / Load Rules (প্রতিটা update-এ মানতে হবে)

> **Rule 0:** নতুন কিছু add বা update করার আগে এই ফাইল পড়ো। কাজ শেষে নিচের Checklist মেলাও।
> লক্ষ্য: **low-config PC তেও খেলা যাবে**, আর ভালো PC তে সব সুন্দর থাকবে (Auto সিস্টেম)।
> নতুন chat-এ কাজ শুরুর সময় `evcity.zip` এর সাথে এই ফাইলটাও দিতে হবে (বা repo root-এ রেখে দাও)।

---

## ১. যে সিস্টেমগুলো আগে থেকেই আছে (এগুলো ভাঙা যাবে না, ব্যবহার করতে হবে)

| সিস্টেম | ফাইল | কাজ |
|---|---|---|
| Quality presets (low / medium / high) | `src/core/Quality.ts` → `PRESETS`, `Q` | সব সংখ্যা (গাছ, মানুষ, গাড়ি, দূরত্ব, sign radius ...) tier অনুযায়ী |
| Tier detect + "ধীর পিসি" শেখা | `Quality.ts` → `detectTier`, `SlowDeviceWatch` | পুরনো পিসি ধরে নিচু ক্লাসে রাখে |
| Dynamic resolution | `Quality.ts` → `DynamicResolution` | FPS কমলে ছবির সাইজ কমায় |
| **Shadow: off / low / medium / high / auto** | `src/core/ShadowQuality.ts`, `Environment.applyShadow` | Settings (Tab) → 🌑 ছায়া। Auto নিজে কমে/বাড়ে |
| Perf overlay | `src/ui/PerfOverlay.ts` (F2 বা `?perf=1`) | FPS, draw calls, triangles, shadow level |
| Engineering site merge | `src/engineering/core/optimize.ts` | static mesh merge → কম draw call |
| Lazy site build / dispose | `src/engineering/LazyInfra.ts`, `InfraManager` | দূরের সাইট তৈরি/ডিসপোজ |
| Sign boards: show/paint distance | `Q.signRadiusMul`, `Q.signPaintPerFrame` | text canvas শুধু কাছে, ফ্রেমে সীমিত |

---

## ২. নতুন জিনিস add করলে — অবশ্যই করতে হবে

### ২.১ সংখ্যা / density হলে → `Quality.ts` preset-এ ঢোকাও
- যেকোনো নতুন entity (গাড়ি, মানুষ, প্রাণী, গাছ, বাতি, sign, কণা/particle, ইত্যাদি) যার **সংখ্যা বা দূরত্ব** আছে, তার জন্য `QualitySettings`-এ নতুন field + `low / medium / high` তিনটাতেই মান দাও।
- `high` = আসল মান। `low` ≈ 35–60%, `medium` ≈ 65–85% (বর্তমান preset-এর মতো)।
- hardcode করা সংখ্যা (যেমন `const COUNT = 200`) সরাসরি রাখা যাবে না। `Q.xxx` পড়ো।
- নতুন field যোগ করলে `scripts/quality-density-test.ts` / সংশ্লিষ্ট টেস্ট ঠিক আছে কিনা দেখো।

### ২.২ Shadow নিয়ম (সবচেয়ে ভারী জিনিস)
- নতুন mesh-এ `castShadow = true` **ডিফল্ট দেবে না।** শুধু বড় ও চোখে পড়া জিনিস (বিল্ডিং, বড় গাড়ি, গাছের কাছের LOD) cast করবে।
- ছোট জিনিস (সাইনের ছোট অংশ, রেলিং, তার, ছোট prop, decal, লেখা, glass/transparent, particle, grass) → `castShadow = false`।
- Engineering site / বড় model: `Q.siteShadowMinR` এর নিয়ম মানো (ছোট radius এর mesh shadow cast করবে না)।
- নতুন `DirectionalLight` / `SpotLight` / `PointLight` এ **`castShadow = true` দেওয়া নিষেধ।** একমাত্র shadow-caster হলো সূর্য (`Environment`)। নতুন light মানেই shader ভারী — বাড়তি light ন্যূনতম রাখো।
- shadow সংক্রান্ত সব সংখ্যা `SHADOW_SPECS` (`ShadowQuality.ts`) থেকে আসবে; `Config.environment.shadowMapSize` সরাসরি বদলানো যাবে না।
- নতুন feature টেস্ট করার সময় **shadow বন্ধ** (`?shadow=off`) আর **উঁচু** দুটোতেই দেখো — দুটোতেই ঠিক দেখাতে হবে।

### ২.৩ Draw call / geometry
- একই আকৃতির অনেক জিনিস → `InstancedMesh` (বা merge)। শত শত আলাদা `Mesh` নয়।
- static জিনিস merge করো (engineering site-এ `optimize.ts` আছে)। নড়ে/animate হয় এমন অংশ merge হবে না, আলাদা রাখো।
- material/texture শেয়ার করো; প্রতি object-এ নতুন material বানানো যাবে না। একই geometry বারবার `new` নয়, cache করো।
- নতুন texture ছোট রাখো (সম্ভব হলে ≤ 512px), `maxAniso` মেনে চলো (`Q.maxAniso`)।
- ট্রায়াঙ্গল বাজেট: দূরের LOD-এ কম ডিটেইল। কাছে-ছাড়া জিনিসে হাই-পলি নয়।

### ২.৪ লোড / স্ট্রিমিং
- ভারী জিনিস **ঢোকার সময় নয়, কাছে গেলে** তৈরি করো (lazy build, `siteShowDist` / chunk লোডের মতো)। দূরে গেলে dispose করো (geometry, material, texture, Rapier body সব)।
- শুরুতেই সব তৈরি করা যাবে না। নতুন বড় সিস্টেম মানে নতুন lazy chunk (`LazyInfra` এর মতো) — initial bundle বাড়ানো যাবে না।
- Physics collider/body শুধু **কাছে** active রাখো (`SignPhysics` এর মতো)। বেশি body = ধীর ফিজিক্স।
- Web Worker-এ করা যায় এমন ভারী হিসাব (chunk, placement) main thread-এ আনা যাবে না।

### ২.৫ প্রতি ফ্রেমে কাজ (per-frame)
- `update()` এর ভেতরে **`new Vector3 / new Color / new Array`** নয় — আগে থেকে বানানো temp object ব্যবহার করো।
- ভারী কাজ প্রতি ফ্রেমে নয়: প্রতি n-তম ফ্রেমে বা সময়-ভিত্তিক (যেমন mirror ১২ ফ্রেমে একবার বাছাই)। এক ফ্রেমে সীমিত সংখ্যক (`signPaintPerFrame` এর মতো budget)।
- canvas texture আঁকা (লেখা/sign/HUD) শুধু বদলালে করো, প্রতি ফ্রেমে নয়।
- নতুন extra scene render (mirror, minimap 3D, camera view) যোগ করা যাবে না — করতেই হলে `low` এ বন্ধ থাকবে (`mirrorLive: 0` এর মতো)।
- `console.log` loop এর ভেতরে নয়।

### ২.৬ UI / HUD
- DOM বারবার rebuild নয়; শুধু text/class বদলাও, আর বদলালেই লেখো।
- নতুন overlay/animation ফোন ও পুরনো পিসিতে ভারী হতে পারে — CSS `will-change`/blur বেশি ব্যবহার করো না।

---

## ৩. Auto সিস্টেমের সাথে সামঞ্জস্য (গুরুত্বপূর্ণ)

- Shadow **Auto** মোডে FPS কমলে নিজে কমে → তাই নতুন feature যেন shadow-এর ওপর **নির্ভর না** করে (shadow বন্ধ থাকলেও দেখতে/খেলতে ঠিক থাকতে হবে)।
- FPS target ধরা হয় `Q.fpsCap || 60`। নতুন কিছু যেন FPS **হিসাবে ভুল ঢোকায়** না (যেমন নিজের আলাদা frame cap)।
- নতুন runtime-বদলানো যায় এমন setting বানালে: settings menu-তে বাটন, `localStorage` এ সেভ, `?param` URL override, আর **Auto অপশন** — Shadow-এর মতো।
- নতুন setting/limit-এর মান **Perf overlay (F2) রিপোর্টে** যোগ করো, যাতে মাপা যায়।

---

## ৪. কাজ শেষে Checklist (✅ না মিললে update শেষ নয়)

- [ ] নতুন সংখ্যা/দূরত্ব → `Quality.ts` তিন preset-এই আছে (hardcode নেই)
- [ ] নতুন mesh-এ `castShadow` ইচ্ছা করে ঠিক করা (ছোট = false); নতুন light shadow-cast করে না
- [ ] অনেক একই জিনিস = instanced/merged; নতুন material/geometry অপ্রয়োজনে বানানো হয়নি
- [ ] ভারী জিনিস lazy build + dispose; শুরুতে সব লোড হয় না
- [ ] per-frame এ allocation নেই; ভারী কাজ throttled/budgeted
- [ ] নতুন extra render pass নেই (বা low এ বন্ধ)
- [ ] `?quality=low&shadow=off&perf=1` এ চালিয়ে FPS / draw calls / triangles দেখা হয়েছে
- [ ] `?quality=high&shadow=high` এ সুন্দর দেখাচ্ছে
- [ ] আগের সংখ্যার সাথে তুলনা করে **draw call ও triangle কত বাড়ল** — রিপোর্টে লেখা হয়েছে
- [ ] `npm run typecheck`, `npm run test:shadow` (+ সংশ্লিষ্ট test) পাস
- [ ] `CHANGES_*_BN.md` এ "লোডের উপর প্রভাব" লাইন যোগ হয়েছে (কম/মাঝারি/বেশি + কেন)

---

## ৫. Reply/Report ফরম্যাট (কাজ শেষে এটা লিখতে হবে)

```
লোডের উপর প্রভাব: কম / মাঝারি / বেশি
- নতুন draw call: ~N, triangle: ~N (আনুমানিক)
- Low tier এ কী কমানো হয়েছে: ...
- Shadow: কোন mesh cast করে / করে না: ...
- lazy/dispose: আছে / নেই (কেন)
- ব্রাউজারে মাপা হয়েছে? হ্যাঁ/না (না হলে স্পষ্ট লিখবে)
```

---

## ৬. যা কখনোই করা যাবে না

1. নতুন `castShadow = true` light
2. low tier এ নতুন লাইভ extra render
3. `Q` / `PRESETS` এড়িয়ে সংখ্যা hardcode
4. শুরুতে সব জিনিস একসাথে তৈরি করা (lazy ছাড়া)
5. প্রতি ফ্রেমে allocation / canvas পুনরায় আঁকা
6. `Config.loop.maxSubSteps`, `Config.environment.shadow*` সরাসরি বদলানো (Quality/ShadowQuality এর মাধ্যমে ছাড়া)
7. অপ্রয়োজনে বড় texture বা hi-poly model যোগ করা

---

*সর্বশেষ আপডেট: 2026-11-09 — Shadow off/low/medium/high/auto + low-PC লোড কমানো (`CHANGES_SHADOW_LOAD_BN.md` দেখো)।*
