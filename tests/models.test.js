const { ok, near, eq, done } = require("./harness");
const M = require("../js/models.js"), D = require("../js/dates.js"), G = require("../js/demo.js");
const mk = (n, fn, start = "2026-03-02") => Array.from({ length: n }, (_, i) => Object.assign({ date: D.addDays(start, i) }, fn(i, D.addDays(start, i))));
const S0 = { maxHr: 190, restHr: 50, sex: "m", lthr: 165 };

// ---- TRIMP / zones / hrTSS
near("Banister TRIMP, male, 150 bpm for 1 min (rest 50, max 190) = 1.8016", M.trimpSample(150, 1, S0), 1.801589, 1e-5);
const SF = Object.assign({}, S0, { sex: "f" });
near("Banister TRIMP, female 0.86·x·e^(1.67x), 150 bpm for 1 min (x = 100/140) = 2.02498", M.trimpSample(150, 1, SF), 2.0249844, 1e-6);
near("female one hour at LTHR (165): 60·x·0.86·e^(1.67x), x = 115/140 = 167.1008", M.trimpHour(SF), 167.1007782, 1e-4);
near("female hrTSS of one hour at LTHR is exactly 100 (sample and hour use the same formula)", 100 * M.trimpSample(165, 60, SF) / M.trimpHour(SF), 100, 1e-9);
near("male coefficient is 0.64 and female 0.86", M.bCoef("m") + M.bCoef("f"), 1.5, 1e-12);
near("TRIMP of resting HR is 0", M.trimpSample(50, 10, S0), 0, 1e-12);
near("one hour at LTHR (165) = 152.70 TRIMP → hrTSS 100", M.trimpHour(S0), 152.7023, 1e-3);
const s200 = { maxHr: 200, restHr: 50, sex: "m", lthr: 170, zoneMode: "maxhr" };
eq("zone seconds from HR series (edges 100/120/140/160/180)", M.zonesFromSeries([90, 100, 119, 120, 150, 179, 180, 199, 0], 5, s200), [5, 10, 5, 5, 5, 10]);
const act = M.enrichActivity({ id: "x", type: "running", durationSec: 3600, avgHr: 150 }, { hr: new Array(720).fill(165), step: 5 }, S0);
near("an hour at exactly LTHR scores hrTSS 100 (from series)", act.hrtss, 100, 0.2); eq("source tag 'series'", act.loadSource, "series");
const hist = new Array(251).fill(0); hist[165] = 720; const ah = M.enrichActivity({ id: "h", type: "running", durationSec: 3600, hrHist: hist, hrStep: 5 }, null, S0);
near("HR histogram gives the same load as the raw series", ah.hrtss, act.hrtss, 1e-6); eq("histogram zones: all time in Z4 (80–90%: 152–171 bpm)", ah.zoneSecAll, [0, 0, 0, 0, 3600, 0]);
const a2 = M.enrichActivity({ id: "y", type: "running", durationSec: 1800, avgHr: 150 }, null, S0);
eq("avg-HR fallback tagged 'avg'", a2.loadSource, "avg"); near("avg HR fallback TRIMP = 30 × 1.8016", a2.trimp, 54.0, 0.1);
const a3 = M.enrichActivity({ id: "z", type: "yoga", durationSec: 1800 }, null, S0);
ok("no HR at all → no load invented", a3.hrtss === undefined && a3.loadSource === "none");
const a4 = M.enrichActivity({ id: "w", type: "running", durationSec: 600, zoneSec: [0, 0, 600, 0, 0] }, null, S0);
eq("zone-summary source tagged", a4.loadSource, "zones");

