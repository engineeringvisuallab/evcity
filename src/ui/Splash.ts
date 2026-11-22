import { UI_FONT } from './theme';

/**
 * Game-start splash: the EVCity logo animates in (icon pops + glows, wordmark wipes in, light sweep),
 * a thin progress bar runs while the engine loads, then the whole thing fades out.
 * Pure DOM + CSS (transform/opacity), so it keeps animating while the engine is busy loading.
 */

const HOLD_AFTER_INTRO_MS = 2500; // logo + name stay fully visible this long AFTER the wordmark has appeared
const INTRO_FALLBACK_MS = 4000;   // safety: treat the intro as done after this even if animationend never fires
const FADE_OUT_MS = 700;

const CSS = `
.evs-root{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at 50% 45%,#10283a 0%,#0b1520 55%,#060b12 100%);overflow:hidden;
  font-family:${UI_FONT};transition:opacity ${FADE_OUT_MS}ms ease,transform ${FADE_OUT_MS}ms ease;}
.evs-root.evs-out{opacity:0;transform:scale(1.06);pointer-events:none;}
.evs-glow{position:absolute;left:50%;top:46%;width:60vmin;height:60vmin;margin:-30vmin 0 0 -30vmin;border-radius:50%;
  background:radial-gradient(circle,rgba(16,245,212,.38) 0%,rgba(16,245,212,0) 68%);opacity:0;
  animation:evs-glow 3s ease-out .1s forwards,evs-breathe 3.2s ease-in-out 3s infinite;}
.evs-grid{position:absolute;inset:-50%;background-image:linear-gradient(rgba(16,245,212,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(16,245,212,.07) 1px,transparent 1px);
  background-size:56px 56px;transform:perspective(600px) rotateX(62deg) translateY(0);transform-origin:50% 60%;opacity:0;
  animation:evs-fade 1.6s ease .2s forwards,evs-grid 6s linear infinite;
  -webkit-mask-image:radial-gradient(circle at 50% 50%,#000 0%,transparent 60%);mask-image:radial-gradient(circle at 50% 50%,#000 0%,transparent 60%);}
.evs-logo{position:relative;width:min(78vw,760px);aspect-ratio:1000/217;}
.evs-layer{position:absolute;inset:0;background:url(LOGO_URL) center/100% 100% no-repeat;}
.evs-iconwrap{position:absolute;inset:0;transform-origin:14% 50%;opacity:0;
  animation:evs-icon 1.1s cubic-bezier(.2,1.3,.4,1) .35s forwards,evs-iconglow 2.4s ease-in-out 1.5s infinite;}
.evs-icon{clip-path:inset(0 71% 0 0);}
.evs-text{clip-path:inset(0 100% 0 29%);opacity:0;animation:evs-text 1.1s cubic-bezier(.65,0,.25,1) 1.1s forwards;}
.evs-shine{position:absolute;inset:0;overflow:hidden;pointer-events:none;
  -webkit-mask-image:url(LOGO_URL);mask-image:url(LOGO_URL);-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;}
.evs-shine::after{content:"";position:absolute;top:-20%;bottom:-20%;width:22%;left:-30%;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.95),transparent);transform:skewX(-18deg);
  animation:evs-sweep 1.1s ease-in-out 2.3s forwards;}
.evs-bar{position:relative;margin-top:3vh;width:min(46vw,340px);height:3px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden;opacity:0;animation:evs-fade .6s ease 1.4s forwards;}
.evs-fill{position:absolute;left:0;top:0;bottom:0;width:100%;background:linear-gradient(90deg,#00c8e6,#10f5d4);border-radius:3px;
  transform:scaleX(.04);transform-origin:left center;transition:transform .5s ease;box-shadow:0 0 10px rgba(16,245,212,.8);}
.evs-label{margin-top:12px;color:rgba(200,230,240,.7);font-size:13px;letter-spacing:.5px;opacity:0;animation:evs-fade .6s ease 1.6s forwards;}
@keyframes evs-fade{to{opacity:1}}
@keyframes evs-glow{0%{opacity:0;transform:scale(.5)}60%{opacity:1}100%{opacity:.75;transform:scale(1)}}
@keyframes evs-breathe{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:.5;transform:scale(1.08)}}
@keyframes evs-grid{to{background-position:0 56px}}
@keyframes evs-icon{0%{opacity:0;transform:scale(.4) rotate(-14deg) translateX(-30px)}100%{opacity:1;transform:scale(1) rotate(0) translateX(0)}}
@keyframes evs-iconglow{0%,100%{filter:drop-shadow(0 0 4px rgba(16,245,212,.35))}50%{filter:drop-shadow(0 0 22px rgba(16,245,212,.9))}}
@keyframes evs-text{0%{opacity:0;clip-path:inset(0 100% 0 29%);transform:translateX(-24px)}25%{opacity:1}100%{opacity:1;clip-path:inset(0 0 0 29%);transform:translateX(0)}}
@keyframes evs-sweep{to{left:120%}}
.evs-sky{position:absolute;left:0;right:0;bottom:0;height:30vh;display:flex;align-items:flex-end;justify-content:center;gap:1vw;pointer-events:none;opacity:.6;
  -webkit-mask-image:linear-gradient(to top,#000 40%,transparent 100%);mask-image:linear-gradient(to top,#000 40%,transparent 100%);}
.evs-sky i{display:block;width:3.2vw;height:var(--h);transform-origin:50% 100%;transform:scaleY(0);border-top:2px solid rgba(16,245,212,.7);
  background:repeating-linear-gradient(0deg,rgba(16,245,212,.16) 0 3px,transparent 3px 11px),linear-gradient(#0f3a4b,#0a1c28);
  animation:evs-rise 5.2s ease-in-out var(--d) infinite;}
.evs-tips{position:relative;margin-top:16px;height:20px;width:min(86vw,560px);text-align:center;}
.evs-tips span{position:absolute;left:0;right:0;top:0;color:rgba(200,230,240,.8);font-size:13px;opacity:0;animation:evs-tip 20s linear infinite;animation-delay:calc(var(--i) * 4s + 2s);}
@keyframes evs-rise{0%{transform:scaleY(0)}35%,72%{transform:scaleY(1)}100%{transform:scaleY(0)}}
@keyframes evs-tip{0%{opacity:0;transform:translateY(6px)}3%,17%{opacity:1;transform:none}20%,100%{opacity:0}}
.evs-shots{position:relative;margin-top:16px;width:min(68vw,1040px);aspect-ratio:2.55 / 1;max-height:48vh;border-radius:14px;overflow:hidden;background:#0a1c28;
  box-shadow:0 0 0 1px rgba(16,245,212,.35),0 12px 40px rgba(0,0,0,.55);opacity:0;animation:evs-fade .8s ease 1.8s forwards,evs-bglow 3.2s ease-in-out 2.6s infinite;}
.evs-slide{position:absolute;inset:0;opacity:0;animation:evs-slide 40s linear infinite;animation-delay:calc(var(--i) * 5s + 1.8s);}
.evs-slide img{display:block;width:100%;height:100%;object-fit:cover;transform-origin:50% 50%;animation-duration:40s;animation-timing-function:ease-out;animation-iteration-count:infinite;animation-delay:calc(var(--i) * 5s + 1.8s);}
.evs-slide.zin img{animation-name:evs-kin}
.evs-slide.zout img{animation-name:evs-kout}
.evs-slide b{position:absolute;z-index:4;left:14px;top:12px;animation:evs-cap 40s linear infinite;animation-delay:calc(var(--i) * 5s + 1.8s);padding:5px 14px;border-radius:999px;font-weight:600;font-size:15px;letter-spacing:.4px;color:#eaffff;
  background:rgba(4,12,20,.62);box-shadow:0 0 0 1px rgba(16,245,212,.3);}
@keyframes evs-slide{0%{opacity:0}2%,13%{opacity:1}16%,100%{opacity:0}}
@keyframes evs-kin{0%{transform:scale(1) translate(0,0);filter:blur(7px) brightness(1.2)}7%{filter:blur(0) brightness(1)}16%,100%{transform:scale(1.22) translate(-2.5%,-1.5%);filter:blur(0) brightness(1)}}
@keyframes evs-kout{0%{transform:scale(1.22) translate(2.5%,1.5%);filter:blur(7px) brightness(1.2)}7%{filter:blur(0) brightness(1)}16%,100%{transform:scale(1) translate(0,0);filter:blur(0) brightness(1)}}
@keyframes evs-cap{0%,1%{opacity:0;transform:translateX(-18px)}4%,13%{opacity:1;transform:none}16%,100%{opacity:0}}
@keyframes evs-bglow{0%,100%{box-shadow:0 0 0 1px rgba(16,245,212,.35),0 0 14px rgba(16,245,212,.12),0 12px 40px rgba(0,0,0,.55)}50%{box-shadow:0 0 0 1px rgba(16,245,212,.75),0 0 34px rgba(16,245,212,.4),0 12px 40px rgba(0,0,0,.55)}}
@keyframes evs-sw{0%{left:-30%}35%,100%{left:130%}}
@keyframes evs-dust{0%{transform:translateY(0);opacity:0}12%{opacity:.9}85%{opacity:.6}100%{transform:translateY(-52vh);opacity:0}}
.evs-vig{position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,transparent 52%,rgba(2,8,14,.6) 100%);}
.evs-sweep{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden;}
.evs-sweep::after{content:"";position:absolute;top:-20%;bottom:-20%;width:16%;left:-30%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.2),transparent);transform:skewX(-18deg);animation:evs-sw 5s ease-in-out 2.4s infinite;}
.evs-dust{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden;}
.evs-dust i{position:absolute;bottom:-8px;left:var(--x);width:var(--s);height:var(--s);border-radius:50%;background:rgba(170,255,240,.85);box-shadow:0 0 7px rgba(16,245,212,.9);opacity:0;animation:evs-dust var(--t) linear var(--d) infinite;}
/* Image effects removed (user 2026-11-22): no zoom / blur on the screenshots, no glow pulse, vignette, light sweep or dust. Slides still cross-fade with their caption. */
.evs-slide img{animation:none!important;filter:none!important;transform:none!important}
.evs-shots{animation:evs-fade .8s ease 1.8s forwards!important;box-shadow:0 0 0 1px rgba(16,245,212,.35),0 12px 40px rgba(0,0,0,.55)!important}
.evs-vig,.evs-sweep,.evs-dust{display:none!important}
@media (prefers-reduced-motion:reduce){
  .evs-slide,.evs-slide img,.evs-slide b,.evs-dust i,.evs-sweep::after{animation:none!important}
  .evs-slide b{opacity:1}
  .evs-slide:first-child{opacity:1}
  .evs-sky i,.evs-tips span,.evs-grid,.evs-glow,.evs-iconwrap,.evs-text,.evs-shine::after{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}
}
`;

