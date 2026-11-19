# CHANGES — গাড়িতে থাকলে দূরের বিল্ডিং render না হওয়া (white box) fix

## সমস্যা
- গাড়ি চালিয়ে অনেক দূর গেলে বিল্ডিং/সাইট সাদা বাক্স বা অদৃশ্য থাকে; গাড়ি থেকে নামলে ঠিক হয়ে যায়।

## কারণ
- `Player.setInVehicle(true)` করলে player capsule ফিজিক্স থেকে বাদ যায়, আর `afterStep()` / `render` position আপডেট হয় না (ট্রেন/প্লেনের মতো `carryTo` গাড়িতে নেই)।
- অথচ Mall, Library, EVLab, ProtoBuilding, PlacedBuildings, FillBuildings, Airport, Army, Agro, Farm, LazyInfra (engineering site) — সবার `playerWorld` ছিল `this.player.getWorldPosition(out)`।
- ফলে গাড়িতে থাকার সময় এরা ভাবত player এখনো গাড়িতে ওঠার জায়গাতেই আছে → দূরের জিনিস show/lazy-build হতো না। নামলে `teleportTo` দিয়ে player আবার সঠিক জায়গায় আসত, তখন render হতো।

## Fix (শুধু `src/core/Engine.ts`)
- নতুন `private focusWorld(out)`: হেলিকপ্টার পাইলট → নৌকা → গাড়ির driver → না থাকলে player; constructor চলাকালীনও safe (`?.`)।
- ১৪টা `playerWorld: (out) => this.player.getWorldPosition(out)` বদলে `this.focusWorld(out)`।
- ইচ্ছা করে বদলানো হয়নি: mission (player-এর উচ্চতা), water/oxygen, GotoPanel — এগুলো সত্যিই player-এর।

## টেস্ট (তোমার পিসিতে)
1. গাড়িতে উঠে বিল্ডিং/সাইট ছাড়িয়ে অনেক দূর যাও, তারপর ফিরে আসো — গাড়ি থেকে না নেমেই বিল্ডিং দেখা যাবে।
2. হেলিকপ্টার/নৌকা দিয়েও একই দেখো।
3. `npm run typecheck` চালাও (আমি এখানে node_modules না থাকায় চালাতে পারিনি — NOT RUN)।

## এখনো যা যাচাই বাকি
- দূরে গাড়ি নিয়ে গেলে যদি তখনো কিছু সাদা বাক্স থাকে, তাহলে সেটা অন্য কারণ (যেমন SHOW_DIST সীমা বা chunk LOD) — তখন কোন জিনিসটা সাদা থাকছে বলো।
