/**
 * Central configuration. Every magic number lives here.
 * Units: metres, seconds.
 */
export const Config = {
  world: {
    /** World is exactly 10 km x 10 km (the playable area). */
    size: 10_000,
    /** One chunk = 500 m x 500 m -> exactly 20 x 20 chunks. */
    chunkSize: 500,
    /** Extra chunk rings rendered outside the playable area so the edge is never a visible void. */
    chunkMargin: 2,
    /** Master seed. Same seed -> same world, nothing stored on disk. */
    seed: 20260101,
  },

  terrain: {
    /**
     * Brown SOIL (with pebbles) showing through the grass on flat land: soil share = smoothstep(soilFrom, soilTo, noise). The noise is ~0.5 on average,
     * so 0.50..0.64 was about half of the land; 0.30..0.44 makes soil the main ground (~80 %), with green patches in between.
     * Lower both = more soil, higher = more green.
     */
    soilFrom: 0.3, // soil is the main ground again: grass only in patches (was 0.8 / 0.95 = grass everywhere, too heavy for the PC)
    soilTo: 0.44,
    /**
     * GREEN CITY GROUND: inside the planned city areas (CityPlan: distance to the site hub < maxRadius) the ground is lawn green, not brown soil.
     * The chunk worker builds a per-vertex greenness mask (`aCity`): 1 inside the city, falling to 0 over `fadeOut` metres outside it.
     * The terrain shader multiplies the soil share (and the soil on slopes) by (1 - greenness * `amount`) and tints the grass colour `lawnTint`
     * towards a fresh lawn green. amount 0 = old behaviour (brown soil everywhere).
     */
    cityGreen: { amount: 0.55, fadeOut: 120, lawnTint: 0.35, slopeSoilKeep: 0.25 },
    seaLevel: 0,
    /** Highest possible terrain point (rim mountains). Used by shader/snow line and sanity checks. */
    maxHeight: 650,
    /** Skirt depth (m) per LOD: hangs below chunk borders to hide cracks between different LODs. */
    skirtDepth: [8, 16, 32, 64] as number[],
    /** Main island in the southern sea (about 2 km2). Centre in world metres (x east, z south). */
    island: {
      x: -1400,
      z: 4050,
      /** Mean radius (m) of the shoreline; the real outline is bent by noise. pi*830^2 = 2.16 km2 */
      radius: 830,
      /** How strongly noise bends the outline (0 = perfect circle). */
      wobble: 0.26,
      /** Highest hill at the middle of the island (m above sea). */
      peak: 46,
      /** Height (m) of the sand beach shelf right at the shoreline. */
      beach: 1.4,
    },
    river: {
      /** Coarse grid (m) used once at start to route rivers downhill (priority-flood). */
      gridStep: 80,
      /** Drainage area (in grid cells) a cell needs to become a river. Lower = more rivers. */
      accThreshold: 450,
      /** A river never cuts a gorge deeper than this (m); deeper -> river ends in a pond. */
      maxCut: 22,
      maxLakes: 3,
    },
  },

  roads: {
    /**
     * The road network grows tier by tier (one tier per stage), never all at once:
     *   1 = main roads (freeways)  2 = + primary (arterial)  3 = + secondary (collector)  4 = + tertiary (local / city streets).
     * Stage 6A = 1, 6B = 2, 6C = 3.
     */
    activeTier: 4 as 1 | 2 | 3 | 4,
    /** The long bridge to the island and the island's road network (RoadPlan.ISLAND_PLAN). */
    island: true,
  },

  /** STAGE 10: the city (local streets, then buildings). */
  city: {
    /**
     * ROADS STEP 1: the cross-section of every road kind, ONE source (roads/RoadSection.ts reads it, scripts/road-section-check.ts checks it).
     * Metres. A DIVIDED section (median) is built from these numbers: halfWidth = median half + median-side shy + lanes x laneW + kerb-side shy.
     *   highway   = every old 4-lane main road, now 3 + 3 lanes with a 2.0 m planted median.
     *   arterial  = 2 + 2 lanes with a 1.5 m median (was one wide 11 m carriageway).
     *   avenue    = the 4-lane downtown streets, now 3 + 3 lanes of 3.25 m (40 km/h town street) with a 1.5 m median.
     * collector and local keep their old half width (terrain, junction pads, street plan and buildings were made for it), so they are
     * "undivided": only lane and footpath numbers are listed, for the checks.
     * footpath (verge + walk + kerb) is the TARGET used in Step 3 (raised footpath). In Step 1 the drawn footpath is still roadside.sidewalk.
     */
    roadSections: {
      highway: { lanesPerDir: 3, laneW: 3.5, shyMedian: 0.5, shyOuter: 0.5, medianClear: 2.0, medianKerb: 0.2, kerbH: 0.15, kerbW: 0.2, verge: 1.5, walk: 2.0, fall: 0.02, designKmh: 100 },
      arterial: { lanesPerDir: 2, laneW: 3.5, shyMedian: 0.5, shyOuter: 0.5, medianClear: 1.5, medianKerb: 0.15, kerbH: 0.15, kerbW: 0.2, verge: 1.5, walk: 2.0, fall: 0.02, designKmh: 70 },
      avenue: { lanesPerDir: 3, laneW: 3.25, shyMedian: 0.5, shyOuter: 0.5, medianClear: 1.5, medianKerb: 0.15, kerbH: 0.15, kerbW: 0.2, verge: 1.5, walk: 2.0, fall: 0.02, designKmh: 40 },
      collector: { lanesPerDir: 1, laneW: 3.25, kerbH: 0.15, kerbW: 0.2, verge: 1.5, walk: 2.0, fall: 0.02, designKmh: 50 },
      local: { lanesPerDir: 1, laneW: 3.0, kerbH: 0.15, kerbW: 0.2, verge: 1.2, walk: 2.0, fall: 0.02, designKmh: 30 },
    },
    localRoads: {
      /** City sites that get local streets so far (Stage 10B step 1 = site 0 only; sites 1 and 2 follow). */
      sites: [0] as number[],
      /** Shortest street piece (m); the junction system needs legs of at least `minArm`. */
      minEdge: 60,
      /** Shortest connector to a main road (m): a local pad and a main-road T pad must not overlap. */
      minConnect: 82,
      /** Longest connector (m) built to join a street group to the network. */
      maxConnect: 420,
      /** Extra connectors to main roads are built for street nodes closer than this (m). */
      extraConnect: 240,
      /** Spacing (m) along a tier 1-3 road between two local T-junctions. */
      mainTSpacing: 120,
      /** Nothing is built within this distance (m) of an existing junction of tier 1-3 (its pad is large). */
      junctionKeepout: 80,
      /** Bridges: no local street within this distance (m). */
      bridgeKeepout: 130,
      /** Free ground (m) between a local street edge and a main-road edge / another street edge. */
      clearMain: 14,
      clearLocal: 24,
      /** Wet test margin (m above the water surface) and sample spacing (m) along a street. */
      wetMargin: 2.5,
      sampleStep: 8,
      /** Steepest allowed street (rise / run). */
      maxGrade: 0.06,
      /** Grade limit (rise / run) the junction system may use to ramp a street back onto its profile after a level pad. */
      rampGrade: 0.1,
      /** Cross slope a pad between local streets may have (rise / run); its plane is fitted through the streets. */
      padTilt: 0.06,
      /** A connector stays level for this length (m) at its T-junction with a main road (the length of the pad stub). */
      mainPlateau: 28,
      /** A T-junction meets the road at least this far from parallel (|cos| of the angle to the road <= value). */
      maxCosSkew: 0.35,
      /** Streets keep this far (m) from the border of their area. */
      areaMargin: 6,
      /** Junction pad limits for local streets (Junctions.ts): shortest leg, spacing local-local, spacing local-main. */
      minArm: 40,
      minPadSpacing: 48,
      mixedPadSpacing: 76,
      /** Footpath (sidewalk) width beside local streets (m) used for the CLEARANCE tests of the street planner (kept at 2 so the street plan does not change). */
      sidewalk: 2,
    },
    /**
     * CITY ROADSIDE (Roadside.ts, RoadMesh / RoadMaterial city style). Only roads inside a planned city area (CityPlan.siteAt) get it:
     * paved interlocking-tile sidewalk `sidewalk` m wide on both sides (this is the ribbon shoulder of a city road), a kerb, a lawn strip behind
     * the sidewalk (grass, see vegetation.grass.city), trees in square kerbed pits every `treeSpacing` m, low flowering hedges (`hedge`) along
     * medians and parking edges, street lamps (StreetLights, on the sidewalk).
     */
    roadside: {
      sidewalk: 3,
      /** Tree pits: spacing range (m) along each sidewalk, pit side (m, kerbed square), distance of the pit centre from the asphalt edge (m). */
      treeSpacing: [45, 60] as [number, number],
      /** Street tree size (scale of the normal tree models; small young trees) and colour multiplier (low = deep dark green; normal forest trees are 0.82-1.14). */
      streetTree: { scale: [0.42, 0.6] as [number, number], tint: [0.58, 0.7] as [number, number] },
      pitSize: 1.2,
      /** Pit centre distance from the asphalt edge: 0.75 = the pit stands on the KERB side of the 3 m footpath (a 1.2 m pit then covers 0.15-1.35 m), so the walking strip (pedestrians walk at ~1.85 m) and the lamp poles (2.1 m) stay free. It was 1.0 = the pit sat in the middle of the footpath. */
      pitOffset: 0.75,
      /** Low flowering hedge: height range (m), width (m), spacing of the instances (m) along the line, length of one hedge piece (m, a little more than the spacing so pieces overlap). */
      hedge: { hMin: 0.6, hMax: 0.9, width: 0.8, step: 2.6, pieceLen: 3.1 },
      /** Hedge / pit / shrub / guardrail instances are drawn within this distance (m) of the player (they live in 500 m chunk groups that are shown / hidden at 2 Hz). */
      drawRadius: 380,
      /** Yellow-black striped kerb at the median: stripe length (m) and kerb width (m). */
      kerbStripe: 0.7,
      kerbWidth: 0.35,
      /** Paving tile size (m) of the interlocking pavers (shader). */
      paver: 0.24,
    },
    /**
     * HIGHWAY ROADSIDE outside the cities (Roadside.ts): galvanized W-beam guardrail on embankment and curve sides (posts every `postStep` m),
     * a dirt / gravel shoulder `shoulder` m wide instead of grass, then tall grass clumps and shrubs on the verge (grass patch, see
     * vegetation.grass.verge) and street lights on one side.
     */
    highway: {
      postStep: 4,
      /** Guardrail goes up where the ground beside the road drops more than `dropMin` m within 6 m, or where the road bends tighter than `curveRadius` m. */
      dropMin: 0.8,
      curveRadius: 900,
      shoulder: 1.5,
      railHeight: 0.75,
      /** Lamps on one side only: spacing (m) is the normal highway lamp class spacing times this. */
      lampStepMul: 1.4,
      /** Verge shrubs (the model of the city hedge, bigger): spacing range (m) along each side, distance range (m) beyond the shoulder, scale range. */
      shrubSpacing: [7, 16] as [number, number],
      shrubOffset: [1.4, 6.5] as [number, number],
      shrubScale: [0.8, 1.7] as [number, number],
    },
  },

  /** STAGE 7: vegetation. Step 1 = forest trees (instanced, placed in the chunk worker). */
  vegetation: {
    /** Chunks up to this LOD get trees (0 = nearest only). LOD 0 uses the detailed models, higher LODs the simple ones. */
    maxLod: 1,
    /** Trees and rocks cast shadows into the shadow map. false = no tree shadows (the shadow pass draws every tree a second time: the biggest tree cost, makes the PC hot). */
    treeShadows: false,
    /** Placement grid (m). One tree at most per cell, jittered inside it. 500 / cellSize must be a whole number. */
    cellSize: 10,
    /** Chance (0..1) of a tree per cell: in the middle of a forest / in open land. */
    forestChance: 0.4, // was 0.55: fewer trees in forests
    scatterChance: 0.02, // was 0.035: fewer lone trees
    /** Size (m) of the forest patches (noise wavelength). */
    forestScale: 520,
    /** No tree on ground steeper than this (degrees), the chance fades out from 60 % of it. Was 33: over 60 % of the ground above 200 m is steeper than that, so the hills were bare. */
    maxSlopeDeg: 42,
    /** Free ground (m) above the water surface / above sea level (beach). */
    waterMargin: 1.5,
    seaMargin: 3.5,
    /** Free ground (m) around asphalt, shoulder and junction pads. */
    roadClear: 4,
    /** Trees thin out between these heights (m) and stop above the second one (snow line is ~340 m). Was 230 / 330: the upper half of the hills was bare. */
    treeLineStart: 320,
    treeLineEnd: 420,
    /** Pines replace broadleaf trees between these heights (m); palms grow below `palmBelow` (m). */
    pineFrom: 70,
    pineFull: 150,
    palmBelow: 35,
    /** BIG FOREST TREES (sal, segun, koroi, bot, shimul) in the middle of a forest: share among the forest trees (0..1) and scale range (1 = mature 20-30 m tree). */
    /** Every tree colour is multiplied by this (r, g, b): the leaves were too light / yellow-green; lower = darker, red lower than green = bluer, deeper green. */
    leafDark: [0.78, 0.84, 0.8] as [number, number, number],
    bigTreeChance: 0.45,
    bigTreeScale: [0.55, 1.15] as [number, number],
    /** HOMESTEADS (gram): coconut, date, palmyra palms and banana clumps stand around rural houses. `reach` = ring width (m) beyond the footprint, `chance` per 10 m cell next to the house (fades out to the edge of the ring). */
    homestead: { reach: 32, chance: 0.42 },
    /** POND / LAKE / RIVER BANKS: palms and banana on low land within `reach` m of water. `chance` per 10 m cell, `maxHeight` = only land lower than this (m above sea level). */
    bank: { reach: 9, chance: 0.12, maxHeight: 40 },
    /**
     * BAMBOO GROVES (bash jhar): patches of low, damp land (noise wavelength `scale` m; the patch starts where the noise passes `from` and is full at `full`)
     * covered with bamboo clumps: `chance` per 10 m cell in the heart of a grove. Only land lower than `maxHeight` m, gentle slopes (`slopeMax` = share of the
     * normal slope limit). Scale range of a clump (1 = grown, ~12 m). `homestead` / `bankShare` = the share of bamboo among the homestead / bank trees.
     */
    bamboo: { scale: 300, from: 0.14, full: 0.4, chance: 0.62, maxHeight: 60, slopeMax: 0.55, clumpScale: [0.7, 1.15] as [number, number], homestead: 0.14, bankShare: 0.2,
      /** BAMBOO IN THE DENSE JUNGLE: a clump there is `jungleTall[0]..[1]` times taller (random per clump), fading in with the jungle density (0 outside, full inside); 1 = no change. Its width grows much slower (see `treeWidth`). */
      jungleTall: [3, 5] as [number, number] },
    /**
     * DENSE FOREST (ghono bon): the forest districts of the world map (WorldRegions kind 'forest') are covered with a jungle: nearly every 10 m cell has a
     * canopy tree (`chance`, `bigChance` = share of the five big forest trees), and a second, younger tree grows in the shade of it (`understory` chance per
     * cell, scale range, `bambooShare` of them are bamboo clumps on low land, `bigShare` = young big trees). The jungle fades out over `fade` m at the district edge
     * (a ragged edge). Lower `understory` (and `chance`) if the frame rate drops: they are the number of trees.
     */
    dense: { fade: 260, chance: 0.75, bigChance: 0.62, understory: 0.4, understoryScale: [0.3, 0.85] as [number, number], bambooShare: 0.1, bigShare: 0.1 },
    /** Tree chance (0..1 of the normal chance) inside a planned city area, by zone kind. Unlisted zones get no trees. */
    cityZoneChance: { green: 0.6, recreation: 0.7 } as Record<string, number>,
    /** Outside the plan of a city the forest grows back over this distance (m). */
    cityFadeOut: 150,
    /** Wind sway (m of sway per metre of tree height). */
    windStrength: 0.02,
    /** Trunks are sunk this far (m) into the ground so coarse LOD terrain never leaves them floating. */
    sink: 0.35,
    /** Trunk colliders (Rapier cylinders): created for trees within `collideRadius` (m) of the player, removed beyond `collideKeep`. */
    collideRadius: 50,
    collideKeep: 70,
    /** Trees are grouped in squares of this size (m) - one fixed body per square. Chunk size / this must be a whole number. */
    collideCell: 50,
    /** Max squares given colliders per physics update (5 Hz), so walking into a forest never hitches. */
    collideBuildPerTick: 8,
    /** Rocks: boulders and outcrops, placed like trees. Rocks at least `collideMinHeight` (m) tall collide (smaller ones can be stepped over). */
    rocks: {
      cellSize: 20,
      baseChance: 0.05,
      /** Extra chance on slopes (rise / run 0.35 .. 0.8) and above the tree line (240 .. 380 m). */
      outcropChance: 0.5,
      alpineChance: 0.25,
      maxChance: 0.6,
      roadClear: 5,
      waterMargin: 0.4,
      minHeight: 1.5,
      collideMinHeight: 0.45,
    },
    /** Grass: tufts in tiles around the player (made by the chunk workers on request), fading out with distance. */
    grass: {
      /** Tile size (m) and cell size (m): one tuft at most per cell. tile / cell must be a whole number (and every LOD stride must divide it). 0.25 m = 1.6x denser than 0.32 (short grass needs many tufts to cover the ground). */
      tile: 32,
      cell: 0.5, // was 0.2: 6x fewer cells. 32 / 0.5 = 64, strides 1, 2, 4 divide it
      /**
       * DENSE SINGLE GRASS: every accepted meadow cell grows `dense` single tufts instead of one (7.5 = 7.5x the old density, may be fractional; same cell test, terrain test and
       * deterministic jitter, so the far rings stay a subset of the near ring). The Quality preset sets the value the workers use (low 3, medium 4.5, high 7.5).
       * Far rings (stride > 1) get dense / stride^2 (at least 1). Not applied to the mown city lawn.
       */
      dense: 1, // 1 = no extra tufts at all (was 7.5)
      /**
       * The extra (dense) tufts fade out with the camera distance: full size inside `denseFade[0]` m, shrunk to nothing at `denseFade[1]` m (smooth, no
       * pop), and a tile's extra tufts are not drawn at all when the tile is farther than `denseFade[1]` m. So the 5x density costs only near the player.
       */
      denseFade: [8, 18] as [number, number],
      /** Tiles within `radius` (m) of the player exist, tiles beyond `keep` are removed. */
      radius: 35, // only grass within 35 m exists (was 115)
      keep: 45,
      maxInFlight: 2, // at most 2 tiles asked from the workers at once (was 6): no CPU spikes
      /** Tufts shrink to nothing between these camera distances (m): only at the very edge, so the meadow is always there (like the trees). */
      fadeStart: 22,
      fadeEnd: 33,
      /**
       * SIZE OF THE GRASS. Short, dense grass: a tuft's TALLEST blade is `tuft.maxHeight` m at most (so the blades of a meadow are 1-20 cm); `tuft.min` = the
       * shortest tuft as a share of that (0.2 -> 4 cm). Big clumps (tussocks) are at most `clump.maxHeight` (0.5 m). `widthScale` = how wide a tuft is relative
       * to its height scale (blades lean outwards, so 2.2 gives natural short grass; higher = flatter, wider mats).
       */
      tuft: {
        /** Meadow single grass: tallest blade 0.8 m. */
        maxHeight: 0.64, // was 0.8, x0.8 = a bit smaller
        min: 0.2,
        /** Wildflowers keep 2x the old height (0.4 m). Mown city lawn keeps its old size (0.2 m, then x `city.height`) and its old width scale. */
        flowerMaxHeight: 0.4,
        lawnMaxHeight: 0.2,
        lawnWidthScale: 2.2,
      },
      /** Width of every tuft = its height scale x this. */
      widthScale: 0.8, // was 2.2 when the grass was 3x lower: the tuft is 3x taller but only ~1.5x wider, so the blades stand more upright instead of splaying
      /**
       * Grass LOD rings (like the trees): `to` = up to this distance (m, nearest edge of the tile), `stride` = only every n-th cell gets a tuft
       * (must divide tile / cell = 128: 1, 2, 4), `density` = blades per tuft model, `size` = width of a tuft (fewer tufts, each a bit wider).
       * Far rings have no flowers. The tuft positions of a coarse ring are a subset of the near ring, so nothing jumps when a tile changes ring.
       */
      lods: [
        { to: 10, stride: 1, density: 1, size: 1, clumpStride: 1, clumpDensity: 1, clumpSize: 1 },
        { to: 20, stride: 2, density: 0.5, size: 1.4, clumpStride: 1, clumpDensity: 0.6, clumpSize: 1 },
        { to: 35, stride: 4, density: 0.25, size: 2, clumpStride: 2, clumpDensity: 0.35, clumpSize: 1.35 },
      ] as { to: number; stride: number; density: number; size: number; clumpStride: number; clumpDensity: number; clumpSize: number }[],
      lodHysteresis: 0.12,
      /**
       * GRASS PATCHES: grass does not cover the land evenly. A low-frequency noise (`scale` m, 20..60 looks right) decides where it grows.
       * `coverage` = share of the land that lies inside a patch (the noise threshold is found from the world seed, so it is a real share).
       * Inside a patch the cover is dense: tufts at `density` x the old chance plus clumps (`clumpChance` per clump cell, they overlap).
       * Outside a patch there is bare soil: no tuft at all where the patch value is below `minValue`. The rim is soft: `edge` = softness in noise
       * units (about 4 m at scale 40), and tufts / clumps at the rim are fewer and smaller (`edgeScale` = their size at the very rim, 1 in the
       * core; the core starts at patch value `coreAt`). Road sides and landmark plots are pulled into a patch (`boost` = patch value there,
       * 0 = off): `roadStep` widens the road mask (reach ~ step * 0.6 + shoulder metres), `landmarkReach` m around plots / placed buildings,
       * `gridStep` = resolution (m) of that road / landmark field.
       */
      patch: {
        scale: 40,
        coverage: 0.3, // only 30 % of the land has grass (patches), the rest is bare soil (was 1 = grass everywhere)
        edge: 0.2,
        minValue: 0.25,
        coreAt: 0.35,
        density: 1,
        clumpChance: 0, // no big clumps: only single grass (see `single`)
        edgeScale: 0.5,
        boost: 0.9,
        roadStep: 24,
        landmarkReach: 24,
        gridStep: 2,
      },
      /**
       * GRASS CLUMPS: one clump = 60..110 blades in one bunch (a tussock), ~0.8..1.5 m wide and 0.5..1.1 m tall. They grow on their own
       * grid (`cell`, tile / cell must be whole), only inside patches (see `patch.clumpChance`).
       */
      clump: {
        cell: 1.6,
        /** A clump is at most `maxHeight` m high (50 cm); its width = its height scale x `width` (the far rings make it a bit wider). */
        maxHeight: 1.0, // 2x the old 0.5 m
        width: 1.8,
      },
      /** Chance per cell inside a meadow / on bare patches, and the extra thinning inside forests. Higher = denser, fewer bald patches. */
      maxChance: 0.35, // SPARSE: ~1 cell in 3 grows a tuft (was 0.98 / 0.9 = every cell)
      minChance: 0.15,
      forestThin: 0.3,
      /** Blades per tuft model are multiplied by this (1 = full quality; 0.6 for weak GPUs). */
      bladeDensity: 1,
      /** Wildflowers: share of tufts that carry flowers inside a flower patch / scattered in the open meadow. Patches are ~12-30 m wide. */
      flowerInPatch: 0.05, // was 0.14: far fewer flowers
      flowerScatter: 0.002, // was 0.006
      /** Steepest ground (rise / run) with grass; it thins out from `slopeFadeFrom`. The terrain shader turns to rock at ~0.5. */
      maxSlope: 0.45,
      slopeFadeFrom: 0.28,
      /** Grass thins out above these heights (m); colour goes from green to dry between dryFrom and dryTo (like the terrain shader). */
      heightFadeStart: 200,
      heightFadeEnd: 300,
      dryFrom: 120,
      dryTo: 280,
      /**
       * GREEN CITY LAWN: everywhere inside a planned city area that is not road, pavement, plaza, parking or a building plot (the same `blocked` list as
       * everywhere else) the ground is lawn. No patches there (patch value forced to 1 inside the city, soft edge `edge` m outside it), the 0.5 city thinning
       * of the old `cityChance` is gone. Flag in the data (last float): 2 = lawn tuft, 3 = tall clump at a tree base / fence.
       *   density      tuft chance multiplier of lawn cells (1 = the old open-meadow density; 0.55 keeps the instance count sane)
       *   height       lawn tufts are this fraction of the normal height (short, mown)
       *   clumpChance  small clumps scattered over the lawn (per clump cell), clumpScale their size
       *   baseChance   clumps at tree bases and along plot fences (per clump cell inside the band), baseScale their size (taller), baseReach / fenceReach metres
       *   flowerShare  share of lawn tufts that carry a small flower (daisy, clover, buttercup)
       *   edge         metres over which the lawn blends into the normal patchy meadow outside the city
       */
      city: { density: 1, height: 0.6, clumpChance: 0, clumpScale: 0.8, baseChance: 0, baseScale: 1.3, baseReach: 1.6, fenceReach: 1.4, flowerShare: 0.02, edge: 40 },
      /**
       * HIGHWAY VERGE outside cities: beyond the gravel shoulder the road side is a grass patch (patch value forced up, like the road-side boost) with
       * tall clumps; `reach` = width (m) of the strip next to the shoulder, `clumpChance` per clump cell inside it, `tall` = clump height multiplier.
       */
      verge: { reach: 7, clumpChance: 0, tall: 1.35, density: 1 },
      /**
       * COLOUR: every tuft is fresh green, yellow-green or straw (`strawShare` of the tufts lean to straw outside the city, `yellowShare` to yellow-green).
       * `rootDark` = brightness of the blade at the root (0..1, 1 = no darkening), `wind` = global wind sway multiplier (0 = still air; the sway grows with blade height, so short lawn moves little anyway).
       */
      look: { bladeWidth: 0.84, strawShare: 0, yellowShare: 0, rootDark: 0.6, wind: 0 }, // bladeWidth was 0.28, now x3 wider
      /**
       * SINGLE GRASS: every tuft model has only `blades[0]..blades[1]` blades (3-5 leaves per grass), so the ground can be covered with very many
       * of them cheaply (`cell` 0.2 m). Used for the four grass kinds; flowers keep their own base. enabled false = the old many-blade tufts.
       */
      /** false = NO white things in the grass: no daisy, no clover (white pom-pom), no pale seed-head grass (they become plain green grass). Coloured flowers stay. */
      whiteFlowers: false,
      single: { enabled: true, blades: [3, 5] as [number, number] },
      /** No grass is made while the camera is higher than this above the ground (m): free-fly / helicopter. */
      maxAboveGround: 25,
      /** While the camera moves faster than this (m/s, ~43 km/h) NO new grass tile is asked from the workers (car / plane / free-fly): existing tiles just fall out of range. */
      maxSpeed: 12,
    },
  },

  /** STAGE 9: people on foot. */
  people: {
    /** How many people on foot the world keeps around the player. */
    target: 34,
    spawnEvery: 0.35,
    /** Ring around the player (m) where new people appear / beyond which they are removed. */
    spawnMin: 40,
    spawnMax: 190,
    despawnRadius: 240,
    /** Share of the people who wander in the open (the rest walk along road edges) while the player is in a city zone. */
    wanderShare: 0.4,
    run: 5.2,
  },

  /** Weapons, wanted level and damage balance; player health remains protected. */
  combat: {
    weapons: {
      // Game-balance values for stylised fictional weapons; these are not real-world ballistics.
      pistol:          { interval: 0.30, auto: false, damage: 34, pellets: 1, spread: 0.012, range: 180, gunLength: 0.20, magazine: 12, reserve: 60, reserveMax: 120, reload: 1.4 },
      combatPistol:    { interval: 0.24, auto: false, damage: 39, pellets: 1, spread: 0.010, range: 210, gunLength: 0.22, magazine: 15, reserve: 75, reserveMax: 150, reload: 1.5 },
      heavyPistol:     { interval: 0.38, auto: false, damage: 52, pellets: 1, spread: 0.014, range: 230, gunLength: 0.23, magazine: 8, reserve: 48, reserveMax: 96, reload: 1.8 },
      revolver:        { interval: 0.52, auto: false, damage: 68, pellets: 1, spread: 0.009, range: 260, gunLength: 0.22, magazine: 6, reserve: 36, reserveMax: 72, reload: 2.0 },
      microSmg:        { interval: 0.075, auto: true, damage: 13, pellets: 1, spread: 0.042, range: 125, gunLength: 0.28, magazine: 24, reserve: 144, reserveMax: 288, reload: 1.7 },
      smg:             { interval: 0.085, auto: true, damage: 17, pellets: 1, spread: 0.030, range: 160, gunLength: 0.34, magazine: 30, reserve: 150, reserveMax: 300, reload: 1.9 },
      ak47:            { interval: 0.105, auto: true, damage: 24, pellets: 1, spread: 0.023, range: 270, gunLength: 0.47, magazine: 30, reserve: 180, reserveMax: 360, reload: 2.1 },
      carbineRifle:    { interval: 0.095, auto: true, damage: 22, pellets: 1, spread: 0.018, range: 320, gunLength: 0.46, magazine: 30, reserve: 180, reserveMax: 360, reload: 2.0 },
      shotgun:         { interval: 0.85, auto: false, damage: 14, pellets: 8, spread: 0.065, range: 60, gunLength: 0.50, magazine: 6, reserve: 30, reserveMax: 60, reload: 2.4 },
      sniperRifle:     { interval: 1.15, auto: false, damage: 95, pellets: 1, spread: 0.0035, range: 650, gunLength: 0.62, magazine: 5, reserve: 25, reserveMax: 50, reload: 2.8 },
    },
    /** Q cycles the full fictional GTA-inspired catalogue. */
    order: ['pistol', 'combatPistol', 'heavyPistol', 'revolver', 'microSmg', 'smg', 'ak47', 'carbineRifle', 'shotgun', 'sniperRifle'] as const,
    /** A killed armed person drops this many magazines of his gun (added to the player's reserve ammo). */
    lootMagazines: 1,
    personHealth: 100,
    headshotMultiplier: 3,
    /** Hit cylinder of a person (radius in m; the head starts at this share of the body height). */
    bodyRadius: 0.38,
    headFrom: 0.84,
    /** The gun stays in the hand this long (s) after the last shot / aim. */
    drawSeconds: 4,
    /** While aiming (right mouse button) the camera moves this much closer. */
    aimCameraScale: 0.6,
    /** Aiming makes bullets this much more accurate. */
    aimAccuracy: 0.5,
    /** Bodies stay on the ground this long (s). */
    deadLinger: 25,
    /** Share of the walking people who carry a gun and want to kill the player. */
    thugShare: 0.035,
    /** Armed people see (and start shooting at) the player within this distance (m). */
    sightRange: 38,
    /** They fire only up to this distance (m) and keep this distance (m) while shooting. */
    fireRange: 52,
    keepDistance: 16,
    /** Hit chance of an NPC shot = max(minHit, baseHit - distance * hitFalloff). */
    baseHit: 0.38,
    minHit: 0.05,
    hitFalloff: 0.011,
    /** Damage the player takes per NPC hit - only used for the red screen flash (the player is immortal). */
    npcDamage: 12,
    /** People within this distance (m) of a shot / killing run away (or fight, when armed). */
    alarmRadius: 25,
    fleeSeconds: 10,
    /** Wanted level (time based): crime weight, seconds of crime that keep the window open / each crime adds per weight, fade per second, crime seconds needed for star 1..5, police per star. */
    wanted: { killCivilian: 1, woundCivilian: 0.4, killPolice: 2, shootPolice: 0.6, activeWindow: 20, bonusPerHeat: 0, decay: 2, starAt: [120, 300, 420, 510, 600], policePerStar: 1, spawnMin: 65, spawnMax: 105, spawnEvery: 3.8, leaveAfter: 22 },
  },

  /** STAGE 9: AI traffic. Every vehicle has a driver (a person); there are no empty cars. */
  traffic: {
    target: 12,
    spawnEvery: 0.6,
    spawnMin: 110,
    spawnMax: 260,
    /** Cars farther than this from the player are removed (the physics only runs near the player anyway). */
    despawnRadius: 285,
    /** Minimum free distance (m) to other vehicles when a new car appears. */
    spawnGap: 25,
    /** What kind of vehicle appears, where, and how often: see `use` of each spec in vehicles/VehicleSpec.ts (vehicles/VehicleUse.ts). */
    /** At most this many buses at the same time. */
    maxBuses: 3,
  },

  lod: {
    /**
     * Distance (m, measured to the nearest edge of the chunk) up to which each LOD is used.
     * LOD0 = most detailed ... LOD3 = coarsest. The last value is also the load radius.
     * Near the camera everything is detailed; far away only a coarse, cheap terrain (no trees, no road ribbons) is drawn.
     */
    distances: [380, 900, 1900, 3600] as number[],
    /** Vertices per chunk side for each LOD. */
    vertsPerSide: [128, 64, 32, 16] as number[],
    /** 8 % hysteresis so chunks do not flicker between LODs at the border. */
    hysteresis: 0.08,
  },

  chunk: {
    /** Re-evaluate wanted chunks when the player moved this far (m). */
    reevaluateDistance: 32,
    /** Max chunk requests being generated by workers at the same time. */
    maxInFlight: 10,
    /** Max chunk meshes added to the scene per frame (avoids hitches). */
    maxMeshesPerFrame: 2,
    /** New chunks fade in (dithered) over this many seconds. */
    fadeSeconds: 0.7,
  },

  loop: {
    fixedStep: 1 / 60,
    maxSubSteps: 5,
    /** Frames longer than this are clamped (tab was in background etc.). */
    maxFrameTime: 0.25,
  },

  floatingOrigin: {
    /** When the camera is farther than this from the scene origin (x or z), the origin is re-centred. */
    threshold: 2000,
  },

  environment: {
    /** Fog density (FogExp2). 0.00046 -> ~95 % fogged at the 3.6 km load radius, hides chunk pop-in and the far, coarse terrain. */
    fogDensity: 0.00046,
    shadowExtent: 350,
    shadowMapSize: 4096,
    /** Day / night cycle (see src/environment/DayNight.ts). Night can be switched off in the game with the \ key. */
    dayNight: {
      /** Minutes from sunrise to sunset. */
      dayMinutes: 8,
      /** Minutes from sunset to sunrise (the dusk and dawn colour changes happen inside these times, never as a sudden jump). */
      nightMinutes: 3,
      /** The game starts at this fraction of the day (0 = sunrise, 1 = sunset): mid-morning. */
      startFraction: 0.21,
      /** Seconds the sky needs to fade to full day when the night mode is switched off (and back when it is switched on). */
      switchSeconds: 6,
    },
  },

  player: {
    height: 1.8,
    radius: 0.35,
    /** Metres per second. */
    walk: 4.2,
    run: 8.5,
    swim: 2.6,
    swimSprint: 4.4,
    jump: 5.2,
    /** Feet depth under water (m) to start / stop swimming (hysteresis). */
    swimEnter: 1.25,
    swimExit: 0.75,
    /** Breath under water (seconds), how fast it refills at the surface (per second), seconds at zero before blacking out. */
    oxygenSeconds: 45,
    oxygenRefill: 0.7,
    drownGrace: 5,
    /** Dive speed (m/s) and with Shift. */
    diveSpeed: 2.2,
    diveSprint: 3.4,
    maxSlopeDeg: 55,
    stepHeight: 0.5,
    /** TREE CLIMBING: walk into a trunk and press Space. Up / down speed (m/s), sideways speed round the trunk (m/s), how close (m, from the trunk surface to the body centre) a trunk must be to grab it. */
    climb: { up: 1.7, down: 2.4, around: 1.3, reach: 0.8 },
    /** Invisible wall: the player cannot leave the playable area. */
    bound: 5000,
  },

  orbit: {
    startYaw: Math.PI, // looking south (towards the sea)
    startElevation: 0.35,
    distance: 6,
    minDistance: 2.5,
    maxDistance: 25,
    minElevation: -0.25,
    maxElevation: 1.45,
    /** Camera looks at a point this far above the capsule centre (shoulder/head height). */
    targetHeight: 0.55,
    /** On foot the camera sits this far to the RIGHT of the player (m): the crosshair in the screen centre does not sit on his back. */
    shoulder: 0.9,
  },

  camera: {
    fov: 70,
    near: 1,
    far: 16_000,
    startPosition: { x: 0, y: 140, z: 0 },
    startPitch: -0.3,
    mouseSensitivity: 0.0022,
    baseSpeed: 80,
    minSpeed: 2,
    maxSpeed: 3000,
    boostMultiplier: 8,
    /** Free-fly camera never goes closer than this to the ground (m). */
    groundClearance: 2,
  },
};
