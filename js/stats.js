/* Garmin Lens – statistics (pure, UMD). Series are plain arrays; missing values are null/undefined/NaN and are skipped. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GLStats = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function ok(x) { return typeof x === "number" && isFinite(x); }
  function clean(a) { var o = []; for (var i = 0; i < a.length; i++) if (ok(a[i])) o.push(a[i]); return o; }
  function sum(a) { var s = 0; a = clean(a); for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { a = clean(a); return a.length ? sum(a) / a.length : null; }
  function variance(a) { a = clean(a); if (a.length < 2) return null; var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return s / (a.length - 1); }
  function sd(a) { var v = variance(a); return v === null ? null : Math.sqrt(v); }
  function percentile(a, p) { a = clean(a).sort(function (x, y) { return x - y; }); if (!a.length) return null; var h = (a.length - 1) * p / 100, lo = Math.floor(h), hi = Math.ceil(h); return a[lo] + (a[hi] - a[lo]) * (h - lo); }
  function median(a) { return percentile(a, 50); }
  function mad(a) { var m = median(a); if (m === null) return null; return median(clean(a).map(function (x) { return Math.abs(x - m); })); }
  function min(a) { a = clean(a); return a.length ? Math.min.apply(null, a) : null; }
  function max(a) { a = clean(a); return a.length ? Math.max.apply(null, a) : null; }
  function z(x, m, s) { return ok(x) && ok(m) && ok(s) && s > 0 ? (x - m) / s : null; }
  // robust z (median / 1.4826*MAD) — less distorted by the very outliers (illness days) we want to find
  function robustZ(x, a) { var m = median(a), d = mad(a); if (m === null || !d) return null; return (x - m) / (1.4826 * d); }

  // Baseline of the `window` values BEFORE index i (the day itself is excluded, so an unusual day cannot hide itself). Needs >= minN values.
  function baseline(series, i, window, minN) {
    var v = [], from = Math.max(0, i - window);
    for (var k = from; k < i; k++) if (ok(series[k])) v.push(series[k]);
    if (v.length < (minN || 5)) return null;
    return { mean: mean(v), sd: sd(v), median: median(v), n: v.length, lo: percentile(v, 10), hi: percentile(v, 90) };
  }
  function rolling(series, window, fn) { var out = []; for (var i = 0; i < series.length; i++) { var w = []; for (var k = Math.max(0, i - window + 1); k <= i; k++) if (ok(series[k])) w.push(series[k]); out.push(w.length ? (fn || mean)(w) : null); } return out; }
  function ema(series, alpha, seed) { var out = [], p = ok(seed) ? seed : null; for (var i = 0; i < series.length; i++) { var x = series[i]; if (ok(x)) p = p === null ? x : alpha * x + (1 - alpha) * p; out.push(p); } return out; }

  function linreg(xs, ys) {
    var px = [], py = [];
    for (var i = 0; i < xs.length; i++) if (ok(xs[i]) && ok(ys[i])) { px.push(xs[i]); py.push(ys[i]); }
    var n = px.length; if (n < 3) return null;
    var mx = mean(px), my = mean(py), sxx = 0, sxy = 0, syy = 0;
    for (var j = 0; j < n; j++) { sxx += (px[j] - mx) * (px[j] - mx); sxy += (px[j] - mx) * (py[j] - my); syy += (py[j] - my) * (py[j] - my); }
    if (sxx === 0) return null;
    var slope = sxy / sxx, icpt = my - slope * mx;
    return { slope: slope, intercept: icpt, r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy), n: n };
  }
  function pairs(xs, ys) { var a = [], b = []; for (var i = 0; i < xs.length && i < ys.length; i++) if (ok(xs[i]) && ok(ys[i])) { a.push(xs[i]); b.push(ys[i]); } return [a, b]; }
  function pearson(xs, ys) {
    var p = pairs(xs, ys), a = p[0], b = p[1], n = a.length; if (n < 3) return null;
    var ma = mean(a), mb = mean(b), sab = 0, saa = 0, sbb = 0;
    for (var i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) * (a[i] - ma); sbb += (b[i] - mb) * (b[i] - mb); }
    if (saa === 0 || sbb === 0) return null;
    return sab / Math.sqrt(saa * sbb);
  }
  function ranks(a) {
    var idx = a.map(function (v, i) { return [v, i]; }).sort(function (x, y) { return x[0] - y[0]; }), r = new Array(a.length), i = 0;
    while (i < idx.length) { var j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; var rk = (i + j) / 2 + 1; for (var k = i; k <= j; k++) r[idx[k][1]] = rk; i = j + 1; }
    return r;
  }
  function spearman(xs, ys) { var p = pairs(xs, ys); if (p[0].length < 3) return null; return pearson(ranks(p[0]), ranks(p[1])); }
  // standard normal CDF (Abramowitz-Stegun 7.1.26 erf, |error| < 1.5e-7)
  function erf(x) { var s = x < 0 ? -1 : 1; x = Math.abs(x); var t = 1 / (1 + 0.3275911 * x); var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
  // two-sided p-value for a correlation via Fisher z (an approximation; fine for n >= ~10)
  function corrP(r, n) { if (!ok(r) || n < 4) return null; var rr = Math.min(0.999999, Math.abs(r)); var zz = 0.5 * Math.log((1 + rr) / (1 - rr)) * Math.sqrt(n - 3); return 2 * (1 - normCdf(zz)); }
  function corrCI(r, n) { if (!ok(r) || n < 4) return null; var rr = Math.max(-0.999999, Math.min(0.999999, r)), zz = 0.5 * Math.log((1 + rr) / (1 - rr)), se = 1 / Math.sqrt(n - 3); function back(v) { return (Math.exp(2 * v) - 1) / (Math.exp(2 * v) + 1); } return [back(zz - 1.96 * se), back(zz + 1.96 * se)]; }
  // correlation between x[t] and y[t+lag] (lag >= 0 means y comes `lag` days AFTER x)
  function laggedCorr(x, y, lag, method) {
    var a = [], b = [];
    for (var t = 0; t < x.length; t++) { var u = t + lag; if (u < 0 || u >= y.length) continue; if (ok(x[t]) && ok(y[u])) { a.push(x[t]); b.push(y[u]); } }
    var r = method === "pearson" ? pearson(a, b) : spearman(a, b);
    return { r: r, n: a.length, p: r === null ? null : corrP(r, a.length), ci: r === null ? null : corrCI(r, a.length) };
  }
  // difference between two groups: Welch t (normal approx for p), Cohen's d
  function groupDiff(a, b) {
    a = clean(a); b = clean(b); if (a.length < 2 || b.length < 2) return { n1: a.length, n2: b.length, diff: null, d: null, p: null };
    var ma = mean(a), mb = mean(b), va = variance(a), vb = variance(b), se = Math.sqrt(va / a.length + vb / b.length);
    var sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
    var t = se > 0 ? (ma - mb) / se : 0;
    return { n1: a.length, n2: b.length, mean1: ma, mean2: mb, diff: ma - mb, d: sp > 0 ? (ma - mb) / sp : null, t: t, p: se > 0 ? 2 * (1 - normCdf(Math.abs(t))) : null };
  }
  function round(x, d) { if (!ok(x)) return x; var f = Math.pow(10, d || 0); return Math.round(x * f) / f; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  return { ok: ok, clean: clean, sum: sum, mean: mean, variance: variance, sd: sd, percentile: percentile, median: median, mad: mad, min: min, max: max, z: z, robustZ: robustZ, baseline: baseline, rolling: rolling, ema: ema, linreg: linreg, pearson: pearson, spearman: spearman, ranks: ranks, erf: erf, normCdf: normCdf, corrP: corrP, corrCI: corrCI, laggedCorr: laggedCorr, groupDiff: groupDiff, round: round, clamp: clamp };
});
