/* Garmin Lens – tiny canvas charting (no libraries). Line / area / bar (stacked) / scatter, bands, reference lines, event annotations,
   hover + touch scrub + keyboard, legend toggles, an accessible summary and a data-table fallback. Theme colours come from CSS variables. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./dates.js"));
  else root.GLCharts = factory(root.GLDates);
})(typeof self !== "undefined" ? self : this, function (D) {
  "use strict";
  function ok(v) { return typeof v === "number" && isFinite(v); }

  /* ---------- pure helpers (unit-tested) ---------- */
  function niceNum(range, round) {
    var exp = Math.floor(Math.log10(range)), f = range / Math.pow(10, exp), nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10; else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
  }
  function niceScale(min, max, ticks) {
    ticks = ticks || 5;
    if (!ok(min) || !ok(max)) return { min: 0, max: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
    if (min === max) { var d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
    var range = niceNum(max - min, false), step = niceNum(range / (ticks - 1), true), lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t = [];
    for (var v = lo; v <= hi + step * 0.5; v += step) t.push(+(Math.round(v / step) * step).toFixed(10));
    return { min: lo, max: hi, step: step, ticks: t };
  }
  function extent(arrs) {
    var lo = Infinity, hi = -Infinity;
    arrs.forEach(function (a) { if (a) for (var i = 0; i < a.length; i++) { var v = a[i]; if (ok(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } } });
    return lo === Infinity ? null : [lo, hi];
  }
  function fmtNum(v, digits) { if (!ok(v)) return "–"; var a = Math.abs(v); if (digits === undefined) digits = a >= 1000 ? 0 : a >= 100 ? 0 : a >= 10 ? 1 : 2; var s = v.toFixed(digits); return s.indexOf(".") >= 0 ? s.replace(/\.?0+$/, "") : s; }
  function describe(spec) {
    var parts = [spec.title || "Chart"];
    if (spec.kind === "scatter") { parts.push((spec.points || []).length + " points" + (spec.fit ? ", trend line" : "")); }
    else {
      var n = spec.x ? spec.x.length : 0; parts.push(n + " days" + (spec.x && n ? " from " + spec.x[0] + " to " + spec.x[n - 1] : ""));
      (spec.series || []).forEach(function (s) {
        var v = (s.data || []).filter(ok); if (!v.length) return;
        var last = null, li = -1; for (var i = s.data.length - 1; i >= 0; i--) if (ok(s.data[i])) { last = s.data[i]; li = i; break; }
        parts.push(s.name + ": latest " + fmtNum(last, s.digits) + ", min " + fmtNum(Math.min.apply(null, v), s.digits) + ", max " + fmtNum(Math.max.apply(null, v), s.digits));
      });
      if (spec.notes && spec.notes.length) parts.push(spec.notes.length + " event marker" + (spec.notes.length === 1 ? "" : "s"));
    }
    return parts.join(". ") + ".";
  }
  function nearestIndex(xPx, left, width, n) { if (n <= 1) return 0; var t = (xPx - left) / width; return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1)))); }
  var NOTE_COLORS = { alcohol: "#a855f7", illness: "#ef4444", travel: "#0ea5e9", hard: "#f97316", note: "#94a3b8", stress: "#eab308", caffeine: "#a16207", sleep: "#6366f1" };

  /* ---------- drawing ---------- */
  function cssVar(el, name, fallback) { var v = getComputedStyle(el).getPropertyValue(name).trim(); return v || fallback; }
  function palette(el) {
    return { fg: cssVar(el, "--fg", "#e2e8f0"), muted: cssVar(el, "--muted", "#93a0b8"), line: cssVar(el, "--line", "#26334d"), card: cssVar(el, "--card", "#141d2f"), acc: cssVar(el, "--acc", "#22d3ee"),
      c: [1, 2, 3, 4, 5, 6].map(function (i) { return cssVar(el, "--c" + i, ["#22d3ee", "#f472b6", "#a3e635", "#fbbf24", "#a78bfa", "#fb923c"][i - 1]); }), good: cssVar(el, "--good", "#4ade80"), warn: cssVar(el, "--warn", "#fbbf24"), bad: cssVar(el, "--bad", "#f87171") };
  }
  function resolveColor(c, pal, i) { if (!c) return pal.c[i % pal.c.length]; if (/^c[1-6]$/.test(c)) return pal.c[+c[1] - 1]; if (c === "acc") return pal.acc; if (c === "muted") return pal.muted; if (c === "good") return pal.good; if (c === "warn") return pal.warn; if (c === "bad") return pal.bad; return c; }
  function rgba(hex, a) { var m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; var n = parseInt(m[1], 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }

  function Chart(canvas, spec) {
    this.canvas = canvas; this.spec = spec || {}; this.hover = null; this.hidden = {};
    var self = this;
    this.onMove = function (e) { var r = canvas.getBoundingClientRect(); self.pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; self.hoverFromPointer(); self.draw(); };
    this.onLeave = function () { self.pointer = null; self.hover = null; self.draw(); };
    this.onKey = function (e) {
      var n = self.count(); if (!n) return;
      if (e.key === "ArrowLeft") self.hover = self.hover === null ? n - 1 : Math.max(0, self.hover - 1);
      else if (e.key === "ArrowRight") self.hover = self.hover === null ? n - 1 : Math.min(n - 1, self.hover + 1);
      else if (e.key === "Home") self.hover = 0; else if (e.key === "End") self.hover = n - 1; else if (e.key === "Escape") self.hover = null; else return;
      e.preventDefault(); self.draw();
    };
    canvas.addEventListener("pointermove", this.onMove); canvas.addEventListener("pointerdown", this.onMove); canvas.addEventListener("pointerleave", this.onLeave); canvas.addEventListener("pointercancel", this.onLeave); canvas.addEventListener("keydown", this.onKey);
    canvas.addEventListener("blur", this.onLeave);
    if (typeof ResizeObserver !== "undefined") { this.ro = new ResizeObserver(function () { self.draw(); }); this.ro.observe(canvas.parentNode || canvas); }
    this.themeObs = new MutationObserver(function () { self.draw(); }); this.themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (window.matchMedia) { this.mq = window.matchMedia("(prefers-color-scheme: dark)"); this.mqf = function () { self.draw(); }; if (this.mq.addEventListener) this.mq.addEventListener("change", this.mqf); }
    canvas.setAttribute("role", "img"); canvas.setAttribute("tabindex", "0");
    this.draw();
  }
  Chart.prototype.count = function () { var s = this.spec; return s.kind === "scatter" ? (s.points || []).length : (s.x ? s.x.length : 0); };
  Chart.prototype.set = function (spec) { this.spec = spec; this.hover = null; this.draw(); };
  Chart.prototype.toggle = function (i) { this.hidden[i] = !this.hidden[i]; this.draw(); };
  Chart.prototype.destroy = function () {
    var c = this.canvas; c.removeEventListener("pointermove", this.onMove); c.removeEventListener("pointerdown", this.onMove); c.removeEventListener("pointerleave", this.onLeave); c.removeEventListener("pointercancel", this.onLeave); c.removeEventListener("keydown", this.onKey); c.removeEventListener("blur", this.onLeave);
    if (this.ro) this.ro.disconnect(); if (this.themeObs) this.themeObs.disconnect(); if (this.mq && this.mq.removeEventListener) this.mq.removeEventListener("change", this.mqf);
  };
  Chart.prototype.layout = function (w, h) {
    var s = this.spec, hasRight = (s.series || []).some(function (x) { return x.axis === "right"; });
    return { l: s.kind === "scatter" ? 44 : 38, r: hasRight ? 38 : 10, t: 10, b: s.kind === "scatter" ? 34 : 24, w: w, h: h };
  };
  Chart.prototype.hoverFromPointer = function () {
    if (!this.pointer) return; var s = this.spec, W = this.cw, H = this.ch, L = this.layout(W, H), n = this.count();
    if (!n) return;
    if (s.kind === "scatter") {
      var best = -1, bd = 1e9; this.sp = this.sp || []; for (var i = 0; i < this.sp.length; i++) { var dx = this.sp[i][0] - this.pointer.x, dy = this.sp[i][1] - this.pointer.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
      this.hover = bd < 28 * 28 ? this.sp[best][2] : null;
    } else this.hover = nearestIndex(this.pointer.x, L.l, W - L.l - L.r, n);
  };
  Chart.prototype.draw = function () {
    var cv = this.canvas, parent = cv.parentNode; if (!parent) return;
    var w = Math.max(160, Math.floor(parent.clientWidth || cv.clientWidth || 300)), h = this.spec.height || 220, dpr = Math.min(3, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    cv.style.width = w + "px"; cv.style.height = h + "px"; this.cw = w; this.ch = h;
    var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    var pal = palette(cv), spec = this.spec; cv.setAttribute("aria-label", describe(spec));
    ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"; ctx.textBaseline = "middle";
    if (!this.count()) { ctx.fillStyle = pal.muted; ctx.textAlign = "center"; ctx.fillText(spec.empty || "No data in this range", w / 2, h / 2); return; }
    if (spec.kind === "scatter") this.drawScatter(ctx, pal, w, h); else this.drawSeries(ctx, pal, w, h);
  };
  Chart.prototype.drawGrid = function (ctx, pal, L, sc, fmt, side) {
    ctx.strokeStyle = pal.line; ctx.lineWidth = 1; ctx.fillStyle = pal.muted; ctx.textAlign = side === "right" ? "left" : "right";
    sc.ticks.forEach(function (t) {
      var y = L.t + (L.h - L.t - L.b) * (1 - (t - sc.min) / (sc.max - sc.min));
      if (side !== "right") { ctx.beginPath(); ctx.moveTo(L.l, Math.round(y) + 0.5); ctx.lineTo(L.w - L.r, Math.round(y) + 0.5); ctx.stroke(); }
      ctx.fillText(fmt ? fmt(t) : fmtNum(t), side === "right" ? L.w - L.r + 4 : L.l - 5, y);
    });
  };
  Chart.prototype.drawSeries = function (ctx, pal, W, H) {
    var spec = this.spec, L = this.layout(W, H), pw = W - L.l - L.r, ph = H - L.t - L.b, n = spec.x.length, self = this;
    var series = (spec.series || []).map(function (s, i) { return Object.assign({ _i: i }, s); }), vis = series.filter(function (s) { return !self.hidden[s._i] && s.data; });
    var bars = vis.filter(function (s) { return s.type === "bar"; }), stacked = !!spec.stack && bars.length > 1;
    function side(s) { return s.axis === "right" ? "right" : "left"; }
    function ext(sd) {
      var arrs = vis.filter(function (s) { return side(s) === sd; }).map(function (s) { return s.data; });
      if (sd === "left") (spec.bands || []).forEach(function (b) { if (b.axis !== "right") arrs.push(b.lo, b.hi); }); else (spec.bands || []).forEach(function (b) { if (b.axis === "right") arrs.push(b.lo, b.hi); });
      var e = extent(arrs); if (!e) return null;
      if (stacked && sd === "left") { var mx = 0; for (var i = 0; i < n; i++) { var t = 0; bars.forEach(function (s) { if (side(s) === "left" && ok(s.data[i])) t += s.data[i]; }); if (t > mx) mx = t; } e = [0, Math.max(e[1], mx)]; }
      if (vis.some(function (s) { return side(s) === sd && s.type === "bar"; }) && e[0] > 0) e[0] = 0;
      (spec.hlines || []).forEach(function (hl) { if ((hl.axis || "left") === sd && ok(hl.y)) { e[0] = Math.min(e[0], hl.y); e[1] = Math.max(e[1], hl.y); } });
      var yMin = sd === "left" ? spec.yMin : spec.yRightMin, yMax = sd === "left" ? spec.yMax : spec.yRightMax;
      if (ok(yMin)) e[0] = yMin; if (ok(yMax)) e[1] = yMax;
      if (!ok(yMin) && !ok(yMax)) { var pad = (e[1] - e[0]) * 0.06; if (!(vis.some(function (s) { return side(s) === sd && s.type === "bar"; })) ) { e[0] -= pad; e[1] += pad; } else e[1] += pad; }
      return e;
    }
    var eL = ext("left"), eR = ext("right"), scL = eL ? niceScale(eL[0], eL[1], 5) : null, scR = eR ? niceScale(eR[0], eR[1], 5) : null;
    if (ok(spec.yMin) && scL) scL.min = Math.min(scL.min, spec.yMin); if (ok(spec.yMax) && scL) scL.max = Math.max(scL.max, spec.yMax);
    var sc0 = scL || scR; if (!sc0) { ctx.fillStyle = pal.muted; ctx.textAlign = "center"; ctx.fillText("No data in this range", W / 2, H / 2); return; }
    this.drawGrid(ctx, pal, { l: L.l, r: L.r, t: L.t, b: L.b, w: W, h: H }, sc0, scL ? spec.yFmt : spec.yRightFmt, "left");
    if (scL && scR) this.drawGrid(ctx, pal, { l: L.l, r: L.r, t: L.t, b: L.b, w: W, h: H }, scR, spec.yRightFmt, "right");
    function X(i) { return L.l + (n <= 1 ? pw / 2 : pw * (i + (bars.length ? 0.5 : 0)) / (n - (bars.length ? 0 : 1))); }
    function Y(v, sc) { return L.t + ph * (1 - (v - sc.min) / (sc.max - sc.min)); }
    function scOf(s) { return side(s) === "right" && scR ? scR : (scL || scR); }
    // x labels
    ctx.fillStyle = pal.muted; ctx.textAlign = "center"; var maxLabels = Math.max(2, Math.floor(pw / 62)), stepX = Math.max(1, Math.ceil(n / maxLabels));
    for (var xi = 0; xi < n; xi += stepX) { var lab = spec.xFmt ? spec.xFmt(spec.x[xi], xi) : (D && D.fmtShort ? D.fmtShort(spec.x[xi]) : String(spec.x[xi])); if (xi === 0) ctx.textAlign = "left"; else ctx.textAlign = "center"; ctx.fillText(lab, xi === 0 ? L.l : X(xi), H - 10); }
    // bands
    (spec.bands || []).forEach(function (b, bi) {
      var sc = b.axis === "right" && scR ? scR : (scL || scR), col = resolveColor(b.color, pal, 0); ctx.fillStyle = rgba(col, b.alpha || 0.14); ctx.beginPath(); var started = false, last = -1, i;
      for (i = 0; i < n; i++) { if (ok(b.lo[i]) && ok(b.hi[i])) { var x = X(i), y = Y(b.hi[i], sc); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); last = i; } else if (started) { for (var k = last; k >= 0 && ok(b.lo[k]) && ok(b.hi[k]); k--) ctx.lineTo(X(k), Y(b.lo[k], sc)); ctx.closePath(); ctx.fill(); ctx.beginPath(); started = false; } }
      if (started) { for (var k2 = last; k2 >= 0 && ok(b.lo[k2]) && ok(b.hi[k2]); k2--) ctx.lineTo(X(k2), Y(b.lo[k2], sc)); ctx.closePath(); ctx.fill(); }
    });
    (spec.zones || []).forEach(function (z) { var sc = scL || scR, y1 = Y(Math.min(z.to, sc.max), sc), y0 = Y(Math.max(z.from, sc.min), sc); ctx.fillStyle = rgba(resolveColor(z.color, pal, 0), z.alpha || 0.1); ctx.fillRect(L.l, y1, pw, y0 - y1); });
    (spec.hlines || []).forEach(function (hl) { var sc = (hl.axis === "right" && scR) ? scR : (scL || scR); if (!ok(hl.y)) return; var y = Y(hl.y, sc); ctx.strokeStyle = resolveColor(hl.color || "muted", pal, 0); ctx.lineWidth = 1; ctx.setLineDash(hl.dash === false ? [] : [5, 4]); ctx.beginPath(); ctx.moveTo(L.l, y); ctx.lineTo(W - L.r, y); ctx.stroke(); ctx.setLineDash([]); if (hl.label) { ctx.fillStyle = resolveColor(hl.color || "muted", pal, 0); ctx.textAlign = "right"; ctx.fillText(hl.label, W - L.r - 3, y - 7); } });
    // bars
    if (bars.length) {
      var gw = pw / n, bw = Math.max(1, Math.min(28, gw * 0.78)), slot = stacked ? bw : bw / bars.length;
      for (var i2 = 0; i2 < n; i2++) { var acc = 0; bars.forEach(function (s, bi2) { var v = s.data[i2]; if (!ok(v)) return; var sc = scOf(s), col = resolveColor(s.color, pal, s._i); ctx.fillStyle = Array.isArray(s.colors) && s.colors[i2] ? resolveColor(s.colors[i2], pal, s._i) : col;
        if (stacked) { var y0 = Y(acc, sc), y1 = Y(acc + v, sc); ctx.fillRect(X(i2) - bw / 2, y1, bw, Math.max(0, y0 - y1)); acc += v; } else { var y0b = Y(Math.max(0, sc.min), sc), y1b = Y(v, sc); ctx.fillRect(X(i2) - bw / 2 + bi2 * slot, Math.min(y0b, y1b), Math.max(1, slot - 0.5), Math.abs(y0b - y1b)); } }); }
    }
    // lines / areas
    vis.forEach(function (s) {
      if (s.type === "bar") return; var sc = scOf(s), col = resolveColor(s.color, pal, s._i); ctx.lineWidth = s.width || 2; ctx.strokeStyle = col; ctx.setLineDash(s.dash ? [6, 4] : []); ctx.lineJoin = "round";
      var seg = [], segs = []; for (var i3 = 0; i3 < n; i3++) { var v = s.data[i3]; if (ok(v)) seg.push([X(i3), Y(v, sc)]); else if (seg.length) { segs.push(seg); seg = []; } } if (seg.length) segs.push(seg);
      segs.forEach(function (sg) {
        if (s.type === "area") { ctx.fillStyle = rgba(col, 0.18); ctx.beginPath(); ctx.moveTo(sg[0][0], Y(Math.max(0, sc.min), sc)); sg.forEach(function (p) { ctx.lineTo(p[0], p[1]); }); ctx.lineTo(sg[sg.length - 1][0], Y(Math.max(0, sc.min), sc)); ctx.closePath(); ctx.fill(); }
        ctx.beginPath(); sg.forEach(function (p, k) { k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.stroke();
        if (sg.length === 1 || s.dots) { ctx.fillStyle = col; sg.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], s.dots ? 2.2 : 3, 0, 6.2832); ctx.fill(); }); }
      });
      ctx.setLineDash([]);
    });
    // annotations
    var noteAt = {};
    (spec.notes || []).forEach(function (nt) { var i = spec.x.indexOf(nt.date); if (i < 0) return; (noteAt[i] = noteAt[i] || []).push(nt); var x = X(i), col = NOTE_COLORS[nt.type] || NOTE_COLORS.note; ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x, L.t + 7); ctx.lineTo(x, H - L.b); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 4, L.t); ctx.lineTo(x + 4, L.t); ctx.lineTo(x, L.t + 7); ctx.closePath(); ctx.fill(); });
    // hover
    if (this.hover !== null && this.hover < n) {
      var hx = X(this.hover); ctx.strokeStyle = pal.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(hx) + 0.5, L.t); ctx.lineTo(Math.round(hx) + 0.5, H - L.b); ctx.stroke();
      var lines = [spec.xFmt ? spec.xFmt(spec.x[this.hover], this.hover, true) : (D && D.fmtShort ? spec.x[this.hover] : String(spec.x[this.hover]))], cols = [null], hi = this.hover;
      vis.forEach(function (s) { var v = s.data[hi]; if (!ok(v)) return; var sc = scOf(s); ctx.fillStyle = resolveColor(s.color, pal, s._i); if (s.type !== "bar") { ctx.beginPath(); ctx.arc(hx, Y(v, sc), 3.5, 0, 6.2832); ctx.fill(); } lines.push(s.name + "  " + (s.fmt ? s.fmt(v) : fmtNum(v, s.digits))); cols.push(resolveColor(s.color, pal, s._i)); });
      (noteAt[hi] || []).forEach(function (nt) { lines.push("▲ " + nt.label); cols.push(NOTE_COLORS[nt.type] || NOTE_COLORS.note); });
      this.tooltip(ctx, pal, lines, cols, hx, L, W);
    }
  };
  Chart.prototype.tooltip = function (ctx, pal, lines, cols, ax, L, W) {
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"; var tw = 0, lh = 16; lines.forEach(function (t) { tw = Math.max(tw, ctx.measureText(t).width); }); tw += 16; var th = lines.length * lh + 8;
    var x = ax + 12; if (x + tw > W - 2) x = ax - 12 - tw; if (x < 2) x = 2; var y = L.t + 4;
    ctx.fillStyle = pal.card; ctx.strokeStyle = pal.line; ctx.globalAlpha = 0.96; ctx.beginPath(); ctx.rect(x, y, tw, th); ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    ctx.textAlign = "left"; lines.forEach(function (t, i) { ctx.fillStyle = cols[i] || pal.fg; ctx.font = (i === 0 ? "600 " : "") + "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"; ctx.fillText(t, x + 8, y + 4 + lh * i + lh / 2); });
    ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  };
  Chart.prototype.drawScatter = function (ctx, pal, W, H) {
    var spec = this.spec, L = this.layout(W, H), pw = W - L.l - L.r, ph = H - L.t - L.b, pts = spec.points || [];
    var ex = extent([pts.map(function (p) { return p.x; })]), ey = extent([pts.map(function (p) { return p.y; })]);
    var sx = niceScale(ex[0], ex[1], 5), sy = niceScale(ey[0], ey[1], 5);
    function X(v) { return L.l + pw * (v - sx.min) / (sx.max - sx.min); } function Y(v) { return L.t + ph * (1 - (v - sy.min) / (sy.max - sy.min)); }
    this.drawGrid(ctx, pal, { l: L.l, r: L.r, t: L.t, b: L.b, w: W, h: H }, sy, spec.yFmt, "left");
    ctx.fillStyle = pal.muted; ctx.textAlign = "center"; sx.ticks.forEach(function (t) { ctx.fillText(spec.xFmt ? spec.xFmt(t) : fmtNum(t), X(t), H - L.b + 12); });
    ctx.fillText(spec.xLabel || "", L.l + pw / 2, H - 7); ctx.save(); ctx.translate(11, L.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(spec.yLabel || "", 0, 0); ctx.restore();
    var col = resolveColor(spec.color || "c1", pal, 0), hot = this.hover; this.sp = [];
    pts.forEach(function (p, i) { var x = X(p.x), y = Y(p.y); self_sp(i, x, y); ctx.fillStyle = rgba(col, p.dim ? 0.2 : 0.55); ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 6.2832); ctx.fill(); });
    var self = this; function self_sp(i, x, y) { self.sp.push([x, y, i]); }
    if (spec.fit) { ctx.strokeStyle = pal.fg; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); var x0 = sx.min, x1 = sx.max; ctx.beginPath(); ctx.moveTo(X(x0), Y(spec.fit.intercept + spec.fit.slope * x0)); ctx.lineTo(X(x1), Y(spec.fit.intercept + spec.fit.slope * x1)); ctx.save(); ctx.beginPath(); ctx.rect(L.l, L.t, pw, ph); ctx.clip(); ctx.stroke(); ctx.restore(); ctx.setLineDash([]); }
    if (hot !== null && pts[hot]) { var p = pts[hot], hx = X(p.x), hy = Y(p.y); ctx.strokeStyle = pal.fg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 6, 0, 6.2832); ctx.stroke(); this.tooltip(ctx, pal, [p.date || "", (spec.xName || "x") + "  " + fmtNum(p.x), (spec.yName || "y") + "  " + fmtNum(p.y)], [null, null, null], hx, L, W); }
  };

  /* ---------- DOM wrapper: card with canvas, legend (toggle buttons) and a data-table fallback ---------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function mount(container, spec) {
    var fig = el("figure", "chart"), box = el("div", "chart-box"), cv = document.createElement("canvas"); box.appendChild(cv); fig.appendChild(box);
    if (spec.title) { var cap = el("figcaption", "chart-title", spec.title); fig.insertBefore(cap, box); }
    var chart = new Chart(cv, spec), legend = null;
    function buildLegend() {
      if (legend) legend.remove(); var items = (spec.series || []).map(function (s, i) { return { s: s, i: i }; }).filter(function (o) { return o.s.name && o.s.legend !== false; });
      if (items.length < 2 && !(spec.notes && spec.notes.length)) { legend = null; return; }
      legend = el("div", "legend"); var pal = palette(cv);
      items.forEach(function (o) { var b = el("button", "lg"); b.type = "button"; b.setAttribute("aria-pressed", chart.hidden[o.i] ? "false" : "true"); var sw = el("span", "sw"); sw.style.background = resolveColor(o.s.color, pal, o.i); b.appendChild(sw); b.appendChild(document.createTextNode(o.s.name)); b.addEventListener("click", function () { chart.toggle(o.i); b.setAttribute("aria-pressed", chart.hidden[o.i] ? "false" : "true"); }); legend.appendChild(b); });
      if (spec.notes && spec.notes.length) { var tl = el("span", "lg note-key"); tl.textContent = "▲ events"; legend.appendChild(tl); }
      fig.appendChild(legend);
    }
    buildLegend();
    var det = el("details", "chart-table"), sm = el("summary", null, "Data table"); det.appendChild(sm); var tbl = null;
    det.addEventListener("toggle", function () { if (!det.open) return; if (tbl) tbl.remove(); tbl = buildTable(chart.spec); det.appendChild(tbl); });
    fig.appendChild(det); if (spec.note) fig.appendChild(el("p", "chart-note", spec.note));
    container.appendChild(fig);
    return { chart: chart, fig: fig, update: function (sp) { spec = sp; chart.set(sp); var old = legend; buildLegend(); if (det.open) { if (tbl) tbl.remove(); tbl = buildTable(sp); det.appendChild(tbl); } if (!legend && old) old.remove(); var cap = fig.querySelector(".chart-title"); if (cap && sp.title) cap.textContent = sp.title; }, destroy: function () { chart.destroy(); fig.remove(); } };
  }
  function buildTable(spec) {
    var t = el("table", "dt"), head = el("tr");
    if (spec.kind === "scatter") { ["Date", spec.xName || "x", spec.yName || "y"].forEach(function (h) { head.appendChild(el("th", null, h)); }); t.appendChild(head); (spec.points || []).slice(-60).forEach(function (p) { var r = el("tr"); [p.date || "", fmtNum(p.x), fmtNum(p.y)].forEach(function (c) { r.appendChild(el("td", null, c)); }); t.appendChild(r); }); return t; }
    head.appendChild(el("th", null, "Date")); (spec.series || []).forEach(function (s) { if (s.name) head.appendChild(el("th", null, s.name)); }); t.appendChild(head);
    var n = spec.x.length, from = Math.max(0, n - 60); for (var i = n - 1; i >= from; i--) { var r2 = el("tr"); r2.appendChild(el("td", null, spec.x[i])); (spec.series || []).forEach(function (s) { if (s.name) r2.appendChild(el("td", null, s.fmt && ok(s.data[i]) ? s.fmt(s.data[i]) : fmtNum(s.data[i], s.digits))); }); t.appendChild(r2); }
    return t;
  }
  return { create: function (canvas, spec) { return new Chart(canvas, spec); }, mount: mount, niceScale: niceScale, extent: extent, describe: describe, nearestIndex: nearestIndex, fmtNum: fmtNum, NOTE_COLORS: NOTE_COLORS };
});