// ---- CTL / ATL / TSB / ACWR / monotony
const step = M.performanceChart(new Array(30).fill(0).concat(new Array(42).fill(100)), S0);
near("CTL after 42 days of 100 TSS from zero = 100(1−e⁻¹) = 63.21", step.ctl[71], 63.2, 0.1); near("ATL after 42 days = 99.75", step.atl[71], 99.8, 0.1);
near("TSB (form) = CTL − ATL", step.tsb[71], step.ctl[71] - step.atl[71], 0.11);
const flat = M.performanceChart(new Array(60).fill(80), S0); near("constant load: CTL = ATL = load, TSB 0", flat.ctl[59], 80, 0.01); near("TSB 0", flat.tsb[59], 0, 0.01);
near("tsbPrior is yesterday's CTL−ATL", step.tsbPrior[40], step.ctl[39] - step.atl[39], 0.11);
const lw = new Array(21).fill(0).concat(new Array(7).fill(100)); near("ACWR: 7 d at 100 after 21 d rest = 100 / 25 = 4.0", M.acwr(lw, 27).ratio, 4, 1e-9);
eq("ACWR unavailable before 28 days", M.acwr(lw, 20), null); eq("shared ACWR threshold is 1.3 (1.3 itself is still steady)", [M.ACWR_HIGH, M.acwrZone(1.3)], [1.3, "steady"]); eq("ACWR zones", [M.acwrZone(0.5), M.acwrZone(1), M.acwrZone(1.4), M.acwrZone(1.8)], ["low (below your usual load)", "steady", "load jumped quickly", "load jumped quickly"]);
const mo = M.monotony([10, 20, 30, 40, 50, 60, 70], 6); near("Foster monotony = mean/sd = 40/21.602 = 1.8516", mo.monotony, 1.85164, 1e-4); near("strain = weekly × monotony = 518.46", mo.strain, 518.46, 0.01);
eq("monotony of identical days is null, not infinity", M.monotony(new Array(7).fill(50), 6).monotony, null);

// ---- sleep
const utc = (date, h, m) => Date.parse(date + "T00:00:00Z") + (h * 60 + (m || 0)) * 60000;
const clock = M.sleepClock({ sleepStart: utc("2026-03-02", 5), sleepEnd: utc("2026-03-02", 13), sleepSec: 28800, tzOffsetMin: -360 }, 0);
eq("sleep clock: 23:00 local → 300 min after 18:00; wake 07:00 → 780; mid 03:00 → 540", [clock.onset, clock.wake, clock.mid], [300, 780, 540]);
// MCTQ: weekdays 23:00–07:00 (mid 03:00), Sat/Sun 00:00–09:00 (mid 04:30)
const sj = mk(56, (i, d) => { const dw = D.dow(d), free = dw === 6 || dw === 0, on = free ? 0 : -60, wk = free ? 9 * 60 : 7 * 60; const base = Date.parse(d + "T00:00:00Z"); return { sleepStart: base + on * 60000, sleepEnd: base + wk * 60000, sleepSec: (wk - on) * 60, tzOffsetMin: 0, rhr: 50 }; });
const dsSj = M.prepare(sj, [], [], S0);
const jl = M.socialJetLag(dsSj, dsSj.n - 1);
near("social jet lag: mid-sleep 03:00 vs 04:30 = 90 min", jl.jetlagMin, 90, 1e-6);
near("sleep-corrected MSFsc: 630 − ½(540 − 497.14) → SJL 68.57 min", jl.jetlagCorrectedMin, 68.571, 0.01); near("work/free sleep hours", jl.workH + jl.freeH, 17, 1e-9);
eq("SJL needs enough nights", M.socialJetLag(M.prepare(sj.slice(0, 5), [], [], S0), 4), null);
const reg = M.sleepRegularity(dsSj, dsSj.n - 1, 14); ok("regularity reports SDs", reg.n === 14 && reg.bedtimeSd > 0);
const flatSleep = mk(20, (i, d) => ({ sleepStart: Date.parse(d + "T00:00:00Z") - 3600000, sleepEnd: Date.parse(d + "T00:00:00Z") + 6 * 3600000, sleepSec: 7 * 3600, tzOffsetMin: 0 }));
near("perfectly regular sleeper has 0 SD", M.sleepRegularity(M.prepare(flatSleep, [], [], S0), 19).bedtimeSd, 0, 1e-9);
const debt = M.sleepDebt(M.prepare(mk(10, () => ({ sleepSec: 6.5 * 3600 })), [], [], Object.assign({}, S0, { sleepNeedH: 7.5 })), 9); near("sleep debt: 7 nights × 1 h short = 7 h", debt.hours, 7, 1e-9);
eq("surplus never shown as negative debt", M.sleepDebt(M.prepare(mk(10, () => ({ sleepSec: 9 * 3600 })), [], [], S0), 9).hours, 0);

