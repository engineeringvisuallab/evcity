# MISSIONS v1.0 (Stage 13)

গেমের জগৎ বদলায় না। শুধু প্রশ্ন করে, উত্তর যাচাই করে, আর মিনিম্যাপে লোকেশন ট্র্যাক করে।

## নতুন ফাইল
- `src/missions/MissionTypes.ts` : টাইপ
- `src/missions/MissionData.ts` : ৫টি মিশন (নতুন মিশন যোগ করতে এখানে একটি object লিখুন)
- `src/missions/MissionVoice.ts` : প্রশ্ন পড়া (speechSynthesis), উত্তর শোনা (SpeechRecognition), সংখ্যা পার্সার
- `src/missions/MissionManager.ts` : মিশন লজিক, ট্র্যাকার চিপ, প্রশ্নের উইন্ডো, progress (localStorage)
- `scripts/mission-test.ts` : `npm run test:missions`

## বদলানো ফাইল
- `src/ui/Minimap.ts` : মিশন পিন, ট্র্যাক করা মিশনের জন্য dashed লাইন, pulse ring, ম্যাপের বাইরে হলে কিনারায় তীর + দূরত্ব
- `src/core/Engine.ts` : MissionManager তৈরি, প্রতি ফ্রেমে আপডেট, `\` কী দিয়ে মিশন লিস্ট
- `package.json` : `test:missions` স্ক্রিপ্ট

## ব্যবহার
1. ডানদিকে মিনিম্যাপের নিচে `📋 Missions` বাটন (বা `\` কী)।
2. মিশনে Track চাপলে মিনিম্যাপে হলুদ ট্র্যাকার আসে।
3. পৌঁছালে `▶ START`। প্রশ্ন ইংরেজিতে পড়ে শোনানো হয়। 🎤 চেপে বলুন বা টাইপ করুন।
4. পাস করলে "Work completed" ও badge।

## মিশনের ধরন
field (⚠), meeting (M), presentation (P)।

## নোট
- ভয়েস উত্তরের জন্য Chrome বা Edge লাগবে (Firefox এ টাইপ করতে হবে)।
- Mission text পুরোটা ইংরেজি।
