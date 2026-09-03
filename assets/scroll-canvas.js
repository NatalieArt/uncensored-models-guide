/* Scroll-driven canvas hero. Tiers: poster -> standard sheets -> HD sheets (desktop only) -> exact full frame after settle. */
(function () {
  var canvas = document.querySelector('.scrolly-canvas');
  var section = document.querySelector('.scrolly');
  if (!canvas || !section) return;
  var ctx = canvas.getContext('2d', { alpha: false });
  var d = canvas.dataset;
  var FRAME_ROOT = d.frameRoot, FRAME_COUNT = +d.frameCount, PAD = +(d.framePad || 3), VER = d.frameVersion || '1';
  var FULL_W = +(d.frameWidth || 1280), FULL_H = +(d.frameHeight || 720);
  var isMobile = window.matchMedia('(max-width: 720px)').matches;
  var conn = navigator.connection || {};
  var hdEnabled = !isMobile && !conn.saveData && !/(^|-)2g$/.test(conn.effectiveType || '');
  var SETTLE_DELAY = 120;

  var tracks = {
    std: { root: d.previewRootDesktop, w: +d.previewWidthDesktop, h: +d.previewHeightDesktop, step: +d.previewStepDesktop, cols: +d.previewColumnsDesktop, cache: {}, order: [], max: 5, look: 4 },
    hd:  { root: d.previewRootDesktopHd, w: +d.previewWidthDesktopHd, h: +d.previewHeightDesktopHd, step: +d.previewStepDesktopHd, cols: +d.previewColumnsDesktopHd, cache: {}, order: [], max: 4, look: 2 },
    mob: { root: d.previewRootMobile, w: +d.previewWidthMobile, h: +d.previewHeightMobile, step: +d.previewStepMobile, cols: +d.previewColumnsMobile, cache: {}, order: [], max: 5, look: 4 }
  };
  var base = isMobile ? tracks.mob : tracks.std;
  var full = { cache: {}, order: [], max: isMobile ? 10 : 16 };

  var pad = function (n) { var s = String(n); while (s.length < PAD) s = '0' + s; return s; };
  var target = 0, lastTarget = -1, dir = 1, settleTimer = null, raf = null, firstRender = false;

  function loadImg(src, cb) {
    var im = new Image(); im.decoding = 'async';
    im.onload = function () { if (im.decode) { im.decode().then(function () { cb(im); }).catch(function () { cb(im); }); } else cb(im); };
    im.onerror = function () { cb(null); };
    im.src = location.protocol === 'file:' ? src : src + '?v=' + VER;
    return im;
  }
  function remember(store, key, val) {
    store.cache[key] = val; store.order.push(key);
    while (store.order.length > store.max) { var k = store.order.shift(); if (k !== key) delete store.cache[k]; }
  }
  function sheetIndex(t, frame) { return Math.floor(Math.round(frame / t.step) / t.cols); }
  function ensureSheet(t, idx, cb) {
    if (idx < 0 || idx >= Math.ceil(Math.ceil(FRAME_COUNT / t.step) / t.cols)) return;
    var key = idx;
    if (t.cache[key]) { if (t.cache[key] !== 'loading' && cb) cb(); return; }
    t.cache[key] = 'loading';
    loadImg(t.root + pad(idx) + '.webp', function (im) { if (!im) { delete t.cache[key]; return; } remember(t, key, im); if (cb) cb(); scheduleDraw(); });
  }
  function ensureFull(frame, cb) {
    if (frame < 0 || frame >= FRAME_COUNT) return;
    if (full.cache[frame]) { if (full.cache[frame] !== 'loading' && cb) cb(); return; }
    full.cache[frame] = 'loading';
    loadImg(FRAME_ROOT + pad(frame) + '.webp', function (im) { if (!im) { delete full.cache[frame]; return; } remember(full, frame, im); if (cb) cb(); scheduleDraw(); });
  }
  function prefetch(t) {
    var s = sheetIndex(t, target);
    for (var i = 0; i <= t.look; i++) ensureSheet(t, s + i * dir);
    ensureSheet(t, s - dir);
  }

  function headerVar(){ var h=document.querySelector('.bn-header'); document.documentElement.style.setProperty('--bn-h',(h?h.offsetHeight:0)+'px'); }
  function resize() {
    headerVar();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    scheduleDraw();
  }
  function drawCover(img, sx, sy, sw, sh) {
    var cw = canvas.width, ch = canvas.height, r = sw / sh;
    var dw = cw, dh = cw / r; if (dh < ch) { dh = ch; dw = ch * r; }
    ctx.drawImage(img, sx, sy, sw, sh, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }
  function drawSheet(t, frame) {
    var idx = sheetIndex(t, frame); var im = t.cache[idx];
    if (!im || im === 'loading') return false;
    var tile = Math.round(frame / t.step) % t.cols;
    drawCover(im, tile * t.w, 0, t.w, t.h); return true;
  }
  function nearestFull(frame) {
    var best = null, bd = 1e9;
    for (var k in full.cache) { var im = full.cache[k]; if (im === 'loading') continue; var dd = Math.abs(k - frame); if (dd < bd) { bd = dd; best = im; } }
    return best;
  }
  function draw() {
    raf = null;
    var f = target, mode = 'none';
    var fi = full.cache[f];
    if (fi && fi !== 'loading') { drawCover(fi, 0, 0, FULL_W, FULL_H); mode = 'full'; }
    else if (hdEnabled && drawSheet(tracks.hd, f)) mode = 'preview-hd';
    else if (drawSheet(base, f)) mode = 'preview';
    else { var nf = nearestFull(f); if (nf) { drawCover(nf, 0, 0, FULL_W, FULL_H); mode = 'nearest'; } }
    if (mode !== 'none') { canvas.dataset.renderMode = mode; if (!firstRender) { firstRender = true; canvas.classList.add('is-ready'); if (hdEnabled) prefetch(tracks.hd); } }
    section.style.setProperty('--p', progress().toFixed(4));
  }
  function scheduleDraw() { if (!raf) raf = requestAnimationFrame(draw); }

  function progress() {
    var r = section.getBoundingClientRect(); var hh = (document.querySelector('.bn-header')||{}).offsetHeight||0; var total = r.height - (window.innerHeight - hh);
    return total > 0 ? Math.min(1, Math.max(0, (hh - r.top) / total)) : 0;
  }
  function onScroll() {
    var t = Math.round(progress() * (FRAME_COUNT - 1));
    if (t !== target) { dir = t > lastTarget ? 1 : -1; lastTarget = target; target = t; }
    prefetch(base); if (hdEnabled && firstRender) prefetch(tracks.hd);
    scheduleDraw();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () { ensureFull(target); ensureFull(target + dir); }, SETTLE_DELAY + 16);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('load', function(){ resize(); onScroll(); });
  window.addEventListener('resize', resize);
  resize();
  ensureSheet(base, 0, function () { onScroll(); });
  onScroll();
})();