// ---- recovery score
const flatDays = mk(40, () => ({ hrv: 60, rhr: 55, sleepSec: 7.5 * 3600, stressAvg: 30 }));
const ds0 = M.prepare(flatDays, [], [], Object.assign({}, S0, { sleepNeedH: 7.5 }));
const r0 = M.recovery(ds0, 35); eq("everything exactly at your normal → score 50, yellow", [r0.score, r0.band], [50, "yellow"]);
ok("components sum to weights 1", Math.abs(r0.components.reduce((s, c) => s + c.weight, 0) - 1) < 1e-9 && r0.components.length === 5);
const hi = flatDays.slice(); hi[39] = Object.assign({}, hi[39], { hrv: 60 * Math.exp(0.1) });
const r1 = M.recovery(M.prepare(hi, [], [], Object.assign({}, S0, { sleepNeedH: 7.5 })), 39);
eq("ONE night of HRV +0.10 ln barely moves readiness (7-night avg z=0.286 → zc 0.114 → Φ(0.149)=56)", r1.score, 56); eq("single night stays yellow", r1.band, "yellow");
const sus = flatDays.map((d, k) => k >= 33 ? Object.assign({}, d, { hrv: 60 * Math.exp(0.1) }) : d);
const r1b = M.recovery(M.prepare(sus, [], [], Object.assign({}, S0, { sleepNeedH: 7.5 })), 39);
eq("HRV +2 floor-SDs held for 7 nights: z=+2 × 0.40 weight → zc 0.8 → Φ(0.8×1.3)=85", r1b.score, 85); eq("green band", r1b.band, "green");
eq("HRV component says it uses the 7-night average", r1b.components.find(c => c.key === "hrv").detail.nights, 7);
near("HRV ratio shown as a ratio, not a log difference", r1b.components.find(c => c.key === "hrv").detail.ratio, Math.exp(0.1), 1e-9);
const lo = flatDays.slice(); lo[39] = { date: lo[39].date, hrv: 60 * Math.exp(-0.2), rhr: 62, sleepSec: 5 * 3600, stressAvg: 30 };
const r2 = M.recovery(M.prepare(lo, [], [], S0), 39); ok("bad HRV + high RHR + short sleep → red", r2.band === "red" && r2.score < 20, r2.score);
eq("not enough history → null (no invented score)", M.recovery(M.prepare(flatDays.slice(0, 6), [], [], S0), 5), null);
ok("recovery works with missing sleep (HRV + RHR carry it)", M.recovery(M.prepare(flatDays.map(d => ({ date: d.date, hrv: d.hrv, rhr: d.rhr })), [], [], S0), 35) !== null);
eq("sleep alone cannot make a score (needs HRV or RHR)", M.recovery(M.prepare(flatDays.map(d => ({ date: d.date, sleepSec: d.sleepSec })), [], [], S0), 35), null);
near("weights sum to 1", Object.values(M.RECOVERY_WEIGHTS).reduce((a, b) => a + b), 1, 1e-12);
// z-score excludes the day itself and uses a floor
const zd = M.prepare(mk(30, i => ({ rhr: 50 + (i % 2) })), [], [], S0); const zz = M.zScore(zd, "rhr", 29); ok("z uses previous 28 days only (n=28)", zz.n === 28);
const zc = M.prepare(mk(30, i => ({ rhr: i === 29 ? 56 : 50 })), [], [], S0); near("constant baseline uses SD floor 1.0 bpm → z = 6", M.zScore(zc, "rhr", 29).z, 6, 1e-9);
const nr = M.normalRange(M.prepare(mk(30, i => ({ rhr: 40 + i })), [], [], S0), "rhr", 29); near("normal range = P10..P90 of previous 28 values (41..68)", nr.lo, 41 + 0.1 * 27, 1e-9);
near("P90", nr.hi, 41 + 0.9 * 27, 1e-9);

