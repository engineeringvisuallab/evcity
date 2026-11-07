# টেক্সটাইল ও গার্মেন্টস ফ্যাক্টরি (eng-textile)

নতুন ইঞ্জিনিয়ারিং সাইট: `Textile & Garments Factory` (id: `textile`, category: `materials`)।

## প্রসেস ফ্লো
তুলার বেল → ব্লোরুম → কার্ডিং → রিং স্পিনিং → ওয়েভিং (লুম) → ডাইং (জেট মেশিন) → স্টেন্টার → গার্মেন্টস (কাটিং, সেলাই, ফিনিশিং, প্যাকিং) → স্টোর ও ডক।
সাথে আছে বয়লার হাউস, ওয়াটার প্ল্যান্ট, ইফ্লুয়েন্ট ট্রিটমেন্ট প্ল্যান্ট (ETP), সাবস্টেশন, ফায়ার ট্যাংক, প্রোডাকশন বোর্ড।

## নতুন ফাইল
- `src/engineering/materials/index.ts`
- `src/engineering/materials/textile/{index,layout,tourScript}.ts`
- `src/engineering/materials/textile/parts/{ctx,helpers,site,cotton,spinning,weaving,dyeing,etp,garments}.ts`
- `src/i18n/voice/textile.en.ts` (১৯টি ট্যুর স্টপের narration)
- `scripts/textile-test.ts`

## বদলানো ফাইল
- `src/engineering/core/types.ts`: `InfraCategory` এ `'materials'`
- `src/engineering/index.ts`: `textileDef` রেজিস্টার
- `src/engineering/InfraSites.ts`: `textile` placement (x 775, z -2425, pad 310 x 210)
- `src/city/EngineeringZones.ts`: `eng-textile` এর south gate (world x 665)
- `scripts/eng-zones-test.ts`: `textile` বাদ দেওয়া হয়েছে (সাইট নিজের এলাকার ভেতরে)
- `package.json`: `test:textile`, এবং `test:infra` এ যোগ

## চালানোর কমান্ড
```
npx tsx scripts/textile-test.ts
npm run test:eng-zones
```
এই দুটি real terrain এর ওপর চলে: pad এলাকার ভেতরে আছে কিনা, রাস্তা/পাহাড় লাগছে কিনা, ট্যুর, collider, gate দেখে।
প্রথমবার চালিয়ে pad এর জায়গা (`x`, `z`) দরকার হলে `InfraSites.ts` এ সরিয়ে নিন; gate এর `at` মান = `x - 110`।
