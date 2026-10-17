# বাংলা ভয়েস ফাইল

এখানে প্রতিটি ভয়েস লাইনের জন্য একটি ফাইল রাখো, নাম = লাইনের id:

    welcome.mp3   ->  src/i18n/bn.ts এর voice.welcome এর বাক্যটি পড়ে রেকর্ড করা

ফাইল থাকলে গেম সেটাই বাজাবে। না থাকলে ব্রাউজারের বাংলা TTS ভয়েস, আর তাও না থাকলে শুধু সাবটাইটেল দেখাবে।

## ট্যুরের ভয়েস ফাইল

ট্যুর সিস্টেমের লাইনগুলোর জন্যও একই নিয়মে ফাইল রাখা যায় (বাক্য: `src/i18n/bn.ts` এর `voice`):

    tourWaitBoth.mp3, tourWaitHeli.mp3, tourWaitCar.mp3, tourNoVehicle.mp3, tourNeedFoot.mp3,
    tourChoose.mp3, tourGoing.mp3, tourArrived.mp3, tourNoPad.mp3, tourNoRoute.mp3, tourCarStuck.mp3
