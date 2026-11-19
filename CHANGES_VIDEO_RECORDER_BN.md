# Video recorder (2026-11-19)

Ki holo: toolbar e 🎥 button (ba F9 key) -> panel -> "রেকর্ড শুরু" dile game er chhobi + sound MP4 (ba WebM) file hoye nambe. Social media (Facebook, YouTube, TikTok, Instagram) e deoar moto.
Thamate: F9 ba oporer lal bar er "থামাও".

Option:
- Akar: screen jemon / 16:9 / 9:16 / 1:1 / 4:5 (centre crop, chhobi chyapta hoy na)
- Man: shadharon / bhalo / sorbocho; size 720p / 1080p / 1440p / 4K; 30 ba 60 fps
- File: auto (MP4 age) / MP4 / WebM; auto-stop (30s .. 10 min)
- Sound: game sound, microphone (nijer golar), baire theke gaan/sound file (volume slider, kotha theke shuru, "ami-o shunbo")
- Shudhu 3D chhobi record hoy: menu, HUD, minimap ashe na.

File: NEW src/record/VideoRecorder.ts (panel + recording), src/record/AudioTap.ts (game sound dhora), src/record/VideoRecorderMeta.ts (pure hishab), scripts/video-recorder-test.ts;
CHANGED src/core/Engine.ts (button, F9, onFrame after render, dispose), src/main.ts (installAudioTap), package.json (test:video-recorder), HANDOFF.md.
Check: npx tsx scripts/video-recorder-test.ts ALL PASS; recorder files tsc clean (stub diye alada); full project tsc ar browser e dekha hoyni.
Sima: browser er speechSynthesis (Bangla/English kotha bolar voice) kono web page record korte pare na, oi line video te ashbe na. Mic er jonno localhost ba https lage.
Baki: browser check (MP4 file Facebook e upload, mic, gaan file, 9:16, 60 fps, boro file).
