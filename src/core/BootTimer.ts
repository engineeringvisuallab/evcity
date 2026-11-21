// Start-up timing (EVCity load speed, step 1 = measure first). Open the game with ?boot=1 (or run localStorage.evcityBoot = '1') and read the table in the browser console (F12).
// Without the switch every call returns at once: no cost, nothing printed.
const ON = (() => {
  try { return /[?&]boot=1/.test(location.search) || localStorage.getItem('evcityBoot') === '1'; } catch { return false; }
})();
const T0 = typeof performance !== 'undefined' ? performance.now() : 0;
const marks: { name: string; at: number }[] = [];

/** Mark that a start-up stage has just FINISHED (the time since the previous mark is the cost of that stage). */
export function bootMark(name: string): void {
  if (!ON) return;
  marks.push({ name, at: performance.now() - T0 });
}

/** Print the table: stage, ms of that stage, ms since page start. Call once, when the first picture is up. */
export function bootReport(): void {
  if (!ON) return;
  let prev = 0;
  const rows = marks.map((m) => { const row = { stage: m.name, 'ms (stage)': Math.round(m.at - prev), 'ms (total)': Math.round(m.at) }; prev = m.at; return row; });
  console.log('[EVCity boot] slowest stages first (the table below is in start-up order):');
  console.table(rows);
  console.table([...rows].sort((a, b) => b['ms (stage)'] - a['ms (stage)']).slice(0, 10));
}
