# 360 photo (2026-11-16)

Ki holo: toolbar e 📷 button (ba F8 key) -> panel -> "ছবি তোলো" dile 360 (2:1 equirectangular) JPEG nambe, GPano XMP soho, jate Facebook e post korle ghorano jay.
Option: size (4096 / 6144 / 8192), drone height (0 / +50 / +100 / +200 m), shomoy (ekhon / din / raat), EVCity badge (payer niche).

File: NEW src/ui/Photo360Meta.ts, src/ui/Photo360.ts, scripts/photo360-test.ts; CHANGED src/core/Engine.ts, package.json, HANDOFF.md, HANDOFF_360_PHOTO_BN.md.
Check: npx tsc --noEmit clean; npx tsx scripts/photo360-test.ts ALL PASS (40). GPU part browser e dekha hoyni.
Baki: weather option, browser check (mirror, brightness, seam, Facebook).

## Update: ghurano viewer
JPG normal ছবি-viewer e chyapta dekhay (eta normal). Tai panel e notun "ফাইল" option: JPG + ghurano viewer (.html, mouse diye tano jay) / shudhu JPG / shudhu viewer.
File: NEW src/ui/Photo360Viewer.ts; CHANGED src/ui/Photo360.ts, scripts/photo360-test.ts (54 PASS), HANDOFF.md, HANDOFF_360_PHOTO_BN.md.
Browser e dekha hoyni; tsc full project e chalano hoyni.
