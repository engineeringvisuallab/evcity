# Export: terrain raster + Road Central Line (key 3) download (2026-11-16)

Ki holo:
- Export panel (📤) e notun section "টেরেন ইমেজ (রাস্টার)": pura 10x10 km map ekta chhobi hishebe (PNG), height file (GeoTIFF), ar key 3 er road centerline soho chhobi.
- GIS layer list e duita notun layer: "রোড সেন্টার লাইন (৩ চাপলে যা দেখায়)" ar "J-xx jonction mark".

Kon file:
- NEW src/roads/debug/RoadCentreSet.ts, NEW src/export/RasterExport.ts, NEW scripts/raster-test.ts
- CHANGED src/export/GisLayers.ts, src/export/ExportPanel.ts, package.json (test:raster), HANDOFF.md

Check: npx tsc --noEmit clean; npx tsx scripts/raster-test.ts PASS; PIL diye PNG/GeoTIFF/pgw porikkha kora. Browser e dekha hoyni.
