# Patch 4: zebra crossing + median gap in front of City Mall, real soil texture

- MedianPlan.ts: `crossings` = for every City Mall door (MALL_DOORS) and Config.city.median.crossing.extra, the nearest divided road within maxDist (70 m) gets a gap (7 m, rounded to the 3 m grid) in the median.
  Never inside a junction, never on a bridge. U-turn openings keep 25 m away. Median colliders follow the cut automatically, so people can walk through.
- MedianView.ts: asphalt patch over the gap + white zebra bars across the whole road (barW 0.5, barStep 1.0, band 3.2 m). Median soil = the earth photo of the building kit (real soil texture).
- Roadside.ts: no median tree / hedge inside a crossing (crossingZoneHas).
- Config.ts: city.median.crossing { enabled, gap, zebraLen, barW, barStep, maxDist, extra: [{x, z}] } (add more crossings by world x / z).
Not compiled here (no node_modules): run `npm run dev` and look at the road in front of the mall.