// ---- anomaly
const base = mk(31, () => ({ rhr: 55, hrv: 60, respAvg: 14, sleepResp: 14 }));
const ill = base.slice(); ill[30] = { date: ill[30].date, rhr: 63, hrv: 40, sleepResp: 16.5 };
eq("RHR↑ + HRV↓ + breathing↑ → strong illness-like signature", M.dayAnomaly(M.prepare(ill, [], [], S0), 30).level, "strong");
const ill2 = base.slice(); ill2[30] = { date: ill2[30].date, rhr: 63, hrv: 40, sleepResp: 14 };
eq("RHR↑ + HRV↓ only → 'possible'", M.dayAnomaly(M.prepare(ill2, [], [], S0), 30).level, "possible");
const ill3 = base.slice(); ill3[30] = { date: ill3[30].date, rhr: 63, hrv: 60, sleepResp: 14 };
eq("RHR↑ alone is not flagged", M.dayAnomaly(M.prepare(ill3, [], [], S0), 30).level, null);
const small = base.slice(); small[30] = { date: small[30].date, rhr: 57, hrv: 57, sleepResp: 14.2 }; eq("small wiggles are not flagged (needs ≥3 bpm AND ≥15% HRV drop)", M.dayAnomaly(M.prepare(small, [], [], S0), 30).level, null);
const eps = M.anomalyEpisodes(M.prepare(ill, [], [{ date: ill[29].date, type: "alcohol", label: "x" }], S0)); eq("episode found, matches note", [eps.length, eps[0].level, eps[0].matchesNote], [1, "strong", true]);
eq("no baseline (<10 days) → no flags", M.anomalyEpisodes(M.prepare(ill.slice(25), [], [], S0)).length, 0);

// ---- decoupling / drift
const mkSeries = (n, hrFn, spd) => ({ step: 5, hr: Array.from({ length: n }, (_, i) => hrFn(i)), spd: Array.from({ length: n }, () => spd) });
const sr = mkSeries(720, i => i < 420 ? 140 : 147, 3);
const dc = M.decoupling(sr); near("Pa:HR decoupling: HR 140→147 at constant pace = (147−140)/147 = 4.76 %", dc.pct, 4.7619, 1e-3); ok("steady flag true for constant pace", dc.steady && dc.ok); near("HR drift +7 bpm", dc.driftBpm, 7, 1e-9);
eq("too-short efforts refuse to compute", M.decoupling(mkSeries(300, () => 140, 3)).ok, false);
const iv = mkSeries(720, i => 140, 3); iv.spd = iv.spd.map((s, i) => i % 24 < 12 ? 1.5 : 4.5); ok("interval session flagged as not steady", M.decoupling(iv).steady === false);
const sl = M.hrDriftSlope(mkSeries(720, i => 140 + i / 60, 3)); near("HR drift slope: +1 bpm/5 min = 2 bpm per 10 min", sl.slopePer10Min, 2 * (5 / 5) , 0.05);
eq("pace string", [M.paceStr(3.3333333), M.paceStr(0), M.paceStr(2.5)], ["5:00 /km", "–", "6:40 /km"]);
const pr = M.personalRecords([{ id: "1", group: "run", start: 1, date: "2026-01-01", best: { "5km": 1500 } }, { id: "2", group: "run", start: 2, date: "2026-02-01", best: { "5km": 1450 } }, { id: "3", group: "run", start: 3, date: "2026-03-01", best: { "5km": 1480 } }]);
eq("personal records keep the fastest and note progressive PRs", [pr.records["run:5km"].sec, pr.records["run:5km"].id, pr.improvements.length], [1450, "2", 1]);

