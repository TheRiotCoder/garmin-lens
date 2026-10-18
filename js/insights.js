/* Garmin Lens – insights: correlations, lag analysis, hypothesis tests, reports, goals, exports (pure, UMD).
   Correlation is not causation. Small samples and autocorrelated daily data make p-values optimistic; the app says so everywhere. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./stats.js"), require("./dates.js"), require("./models.js"));
  else root.GLInsights = factory(root.GLStats, root.GLDates, root.GLModels);
})(typeof self !== "undefined" ? self : this, function (S, D, M) {
  "use strict";
  var ok = S.ok;

  /* ---------- helpers ---------- */
  function autocorr1(a) { var x = [], y = []; for (var i = 1; i < a.length; i++) if (ok(a[i]) && ok(a[i - 1])) { x.push(a[i - 1]); y.push(a[i]); } var r = S.pearson(x, y); return r === null ? 0 : r; }
  // effective sample size under AR(1) autocorrelation (Bayley–Hammersley): n * (1 − ρx ρy) / (1 + ρx ρy)
  function effectiveN(n, rx, ry) { var q = rx * ry; if (q <= 0) return n; return Math.max(4, n * (1 - q) / (1 + q)); }
  function strengthLabel(r) { var a = Math.abs(r); return a < 0.1 ? "negligible" : a < 0.3 ? "weak" : a < 0.5 ? "moderate" : a < 0.7 ? "strong" : "very strong"; }
  // deviation from the user's own trailing normal (value − median of previous `win` days); removes slow trends that cause spurious correlations
  function deviation(arr, win) { win = win || 28; return arr.map(function (v, i) { if (!ok(v)) return null; var b = S.baseline(arr, i, win, 10); return b ? v - b.median : null; }); }
  function bhAdjust(ps) { // Benjamini–Hochberg q-values; null p stays null
    var idx = []; ps.forEach(function (p, i) { if (ok(p)) idx.push(i); });
    idx.sort(function (a, b) { return ps[a] - ps[b]; });
    var m = idx.length, q = new Array(ps.length).fill(null), prev = 1;
    for (var r = m - 1; r >= 0; r--) { var v = Math.min(prev, ps[idx[r]] * m / (r + 1)); q[idx[r]] = v; prev = v; }
    return q;
  }
  function seriesFor(ds, key, detrend) { var a = ds.s[key]; if (!a) return null; return detrend ? deviation(a) : a; }

  /* ---------- correlation explorer ---------- */
  function explore(ds, xKey, yKey, opts) {
    opts = opts || {}; var lag = opts.lag || 0, method = opts.method || "spearman", detrend = !!opts.detrend;
    var xs = seriesFor(ds, xKey, detrend), ys = seriesFor(ds, yKey, detrend);
    if (!xs || !ys) return { error: "unknown series" };
    var px = [], py = [], dates = [];
    for (var t = 0; t < ds.n; t++) { var u = t + lag; if (u < 0 || u >= ds.n) continue; if (ok(xs[t]) && ok(ys[u])) { px.push(xs[t]); py.push(ys[u]); dates.push(ds.dates[t]); } }
    var r = method === "pearson" ? S.pearson(px, py) : S.spearman(px, py), n = px.length, warnings = [];
    var rx = autocorr1(xs), ry = autocorr1(ys), ne = effectiveN(n, rx, ry);
    var out = { x: xKey, y: yKey, lag: lag, method: method, detrend: detrend, n: n, nEff: Math.round(ne), r: r, xs: px, ys: py, dates: dates, warnings: warnings };
    if (r === null) { warnings.push("Not enough overlapping days to compute a correlation."); return out; }
    out.p = S.corrP(r, ne); out.ci = S.corrCI(r, ne); out.strength = strengthLabel(r);
    out.direction = r > 0 ? "rise together" : "move in opposite directions";
    out.lr = S.linreg(px, py);
    if (n < 14) warnings.push("Only " + n + " paired days – far too few to say anything.");
    else if (n < 30) warnings.push("Only " + n + " paired days – treat this as a hint, not a finding.");
    if (ne < n * 0.7) warnings.push("Daily values are strongly autocorrelated, so the effective sample is about " + Math.round(ne) + " independent days; p-value and interval use that.");
    if (xKey === yKey && lag === 0) warnings.push("Comparing a series with itself.");
    warnings.push("Correlation is not causation: a third factor (training block, illness, season, travel) can drive both.");
    return out;
  }
  function lagScan(ds, xKey, yKey, lags, opts) {
    lags = lags || [-3, -2, -1, 0, 1, 2, 3]; var res = lags.map(function (l) { var e = explore(ds, xKey, yKey, Object.assign({}, opts, { lag: l })); return { lag: l, r: e.r, n: e.n, p: e.p, nEff: e.nEff }; });
    var q = bhAdjust(res.map(function (x) { return x.p; })); res.forEach(function (x, i) { x.q = q[i]; });
    var best = null; res.forEach(function (x) { if (ok(x.r) && x.n >= 14 && (!best || Math.abs(x.r) > Math.abs(best.r))) best = x; });
    return { results: res, best: best, note: "Lag k means " + (LBL(xKey)) + " today versus " + (LBL(yKey)) + " k days later. Several lags were tested, so q-values (Benjamini–Hochberg) are shown." };
  }
  function LBL(k) { return M.LABELS[k] || k; }

  var PRED = ["load", "stress", "sleepH", "onset", "activeMin", "steps", "deepPct", "spo2", "resp"];
  var TARG = ["lnHrv", "rhr", "sleepScore", "deepPct", "stress", "bbHigh", "sleepH"];
  var SLEEPY = { sleepH: 1, onset: 1, deepPct: 1, sleepScore: 1, spo2: 1, resp: 1, lnHrv: 1, rhr: 1 }; // all measured during the same night
  // "what affects what": scan predictor→target pairs at lag 0 and 1, on deviations from your own normal, with BH-FDR
  function associations(ds, opts) {
    opts = opts || {}; var preds = opts.predictors || PRED, targs = opts.targets || TARG, lags = opts.lags || [0, 1], minN = opts.minN || 30, out = [];
    preds.forEach(function (px) { targs.forEach(function (ty) {
      if (px === ty) return;
      lags.forEach(function (lag) { if (lag === 0 && SLEEPY[px] && SLEEPY[ty]) return; // same-night sleep metrics describe one thing; skip
        var e = explore(ds, px, ty, { lag: lag, detrend: true, method: "spearman" });
        if (!ok(e.r) || e.n < minN) return; out.push({ x: px, y: ty, lag: lag, r: e.r, n: e.n, nEff: e.nEff, p: e.p, strength: e.strength });
      });
    }); });
    var q = bhAdjust(out.map(function (o) { return o.p; })); out.forEach(function (o, i) { o.q = q[i]; o.significant = o.q < 0.05 && Math.abs(o.r) >= 0.2; o.text = assocText(o); });
    out.sort(function (a, b) { return Math.abs(b.r) - Math.abs(a.r); });
    return { tests: out.length, results: out, note: "Each row is one of " + out.length + " tests; q-values correct for running many. Values are deviations from your own 28-day normal. Association only – not proof of cause." };
  }
  var NAME = { lnHrv: "overnight HRV", rhr: "resting HR", sleepScore: "sleep score", deepPct: "deep-sleep share", stress: "stress", bbHigh: "Body Battery peak", sleepH: "sleep duration", load: "training load", onset: "bedtime", activeMin: "intensity minutes", steps: "steps", spo2: "SpO2", resp: "breathing rate" };
  function assocText(o) {
    var when = o.lag === 0 ? "the same day" : o.lag === 1 ? "the next day" : o.lag + " days later", up = o.x === "onset" ? "later than" : "higher than";
    return "When " + (NAME[o.x] || o.x) + " is " + up + " your normal, " + (NAME[o.y] || o.y) + " tends to be " + (o.r > 0 ? "higher" : "lower") + " " + when + " (" + strengthLabel(o.r) + ", ρ=" + o.r.toFixed(2) + ", n=" + o.n + ").";
  }

  /* ---------- group comparisons ("does X change Y the next day?") ---------- */
  function compareGroups(ds, dateSet, key, lag) {
    lag = lag === undefined ? 1 : lag; var arr = ds.s[key], a = [], b = [], hit = {};
    Object.keys(dateSet).forEach(function (d) { var i = ds.idx[d]; if (i === undefined) return; var j = i + lag; if (j < ds.n && ok(arr[j])) { a.push(arr[j]); hit[j] = true; } });
    for (var j = 0; j < ds.n; j++) if (!hit[j] && ok(arr[j])) b.push(arr[j]);
    var g = S.groupDiff(a, b); g.key = key; g.lag = lag; return g;
  }
  function verdict(g) {
    if (g.n1 < 5) return "too-few"; if (g.d === null) return "none";
    var strong = g.p < 0.05 && Math.abs(g.d) >= 0.5 && g.n1 >= 8;
    if (strong) return "supported"; if (g.p < 0.15 && Math.abs(g.d) >= 0.4) return "hint"; return "none";
  }
  var HYP_METRICS = ["lnHrv", "rhr", "sleepScore", "deepPct", "sleepH"];
  var GOOD_DIR = { lnHrv: 1, rhr: -1, sleepScore: 1, deepPct: 1, sleepH: 1, stress: -1, bbHigh: 1, readiness: 1 };
  function lateWorkoutDates(ds, hour) {
    var set = {}; ds.acts.forEach(function (a) { if (!ok(a.start) || !ok(a.durationSec) || a.durationSec < 20 * 60) return; var tz = ok(a.tzOffsetMin) ? a.tzOffsetMin : (ds.settings.tzMin || 0); var h = (((a.start + tz * 60000) / 3600000) % 24 + 24) % 24; if (h >= hour) set[a.date] = true; });
    return set;
  }
  function hypotheses(ds) {
    var list = [], load = ds.s.load.filter(function (v) { return v > 0; }), loadP75 = load.length >= 20 ? S.percentile(load, 75) : null;
    var stressP75 = S.percentile(ds.s.stress, 75);
    var sets = [
      { id: "late", title: "Workouts that start after 19:30", set: lateWorkoutDates(ds, 19.5), when: "that night / next morning", lag: 1, metrics: HYP_METRICS.concat(["onset"]) },
      { id: "hard", title: "Hard training days (top quarter of your load)", set: loadP75 ? (function () { var s = {}; ds.dates.forEach(function (d, i) { if (ds.s.load[i] >= loadP75) s[d] = true; }); return s; })() : {}, when: "next day", lag: 1, metrics: ["lnHrv", "rhr", "sleepScore"] },
      { id: "stress", title: "High-stress days (top quarter of your stress)", set: (function () { var s = {}; ds.dates.forEach(function (d, i) { if (ok(ds.s.stress[i]) && ds.s.stress[i] >= stressP75) s[d] = true; }); return s; })(), when: "next day", lag: 1, metrics: ["lnHrv", "rhr", "sleepScore"] },
      { id: "short", title: "Short nights (under 6 h 30 m)", set: (function () { var s = {}; ds.dates.forEach(function (d, i) { if (ok(ds.s.sleepH[i]) && ds.s.sleepH[i] < 6.5) s[d] = true; }); return s; })(), when: "same day", lag: 0, metrics: ["stress", "bbHigh", "readiness"] }
    ];
    var types = {}; ds.notes.forEach(function (n) { types[n.type] = types[n.type] || {}; types[n.type][n.date] = true; });
    Object.keys(types).forEach(function (t) { if (t === "illness" || t === "travel") return; sets.push({ id: "note:" + t, title: "Days you tagged “" + t + "”", set: types[t], when: "next day", lag: 1, metrics: ["lnHrv", "rhr", "sleepScore", "deepPct"] }); });
    var all = [];
    sets.forEach(function (h) {
      var n = Object.keys(h.set).length, item = { id: h.id, title: h.title, when: h.when, days: n, effects: [] };
      if (n >= 3) h.metrics.forEach(function (m) { if (!ds.s[m]) return; var g = compareGroups(ds, h.set, m, h.lag); if (g.diff === null) return; item.effects.push({ key: m, label: LBL(m), lag: h.lag, n1: g.n1, n2: g.n2, mean1: g.mean1, mean2: g.mean2, diff: g.diff, d: g.d, p: g.p }); all.push(item.effects[item.effects.length - 1]); });
      list.push(item);
    });
    var q = bhAdjust(all.map(function (e) { return e.p; })); all.forEach(function (e, i) { e.q = q[i]; });
    list.forEach(function (h) { h.effects.forEach(function (e) {
      var g = { n1: e.n1, d: e.d, p: e.q }; e.verdict = e.n1 < 5 ? "too-few" : (e.q < 0.05 && Math.abs(e.d) >= 0.5 && e.n1 >= 8) ? "supported" : (e.p < 0.1 && Math.abs(e.d) >= 0.4) ? "hint" : "none";
      var better = (GOOD_DIR[e.key] || 0) * e.diff > 0, pct = e.mean2 ? Math.abs(e.diff / e.mean2) * 100 : null;
      var pctTxt = e.key === "lnHrv" ? "about " + Math.abs((Math.exp(e.diff) - 1) * 100).toFixed(0) + "%" : null;
      if (e.key === "lnHrv") e.label = "Overnight HRV";
      e.text = e.verdict === "none" ? "No clear difference in " + e.label + "." : pctTxt ? (e.verdict === "hint" ? "Possible: " : "") + "Overnight HRV was " + pctTxt + (e.diff > 0 ? " higher" : " lower") + " than on other days (" + e.n1 + " vs " + e.n2 + " days)" + (better ? " – better" : " – worse") + "." : e.verdict === "too-few" ? "Only " + e.n1 + " examples – too few." : (e.verdict === "hint" ? "Possible: " : "") + e.label + " was " + Math.abs(e.diff).toFixed(Math.abs(e.diff) < 1 ? 2 : 1) + (pct !== null && pct < 400 ? " (" + pct.toFixed(0) + "%)" : "") + (e.diff > 0 ? " higher" : " lower") + " than on other days (" + e.n1 + " vs " + e.n2 + " days)" + (better ? " – better" : GOOD_DIR[e.key] ? " – worse" : "") + ".";
    }); h.verdict = h.effects.some(function (e) { return e.verdict === "supported"; }) ? "supported" : h.effects.some(function (e) { return e.verdict === "hint"; }) ? "hint" : "none"; });
    return list;
  }

  /* ---------- trends ---------- */
  function windowStats(arr, i, w) { var v = []; for (var k = Math.max(0, i - w + 1); k <= i; k++) if (ok(arr[k])) v.push(arr[k]); return v.length >= Math.max(2, Math.ceil(w * 0.4)) ? { mean: S.mean(v), sd: S.sd(v), n: v.length } : null; }
  function trendSummary(ds, key, i) {
    i = i === undefined ? ds.n - 1 : i; var arr = ds.s[key]; if (!arr) return null;
    var w7 = windowStats(arr, i, 7), w30 = windowStats(arr, i, 30), w90 = windowStats(arr, i, 90), z = M.zScore(ds, key, i), range = M.normalRange(ds, key, i);
    var xs = [], ys = []; for (var k = Math.max(0, i - 89); k <= i; k++) if (ok(arr[k])) { xs.push(k); ys.push(arr[k]); }
    var lr = xs.length >= 20 ? S.linreg(xs, ys) : null;
    return { key: key, label: LBL(key), latest: arr[i], avg7: w7 && w7.mean, avg30: w30 && w30.mean, avg90: w90 && w90.mean, z: z && z.z, range: range, slopePer30: lr ? lr.slope * 30 : null, slopeR2: lr ? lr.r2 : null, slopeN: lr ? lr.n : 0,
      delta7v30: w7 && w30 ? w7.mean - w30.mean : null };
  }
  function lastIndex(ds, key) { for (var i = ds.n - 1; i >= 0; i--) if (ok(ds.s[key][i])) return i; return -1; }

  /* ---------- reports ---------- */
  var REPORT_KEYS = ["rhr", "hrv", "sleepH", "sleepScore", "stress", "steps", "bbHigh", "recovery", "load", "vo2max"];
  function periodReport(ds, from, to) {
    var i0 = ds.idx[from], i1 = ds.idx[to]; if (i0 === undefined || i1 === undefined) return null;
    var len = i1 - i0 + 1, p0 = Math.max(0, i0 - len), metrics = [], hl = [];
    REPORT_KEYS.forEach(function (k) {
      var cur = ds.s[k].slice(i0, i1 + 1), prev = ds.s[k].slice(p0, i0), cm = S.mean(cur), pm = prev.length >= 3 ? S.mean(prev) : null, nC = S.clean(cur).length;
      if (nC < Math.ceil(len * 0.4) && k !== "load") return;
      var base = S.baseline(ds.s[k], i0, 90, 10), sd = base ? Math.max(base.sd || 0, 1e-9) : null;
      metrics.push({ key: k, label: LBL(k), mean: cm, prev: pm, delta: pm !== null && cm !== null ? cm - pm : null, effect: sd && pm !== null ? (cm - pm) / sd : null, n: nC });
    });
    metrics.slice().filter(function (m) { return m.effect !== null; }).sort(function (a, b) { return Math.abs(b.effect) - Math.abs(a.effect); }).slice(0, 3).forEach(function (m) { if (Math.abs(m.effect) >= 0.5) hl.push(m.label + " " + (m.delta > 0 ? "up " : "down ") + Math.abs(m.delta).toFixed(Math.abs(m.delta) < 10 ? 1 : 0) + " versus the previous " + len + " days."); });
    var acts = ds.acts.filter(function (a) { return a.date >= from && a.date <= to; }), dist = 0, dur = 0, load = 0; acts.forEach(function (a) { dist += a.distanceM || 0; dur += a.durationSec || 0; load += a.hrtss || 0; });
    var reg = M.sleepRegularity(ds, i1, Math.min(len, 14)), eps = M.anomalyEpisodes(ds).filter(function (e) { return e.end >= from && e.start <= to; });
    var rec = []; for (var k = i0; k <= i1; k++) if (ok(ds.s.recovery[k])) rec.push({ date: ds.dates[k], v: ds.s.recovery[k] });
    var best = rec.length ? rec.reduce(function (a, b) { return b.v > a.v ? b : a; }) : null, worst = rec.length ? rec.reduce(function (a, b) { return b.v < a.v ? b : a; }) : null;
    var notes = []; for (k = i0; k <= i1; k++) (ds.notesByDate[ds.dates[k]] || []).forEach(function (n) { notes.push(n); });
    var wk = M.weeklyZoneDistribution(ds, from);
    return { from: from, to: to, days: len, metrics: metrics, highlights: hl, activities: acts.length, distanceKm: dist / 1000, durationH: dur / 3600, load: load, sleepRegularity: reg, anomalies: eps, bestRecovery: best, worstRecovery: worst, notes: notes, zones: len <= 8 ? wk : null, ctlEnd: ds.s.ctl[i1], tsbEnd: ds.s.tsb[i1] };
  }
  function weeks(ds) { var out = [], seen = {}; ds.dates.forEach(function (d) { var w = D.weekStart(d); if (!seen[w]) { seen[w] = 1; out.push(w); } }); return out; }
  function months(ds) { var out = [], seen = {}; ds.dates.forEach(function (d) { var m = D.monthKey(d); if (!seen[m]) { seen[m] = 1; out.push(m); } }); return out; }
  function weeklyReport(ds, ws) { var end = D.addDays(ws, 6); if (end > ds.dates[ds.n - 1]) end = ds.dates[ds.n - 1]; var from = ws < ds.dates[0] ? ds.dates[0] : ws; return periodReport(ds, from, end); }
  function monthlyReport(ds, mk) { var f = mk + "-01", from = f < ds.dates[0] ? ds.dates[0] : f, last = D.addDays(D.addDays(f, 32).slice(0, 8) + "01", -1); if (last > ds.dates[ds.n - 1]) last = ds.dates[ds.n - 1]; return periodReport(ds, from, last); }

  /* ---------- goals ---------- */
  function goalValues(ds, goal, from, to) {
    var out = [], i0 = ds.idx[from], i1 = ds.idx[to]; if (i0 === undefined) return out;
    function dayVal(i) { var k = goal.key; if (k === "sessions") return (ds.actsByDate[ds.dates[i]] || []).length; if (k === "distanceKm") return (ds.actsByDate[ds.dates[i]] || []).reduce(function (s, a) { return s + (a.distanceM || 0) / 1000; }, 0); return ds.s[k] ? ds.s[k][i] : null; }
    if (goal.period === "week") {
      var ws = D.weekStart(ds.dates[i0]);
      while (ws <= ds.dates[i1]) { var a = ds.idx[ws] === undefined ? Math.max(0, i0) : ds.idx[ws], e = Math.min(i1, a + 6 - (ds.idx[ws] === undefined ? D.diffDays(ws, ds.dates[a]) * -1 : 0)), vals = [];
        for (var k = a; k <= Math.min(i1, ds.idx[ws] === undefined ? a + 6 : ds.idx[ws] + 6); k++) { var v = dayVal(k); if (ok(v)) vals.push(v); }
        out.push({ start: ws, value: vals.length ? (goal.agg === "avg" ? S.mean(vals) : S.sum(vals)) : null, days: vals.length, complete: D.addDays(ws, 6) <= ds.dates[i1] });
        ws = D.addDays(ws, 7); }
    } else for (var i = i0; i <= i1; i++) out.push({ start: ds.dates[i], value: dayVal(i), days: 1, complete: true });
    return out;
  }
  function meets(goal, v) { return ok(v) && (goal.op === "<=" ? v <= goal.target : v >= goal.target); }
  function evaluateGoal(ds, goal, today) {
    var end = today || ds.dates[ds.n - 1], from = D.addDays(end, goal.period === "week" ? -7 * 12 + 1 : -29);
    if (from < ds.dates[0]) from = ds.dates[0]; if (end > ds.dates[ds.n - 1]) end = ds.dates[ds.n - 1];
    var vals = goalValues(ds, goal, from, end), done = vals.filter(function (x) { return x.complete && ok(x.value); }), hit = done.filter(function (x) { return meets(goal, x.value); }), streak = 0;
    for (var i = vals.length - 1; i >= 0; i--) { if (!vals[i].complete) continue; if (meets(goal, vals[i].value)) streak++; else break; }
    var cur = vals.length ? vals[vals.length - 1] : null;
    return { goal: goal, periods: done.length, met: hit.length, rate: done.length ? hit.length / done.length : null, streak: streak, current: cur, progress: cur && ok(cur.value) && goal.op !== "<=" ? Math.min(1, cur.value / goal.target) : null, series: vals };
  }

  /* ---------- CSV export ---------- */
  function csvCell(v) { if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return ""; var s = typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v); if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCsv(cols, rows) { return [cols.map(csvCell).join(",")].concat(rows.map(function (r) { return r.map(csvCell).join(","); })).join("\r\n") + "\r\n"; }
  var DAY_COLS = ["rhr", "hrv", "lnHrv", "sleepH", "sleepScore", "deepPct", "remPct", "awakeMin", "stress", "bbHigh", "bbLow", "resp", "spo2", "skin", "steps", "readiness", "vo2max", "weight", "load", "ctl", "atl", "tsb", "recovery", "onset", "wake", "mid"];
  function daysCsv(ds) { return toCsv(["date"].concat(DAY_COLS), ds.dates.map(function (d, i) { return [d].concat(DAY_COLS.map(function (k) { return ds.s[k][i]; })); })); }
  function activitiesCsv(ds) {
    var cols = ["date", "start_utc", "name", "type", "group", "duration_min", "distance_km", "avg_hr", "max_hr", "trimp", "hrtss", "load_source", "calories", "ascent_m"];
    return toCsv(cols, ds.acts.slice().sort(function (a, b) { return a.start - b.start; }).map(function (a) { return [a.date, ok(a.start) ? new Date(a.start).toISOString() : "", a.name, a.type, a.group, ok(a.durationSec) ? a.durationSec / 60 : null, ok(a.distanceM) ? a.distanceM / 1000 : null, a.avgHr, a.maxHr, a.trimp, a.hrtss, a.loadSource, a.calories, a.ascentM]; }));
  }

  return { autocorr1: autocorr1, effectiveN: effectiveN, strengthLabel: strengthLabel, deviation: deviation, bhAdjust: bhAdjust, explore: explore, lagScan: lagScan, associations: associations, compareGroups: compareGroups, hypotheses: hypotheses, lateWorkoutDates: lateWorkoutDates, trendSummary: trendSummary, lastIndex: lastIndex, periodReport: periodReport, weeklyReport: weeklyReport, monthlyReport: monthlyReport, weeks: weeks, months: months, goalValues: goalValues, evaluateGoal: evaluateGoal, csvCell: csvCell, toCsv: toCsv, daysCsv: daysCsv, activitiesCsv: activitiesCsv, DAY_COLS: DAY_COLS, PRED: PRED, TARG: TARG };
});
