#!/bin/bash
for f in ring-structures-check ring-profile-check ring-cut-check ring-ground-check ring-road-check ring-facade-check ring-drive-check ring-row-check ring-ribbons-check; do
  r=$(timeout 280 npx tsx scripts/$f.ts 2>&1 | grep -v "road fix")
  echo "== $f: $(echo "$r" | grep -c '  PASS') PASS, $(echo "$r" | grep -c '  FAIL') FAIL | $(echo "$r" | tail -1 | cut -c1-90)"
  echo "$r" | grep '  FAIL' | head -4 | cut -c1-200
done