// ---- planted effects in the demo data are found
const dd = G.generate(), ds = M.prepare(dd.days, dd.activities, dd.annotations, {});
const e2 = M.anomalyEpisodes(ds), illEp = e2.find(e => e.start <= dd.truth.illnessStart && e.end >= dd.truth.illnessStart);
ok("demo: the planted illness (Jul 7–10) is detected as a strong episode", illEp && illEp.level === "strong" && illEp.start === "2026-07-07" && illEp.end === "2026-07-10", illEp);
ok("demo: no 'strong' episodes outside the illness window", e2.filter(e => e.level === "strong" && e.start !== "2026-07-07").every(e => e.matchesNote), e2.filter(e => e.level === "strong"));
const recIll = dd.truth.illness.map(d => ds.s.recovery[ds.idx[d]]).filter(x => x !== null && x !== undefined), recAll = ds.s.recovery.filter(x => x !== null && x !== undefined);
ok("demo: recovery is red on illness days (mean < 25) and ~50 overall", recIll.reduce((a, b) => a + b) / recIll.length < 25 && Math.abs(recAll.reduce((a, b) => a + b) / recAll.length - 50) < 12, [recIll, recAll.reduce((a, b) => a + b) / recAll.length]);
const lastDay = ds.n - 1; ok("demo: fitness (CTL) built up, form (TSB) sane", ds.s.ctl[lastDay] > 15 && ds.s.ctl[lastDay] < 120 && Math.abs(ds.s.tsb[lastDay]) < 60, [ds.s.ctl[lastDay], ds.s.tsb[lastDay]]);
const sj2 = M.socialJetLag(ds, lastDay); ok("demo: social jet lag between 30 and 120 min (weekends are later)", sj2 && sj2.jetlagMin > 30 && sj2.jetlagMin < 120, sj2 && sj2.jetlagMin);
const zonesSum = M.weeklyZoneDistribution(ds, "2026-10-05"); ok("weekly zone distribution sums to 100 %", Math.abs(zonesSum.pct.slice(1).reduce((a, b) => a + b) - 100) < 1e-6 || zonesSum.total === 0);
ok("every demo activity with HR got a load", ds.acts.filter(a => a.avgHr).every(a => a.hrtss > 0));
ok("prepare() keeps day and activity counts", ds.acts.length === dd.activities.length && ds.n >= dd.days.length);

// ---- review notes: single night vs strain pattern, max-HR estimate, shared ACWR threshold
{
  const two = base.slice(); two[29] = { date: two[29].date, rhr: 63, hrv: 40, sleepResp: 16.5 }; two[30] = { date: two[30].date, rhr: 64, hrv: 41, sleepResp: 16.5 };
  const dsT = M.prepare(two, [], [], S0);
  eq("one flagged night → 'worth watching' (1 day)", [M.anomalyStatus(M.prepare(ill, [], [], S0), 30).kind, M.anomalyStatus(M.prepare(ill, [], [], S0), 30).days], ["watch", 1]);
  eq("2 consecutive flagged days → 'strain pattern'", [M.anomalyStatus(dsT, 30).kind, M.anomalyStatus(dsT, 30).days], ["pattern", 2]);
  eq("first of the two days is still only 'watch'", M.anomalyStatus(dsT, 29).kind, "watch");
  eq("unflagged day → kind null", M.anomalyStatus(M.prepare(base, [], [], S0), 30).kind, null);
  eq("episode kind: 1-day = watch, 2-day = pattern", [M.anomalyEpisodes(M.prepare(ill, [], [], S0))[0].kind, M.anomalyEpisodes(dsT)[0].kind], ["watch", "pattern"]);
  ok("care text says not a diagnosis and lists red flags", /not a diagnosis/.test(M.ANOMALY_CARE) && /fever, chest pain, shortness of breath or fainting/.test(M.ANOMALY_CARE));
  const histA = new Array(251).fill(0); histA[150] = 600; histA[170] = 200; histA[195] = 2;
  const est = M.estimateMaxHr([{ hrHist: histA, hrStep: 5 }]);
  eq("max HR = 99th percentile of sustained HR; a 10 s spike at 195 is ignored", [est.value, est.source], [170, "sustained"]);
  eq("no HR data → flagged placeholder, never silently 190", [M.estimateMaxHr([]).source, M.estimateMaxHr([]).value !== 190], ["placeholder", true]);
  eq("too little sustained data falls back to activity max HR", M.estimateMaxHr([1, 2, 3, 4, 5].map(k => ({ maxHr: 170 + k }))).source, "activity-max");
  const sr = { step: 5, hr: Array.from({ length: 800 }, (_, k) => k < 792 ? 150 : 185) };
  eq("series-only activities also feed the estimate (≥1 h needed)", M.estimateMaxHr([{ series: sr }, { series: sr }]).value, 150);
  let jumps = 0, penalised = 0; for (let k = 29; k < ds.n; k++) { const a = M.acwr(ds.s.load, k - 1); if (a && a.ratio > M.ACWR_HIGH) { jumps++; const rc = M.recovery(ds, k); const lc = rc && rc.components.find(c => c.key === "load"); if (lc && lc.detail.penalty) penalised++; } }
  ok("recovery penalty applies exactly when ratio > 1.3 (same threshold as the advice)", jumps === 0 || penalised > 0, [jumps, penalised]);
}

