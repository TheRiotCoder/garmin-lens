/* Garmin Lens – physiology / training models (pure, UMD). Every formula is documented in docs/METHODS.md and shown in the app.
   NOT MEDICAL ADVICE: these are descriptive statistics of your own data, not diagnoses. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./stats.js"), require("./dates.js"), require("./parsers.js"));
  else root.GLModels = factory(root.GLStats, root.GLDates, root.GLParsers);
})(typeof self !== "undefined" ? self : this, function (S, D, P) {
  "use strict";
  var ok = S.ok;
  var DEFAULTS = { maxHr: 188, restHr: null, sex: "m", sleepNeedH: 7.5, lthr: null, tzMin: null, freeDays: [6, 0], baselineDays: 28, zoneMode: "maxhr" };
  var ZONE_NAMES = ["Z1 50–60%", "Z2 60–70%", "Z3 70–80%", "Z4 80–90%", "Z5 90–100%"];

  /* ---------- canonical daily series ---------- */
  function sleepClock(day, defTz) {
    // returns {onset, wake, mid} in minutes since 18:00 local, or null
    if (!day || !ok(day.sleepStart) || !ok(day.sleepEnd) || day.sleepSec === undefined) return null;
    var tz = ok(day.sleepTzOffsetMin) ? day.sleepTzOffsetMin : ok(day.tzOffsetMin) ? day.tzOffsetMin : defTz;
    if (!ok(tz)) tz = 0;
    var on = (((day.sleepStart + tz * 60000) / 60000) % 1440 + 1440) % 1440, span = (day.sleepEnd - day.sleepStart) / 60000;
    var onset = ((on - 1080) % 1440 + 1440) % 1440;   // minutes since 18:00
    return { onset: onset, wake: onset + span, mid: onset + span / 2, span: span, tz: tz };
  }
  var SERIES = {
    rhr: function (d) { return ok(d.rhr) ? d.rhr : ok(d.hsRhr) ? d.hsRhr : null; },
    hrv: function (d) { return ok(d.hrv) ? d.hrv : null; },
    sleepH: function (d) { return ok(d.sleepSec) ? d.sleepSec / 3600 : null; },
    sleepScore: function (d) { return ok(d.sleepScore) ? d.sleepScore : null; },
    deepPct: function (d) { var t = (d.deepSec || 0) + (d.lightSec || 0) + (d.remSec || 0); return ok(d.deepSec) && t > 0 ? 100 * d.deepSec / t : null; },
    remPct: function (d) { var t = (d.deepSec || 0) + (d.lightSec || 0) + (d.remSec || 0); return ok(d.remSec) && t > 0 ? 100 * d.remSec / t : null; },
    awakeMin: function (d) { return ok(d.awakeSec) ? d.awakeSec / 60 : null; },
    stress: function (d) { return ok(d.stressAvg) ? d.stressAvg : null; },
    sleepStress: function (d) { return ok(d.sleepStress) ? d.sleepStress : null; },
    bbHigh: function (d) { return ok(d.bbHigh) ? d.bbHigh : null; },
    bbLow: function (d) { return ok(d.bbLow) ? d.bbLow : null; },
    resp: function (d) { return ok(d.sleepResp) ? d.sleepResp : ok(d.hsResp) ? d.hsResp : ok(d.respAvg) ? d.respAvg : null; },
    spo2: function (d) { return ok(d.spo2Avg) ? d.spo2Avg : ok(d.hsSpo2) ? d.hsSpo2 : null; },
    skin: function (d) { return ok(d.skinTemp) ? d.skinTemp : null; },
    steps: function (d) { return ok(d.steps) ? d.steps : null; },
    weight: function (d) { return ok(d.weightKg) ? d.weightKg : null; },
    readiness: function (d) { return ok(d.readiness) ? d.readiness : null; },
    vo2max: function (d) { return ok(d.vo2max) ? d.vo2max : null; },
    activeMin: function (d) { return ok(d.modMin) || ok(d.vigMin) ? (d.modMin || 0) + (d.vigMin || 0) : null; }
  };
  var LABELS = { rhr: "Resting HR (bpm)", hrv: "Overnight HRV (ms)", lnHrv: "Overnight HRV (log scale)", sleepH: "Sleep duration (h)", sleepScore: "Sleep score", deepPct: "Deep sleep (%)", remPct: "REM sleep (%)", awakeMin: "Awake in bed (min)", stress: "Stress (avg)", sleepStress: "Sleep stress", bbHigh: "Body Battery high", bbLow: "Body Battery low", resp: "Respiration (brpm)", spo2: "SpO2 (%)", skin: "Skin temp (°C dev.)", steps: "Steps", weight: "Weight (kg)", readiness: "Garmin readiness", vo2max: "VO2max", activeMin: "Intensity min", load: "Training load (hrTSS)", onset: "Bedtime (min after 18:00)", wake: "Wake (min after 18:00)", mid: "Mid-sleep (min after 18:00)", recovery: "Recovery score", ctl: "Fitness (CTL)", atl: "Fatigue (ATL)", tsb: "Form (TSB)" };

  /* ---------- heart-rate based load ---------- */
  function resolveSettings(st, days) {
    var s = Object.assign({}, DEFAULTS, st || {});
    if (!ok(s.restHr)) { var r = (days || []).slice(-90).map(function (d) { return SERIES.rhr(d); }).filter(ok); s.restHr = r.length >= 7 ? Math.round(S.median(r)) : 55; s.restHrAuto = true; }
    if (!ok(s.lthr)) { var lt = (days || []).map(function (d) { return d.lthr; }).filter(ok); s.lthr = lt.length ? lt[lt.length - 1] : Math.round(0.88 * s.maxHr); s.lthrAuto = true; }
    return s;
  }
  function bFactor(sex) { return sex === "f" ? 1.67 : 1.92; }
  function hrr(hr, s) { return S.clamp((hr - s.restHr) / (s.maxHr - s.restHr), 0, 1.1); }
  // Banister TRIMP for one heart-rate sample held for `minutes`
  function trimpSample(hr, minutes, s) { var x = hrr(hr, s); return x <= 0 ? 0 : minutes * x * 0.64 * Math.exp(bFactor(s.sex) * x); }
  function trimpFromSeries(hrArr, stepSec, s) { var t = 0, m = stepSec / 60; for (var i = 0; i < hrArr.length; i++) if (hrArr[i] > 20) t += trimpSample(hrArr[i], m, s); return t; }
  function zoneEdges(s) { return s.zoneMode === "hrr" ? [0.5, 0.6, 0.7, 0.8, 0.9].map(function (p) { return s.restHr + p * (s.maxHr - s.restHr); }) : [0.5, 0.6, 0.7, 0.8, 0.9].map(function (p) { return p * s.maxHr; }); }
  function zoneOf(hr, edges) { var z = 0; for (var i = 0; i < edges.length; i++) if (hr >= edges[i]) z = i + 1; return z; }
  // seconds in zones Z0 (<50%) .. Z5
  function zonesFromSeries(hrArr, stepSec, s) { var e = zoneEdges(s), out = [0, 0, 0, 0, 0, 0]; for (var i = 0; i < hrArr.length; i++) if (hrArr[i] > 20) out[zoneOf(hrArr[i], e)] += stepSec; return out; }
  function trimpHour(s) { var x = hrr(s.lthr, s); return 60 * x * 0.64 * Math.exp(bFactor(s.sex) * x); }
  // enrich an activity with load numbers. source tells how trustworthy: series > zones > avg
  function enrichActivity(a, series, s) {
    var o = Object.assign({}, a); delete o.series;
    o.group = P.sportGroup(a.type);
    var tr = null, src = "none", z = null;
    if (a.hrHist && a.hrStep) { // compact histogram stored with the activity (see importer.addHrHist)
      var e0 = zoneEdges(s), zz0 = [0, 0, 0, 0, 0, 0], t0 = 0, m0 = a.hrStep / 60;
      for (var hbpm = 21; hbpm < a.hrHist.length; hbpm++) { var cnt = a.hrHist[hbpm]; if (!cnt) continue; t0 += trimpSample(hbpm, cnt * m0, s); zz0[zoneOf(hbpm, e0)] += cnt * a.hrStep; }
      tr = t0; src = "series"; z = zz0;
    } else if (series && series.hr && series.hr.some(function (x) { return x > 20; })) { tr = trimpFromSeries(series.hr, series.step || 5, s); src = "series"; z = zonesFromSeries(series.hr, series.step || 5, s); }
    else if (a.zoneSec && a.zoneSec.length === 5) { var e = zoneEdges(s), mids = [0.55, 0.65, 0.75, 0.85, 0.95]; tr = 0; a.zoneSec.forEach(function (sec, i) { tr += trimpSample(mids[i] * s.maxHr, sec / 60, s); }); src = "zones"; z = [0].concat(a.zoneSec); }
    else if (ok(a.avgHr) && ok(a.durationSec)) { tr = trimpSample(a.avgHr, (a.movingSec || a.durationSec) / 60, s); src = "avg"; var zz = [0, 0, 0, 0, 0, 0]; zz[zoneOf(a.avgHr, zoneEdges(s))] = a.durationSec; z = zz; }
    if (tr !== null) { o.trimp = Math.round(tr * 10) / 10; o.hrtss = Math.round(100 * tr / trimpHour(s) * 10) / 10; }
    o.loadSource = src; if (z) o.zoneSecAll = z;
    return o;
  }

  /* ---------- dataset ---------- */
  function prepare(days, acts, notes, settings, loadSeriesFor) {
    var s = resolveSettings(settings, days);
    var byDate = {}; days.forEach(function (d) { byDate[d.date] = d; });
    var first = days.length ? days[0].date : null, last = days.length ? days[days.length - 1].date : null;
    (acts || []).forEach(function (a) { if (!a.date) return; if (!first || a.date < first) first = a.date; if (!last || a.date > last) last = a.date; });
    var dates = first ? D.range(first, last) : [], idx = {}; dates.forEach(function (d, i) { idx[d] = i; });
    var n = dates.length, series = {};
    Object.keys(SERIES).forEach(function (k) { series[k] = dates.map(function (d) { return byDate[d] ? SERIES[k](byDate[d]) : null; }); });
    series.lnHrv = series.hrv.map(function (v) { return ok(v) && v > 0 ? Math.log(v) : null; });
    ["onset", "wake", "mid"].forEach(function (k) { series[k] = dates.map(function (d) { var c = sleepClock(byDate[d], s.tzMin); return c ? c[k] : null; }); });
    var enriched = (acts || []).map(function (a) { return enrichActivity(a, loadSeriesFor ? loadSeriesFor(a) : a.series, s); });
    series.load = dates.map(function () { return 0; }); series.actMin = dates.map(function () { return 0; });
    var actsByDate = {};
    enriched.forEach(function (a) {
      (actsByDate[a.date] = actsByDate[a.date] || []).push(a);
      var i = idx[a.date]; if (i === undefined) return;
      if (ok(a.hrtss)) series.load[i] += a.hrtss;
      if (ok(a.durationSec)) series.actMin[i] += a.durationSec / 60;
    });
    series.load = series.load.map(function (x) { return Math.round(x * 10) / 10; });
    var ds = { settings: s, dates: dates, idx: idx, n: n, s: series, days: byDate, acts: enriched, actsByDate: actsByDate, notes: notes || [], notesByDate: {}, demo: days.some(function (d) { return d.demo; }) };
    (notes || []).forEach(function (nt) { (ds.notesByDate[nt.date] = ds.notesByDate[nt.date] || []).push(nt); });
    var pmc = performanceChart(series.load, s); ds.s.ctl = pmc.ctl; ds.s.atl = pmc.atl; ds.s.tsb = pmc.tsb; ds.s.tsbPrior = pmc.tsbPrior;
    ds.s.recovery = dates.map(function (_, i) { var r = recovery(ds, i); return r ? r.score : null; });
    return ds;
  }

  /* ---------- fitness / fatigue / form (Banister impulse-response, as popularised by TrainingPeaks) ---------- */
  function performanceChart(load, s, tauC, tauA) {
    tauC = tauC || 42; tauA = tauA || 7;
    var n = load.length, ctl = new Array(n), atl = new Array(n), tsb = new Array(n), tsbPrior = new Array(n);
    var seed = n ? S.mean(load.slice(0, Math.min(28, n))) : 0, c = seed || 0, a = seed || 0, kc = 1 - Math.exp(-1 / tauC), ka = 1 - Math.exp(-1 / tauA);
    for (var i = 0; i < n; i++) {
      tsbPrior[i] = c - a;                       // "form" you start the day with (yesterday's CTL − ATL)
      var l = ok(load[i]) ? load[i] : 0;
      c += (l - c) * kc; a += (l - a) * ka;
      ctl[i] = Math.round(c * 10) / 10; atl[i] = Math.round(a * 10) / 10; tsb[i] = Math.round((c - a) * 10) / 10;
    }
    return { ctl: ctl, atl: atl, tsb: tsb, tsbPrior: tsbPrior, seeded: seed };
  }
  function acwr(load, i) { // rolling averages (7 d acute / 28 d chronic); needs 21+ days of history
    if (i < 27) return null;
    var ac = S.mean(load.slice(i - 6, i + 1)), ch = S.mean(load.slice(i - 27, i + 1));
    if (!ok(ch) || ch < 5) return null;
    return { acute: ac, chronic: ch, ratio: ac / ch };
  }
  function acwrZone(r) { return r === null ? null : r < 0.8 ? "detraining / low" : r <= 1.3 ? "sweet spot" : r <= 1.5 ? "caution" : "high"; }
  function monotony(load, i) { if (i < 6) return null; var w = load.slice(i - 6, i + 1), m = S.mean(w), sd = S.sd(w); if (!sd) return { monotony: null, strain: null, weekly: S.sum(w) }; return { monotony: m / sd, strain: S.sum(w) * (m / sd), weekly: S.sum(w) }; }

  /* ---------- baselines / z-scores ---------- */
  var SD_FLOOR = { rhr: 1.0, lnHrv: 0.05, resp: 0.3, skin: 0.15, sleepH: 0.35, stress: 3, sleepScore: 4, bbHigh: 4, deepPct: 2, steps: 1200, spo2: 0.6, readiness: 6 };
  function zScore(ds, key, i, win, robust) {
    var arr = ds.s[key]; if (!arr || !ok(arr[i])) return null;
    win = win || ds.settings.baselineDays;
    var v = [], from = Math.max(0, i - win); for (var k = from; k < i; k++) if (ok(arr[k])) v.push(arr[k]);
    if (v.length < 10) return null;
    var m, sd;
    if (robust === false) { m = S.mean(v); sd = S.sd(v); } else { m = S.median(v); var mad = S.mad(v); sd = mad ? 1.4826 * mad : S.sd(v); }
    sd = Math.max(sd || 0, SD_FLOOR[key] || 1e-9);
    return { z: (arr[i] - m) / sd, value: arr[i], mean: m, sd: sd, n: v.length };
  }
  function normalRange(ds, key, i, win) { // "personal normal range": 10th–90th percentile of the previous window (default 28 d)
    var arr = ds.s[key]; win = win || ds.settings.baselineDays; var v = []; for (var k = Math.max(0, i - win); k < i; k++) if (ok(arr[k])) v.push(arr[k]);
    if (v.length < 10) return null; return { lo: S.percentile(v, 10), hi: S.percentile(v, 90), median: S.median(v), n: v.length };
  }
  function rollingBaseline(ds, key, win) { return ds.dates.map(function (_, i) { var r = normalRange(ds, key, i, win); return r ? r.median : null; }); }
  function rollingBand(ds, key, win) { return ds.dates.map(function (_, i) { return normalRange(ds, key, i, win); }); }

  /* ---------- recovery score (transparent) ---------- */
  var RECOVERY_WEIGHTS = { hrv: 0.40, rhr: 0.20, sleep: 0.25, stress: 0.075, load: 0.075 }, RECOVERY_K = 1.3;
  function recovery(ds, i) {
    var comps = [], s = ds.settings, z;
    z = zScore(ds, "lnHrv", i); if (z) comps.push({ key: "hrv", label: "Overnight HRV vs your 28-day normal", z: S.clamp(z.z, -3, 3), w: RECOVERY_WEIGHTS.hrv, detail: z });
    z = zScore(ds, "rhr", i); if (z) comps.push({ key: "rhr", label: "Resting HR vs your 28-day normal (lower is better)", z: S.clamp(-z.z, -3, 3), w: RECOVERY_WEIGHTS.rhr, detail: z });
    if (ok(ds.s.sleepH[i])) comps.push({ key: "sleep", label: "Sleep vs your need (" + s.sleepNeedH + " h)", z: S.clamp((ds.s.sleepH[i] - s.sleepNeedH) / 1.0, -3, 3), w: RECOVERY_WEIGHTS.sleep, detail: { value: ds.s.sleepH[i], need: s.sleepNeedH } });
    if (i > 0) { z = zScore(ds, "stress", i - 1); if (z) comps.push({ key: "stress", label: "Yesterday's stress vs normal (lower is better)", z: S.clamp(-z.z, -3, 3), w: RECOVERY_WEIGHTS.stress, detail: z }); }
    if (ok(ds.s.tsbPrior[i]) && i >= 28) comps.push({ key: "load", label: "Training form (TSB) going into today", z: S.clamp(ds.s.tsbPrior[i] / 20, -2.5, 2.5), w: RECOVERY_WEIGHTS.load, detail: { tsb: ds.s.tsbPrior[i] } });
    var hasCore = comps.some(function (c) { return c.key === "hrv" || c.key === "rhr"; });
    if (comps.length < 2 || !hasCore) return null;
    var wsum = S.sum(comps.map(function (c) { return c.w; })), zc = 0;
    comps.forEach(function (c) { c.weight = c.w / wsum; c.contribution = c.weight * c.z; zc += c.contribution; });
    var score = Math.round(100 * S.normCdf(zc * RECOVERY_K));
    return { score: score, zComposite: zc, band: score >= 67 ? "green" : score >= 34 ? "yellow" : "red", components: comps };
  }

  /* ---------- sleep ---------- */
  function sleepRegularity(ds, i, win) {
    win = win || 14; var from = Math.max(0, i - win + 1), on = [], wk = [], md = [];
    for (var k = from; k <= i; k++) { if (ok(ds.s.onset[k])) { on.push(ds.s.onset[k]); wk.push(ds.s.wake[k]); md.push(ds.s.mid[k]); } }
    if (on.length < 7) return null;
    return { n: on.length, bedtimeSd: S.sd(on), wakeSd: S.sd(wk), midSd: S.sd(md), meanOnset: S.mean(on), meanWake: S.mean(wk) };
  }
  // Social jet lag (Roenneberg et al., MCTQ): MSF − MSW, with free days = weekend wake-ups (setting freeDays). Needs enough nights of each kind.
  function socialJetLag(ds, i, win) {
    win = win || 56; var from = Math.max(0, i - win + 1), work = [], free = [], fs = ds.settings.freeDays;
    for (var k = from; k <= i; k++) { if (!ok(ds.s.mid[k])) continue; var dw = D.dow(ds.dates[k]), rec = { mid: ds.s.mid[k], span: (ds.s.wake[k] - ds.s.onset[k]), sleep: ds.s.sleepH[k] * 60 }; (fs.indexOf(dw) >= 0 ? free : work).push(rec); }
    if (work.length < 8 || free.length < 3) return null;
    var msw = S.mean(work.map(function (r) { return r.mid; })), msf = S.mean(free.map(function (r) { return r.mid; }));
    var sdw = S.mean(work.map(function (r) { return r.sleep; })), sdf = S.mean(free.map(function (r) { return r.sleep; })), sdWeek = (5 * sdw + 2 * sdf) / 7;
    var msfsc = sdf > sdw ? msf - 0.5 * (sdf - sdWeek) : msf;
    return { msw: msw, msf: msf, msfsc: msfsc, jetlagMin: msf - msw, jetlagCorrectedMin: msfsc - msw, workH: sdw / 60, freeH: sdf / 60, nWork: work.length, nFree: free.length };
  }
  function sleepDebt(ds, i, win) {
    win = win || 7; var need = ds.settings.sleepNeedH, tot = 0, n = 0;
    for (var k = Math.max(0, i - win + 1); k <= i; k++) if (ok(ds.s.sleepH[k])) { tot += need - ds.s.sleepH[k]; n++; }
    return n >= Math.ceil(win * 0.6) ? { hours: Math.max(0, tot), net: tot, nights: n, need: need } : null;
  }

  /* ---------- anomaly / illness-like signature ---------- */
  var SIGNALS = [
    { key: "rhr", dir: 1, z: 1.5, min: 3, label: "resting HR up", unit: "bpm" },
    { key: "lnHrv", dir: -1, z: 1.5, min: Math.log(1 / 0.85) * -1, label: "HRV down", unit: "" },
    { key: "resp", dir: 1, z: 1.5, min: 0.8, label: "breathing rate up", unit: "brpm" },
    { key: "skin", dir: 1, z: 1.5, min: 0.5, label: "skin temperature up", unit: "°C" }
  ];
  function dayAnomaly(ds, i) {
    var sig = [], z = null;
    SIGNALS.forEach(function (sg) {
      z = zScore(ds, sg.key, i); if (!z) return;
      var delta = z.value - z.mean, passes = sg.dir * z.z >= sg.z && (sg.key === "lnHrv" ? delta <= Math.log(0.85) : sg.dir * delta >= sg.min);
      sig.push({ key: sg.key, label: sg.label, z: z.z, delta: sg.key === "lnHrv" ? (Math.exp(delta) - 1) * 100 : delta, pass: passes });
    });
    var pass = {}; sig.forEach(function (x) { if (x.pass) pass[x.key] = true; });
    var cnt = Object.keys(pass).length, level = null;
    if (pass.rhr && pass.lnHrv && (pass.resp || pass.skin)) level = "strong";
    else if (pass.rhr && pass.lnHrv) level = "possible";
    else if (cnt >= 3) level = "possible";
    return { level: level, signals: sig, count: cnt };
  }
  function anomalyEpisodes(ds) {
    var flagged = [];
    for (var i = 0; i < ds.n; i++) { var a = dayAnomaly(ds, i); if (a.level) flagged.push({ i: i, date: ds.dates[i], level: a.level, signals: a.signals.filter(function (x) { return x.pass; }) }); }
    var eps = [], cur = null;
    flagged.forEach(function (f) { if (cur && f.i - cur.endI <= 1) { cur.endI = f.i; cur.days.push(f); } else { cur = { startI: f.i, endI: f.i, days: [f] }; eps.push(cur); } });
    return eps.map(function (e) {
      var strong = e.days.filter(function (d) { return d.level === "strong"; }).length, keys = {}; e.days.forEach(function (d) { d.signals.forEach(function (s) { keys[s.label] = true; }); });
      var notes = []; for (var k = e.startI - 1; k <= e.endI; k++) (ds.notesByDate[ds.dates[k]] || []).forEach(function (n) { notes.push(n); });
      var explained = notes.filter(function (n) { return n.type === "alcohol" || n.type === "illness" || n.type === "travel" || n.type === "hard"; });
      return { start: e.days[0].date, end: e.days[e.days.length - 1].date, length: e.days.length, strongDays: strong, level: strong ? "strong" : "possible", signals: Object.keys(keys), notes: explained.map(function (n) { return n.type; }), matchesNote: explained.length > 0 };
    });
  }

  /* ---------- activity analytics ---------- */
  function efficiency(series, a, b) { // mean speed / mean HR over [a,b) samples
    var sp = 0, hr = 0, n = 0; for (var i = a; i < b; i++) if (series.hr[i] > 20 && series.spd[i] > 0.3) { sp += series.spd[i]; hr += series.hr[i]; n++; }
    return n >= 20 ? { ef: (sp / n) / (hr / n), speed: sp / n, hr: hr / n, n: n } : null;
  }
  // aerobic decoupling (Pa:HR): drop in speed-per-heartbeat between the first and second half after a warm-up. Only meaningful for steady efforts.
  function decoupling(series, warmupMin) {
    if (!series || !series.hr || !series.spd) return null;
    var step = series.step || 5, w = Math.round((warmupMin === undefined ? 10 : warmupMin) * 60 / step), n = series.hr.length;
    if (n * step < 40 * 60) return { ok: false, reason: "needs at least 40 minutes (10 min warm-up + two 15-min halves)" };
    var mid = w + Math.floor((n - w) / 2), e1 = efficiency(series, w, mid), e2 = efficiency(series, mid, n);
    if (!e1 || !e2) return { ok: false, reason: "not enough moving samples with heart rate" };
    // steadiness: coefficient of variation of speed within each half; intervals make the number meaningless
    var cv = function (a, b) { var v = []; for (var i = a; i < b; i++) if (series.spd[i] > 0.3) v.push(series.spd[i]); return S.sd(v) / S.mean(v); };
    var c1 = cv(w, mid), c2 = cv(mid, n), steady = c1 < 0.18 && c2 < 0.18;
    return { ok: true, pct: (e1.ef - e2.ef) / e1.ef * 100, ef1: e1.ef, ef2: e2.ef, hr1: e1.hr, hr2: e2.hr, speed1: e1.speed, speed2: e2.speed, steady: steady, cv: Math.max(c1, c2), driftBpm: e2.hr - e1.hr };
  }
  function hrDriftSlope(series, warmupMin) { // linear trend of HR over time (bpm per 10 min) after warm-up, for steady efforts
    var step = series.step || 5, w = Math.round((warmupMin === undefined ? 10 : warmupMin) * 60 / step), xs = [], ys = [];
    for (var i = w; i < series.hr.length; i++) if (series.hr[i] > 20) { xs.push(i * step / 600); ys.push(series.hr[i]); }
    var lr = S.linreg(xs, ys); return lr ? { slopePer10Min: lr.slope, r2: lr.r2, n: lr.n } : null;
  }
  function paceStr(mps) { if (!ok(mps) || mps <= 0) return "–"; var s = 1000 / mps, m = Math.floor(s / 60), r = Math.round(s - m * 60); if (r === 60) { m++; r = 0; } return m + ":" + (r < 10 ? "0" : "") + r + " /km"; }
  function personalRecords(acts) { // best efforts by sport group, with date; also flags which activity set a record at the time (progressive PRs)
    var recs = {}, hist = [];
    acts.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (a) {
      if (!a.best) return;
      Object.keys(a.best).forEach(function (k) {
        var key = a.group + ":" + k, cur = recs[key];
        if (!cur || a.best[k] < cur.sec) { recs[key] = { group: a.group, dist: k, sec: a.best[k], date: a.date, id: a.id, name: a.name }; if (cur) hist.push({ key: key, id: a.id, date: a.date, sec: a.best[k], prev: cur.sec }); }
      });
    });
    return { records: recs, improvements: hist };
  }
  function weeklyZoneDistribution(ds, weekStart) {
    var tot = [0, 0, 0, 0, 0, 0], end = D.addDays(weekStart, 6);
    ds.acts.forEach(function (a) { if (a.date >= weekStart && a.date <= end && a.zoneSecAll && a.loadSource !== "avg") a.zoneSecAll.forEach(function (x, i) { tot[i] += x; }); });
    var all = S.sum(tot.slice(1)); return { zones: tot, total: all, pct: tot.map(function (x) { return all ? 100 * x / all : 0; }) };
  }

  return { DEFAULTS: DEFAULTS, SERIES: SERIES, LABELS: LABELS, ZONE_NAMES: ZONE_NAMES, resolveSettings: resolveSettings, sleepClock: sleepClock, trimpSample: trimpSample, trimpFromSeries: trimpFromSeries, trimpHour: trimpHour, zoneEdges: zoneEdges, zonesFromSeries: zonesFromSeries, enrichActivity: enrichActivity,
    prepare: prepare, performanceChart: performanceChart, acwr: acwr, acwrZone: acwrZone, monotony: monotony, zScore: zScore, normalRange: normalRange, rollingBaseline: rollingBaseline, rollingBand: rollingBand, recovery: recovery, RECOVERY_WEIGHTS: RECOVERY_WEIGHTS, RECOVERY_K: RECOVERY_K,
    sleepRegularity: sleepRegularity, socialJetLag: socialJetLag, sleepDebt: sleepDebt, dayAnomaly: dayAnomaly, anomalyEpisodes: anomalyEpisodes, decoupling: decoupling, hrDriftSlope: hrDriftSlope, paceStr: paceStr, personalRecords: personalRecords, weeklyZoneDistribution: weeklyZoneDistribution };
});
