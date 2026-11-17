// 360 photo: standalone HTML viewer (PURE, no three.js, no DOM). One .html file with the JPEG inside: open it in any browser, drag with the mouse (or one
// finger) to look around, wheel / pinch to zoom, double click = auto spin, F = full screen. Raw WebGL, no network, no library.
// The maths is the same as equirectDir() in Photo360Meta.ts (centre of the picture = yaw 0, u grows to the right). Tested in scripts/photo360-test.ts.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const VIEWER_JS = `
(function () {
  var cv = document.getElementById('v'), msg = document.getElementById('msg');
  var gl = cv.getContext('webgl', { antialias: false }) || cv.getContext('experimental-webgl');
  if (!gl) { msg.textContent = 'WebGL নেই — এই ব্রাউজারে ৩৬০° ভিউ চলবে না'; return; }
  var vs = 'attribute vec2 p; varying vec2 q; void main(){ q = p; gl_Position = vec4(p, 0.0, 1.0); }';
  var fs = 'precision highp float; varying vec2 q; uniform sampler2D t; uniform vec3 R, U, F; uniform vec2 k;' +
    'const float PI = 3.14159265358979;' +
    'void main(){ vec3 d = normalize(F + R * (q.x * k.x) + U * (q.y * k.y));' +
    ' float lon = atan(d.x, -d.z); float lat = asin(clamp(d.y, -1.0, 1.0));' +
    ' gl_FragColor = vec4(texture2D(t, vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI)).rgb, 1.0); }';
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { msg.textContent = 'শেডার হয়নি: ' + gl.getProgramInfoLog(pr); return; }
  gl.useProgram(pr);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uR = gl.getUniformLocation(pr, 'R'), uU = gl.getUniformLocation(pr, 'U'), uF = gl.getUniformLocation(pr, 'F'), uK = gl.getUniformLocation(pr, 'k');
  var yaw = 0, pitch = 0, fov = 90 * Math.PI / 180, vy = 0, vp = 0, spin = false, dirty = true, drag = null;
  var FOV_MIN = 25 * Math.PI / 180, FOV_MAX = 110 * Math.PI / 180, LIM = 89 * Math.PI / 180;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(2, Math.floor(innerWidth * dpr)); cv.height = Math.max(2, Math.floor(innerHeight * dpr));
    gl.viewport(0, 0, cv.width, cv.height); dirty = true;
  }
  addEventListener('resize', resize); resize();
  function draw() {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    gl.uniform3f(uF, sy * cp, sp, -cy * cp); gl.uniform3f(uR, cy, 0, sy); gl.uniform3f(uU, -sy * sp, cp, cy * sp);
    var t = Math.tan(fov / 2); gl.uniform2f(uK, t * cv.width / cv.height, t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function loop() {
    if (!drag) {
      if (spin) { yaw += 0.0035 * (fov / 1.57); dirty = true; }
      if (Math.abs(vy) > 1e-5 || Math.abs(vp) > 1e-5) { yaw += vy; pitch = Math.max(-LIM, Math.min(LIM, pitch + vp)); vy *= 0.92; vp *= 0.92; dirty = true; }
    }
    if (dirty) { dirty = false; draw(); }
    requestAnimationFrame(loop);
  }
  var img = new Image();
  img.onload = function () {
    var max = gl.getParameter(gl.MAX_TEXTURE_SIZE), src = img;
    if (img.width > max) { // small phones: shrink to what the GPU can take
      var c = document.createElement('canvas'); c.width = max; c.height = Math.round(max * img.height / img.width);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); src = c;
    }
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    msg.style.display = 'none'; dirty = true; loop();
  };
  img.onerror = function () { msg.textContent = 'ছবি খোলা গেল না'; };
  img.src = window.PANO_SRC;
  var pts = {}, pinch0 = 0, fov0 = fov;
  function count() { var n = 0; for (var k in pts) n++; return n; }
  function pdist() { var a = [], k; for (k in pts) a.push(pts[k]); return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY }; spin = false; vy = vp = 0;
    if (count() === 2) { pinch0 = pdist(); fov0 = fov; drag = null; } else drag = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointermove', function (e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (count() === 2 && pinch0 > 0) { fov = Math.max(FOV_MIN, Math.min(FOV_MAX, fov0 * pinch0 / Math.max(1, pdist()))); dirty = true; return; }
    if (!drag) return;
    var k = fov / cv.clientHeight; // radians per CSS pixel: the picture follows the finger
    vy = -(e.clientX - drag.x) * k; vp = (e.clientY - drag.y) * k;
    yaw += vy; pitch = Math.max(-LIM, Math.min(LIM, pitch + vp));
    drag = { x: e.clientX, y: e.clientY }; dirty = true;
  });
  function up(e) { delete pts[e.pointerId]; if (count() < 2) pinch0 = 0; if (count() === 0) drag = null; }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); fov = Math.max(FOV_MIN, Math.min(FOV_MAX, fov * (e.deltaY > 0 ? 1.08 : 1 / 1.08))); dirty = true; }, { passive: false });
  cv.addEventListener('dblclick', function () { spin = !spin; vy = vp = 0; });
  addEventListener('keydown', function (e) {
    if (e.key === 'f' || e.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
    else if (e.key === ' ') spin = !spin;
    else if (e.key === 'ArrowLeft') { yaw -= 0.08; dirty = true; } else if (e.key === 'ArrowRight') { yaw += 0.08; dirty = true; }
    else if (e.key === 'ArrowUp') { pitch = Math.min(LIM, pitch + 0.08); dirty = true; } else if (e.key === 'ArrowDown') { pitch = Math.max(-LIM, pitch - 0.08); dirty = true; }
  });
})();
`;

/** The whole viewer page. `dataUrl` = "data:image/jpeg;base64,..." of the 2:1 picture. */
export function buildViewerHtml(dataUrl: string, title: string): string {
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('viewer: not a JPEG data URL');
  const t = escapeHtml(title);
  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${t}</title>
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:system-ui,sans-serif}
#v{position:fixed;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}
#v:active{cursor:grabbing}
#msg{position:fixed;left:0;right:0;top:45%;text-align:center;color:#fff;font-size:18px}
#hint{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);padding:7px 14px;border-radius:20px;background:rgba(0,0,0,.55);color:#fff;font-size:13px;pointer-events:none;white-space:nowrap}
</style></head><body>
<canvas id="v"></canvas>
<div id="msg">ছবি লোড হচ্ছে…</div>
<div id="hint">${t} · মাউস দিয়ে টানো · চাকা = জুম · ডাবল ক্লিক = ঘোরা · F = ফুলস্ক্রিন</div>
<script>window.PANO_SRC="${dataUrl}";</script>
<script>${VIEWER_JS}</script>
</body></html>`;
}

export function viewerFileName(jpgName: string): string {
  return jpgName.replace(/\.jpe?g$/i, '') + '-viewer.html';
}