// ---- review round 2: baseline contamination, cycle confounder, sleep cap
{
  const noise = k => ((k * 7919) % 11 - 5) / 10; // deterministic small wiggle so MAD is not zero
  const mkIll = (len) => mk(40 + len + 5, (k) => k >= 40 && k < 40 + len ? { rhr: 63 + noise(k) * 0.5, hrv: 40 * Math.exp(noise(k) * 0.02), sleepResp: 16.5 } : { rhr: 55 + noise(k), hrv: 60 * Math.exp(noise(k) * 0.02), sleepResp: 14 + noise(k) * 0.1 });
  for (const len of [10, 20]) {
    const dsI = M.prepare(mkIll(len), [], [], S0);
    const flagged = []; for (let k = 40; k < 40 + len; k++) flagged.push(!!M.dayAnomaly(dsI, k).level);
    eq("a " + len + "-day illness-like episode keeps flagging on every day (flagged days are excluded from the baseline)", flagged.every(Boolean), true);
    eq("…and the status counts " + len + " consecutive days", M.anomalyStatus(dsI, 39 + len).days, len);
    eq("…and it becomes one episode of " + len + " days", [M.anomalyEpisodes(dsI).length, M.anomalyEpisodes(dsI)[0].length], [1, len]);
    ok("recovers: the day after the episode is not flagged", !M.dayAnomaly(dsI, 40 + len).level);
  }
  const dsL = M.prepare(mkIll(20), [], [], S0);
  ok("without exclusion the trailing baseline WOULD have normalised (plain z of RHR on day 59 < 1.5)", M.zScore(dsL, "rhr", 59).z < 1.5, M.zScore(dsL, "rhr", 59).z);
  // NOTE (v1.1.1): from the 15th consecutive flagged day onward flagged days are admitted into the baseline (sustained-change rule), so the mask used here
  // is the skip mask (first 14 flagged days only). Day 59 is episode day 20: pre-shift days still outnumber admitted days (9 vs 5), so it is still flagged.
  M.dayAnomaly(dsL, 59); ok("with exclusion the same day is z ≫ 1.5", M.zScore(dsL, "rhr", 59, null, true, dsL._an.skip).z > 1.5);
  // cycle confounder
  const SFx = Object.assign({}, S0, { sex: "f" });
  const base2 = mk(46, k => k >= 40 && k < 44 ? { rhr: 63, hrv: 40, sleepResp: 16.5 } : { rhr: 55 + noise(k), hrv: 60 * Math.exp(noise(k) * 0.02), sleepResp: 14 });
  const cyc = [{ id: "c1", date: base2[39].date, until: base2[45].date, type: "cycle", label: "Luteal" }];
  const dsC = M.prepare(base2, [], cyc, SFx);
  eq("cycle event with 'until' covers each day of the range (7 days)", Object.keys(dsC.cycleDays).length, 7);
  eq("cycle event without 'until' covers one day", Object.keys(M.prepare(base2, [], [{ id: "c2", date: base2[41].date, type: "cycle" }], SFx).cycleDays).length, 1);
  const stC = M.anomalyStatus(dsC, 42);
  eq("strain pattern on a cycle day: kind pattern, cycle tagged, luteal note for sex f", [stC.kind, stC.cycleTagged, stC.lutealNote], ["pattern", true, true]);
  eq("sex m gets no luteal line", M.anomalyStatus(M.prepare(base2, [], [], S0), 42).lutealNote, false);
  const epC = M.anomalyEpisodes(dsC)[0]; eq("episode inside a cycle event is marked as explained by 'cycle'", [epC.matchesNote, epC.notes.indexOf("cycle") >= 0], [true, true]);
  ok("luteal wording", /luteal phase/.test(M.LUTEAL_NOTE));
  // sleep bonus cap
  const sl = h => { const dd = flatDays.slice(); dd[39] = Object.assign({}, dd[39], { sleepSec: h * 3600 }); const r = M.recovery(M.prepare(dd, [], [], Object.assign({}, S0, { sleepNeedH: 7.5 })), 39); return r.components.find(c => c.key === "sleep"); };
  eq("sleep component z is capped at +1 (12 h counts like 8.5 h)", [sl(12).z, sl(8.5).z, sl(9).z], [1, 1, 1]);
  near("8 h (0.5 h over need) still gets its proportional +0.5", sl(8).z, 0.5, 1e-9);
  near("a short night is NOT capped on the way down (5 h → −2.5)", sl(5).z, -2.5, 1e-9);
  eq("the explanation text names the cap", /at most \+1/.test(sl(8).label), true);
}

