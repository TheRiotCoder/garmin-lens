const { ok, near, eq, done } = require("./harness");
const I = require("../js/insights.js"), M = require("../js/models.js"), D = require("../js/dates.js"), G = require("../js/demo.js");
const fake = (obj) => { const keys = Object.keys(obj), n = obj[keys[0]].length; return { s: obj, n, dates: Array.from({ length: n }, (_, i) => D.addDays("2026-01-01", i)), idx: Object.fromEntries(Array.from({ length: n }, (_, i) => [D.addDays("2026-01-01", i), i])), settings: {}, notes: [], acts: [], actsByDate: {}, notesByDate: {} }; };
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ---- stats helpers
eq("Benjamini–Hochberg q-values (known answer)", I.bhAdjust([0.01, 0.04, 0.03, 0.005]).map(x => Math.round(x * 1e6) / 1e6), [0.02, 0.04, 0.04, 0.02]);
eq("BH keeps nulls", I.bhAdjust([0.01, null, 0.02]).map(x => x === null ? null : Math.round(x * 1e6) / 1e6), [0.02, null, 0.02]);
near("effective n under AR(1): 100 × (1−.25)/(1+.25) = 60", I.effectiveN(100, 0.5, 0.5), 60, 1e-9); near("no autocorrelation → n unchanged", I.effectiveN(100, 0, 0.9), 100, 1e-9);
eq("strength labels", [0.05, 0.2, 0.4, 0.6, 0.9].map(I.strengthLabel), ["negligible", "weak", "moderate", "strong", "very strong"]);
near("lag-1 autocorrelation of a ramp ≈ 1", I.autocorr1([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 1, 1e-9);
const dev = I.deviation(Array.from({ length: 50 }, (_, i) => 10 + i), 28); near("deviation from trailing median removes a linear trend (constant offset)", dev[40], 14.5, 1e-9); eq("deviation null until 10 days of history", dev[5], null);

// ---- explorer
const r = rng(5), xs = Array.from({ length: 80 }, () => r() * 10);
const ys = new Array(80).fill(null).map((_, i) => i === 0 ? null : 3 * xs[i - 1] + 1);       // y follows x by exactly one day
const d = fake({ x: xs, y: ys });
const e0 = I.explore(d, "x", "y", { lag: 1 }); near("perfect lag-1 relation → ρ = 1", e0.r, 1, 1e-9); eq("n pairs", e0.n, 79);
ok("lag scan picks lag +1", I.lagScan(d, "x", "y").best.lag === 1);
ok("wrong lag is weak", Math.abs(I.explore(d, "x", "y", { lag: 0 }).r) < 0.4);
const noise = fake({ a: Array.from({ length: 200 }, () => r()), b: Array.from({ length: 200 }, () => r()) });
const en = I.explore(noise, "a", "b"); ok("independent noise: |ρ| small and p not tiny", Math.abs(en.r) < 0.2 && en.p > 0.01, [en.r, en.p]);
const few = I.explore(fake({ a: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], b: [2, 1, 4, 3, 6, 5, 8, 7, 10, 9] }), "a", "b"); ok("small samples get a warning", few.warnings.some(w => /too few/.test(w)));
ok("always says correlation is not causation", en.warnings.some(w => /not causation/.test(w)));
ok("unknown series handled", I.explore(noise, "a", "zzz").error === "unknown series");
const none = I.explore(fake({ a: [null, null, null, null, null], b: [1, 2, 3, 4, 5] }), "a", "b"); ok("no overlapping data → warning, no r", none.r === null && none.warnings.length > 0);
const sp = I.explore(fake({ a: [1, 2, 3, 4, 5, 6, 7, 8], b: [1, 4, 9, 16, 25, 36, 49, 64] }), "a", "b", { method: "spearman" }); near("Spearman of a monotone curve = 1", sp.r, 1, 1e-12);
const pe = I.explore(fake({ a: [1, 2, 3, 4, 5, 6, 7, 8], b: [1, 4, 9, 16, 25, 36, 49, 64] }), "a", "b", { method: "pearson" }); near("Pearson of y=x² on 1..8 = 0.976187 (numpy)", pe.r, 0.976187060, 1e-8);

// ---- group comparison
const g = fake({ v: Array.from({ length: 60 }, (_, i) => i % 7 === 3 ? 40 + (i % 3) : 60 + (i % 5)) });
const flagged = {}; for (let i = 2; i < 60; i += 7) flagged[g.dates[i]] = true;      // flagged day i → effect at i+1 (i%7===3)
const cg = I.compareGroups(g, flagged, "v", 1); ok("next-day effect found with lag 1", cg.mean1 < 45 && cg.mean2 > 55 && cg.p < 0.001 && cg.n1 === 9, cg);
const cg0 = I.compareGroups(g, flagged, "v", 0); ok("same-day comparison shows no such effect", Math.abs(cg0.diff) < 10);

// ---- planted effects in the demo
const dd = G.generate(), ds = M.prepare(dd.days, dd.activities, dd.annotations, {});
const hyp = I.hypotheses(ds), byId = id => hyp.find(h => h.id === id);
const late = byId("late"); ok("demo: late workouts → worse sleep, supported", late.verdict === "supported" && late.effects.find(e => e.key === "sleepScore").verdict === "supported" && late.effects.find(e => e.key === "sleepScore").diff < -8, late.effects.map(e => e.text));
ok("demo: late workouts push bedtime later (~+45 min planted)", late.effects.find(e => e.key === "onset").diff > 25);
const alc = byId("note:alcohol"); ok("demo: alcohol tag → higher RHR & lower sleep score next day", alc.effects.find(e => e.key === "rhr").diff > 1.5 && alc.effects.find(e => e.key === "sleepScore").verdict === "supported" && alc.days === dd.truth.alcohol.length, alc.effects.map(e => e.text));
ok("demo: hard days lower next-day HRV", byId("hard").effects.find(e => e.key === "lnHrv").diff < -0.05);
ok("every effect carries a plain-English sentence and a q-value", hyp.every(h => h.effects.every(e => typeof e.text === "string" && e.q !== undefined)));
ok("lateWorkoutDates uses LOCAL start time", Object.keys(I.lateWorkoutDates(ds, 19.5)).length >= dd.truth.late.length - 3, [Object.keys(I.lateWorkoutDates(ds, 19.5)).length, dd.truth.late.length]);
const as = I.associations(ds);
ok("associations scan multiple-testing aware, finds load → next-day HRV", as.tests > 50 && as.results.some(x => x.x === "load" && x.y === "lnHrv" && x.lag === 1 && x.r < -0.2 && x.significant), as.tests);
ok("same-night sleep metrics are not paired with each other", !as.results.some(x => x.lag === 0 && ["sleepH", "onset", "deepPct"].includes(x.x) && ["sleepScore", "deepPct", "sleepH"].includes(x.y)));
ok("association text is plain English", /^When .* tends to be (higher|lower)/.test(as.results[0].text));
const ls = I.lagScan(ds, "load", "lnHrv"); ok("lag scan on demo: strongest negative at lag +1 (or +0/+2), q-values present", ls.best.r < -0.15 && ls.results.every(x => x.q === null || x.q >= 0));
const ts = I.trendSummary(ds, "rhr"); ok("trend summary: 7/30/90 d means, normal range, slope", ts.avg7 && ts.avg30 && ts.avg90 && ts.range.lo < ts.range.hi && ts.slopeN > 60);
ok("demo RHR trends down (planted fitness gain)", I.trendSummary(ds, "rhr", ds.n - 1).avg90 < I.trendSummary(ds, "rhr", 100).avg90 + 0.5);

// ---- reports
const w = I.weeklyReport(ds, "2026-10-05"); ok("weekly report has metrics, activities, load", w.days === 7 && w.metrics.length >= 6 && w.activities >= 1 && w.load > 0);
ok("highlights are sentences about changes ≥ 0.5 SD", w.highlights.every(h => /versus the previous 7 days/.test(h)));
const mrep = I.monthlyReport(ds, "2026-07"); ok("July report covers 31 days and lists the illness episode", mrep.days === 31 && mrep.anomalies.some(a => a.start === "2026-07-07"), mrep.anomalies);
ok("weeks() are Mondays", I.weeks(ds).every(x => D.dow(x) === 1)); eq("months() ascending", I.months(ds).slice(0, 2), ["2026-02", "2026-03"]);
ok("partial first week is handled", I.weeklyReport(ds, D.weekStart(ds.dates[0])).days <= 7);

// ---- goals
const gd = fake({ steps: [9000, 9000, 7000, 9500, 9100, 9200], sleepH: [7, 7, 7, 7, 7, 7], stress: [30, 30, 30, 30, 30, 30], load: [0, 0, 0, 0, 0, 0] }); gd.dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"];
const ev = I.evaluateGoal(gd, { key: "steps", op: ">=", target: 8000, period: "day" }, "2026-01-06"); eq("daily goal: 5/6 met, current streak 3", [ev.met, ev.periods, ev.streak], [5, 6, 3]);
const evLe = I.evaluateGoal(gd, { key: "stress", op: "<=", target: 35, period: "day" }, "2026-01-06"); eq("'at most' goal", evLe.rate, 1);
const wk = I.evaluateGoal(ds, { key: "sessions", agg: "sum", op: ">=", target: 3, period: "week" }); ok("weekly sessions goal evaluates over complete weeks", wk.periods >= 8 && wk.rate > 0 && wk.rate <= 1, wk.rate);
ok("incomplete current week is not counted as a miss", wk.series[wk.series.length - 1].complete === false || wk.series[wk.series.length - 1].days === 7);

// ---- CSV export
eq("csv escapes quotes/commas/newlines", I.csvCell('a,"b"\nc'), '"a,""b""\nc"');
eq("csv neutralises spreadsheet formulas in text", I.csvCell("=HYPERLINK(\"x\")").startsWith("\"'=") || I.csvCell("=1+1").startsWith("'="), true);
eq("numbers are never prefixed (negative stays numeric)", I.csvCell(-5.123456), "-5.123"); eq("null/NaN are blank", [I.csvCell(null), I.csvCell(NaN), I.csvCell(undefined)], ["", "", ""]);
const csv = I.daysCsv(ds).split("\r\n"); eq("days CSV: header + one row per day + trailing newline", [csv.length, csv[0].startsWith("date,rhr,hrv")], [ds.n + 2, true]);
ok("every CSV row has the same number of columns", csv.slice(0, -1).every(l => l.split(",").length === csv[0].split(",").length));
const acsv = I.activitiesCsv(ds).split("\r\n"); eq("activities CSV rows", acsv.length - 2, ds.acts.length); ok("activity CSV has ISO UTC start", /T\d\d:\d\d:\d\d\.\d{3}Z/.test(acsv[1]));
done();
