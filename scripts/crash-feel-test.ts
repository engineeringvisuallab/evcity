// CRASH FEEL: headless checks of the tree rules (pass-through, knock-down, solid). Run: npx tsx scripts/crash-feel-test.ts
import { Config } from '../src/core/Config';
import { TREE_TRUNK, TreeKind, treeWidth } from '../src/vegetation/TreeTypes';

let failed = 0;
const ok = (c: boolean, m: string): void => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const V = Config.vegetation;
type Class = 'pass' | 'break' | 'solid';
const classify = (kind: number, scale: number): Class => {
  const s = TREE_TRUNK[kind];
  const r = s.r * treeWidth(kind, scale);
  if (r < V.passRadius || s.h * scale < V.passHeight) return 'pass';
  return r <= V.breakRadius ? 'break' : 'solid';
};
// the small median trees (Roadside MEDIAN_SMALL 0.42..0.62: debdaru, date palm) and the young trees are not solid
ok(classify(TreeKind.debdaru, 0.42) === 'pass' && classify(TreeKind.debdaru, 0.62) === 'pass', 'small median debdaru: no collider');
ok(classify(TreeKind.datePalm, 0.42) === 'pass' && classify(TreeKind.datePalm, 0.55) === 'pass', 'small median date palm: no collider');
ok(classify(TreeKind.broadleaf, 0.25) === 'pass', 'a young broadleaf (scale 0.25, 0.8 m high): no collider');
// full-grown trees
ok(classify(TreeKind.oak, 1) === 'solid', 'a full oak (r 0.55 m) stays solid');
ok(classify(TreeKind.bot, 1) === 'solid' && classify(TreeKind.shimul, 1) === 'solid', 'bot and shimul stay solid');
ok(classify(TreeKind.broadleaf, 1) === 'break', 'a full broadleaf (r 0.42 m) is knocked down by a fast vehicle');
ok(classify(TreeKind.palm, 1) === 'break' && classify(TreeKind.coconut, 1) === 'break', 'palms are knocked down by a fast vehicle');
// momentum: a 1200 kg car hits a 0.3 m trunk
const r = 0.3;
const m = V.treeDensity * Math.PI * r * r * V.treeLen;
const k = 1200 / (1200 + m);
ok(k > 0.5 && k < 0.98, `a 1200 kg car keeps ${(k * 100).toFixed(0)} % of its speed after a ${m.toFixed(0)} kg tree (loses some, does not stop)`);
const mb = V.treeDensity * Math.PI * V.breakRadius ** 2 * V.treeLen;
ok(1200 / (1200 + mb) > 0.35, `even the thickest knock-down trunk (${mb.toFixed(0)} kg) does not stop a 1200 kg car dead (keeps ${((1200 / (1200 + mb)) * 100).toFixed(0)} %)`);
console.log(failed === 0 ? '\nALL OK' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
