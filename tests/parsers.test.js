const { ok, near, eq, throws, done } = require("./harness");
const fs = require("fs"), path = require("path"), P = require("../js/parsers.js"), F = require("../js/fit.js");
const fx = path.join(__dirname, "fixtures", "garmin-format"), txt = f => fs.readFileSync(path.join(fx, f), "utf8");
const parse = (f, o) => P.parseFile({ name: f, text: txt(f) }, o);
const byDate = (r, d) => r.days.find(x => x.date === d);

// ---------- UDSFile
{
  const r = parse("UDSFile_2022-03-15_2022-03-16.json"), d = byDate(r, "2022-03-15"), d2 = byDate(r, "2022-03-16");
  eq("uds: classified by file name", r.kind, "uds");
  ok("uds: hydration-only row skipped, two days read", r.days.length === 2);
  ok("uds (real record): steps 879, goal 4000, distance 724 m, kcal 2237/7", d.steps === 879 && d.stepGoal === 4000 && d.distanceM === 724 && d.kcalTotal === 2237 && d.kcalActive === 7);
  ok("uds (real record): min/max/resting HR 37/76/39", d.minHr === 37 && d.maxHr === 76 && d.rhr === 39);
  ok("uds (real record): stress TOTAL 16 (max 75), ASLEEP 15, AWAKE 17", d.stressAvg === 16 && d.stressMax === 75 && d.sleepStress === 15 && d.awakeStress === 17);
  ok("uds (real record): stress durations high/med/low/rest = -/120/8520/72420", d.stressHighSec === undefined && d.stressMedSec === 120 && d.stressLowSec === 8520 && d.stressRestSec === 72420);
  ok("uds (real record): body battery 100/66, end 83, +46/-33", d.bbHigh === 100 && d.bbLow === 66 && d.bbEnd === 83 && d.bbCharged === 46 && d.bbDrained === 33);
  ok("uds (real record): SpO2 avg 96, low 93", d.spo2Avg === 96 && d.spo2Low === 93);
  ok("uds: respiration from nested object (reconstructed shape)", d.respAvg === 15 && d.respHigh === 22 && d.respLow === 9);
  ok("uds: floors = 6.48 m / 3.048 m per floor = 2", d.floors === 2);
  ok("uds: tz offset from GMT vs local start (a UTC+0 export day here) = 60 min", d.tzOffsetMin === 60, d.tzOffsetMin);
  ok("uds: ISO-string calendarDate (newer exports) works", d2 && d2.steps === 10432 && d2.floors === 10);
  ok("uds: -1 sentinel values (no data) are dropped, not stored", d2.stressAvg === undefined && d2.bbLow === undefined && d2.bbHigh === 92);
  ok("uds: waking respiration flat key", d2.respAvg === 14);
  ok("uds: rejects non-JSON with a clear message", (() => { try { P.parseFile({ name: "UDSFile_x.json", text: "{oops" }); return false; } catch (e) { return /Not valid JSON/.test(e.message); } })());
}
// ---------- sleep
{
  const r = parse("2019-06-29_2019-10-07_123456789_sleepData.json"); eq("sleep: kind", r.kind, "sleep");
  const a = byDate(r, "2019-08-05"), un = byDate(r, "2019-08-04"), c = byDate(r, "2022-03-15");
  ok("sleep (real record): stages 600/19440/8460 s, awake 420; sleep time excludes awake = 28500", a.deepSec === 600 && a.lightSec === 19440 && a.remSec === 8460 && a.awakeSec === 420 && a.sleepSec === 28500);
  ok("sleep (real record): GMT start/end read as UTC", a.sleepStart === Date.UTC(2019, 7, 4, 20, 28) && a.sleepEnd === Date.UTC(2019, 7, 5, 4, 30));
  ok("sleep (real record): UNCONFIRMED session keeps window but no sleep time", un.sleepUnconfirmed === true && un.sleepSec === undefined && un.deepSec === undefined);
  ok("sleep: scores, respiration, stress, restlessness", c.sleepScore === 82 && c.sleepScoreDuration === 85 && c.sleepResp === 14 && c.sleepRespLow === 10 && c.sleepStress === 13 && c.awakeCount === 2 && c.restless === 38 && c.sleepFeedback === "POSITIVE_LONG_AND_DEEP");
  ok("sleep: total = deep+light+rem = 25200 (7 h)", c.sleepSec === 25200);
  const dup = P.parseSleep([{ calendarDate: "2026-02-01", sleepStartTimestampGMT: "2026-02-01T05:00:00.0", sleepEndTimestampGMT: "2026-02-01T12:00:00.0", deepSleepSeconds: 3600, lightSleepSeconds: 14400, remSleepSeconds: 5400, awakeSleepSeconds: 0 }, { calendarDate: "2026-02-01", sleepStartTimestampGMT: "2026-02-01T19:00:00.0", sleepEndTimestampGMT: "2026-02-01T19:40:00.0", deepSleepSeconds: 0, lightSleepSeconds: 2400, remSleepSeconds: 0 }]);
  ok("sleep: nap on the same date does not replace the night", dup.days.length === 1 && dup.days[0].sleepSec === 23400);
  ok("sleep: score as {overall:{value}} (API-style) is understood", P.parseSleep([{ calendarDate: "2026-02-02", deepSleepSeconds: 1, lightSleepSeconds: 1, remSleepSeconds: 1, sleepScores: { overall: { value: 77 } } }]).days[0].sleepScore === 77);
}
// ---------- health status / metrics
{
  const r = parse("2026-01-01_2026-01-31_123456789_healthStatusData.json"), a = byDate(r, "2026-01-02"), b = byDate(r, "2026-01-03");
  ok("healthStatus: HRV value, baseline band, status", a.hrv === 48 && a.hrvLow === 41 && a.hrvHigh === 58 && a.hrvStatus === "BALANCED");
  ok("healthStatus: HR/SpO2/skin temp/respiration", a.hsRhr === 47 && a.hsSpo2 === 95 && a.skinTemp === 0.3 && a.hsResp === 14.2);
  ok("healthStatus: partial day + empty day (empty dropped)", b.hrv === 31 && b.hrvStatus === "LOW" && r.days.length === 2);
  const rd = parse("TrainingReadinessDTO_2026-01-01_2026-01-31_123456789.json").days;
  ok("readiness: two entries same day -> the later timestamp wins", rd.length === 1 && rd[0].readiness === 65 && rd[0].garminAcuteLoad === 510);
  const rd1 = P.parseReadiness([{ calendarDate: "2026-01-02", timestamp: "2026-01-02T12:05:00.0", score: 72, level: "MODERATE", recoveryTime: 600, hrvFactorPercent: 100 }]).days[0];
  ok("readiness: score, level, recovery minutes, HRV factor", rd1.readiness === 72 && rd1.readinessLevel === "MODERATE" && rd1.readinessRecoveryMin === 600 && rd1.readinessHrvPct === 100);
  const ld = parse("MetricsAcuteTrainingLoad_2026-01-01_2026-01-31_123456789.json").days[0];
  ok("load: ms-epoch calendarDate -> 2026-01-02, acute/chronic/ACWR", ld.date === "2026-01-02" && ld.garminAcute === 488 && ld.garminChronic === 520 && ld.garminAcwr === 0.9);
  const v = parse("ActivityVo2Max_2026-01-01_2026-01-31_123456789.json").days;
  ok("vo2max: running -> vo2max, cycling -> vo2maxCycling", v[0].vo2max === 51 && v[1].vo2maxCycling === 54);
  const bio = parse("123456789_userBioMetrics.json").days;
  ok("bio: weight grams -> kg, lactate threshold HR; empty row ignored", bio.length === 1 && bio[0].weightKg === 78.4 && bio[0].lthr === 168 && bio[0].date === "2026-01-04");
  ok("maxMet: derived VO2max flagged in warnings", P.parseMaxMet([{ calendarDate: "2026-01-02", maxMet: 14.6, fitnessAge: 31 }]).warnings.length === 1);
}
// ---------- summarized activities
{
  const r = parse("x_0_summarizedActivities.json"); eq("activities: kind", r.kind, "activities");
  const run = r.activities[0], st = r.activities[1];
  ok("activity: run — duration ms->s (3000 s), distance cm->m (9000 m), elevation cm->m (45 m)", run.durationSec === 3000 && run.distanceM === 9000 && run.ascentM === 45 && run.type === "running");
  ok("activity: avg/max/min HR, calories, steps, TE", run.avgHr === 150 && run.maxHr === 172 && run.minHr === 98 && run.calories === 620.5 && run.steps === 5100 && Math.abs(run.te - 3.4) < 1e-6);
  ok("activity: start (GMT ms, float literal) and tz offset -6 h from local", run.start === 1767344400000 && run.tzOffsetMin === -360 && run.date === "2026-01-02", [run.start, run.tzOffsetMin, run.date]);
  ok("activity: id stable", run.id === "g900000001");
  ok("activity (real record): strength, 4709.575 s, 0 distance dropped, avg 138 / max 172", st.type === "strength_training" && Math.abs(st.durationSec - 4709.58) < 0.01 && st.distanceM === undefined && st.avgHr === 138 && st.maxHr === 172);
  ok("activity (real record): local = GMT + 1 h", st.tzOffsetMin === 60 && st.date === "2026-01-16");
  eq("sportGroup", ["running", "treadmill_running", "road_biking", "indoor_cycling", "lap_swimming", "strength_training", "hiking", "foo"].map(P.sportGroup), ["run", "run", "bike", "bike", "swim", "gym", "walk", "other"]);
  const z = P.parseSummarized([{ summarizedActivitiesExport: [{ activityId: 1, activityType: "running", startTimeGmt: 1.7e12, duration: 3600000, hrTimeInZone_1: 600000, hrTimeInZone_2: 1200000, hrTimeInZone_3: 1200000, hrTimeInZone_4: 600000, hrTimeInZone_5: 0 }] }]).activities[0];
  eq("activity: HR zone times accepted when consistent with duration (ms -> s)", z.zoneSec, [600, 1200, 1200, 600, 0]);
  const zbad = P.parseSummarized([{ summarizedActivitiesExport: [{ activityId: 1, activityType: "running", startTimeGmt: 1.7e12, duration: 3600000, hrTimeInZone_1: 9e9, hrTimeInZone_2: 9e9, hrTimeInZone_3: 0, hrTimeInZone_4: 0, hrTimeInZone_5: 0 }] }]).activities[0];
  ok("activity: inconsistent zone units are ignored rather than guessed", zbad.zoneSec === undefined);
}
// ---------- FIT -> activity (real files)
{
  const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures/real-fit/garmin-edge-500-activity.fit")));
  const r = P.parseFile({ name: "ride.fit", bytes }); eq("fit: kind", r.kind, "fit-activity");
  const a = r.activities[0];
  ok("fit ride: type cycling, 92622.34 m, avg HR 162, max 189, ascent 541", a.type === "cycling" && a.distanceM === 92622.34 && a.avgHr === 162 && a.maxHr === 189 && a.ascentM === 541, a);
  ok("fit ride: start 2011-09-25T13:00:21Z -> id and date", a.start === Date.UTC(2011, 8, 25, 13, 0, 21) && a.id === "f" + a.start && a.date === "2011-09-25");
  ok("fit ride: 5 s series covers the 3.5 h ride (~2538 points) with HR + speed + distance", a.series.step === 5 && a.series.hr.length > 2500 && a.series.hr.length < 2600 && a.series.dist && a.series.spd.some(x => x > 5), a.series.hr.length);
  ok("fit ride: series distance ends near the session distance", Math.abs(a.series.dist[a.series.dist.length - 1] - 92622) < 120, a.series.dist[a.series.dist.length - 1]);
  ok("fit ride: best efforts present and monotone (1 km < 5 km < 10 km)", a.best && a.best["1km"] < a.best["5km"] && a.best["5km"] < a.best["10km"], a.best);
  ok("fit ride: 1 km best effort is physically plausible for a 8.7 m/s average ride (<= 100 s, >= 25 s)", a.best["1km"] >= 25 && a.best["1km"] <= 100, a.best["1km"]);
  const run = P.parseFile({ name: "run.fit", bytes: new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures/real-fit/garmin-fenix-5-run.fit"))) }).activities[0];
  ok("fit run (fenix 5): running, 157.56 m, HR 90/112, rr intervals counted", run.type === "running" && run.distanceM === 157.56 && run.avgHr === 90 && run.maxHr === 112, run);
  const mon = P.parseFile({ name: "m.fit", bytes: new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures/real-fit/MonitoringFile.fit"))) });
  ok("fit: all-day monitoring file is recognised and skipped cheaply", mon.kind === "fit-other" && mon.fileType === "monitoring_b" && mon.activities.length === 0);
  const sysTime = P.parseFile({ name: "c.fit", bytes: new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures/real-fit/compressed-speed-distance.fit"))) });
  ok("fit: file whose clock is device 'system time' is skipped with a warning (no fake 1989 dates)", sysTime.activities.length === 0 && sysTime.warnings.length === 1, sysTime.warnings);
}
// ---------- best efforts known answer
{
  // constant 4 m/s: 1 km takes exactly 250 s; 5 km 1250 s
  const t = [], d = []; for (let s = 0; s <= 1500; s++) { t.push(s); d.push(4 * s); }
  const be = P.bestEfforts(t, d); near("bestEfforts constant 4 m/s -> 1 km = 250 s", be["1km"], 250, 0.11); near("5 km = 1250 s", be["5km"], 1250, 0.11); ok("10 km not reached -> absent", be["10km"] === undefined);
  // fast middle section: 1 km in 200 s hidden inside a slower run
  const t2 = [], d2 = []; let dist = 0; for (let s = 0; s <= 1000; s++) { t2.push(s); dist += (s >= 300 && s < 500) ? 5 : 3; d2.push(dist); }
  near("bestEfforts finds the fast 1 km window (200 s at 5 m/s)", P.bestEfforts(t2, d2)["1km"], 200, 0.6);
}
// ---------- TCX / GPX / CSV
{
  const t = parse("sample.tcx"); eq("tcx kind", t.kind, "tcx");
  const a = t.activities[0];
  ok("tcx: sport running, 40 s, 110 m, avg HR 136, max 152, ascent 5 m", a.type === "running" && a.durationSec === 40 && a.distanceM === 110 && a.avgHr === 136 && a.maxHr === 152 && a.ascentM === 5, a);
  ok("tcx: start time UTC 2026-01-10T07:00Z", a.start === Date.UTC(2026, 0, 10, 7) && a.date === "2026-01-10");
  const g = parse("sample.gpx"); const b = g.activities[0];
  ok("gpx: walking, 120 s, HR 90..99 from gpxtpx extension", b.type === "walking" && b.durationSec === 120 && b.maxHr === 99 && b.avgHr === 95, b);
  ok("gpx: distance computed from lat/lon (0.0018° ≈ 200 m)", Math.abs(b.distanceM - 200.2) < 1.5, b.distanceM);
  const bad = P.parseGpx("<gpx></gpx>"); ok("gpx without track points -> warning, no activity", bad.activities.length === 0 && bad.warnings.length === 1);
  const c = parse("activities.csv"); eq("csv kind", c.kind, "csv-activities");
  ok("csv: quoted comma in title, duration, distance km->m, HR", c.activities[0].name === "Easy, run" && c.activities[0].durationSec === 1810 && c.activities[0].distanceM === 5020 && c.activities[0].avgHr === 142 && c.activities[0].maxHr === 161 && c.activities[0].type === "running", c.activities[0]);
  ok("csv: '--' HR ignored, thousands separator in ascent", c.activities[1].avgHr === undefined && c.activities[1].ascentM === 1020 && c.activities[1].type === "cycling");
  const mi = P.parseFile({ name: "a.csv", text: txt("activities.csv") }, { distanceUnit: "mi" }); ok("csv: distance unit option (miles)", Math.abs(mi.activities[0].distanceM - 5.02 * 1609.344) < 1);
  ok("csv: warns that the unit and the time zone are unknown", c.warnings.length === 2);
  const dd = parse("days.csv"); eq("days csv kind", dd.kind, "csv-days");
  ok("days csv: aliases, hours -> seconds, blank skipped, bad date skipped", dd.days.length === 2 && dd.days[0].rhr === 48 && dd.days[0].hrv === 52 && dd.days[0].sleepSec === 27000 && dd.days[1].hrv === undefined && dd.days[1].sleepSec === 22500 && dd.days[1].stressAvg === 41);
  eq("csv parser: quotes, escaped quotes, CRLF, BOM", P.parseCsv('\uFEFFa,b\r\n"x ""y""",2\r\n3,"4\n5"'), [["a", "b"], ['x "y"', "2"], ["3", "4\n5"]]);
}
// ---------- routing + sniffing + bundle
{
  eq("classify by Garmin path", ["DI_CONNECT/DI-Connect-Aggregator/UDSFile_2022-01-01_2022-04-01.json", "x/2023-12-16_2024-03-25_45940832_sleepData.json", "a/me@x.com_0_summarizedActivities.json", "a/b.FIT", "z.tcx", "z.gpx", "z.csv", "z.zip", "z.txt", "random.json"].map(P.classify), ["uds", "sleep", "activities", "fit", "tcx", "gpx", "csv", "zip", "other", "json"]);
  const renamed = P.parseFile({ name: "my-data.json", text: txt("UDSFile_2022-03-15_2022-03-16.json") }); ok("sniffing: renamed UDS file is still recognised", renamed.kind === "uds" && renamed.days.length === 2);
  eq("sniffing: sleep/activities/healthStatus", ["2019-06-29_2019-10-07_123456789_sleepData.json", "x_0_summarizedActivities.json", "2026-01-01_2026-01-31_123456789_healthStatusData.json"].map(f => P.parseFile({ name: "q.json", text: txt(f) }).kind), ["sleep", "activities", "healthStatus"]);
  eq("unknown json is reported not crashed", P.parseFile({ name: "q.json", text: '{"hello":1}' }).kind, "json-unknown");
  const bun = P.parseFile({ name: "garmin-lens-bundle.json", text: JSON.stringify({ format: "garmin-lens-bundle", version: 1, days: [{ date: "2026-01-01", rhr: 50 }, { date: "bad" }], activities: [{ id: "x", start: 1 }, { nope: 1 }], annotations: [{ id: "a", date: "2026-01-01", type: "travel" }] }) });
  ok("bundle: valid rows kept, invalid dropped", bun.kind === "bundle" && bun.days.length === 1 && bun.activities.length === 1 && bun.annotations.length === 1);
  throws("bundle with wrong format rejected", () => P.parseBundle({ format: "other" }), /Not a Garmin Lens bundle/);
}

// ---------- v1.2: odd shapes, fallbacks, sanity checks, skipped folders
{
  const D = require("../js/dates.js");
  eq("calendarDate as {year, month, day} (month 1-12)", D.dayKey({ year: 2023, month: 4, day: 9 }), "2023-04-09");
  eq("calendarDate {monthValue, dayOfMonth} too", D.dayKey({ year: 2023, monthValue: 12, dayOfMonth: 31 }), "2023-12-31");
  eq("garbage object -> null", D.dayKey({ year: 1, month: 99, day: 0 }), null);
  const act = (t, extra) => P.parseSummarized([{ summarizedActivitiesExport: [Object.assign({ activityId: 1, startTimeGmt: 1497191649000, duration: 3600000, distance: 1000000, avgHr: 150, activityType: t }, extra || {})] }]).activities[0];
  eq("activityType as string", act("running").type, "running");
  eq("activityType as object {typeKey}", act({ typeId: 1, typeKey: "Trail_Running", parentTypeId: 17 }).type, "trail_running");
  eq("activityType missing -> sportType fallback, else other", [act(undefined, { sportType: "CYCLING" }).type, act(undefined).type], ["cycling", "other"]);
  eq("activityType object without key -> other (never '[object object]')", act({ typeId: 9 }).type, "other");
  const wrapped = P.parseSleep([{ dailySleepDTO: { calendarDate: { year: 2026, month: 3, day: 5 }, sleepStartTimestampGMT: "2026-03-05T04:00:00.0", sleepEndTimestampGMT: "2026-03-05T12:00:00.0", deepSleepSeconds: 5400, lightSleepSeconds: 16200, remSleepSeconds: 5400, awakeSleepSeconds: 600, sleepScores: { overall: { value: 81 } }, averageRespirationValue: 14.2 }, avgOvernightHrv: 52.5 }]);
  const wd = wrapped.days[0]; eq("dailySleepDTO wrapper: date, duration, score, respiration, HRV", [wd.date, wd.sleepSec, wd.sleepScore, wd.sleepResp, wd.hrvSleep], ["2026-03-05", 27000, 81, 14.2, 52.5]);
  const flat = P.parseSleep([{ calendarDate: "2026-03-06", deepSleepSeconds: 3600, lightSleepSeconds: 18000, remSleepSeconds: 3600, avgOvernightHrv: 47 }]).days[0]; eq("flat sleep record: avgOvernightHrv -> hrvSleep", flat.hrvSleep, 47);
  eq("avgOvernightHrv absent -> no hrvSleep key", "hrvSleep" in P.parseSleep([{ calendarDate: "2026-03-06", deepSleepSeconds: 3600, lightSleepSeconds: 18000 }]).days[0], false);
  const ms = P.parseSleep([{ calendarDate: "2026-03-07", deepSleepSeconds: 5400000, lightSleepSeconds: 16200000, remSleepSeconds: 5400000, awakeSleepSeconds: 600000 }]);
  eq("sleep stages in ms are converted (7.5 h) with a warning", [ms.days[0].sleepSec, ms.warnings.length], [27000, 1]);
  const bad = P.parseFile({ name: "UDSFile_x.json", text: JSON.stringify([{ calendarDate: "2026-03-08", totalSteps: 12000000, restingHeartRate: 300, minHeartRate: 48, maxHeartRate: 160, averageSpo2Value: 97, avgWakingRespirationValue: 15 }]) });
  const bd = bad.days[0]; eq("implausible steps (12 000 000) and resting HR (300) dropped; sane fields kept", ["steps" in bd, "rhr" in bd, bd.minHr, bd.maxHr, bd.spo2Avg, bd.respAvg], [false, false, 48, 160, 97, 15]);
  ok("a warning names the dropped fields", /Ignored 2 value\(s\) outside a plausible range \(.*(steps|rhr)/.test(bad.warnings.join(" ")), bad.warnings);
  const ba = P.parseFile({ name: "x_summarizedActivities.json", text: JSON.stringify([{ summarizedActivitiesExport: [{ activityId: 7, startTimeGmt: 1497191649000, duration: 99999999999, distance: 1000000, avgHr: 150, activityType: "running" }] }]) });
  eq("activity with an absurd duration (> 7 days) loses the duration, keeps the rest", ["durationSec" in ba.activities[0], ba.activities[0].avgHr, ba.activities[0].distanceM], [false, 150, 10000]);
  const good = P.parseFile({ name: "UDSFile_y.json", text: JSON.stringify([{ calendarDate: "2026-03-09", totalSteps: 0, restingHeartRate: 52, totalKilocalories: 2300 }]) });
  eq("sane data produces no sanity warning (0 steps is legal)", [good.warnings.length, good.days[0].steps], [0, 0]);
  const sk = P.isSkippedFolder;
  eq("skipped: account, customer-service, user, social, payment, content, device, golf folders", ["DI_CONNECT/DI-Connect-Account/a.json", "DI_CONNECT/DI-Connect-Customer-Service/a.json", "x/DI-Connect-User/a.json", "x/DI-Connect-Social/a.json", "x/DI-Connect-Payment/a.json", "x/DI-Connect-Content/a.json", "x/DI-Connect-Device/a.json", "x/Golf/a.json", "x/DI-Connect-Golf/a.json"].map(sk), Array(9).fill(true));
  eq("not skipped: fitness, metrics, wellness, aggregator, uploaded files", ["DI_CONNECT/DI-Connect-Fitness/a.json", "DI_CONNECT/DI-Connect-Metrics/a.json", "DI_CONNECT/DI-Connect-Wellness/a.json", "DI_CONNECT/DI-Connect-Aggregator/UDSFile_1.json", "DI_CONNECT/DI-Connect-Uploaded-Files/a.json", "UDSFile_1.json"].map(sk), Array(6).fill(false));
  eq("a file NAME containing 'user' does not skip (folders only)", sk("DI_CONNECT/DI-Connect-Fitness/user_summarizedActivities.json"), false);
}

done();
