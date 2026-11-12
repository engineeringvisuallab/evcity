# Stale-cache reload fix (Engine chunk 404)

Error: `Failed to fetch dynamically imported module .../assets/Engine-CJZ44_el.js`

Karon: notun deploy-er por browser-er cache-e purono index/main JS thake, ja purono hash-er Engine chunk khoje, kintu server-e ta ar nei (404).

Fix: `src/main.ts` — ei error hole page auto-reload hobe ekbar (sessionStorage guard, infinite loop hobe na). Engine load hoye gele guard clear hoy.

Apply: `src/main.ts` replace kore commit + push korun, GitHub Actions deploy shesh hole Ctrl+F5.