export class Splash {
  private readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly label: HTMLDivElement;
  /** Resolves when the logo + wordmark intro has finished playing (the engine load starts only after this). */
  readonly introDone: Promise<void>;
  private introEndedAt = 0;
  private progress = 0.04;
  /** The bar creeps towards this value between real steps (so it never looks frozen on a slow phone). */
  private cap = 0.12;
  private creep: number | undefined;

  constructor(parent: HTMLElement = document.body) {
    const logoUrl = `${import.meta.env.BASE_URL}assets/evcity-logo.png`;
    const BASE = import.meta.env.BASE_URL;
    const style = document.createElement('style');
    style.textContent = CSS.split('LOGO_URL').join(`"${logoUrl}"`);
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'evs-root';
    this.root.innerHTML = `
      <div class="evs-grid"></div>
      <div class="evs-glow"></div>
      <div class="evs-sky"><i style="--h:14vh;--d:0.0s"></i><i style="--h:22vh;--d:0.37s"></i><i style="--h:17vh;--d:0.74s"></i><i style="--h:30vh;--d:1.11s"></i><i style="--h:20vh;--d:1.48s"></i><i style="--h:26vh;--d:1.85s"></i><i style="--h:13vh;--d:2.22s"></i><i style="--h:34vh;--d:2.59s"></i><i style="--h:19vh;--d:2.96s"></i><i style="--h:28vh;--d:3.33s"></i><i style="--h:16vh;--d:3.7s"></i><i style="--h:24vh;--d:4.07s"></i><i style="--h:12vh;--d:0.04s"></i><i style="--h:21vh;--d:0.41s"></i></div>
      <div class="evs-logo">
        <div class="evs-iconwrap"><div class="evs-layer evs-icon"></div></div>
        <div class="evs-layer evs-text"></div>
        <div class="evs-shine"></div>
      </div>
      <div class="evs-bar"><div class="evs-fill"></div></div><div class="evs-label">লোড হচ্ছে…</div><div class="evs-tips"><span style="--i:0">N চাপলে যেকোনো গাড়ি তোমার কাছে চলে আসবে</span><span style="--i:1">Y চাপলে গাইডেড ভয়েস ট্যুর শুরু হয়</span><span style="--i:2">0 চাপে X ও Z লিখে সরাসরি সেখানে যাওয়া যায়</span><span style="--i:3">Tab চাপলে সেটিংস মেনু খোলে</span><span style="--i:4">F2 চাপলে FPS ও ড্র-কল দেখা যায়</span></div>
      <div class="evs-shots"><div class="evs-slide zin" style="--i:0"><img src="${BASE}assets/splash/mall.webp" alt="" decoding="async"><b>সিটি মল</b></div><div class="evs-slide zout" style="--i:1"><img src="${BASE}assets/splash/evlab.webp" alt="" decoding="async"><b>EVLab</b></div><div class="evs-slide zin" style="--i:2"><img src="${BASE}assets/splash/hall.webp" alt="" decoding="async"><b>EVLab হল</b></div><div class="evs-slide zout" style="--i:3"><img src="${BASE}assets/splash/mosque.webp" alt="" decoding="async"><b>মসজিদ</b></div><div class="evs-slide zin" style="--i:4"><img src="${BASE}assets/splash/plant.webp" alt="" decoding="async"><b>জল শোধনাগার</b></div><div class="evs-slide zout" style="--i:5"><img src="${BASE}assets/splash/jungle.webp" alt="" decoding="async"><b>জঙ্গল</b></div><div class="evs-slide zin" style="--i:6"><img src="${BASE}assets/splash/sea.webp" alt="" decoding="async"><b>সাগরের তলদেশ</b></div><div class="evs-slide zout" style="--i:7"><img src="${BASE}assets/splash/farm.webp" alt="" decoding="async"><b>কৃষিজমি</b></div><div class="evs-vig"></div><div class="evs-sweep"></div><div class="evs-dust"><i style="--x:6%;--s:3px;--t:7s;--d:0s"></i><i style="--x:14%;--s:2px;--t:9s;--d:2.1s"></i><i style="--x:22%;--s:4px;--t:8s;--d:4.2s"></i><i style="--x:31%;--s:2px;--t:10s;--d:1.2s"></i><i style="--x:40%;--s:3px;--t:7.5s;--d:5.3s"></i><i style="--x:48%;--s:2px;--t:9.5s;--d:3.1s"></i><i style="--x:57%;--s:4px;--t:8.5s;--d:0.7s"></i><i style="--x:65%;--s:3px;--t:7s;--d:6.2s"></i><i style="--x:73%;--s:2px;--t:10s;--d:2.9s"></i><i style="--x:81%;--s:4px;--t:8s;--d:4.8s"></i><i style="--x:88%;--s:3px;--t:9s;--d:1.6s"></i><i style="--x:94%;--s:2px;--t:7.5s;--d:5.7s"></i></div></div>
`;
    parent.appendChild(this.root);
    this.fill = this.root.querySelector('.evs-fill') as HTMLDivElement;
    this.label = this.root.querySelector('.evs-label') as HTMLDivElement;

    const textEl = this.root.querySelector('.evs-text') as HTMLDivElement;
    this.introDone = new Promise<void>((resolve) => {
      const done = () => { if (!this.introEndedAt) { this.introEndedAt = performance.now(); resolve(); } };
      textEl.addEventListener('animationend', done, { once: true });
      window.setTimeout(done, INTRO_FALLBACK_MS);
    });

    // Real steps come from setStage(); in between the bar creeps slowly towards the next step's value.
    this.creep = window.setInterval(() => {
      this.setProgress(this.progress + (this.cap - this.progress) * 0.08);
    }, 350);
  }

  /** A real loading step is done: jump to `p` (0..1), show what comes next, and creep towards `p + 0.12` until the next step. */
  setStage(p: number, label: string): void {
    this.setProgress(p);
    this.cap = Math.min(0.97, p + 0.12);
    this.label.textContent = label;
  }

  setProgress(p: number): void {
    this.progress = Math.max(this.progress, Math.min(1, p));
    this.fill.style.transform = `scaleX(${this.progress})`;
  }

  /** Call when the game is ready: finishes the bar, waits for the intro to play out, fades away, removes itself. */
  async finish(): Promise<void> {
    if (this.creep !== undefined) window.clearInterval(this.creep);
    this.setProgress(1);
    this.label.textContent = 'প্রস্তুত!';
    await this.introDone;
    const wait = Math.max(0, HOLD_AFTER_INTRO_MS - (performance.now() - this.introEndedAt));
    await new Promise((r) => setTimeout(r, wait));
    this.root.classList.add('evs-out');
    await new Promise((r) => setTimeout(r, FADE_OUT_MS + 50));
    this.root.remove();
  }

  /** Loading failed: drop the splash immediately so the error message is visible. */
  dispose(): void {
    if (this.creep !== undefined) window.clearInterval(this.creep);
    this.root.remove();
  }
}