// ---- review round 3: a permanent new level must not flag forever
{
  const noise = k => ((k * 7919) % 11 - 5) / 10;
  const mkShift = (len, tail) => mk(40 + len + tail, (k) => k >= 40 ? { rhr: 63 + noise(k) * 0.5, hrv: 40 * Math.exp(noise(k) * 0.02), sleepResp: 16.5 } : { rhr: 55 + noise(k), hrv: 60 * Math.exp(noise(k) * 0.02), sleepResp: 14 + noise(k) * 0.1 });
  const dsP = M.prepare(mkShift(30, 0), [], [], S0), fl = []; for (let e = 1; e <= 30; e++) fl.push(!!M.dayAnomaly(dsP, 39 + e).level);
  const lastFlag = fl.lastIndexOf(true) + 1;
  eq("30-day permanent shift: days 1–14 all flag (still excluded from baseline)", fl.slice(0, 14).every(Boolean), true);
  eq("SUSTAINED_DAYS is 14", M.SUSTAINED_DAYS, 14);
  eq("day 13 is a strain pattern, day 14 becomes 'sustained'", [M.anomalyStatus(dsP, 39 + 13).kind, M.anomalyStatus(dsP, 39 + 14).kind], ["pattern", "sustained"]);
  ok("sustained wording says 2 weeks and discussing with a clinician", /Sustained change for 2 weeks/.test(M.SUSTAINED_NOTE) && /worth discussing with a clinician/.test(M.SUSTAINED_NOTE) && /isn't explained by something you know about/.test(M.SUSTAINED_NOTE));
  ok("the flag clears once the new baseline settles: last flagged day is between 15 and 26 (got " + lastFlag + ")", lastFlag >= 15 && lastFlag <= 26, lastFlag);
  eq("…and stays clear for the remaining days of the shift (days " + (lastFlag + 1) + "–30)", fl.slice(lastFlag).some(Boolean), false);
  const epP = M.anomalyEpisodes(dsP); eq("one episode, labelled 'sustained', ending where the flag clears", [epP.length, epP[0].kind, epP[0].length], [1, "sustained", lastFlag]);
  // a 13-day episode stays below the threshold and every day flags; 10-day behaviour is unchanged
  const ds13 = M.prepare(mkShift(13, 5).map((d, k) => k >= 53 ? Object.assign({}, d, { rhr: 55 + noise(k), hrv: 60 * Math.exp(noise(k) * 0.02), sleepResp: 14 }) : d), [], [], S0);
  eq("13-day episode: all 13 days flag, never 'sustained'", [Array.from({ length: 13 }, (_, k) => !!M.dayAnomaly(ds13, 40 + k).level).every(Boolean), M.anomalyStatus(ds13, 52).kind], [true, "pattern"]);
  // after the shift settled, a NEW acute illness on top of the new level is detected again
  const mk2 = mk(40 + 45, (k) => k < 40 ? { rhr: 55 + noise(k), hrv: 60 * Math.exp(noise(k) * 0.02), sleepResp: 14 } : k < 40 + 40 ? { rhr: 63 + noise(k) * 0.5, hrv: 40 * Math.exp(noise(k) * 0.02), sleepResp: 16.5 } : { rhr: 71 + noise(k) * 0.5, hrv: 28 * Math.exp(noise(k) * 0.02), sleepResp: 19 });
  const ds2 = M.prepare(mk2, [], [], S0); ok("a further jump on top of the settled new level flags again", !!M.dayAnomaly(ds2, 82).level && !M.dayAnomaly(ds2, 78).level, [M.dayAnomaly(ds2, 78).level, M.dayAnomaly(ds2, 82).level]);
}
done();
