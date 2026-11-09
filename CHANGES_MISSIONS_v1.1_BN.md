# MISSIONS v1.1: EVLab মুছে ফেলা + Presentation Hall মিশন

## ১. EVLab সরানো হয়েছে
- EVLab campus (বিল্ডিং, বেড়া, collider, access road) গেম থেকে বাদ।
- **রাখা হয়েছে** `src/evlab/EVLabSite.ts`: সমতল জায়গা (plot), রাস্তার keep-out, গাছ/ঘাস বাদ দেওয়ার সীমা। নতুন বিল্ডিং এই জায়গাতেই বসবে।
- EVLAB পার্কিং লট (গাড়ি/হেলিকপ্টার) আগের মতোই আছে।
- পুরনো ফাইল মুছতে `delete-evlab-files.bat` একবার চালান (EVLab.ts, EVLabBuilders.ts, EVLabManager.ts, preview-evlab.html)।
- `PreviewRig.ts` এখন শুধু Library দেখায়। `parking-fence-test.ts` শুধু পার্কিং লট টেস্ট করে।

## ২. নতুন মিশন: Presentation at the EVLab Office (🎤, মিনিম্যাপে teal `H`)
1. EVLab plot এর দক্ষিণ প্রবেশপথে যান (মিনিম্যাপে ট্র্যাক করা যায়)।
2. **Enter** চাপলে Presentation Hall এ ঢোকা যায়। **Enter** চাপলে বের হওয়া যায় (মাঝপথে বের হলে একবার জিজ্ঞেস করে, মার্ক হারাবে)।
3. টপিক বাছুন: **Islamic Life** (চালু)। Water Supply সহ ১০টি ইঞ্জিনিয়ারিং টপিক "Coming soon"।
4. ভয়েসে শুরু করুন: "Start" বা "Good morning everyone"।
5. নিচে ৩ লাইন করে আসে। জোরে পড়ুন। যে শব্দ বলবেন সেগুলো সবুজ হয়।
6. মাউসের **wheel** ঘোরালে পরের ৩ লাইন (↑ ফিরে যাওয়া)। টাচ ডিভাইসের জন্য ▲ ▼ বাটন।
7. শেষ পেজ ভয়েসে পড়ে **Finish** করলেই মার্ক পাবেন। ভয়েস না দিলে মার্ক নেই।
8. ভালো পড়লে (পেজ ৮০%+) নরম হাততালি, ৬০%+ হলে সবাই হাততালি ও "Nice!", ৭৫%+ হলে বড় ভিড়ের উল্লাস।

মার্ক = প্রতিটি পেজের গুরুত্বপূর্ণ শব্দের কত শতাংশ বলা হয়েছে (গড়)। ৩০% এর নিচে হলে ওই পেজে ০। পাস ৬০%।

## ৩. এখনকার Hall কেমন
বিল্ডিং এখনও নেই। তাই Hall হলো একটি অস্থায়ী মঞ্চের দৃশ্য (পর্দা, পর্দার ফ্রেম, শ্রোতা, নিচে ৩ লাইন)। পরের ধাপে ১০০ m / ১৫০ m বিল্ডিং, Ground Floor এর conference room, বিশাল stage ও বসে থাকা শ্রোতা 3D তে বানালে এই Hall এর লজিক (টপিক, ভয়েস, মার্ক, wheel) সরাসরি সেখানে বসবে।

## ফাইল
নতুন: `src/missions/Hall*.ts`, `PresentationHall.ts`, `delete-evlab-files.bat`
বদল: `MissionTypes/Data/Voice/Manager.ts`, `Minimap.ts`, `Engine.ts`, `src/evlab/index.ts`, `PreviewRig.ts`, `mission-test.ts`, `parking-fence-test.ts`
