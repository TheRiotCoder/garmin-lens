/* Garmin Lens – SYNTHETIC DEMO DATA generator (pure, UMD). Nothing here comes from a real person or a real Garmin device.
   Deterministic (seeded). Plants known effects (an illness episode, a trip across time zones, alcohol nights, late workouts, a fitness trend) so the
   analysis can be tested against ground truth. Everything is flagged demo:true and the app shows a permanent DEMO banner while it is loaded. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./dates.js"), require("./parsers.js"));
  else root.GLDemo = factory(root.GLDates, root.GLParsers);
})(typeof self !== "undefined" ? self : this, function (D, P) {
  "use strict";
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function r1(x) { return Math.round(x * 10) / 10; }

  function generate(opts) {
    opts = opts || {};
    var n = opts.days || 240, end = opts.end || "2026-10-15", start = D.addDays(end, -(n - 1)), rnd = rng(opts.seed || 20261017);
    function gauss() { var u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    var dates = D.range(start, end), MAXHR = 188, REST0 = 53;
    var truth = { illness: [], travel: [], alcohol: [], late: [], tzShift: [] };
    // planted events (indices counted from the start)
    var illStart = Math.round(n * 0.58), illness = [illStart, illStart + 1, illStart + 2, illStart + 3];
    var tripStart = Math.round(n * 0.37), trip = [tripStart, tripStart + 1, tripStart + 2, tripStart + 3, tripStart + 4, tripStart + 5];
    var alcoholIdx = {}; dates.forEach(function (d, i) { var wd = D.dow(d); if ((wd === 5 || wd === 6) && rnd() < 0.3 && illness.indexOf(i) < 0 && trip.indexOf(i) < 0 && i > 20) alcoholIdx[i] = true; });
    var days = [], acts = [], notes = [], ctl = 30, atl = 30, prevStress = 30, prevHardLate = false, actN = 0;
    // home time zone: US Central (CST -360 / CDT -300 minutes)
    for (var i = 0; i < n; i++) {
      var date = dates[i], wd = D.dow(date), progress = i / n;
      var inTrip = trip.indexOf(i) >= 0, ill = illness.indexOf(i) >= 0, alcPrev = !!alcoholIdx[i - 1] && i > 0;
      var homeTz = date < "2026-03-08" || date >= "2026-11-01" ? -360 : -300, tz = inTrip ? homeTz + 360 : homeTz;       // trip: UTC+1 (six hours east of home)
      var missing = rnd() < 0.025 && !ill;            // watch not worn: no record at all
      // ---- training plan: 0 Mon ... 6 Sun (JS getUTCDay: 0 Sun)
      var plan = { 1: "rest", 2: "intervals", 3: "easy", 4: "gym", 5: "rest", 6: "long", 0: "ride" }[wd];
      if (rnd() < 0.12) plan = "rest"; if (ill) plan = "rest"; if (i > illStart + 3 && i <= illStart + 5) plan = plan === "intervals" || plan === "long" ? "easy" : plan; if (inTrip && (plan === "intervals" || plan === "long")) plan = "easy";
      var late = false, startHour = 6.5 + rnd() * 0.8;
      if ((plan === "intervals" || plan === "gym") && rnd() < 0.35 && !ill) { late = true; startHour = 19.8 + rnd() * 1.0; }
      var load = 0, act = null;
      if (plan !== "rest") {
        var spec = { intervals: { type: "running", dur: 52, hrf: 0.84, pace: 3.55 }, easy: { type: "running", dur: 42, hrf: 0.68, pace: 2.95 }, long: { type: "running", dur: 88, hrf: 0.73, pace: 3.0 }, ride: { type: "cycling", dur: 70, hrf: 0.69, pace: 7.4 }, gym: { type: "strength_training", dur: 48, hrf: 0.6, pace: 0 } }[plan];
        var durMin = Math.round(spec.dur * (0.9 + rnd() * 0.25)), steps = Math.round(durMin * 60 / 5), hr = [], spd = [], alt = [], dist = [], pw = null, d0 = 0, base = spec.hrf, hrmax = 0, hrsum = 0;
        var fit = clamp(progress * 0.04, 0, 0.04), drift = plan === "long" || plan === "ride" ? 0.075 : 0.025;     // cardiac drift over the activity
        for (var k = 0; k < steps; k++) {
          var f = k / steps, warm = Math.min(1, k / 120), s = spec.pace * (1 + fit * 0.7) * (0.97 + 0.06 * Math.sin(k / 31)) * (spec.pace ? 1 : 0), h;
          if (plan === "intervals") { var ph = k % 90; var hard = f > 0.2 && f < 0.85 && ph < 45; s = hard ? spec.pace * 1.18 : spec.pace * 0.82; if (k < 120) s = spec.pace * 0.8 * warm; h = hard ? 0.91 : 0.72; h = h * (1 - fit * 0.4) + 0.0; }
          else h = base * (1 - fit * 0.5);
          var hrv = Math.round(MAXHR * clamp((h * (0.85 + 0.15 * warm) + drift * f) + gauss() * 0.01, 0.45, 0.99));
          if (plan === "gym") hrv = Math.round(MAXHR * clamp(0.55 + 0.1 * Math.sin(k / 9) + gauss() * 0.02, 0.45, 0.85));
          hr.push(hrv); hrmax = Math.max(hrmax, hrv); hrsum += hrv;
          spd.push(r1(Math.max(0, s) * 100) / 100); d0 += s * 5; dist.push(Math.round(d0 * 10) / 10); alt.push(Math.round((220 + 14 * Math.sin(k / 70) + 6 * Math.sin(k / 17)) * 10) / 10);
        }
        var start0 = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + Math.round(startHour * 3600000) - tz * 60000;
        act = { id: "demo-" + (++actN), source: "demo", demo: true, name: { intervals: "Intervals (demo)", easy: "Easy run (demo)", long: "Long run (demo)", ride: "Ride (demo)", gym: "Strength (demo)" }[plan], type: spec.type, start: start0, tzOffsetMin: tz, date: date, durationSec: steps * 5, distanceM: d0 > 0 ? Math.round(d0) : undefined, avgHr: Math.round(hrsum / steps), maxHr: hrmax, calories: Math.round(durMin * (plan === "gym" ? 6 : 10.5)), ascentM: spec.pace ? Math.round(steps * 0.35) : undefined, te: r1(clamp(1.5 + (plan === "intervals" ? 1.8 : plan === "long" ? 1.2 : 0.3) + gauss() * 0.2, 0.5, 5)),
          series: { step: 5, t0: start0, hr: hr, spd: spd, alt: alt, dist: spec.pace ? dist : null, pwr: null, cad: null } };
        if (!act.distanceM) delete act.distanceM; if (!act.ascentM) delete act.ascentM;
        if (spec.pace) { var be = P.bestEfforts(hr.map(function (_, q) { return q * 5; }), dist); if (Object.keys(be).length) act.best = be; }
        // load in hrTSS-like units (matches models.js, which recomputes it): approximated here only for the physiology below
        var hrr = (act.avgHr - REST0) / (MAXHR - REST0); load = durMin * hrr * 0.64 * Math.exp(1.92 * hrr) * 1.9;
        if (!missing) acts.push(act); if (late) { truth.late.push(date); }
      }
      // ---- latent state update (fitness / fatigue)
      var ctlPrev = ctl, atlPrev = atl; ctl += (load - ctl) * (1 - Math.exp(-1 / 42)); atl += (load - atl) * (1 - Math.exp(-1 / 7));
      var tsb = ctlPrev - atlPrev;
      // ---- recovery drivers
      var hrvBase = 56 * (1 + 0.1 * progress), fatigueEff = clamp(tsb / 60, -0.25, 0.15);
      var lnh = Math.log(hrvBase) + fatigueEff + gauss() * 0.085 + (prevStress > 40 ? -0.06 : 0) + (alcPrev ? -0.2 : 0) + (prevHardLate ? -0.05 : 0) + (inTrip && i - tripStart < 3 ? -0.11 : 0) + (ill ? -0.4 : 0);
      var hrvV = Math.exp(lnh), rhrV = REST0 - 3 * progress - fatigueEff * 8 + gauss() * 1.1 + (alcPrev ? 4 : 0) + (ill ? 7 : 0) + (inTrip && i - tripStart < 3 ? 1.5 : 0);
      // ---- sleep: need ~7.6 h; weekends later; late workouts push onset; jet lag shifts the clock
      var wake = 6.5 + (wd === 6 || wd === 0 ? 1.4 : 0) + gauss() * 0.25;                   // night ending on this date: Sat/Sun wake later (free days)
      var dur = clamp(7.15 + (wd === 6 || wd === 0 ? 0.55 : 0) + gauss() * 0.55 - (prevHardLate ? 0.35 : 0) - (alcPrev ? 0.4 : 0) - (ill ? -0.8 : 0), 4.5, 10);
      var onsetShift = (prevHardLate ? 0.75 : 0) + (alcPrev ? 0.5 : 0);
      var jet = inTrip ? (i - tripStart < 3 ? 0 : 0) : 0, sleepStartLocal = wake - dur - 0 + (onsetShift > 0 ? 0 : 0);
      var bed = (wake - dur - 0.2) + onsetShift; var wakeAdj = wake + (onsetShift > 0.5 ? 0.2 : 0);
      var localTz = tz; if (inTrip) { /* body clock still on home time: at the destination it feels 6 h earlier, so the local clock time of sleep moves later */ var adapt = Math.min(1, (i - tripStart) / 4); bed += 6 * (1 - adapt) * 0.6; wakeAdj += 6 * (1 - adapt) * 0.6; }
      var sleepSec = Math.round(dur * 3600), deepP = clamp(0.165 - (alcPrev ? 0.045 : 0) - (prevHardLate ? 0.02 : 0) + gauss() * 0.015, 0.06, 0.24), remP = clamp(0.21 - (alcPrev ? 0.04 : 0) + gauss() * 0.02, 0.1, 0.3), awakeP = clamp(0.07 + (alcPrev ? 0.03 : 0) + (ill ? 0.04 : 0) + gauss() * 0.01, 0.03, 0.2);
      var deep = Math.round(sleepSec * deepP), rem = Math.round(sleepSec * remP), light = sleepSec - deep - rem, awake = Math.round(sleepSec * awakeP);
      var sleepScore = Math.round(clamp(62 + (dur - 7) * 9 + (deepP - 0.15) * 160 + (hrvV > hrvBase ? 3 : -2) - (alcPrev ? 8 : 0) - (prevHardLate ? 5 : 0) + gauss() * 3.5, 25, 99));
      var stress = clamp(27 + (wd >= 1 && wd <= 5 ? 7 : -3) + gauss() * 6 + (ill ? 6 : 0) + (inTrip ? 5 : 0) + (rnd() < 0.08 ? 18 : 0), 8, 75);
      var respSleep = r1(13.6 + gauss() * 0.35 + (ill ? 2.1 : 0) + (alcPrev ? 0.4 : 0)), skin = r1(gauss() * 0.22 + (ill ? 0.85 : 0) + (alcPrev ? 0.25 : 0));
      var stepsV = Math.round(clamp(7600 + (act && act.distanceM ? act.distanceM * 0.85 : 0) + gauss() * 1700 - (ill ? 3500 : 0), 1500, 28000));
      var bbHigh = Math.round(clamp(78 + (sleepScore - 70) * 0.5 + (hrvV - hrvBase) * 0.4 + gauss() * 4 - (ill ? 20 : 0), 20, 100)), bbLow = Math.round(clamp(bbHigh - 30 - load * 0.25 - stress * 0.3 + gauss() * 4, 3, 70));
      var readiness = Math.round(clamp(55 + (Math.log(hrvV / hrvBase)) * 90 + (sleepScore - 70) * 0.5 - (atl - ctl) * 0.35 - (rhrV - REST0) * 1.5 + gauss() * 4, 5, 99));
      if (!missing) {
        var sStart = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + Math.round((bed - 0.0) * 3600000) - tz * 60000, sEnd = sStart + Math.round((dur + awakeP * dur) * 3600000);
        var day = { date: date, demo: true, tzOffsetMin: tz, steps: stepsV, stepGoal: 9000, distanceM: Math.round(stepsV * 0.76), kcalTotal: Math.round(2350 + load * 4 + stepsV * 0.03), kcalActive: Math.round(300 + load * 4), modMin: Math.round(clamp(15 + load * 0.2, 0, 90)), vigMin: Math.round(clamp(load * 0.08, 0, 40)), minHr: Math.round(rhrV - 8), maxHr: act ? act.maxHr : Math.round(112 + gauss() * 8), rhr: Math.round(rhrV),
          stressAvg: Math.round(stress), stressMax: Math.round(clamp(stress + 38 + gauss() * 8, 40, 99)), sleepStress: Math.round(clamp(stress - 14 + gauss() * 3, 5, 60)), bbHigh: bbHigh, bbLow: bbLow, bbCharged: Math.round(clamp(bbHigh - 15 + gauss() * 4, 20, 99)), bbDrained: Math.round(clamp(bbHigh - bbLow, 10, 99)), spo2Avg: Math.round(clamp(96 + gauss() * 0.7 - (ill ? 1.5 : 0), 90, 99)), spo2Low: Math.round(clamp(91 + gauss() * 1.5, 82, 97)), respAvg: r1(14.4 + gauss() * 0.4 + (ill ? 1.5 : 0)),
          sleepStart: sStart, sleepEnd: sEnd, sleepTzOffsetMin: tz, sleepSec: sleepSec, deepSec: deep, lightSec: light, remSec: rem, awakeSec: awake, sleepScore: sleepScore, sleepResp: respSleep, awakeCount: Math.round(clamp(1 + awakeP * 25 + gauss(), 0, 9)), restless: Math.round(clamp(30 + awakeP * 250 + gauss() * 6, 5, 120)),
          hrv: r1(hrvV), hrvLow: Math.round(hrvBase * 0.84), hrvHigh: Math.round(hrvBase * 1.2), hrvStatus: hrvV < hrvBase * 0.84 ? "LOW" : hrvV > hrvBase * 1.2 ? "UNBALANCED" : "BALANCED", hsRhr: Math.round(rhrV - 3), skinTemp: skin, readiness: readiness,
          vo2max: i % 3 === 0 && act && act.type === "running" ? r1(48.6 + 2.6 * progress + gauss() * 0.25) : undefined, weightKg: i % 7 === 3 ? r1(78.6 - 1.6 * progress + gauss() * 0.3) : undefined };
        if (rnd() < 0.05) { delete day.hrv; delete day.hrvLow; delete day.hrvHigh; delete day.hrvStatus; delete day.skinTemp; }
        Object.keys(day).forEach(function (k) { if (day[k] === undefined) delete day[k]; });
        days.push(day);
      }
      prevStress = stress; prevHardLate = late;
      if (alcoholIdx[i]) { truth.alcohol.push(date); notes.push({ id: "demo-n" + date + "a", date: date, type: "alcohol", label: "Drinks with dinner (demo)", demo: true }); }
      if (ill) truth.illness.push(date);
      if (inTrip) truth.travel.push(date);
    }
    notes.push({ id: "demo-n-trip", date: dates[tripStart], type: "travel", label: "Flew to Europe, +6 h (demo)", demo: true });
    notes.push({ id: "demo-n-ill", date: dates[illStart + 1], type: "illness", label: "Felt feverish (demo)", demo: true });
    truth.start = start; truth.end = end; truth.illnessStart = dates[illStart]; truth.tripStart = dates[tripStart];
    return { days: days, activities: acts, annotations: notes, truth: truth, demo: true };
  }

  /* Write the generated data in the Garmin export formats (UDSFile / sleepData / healthStatusData / summarizedActivities / readiness / acute load / vo2max)
     so the real parsers can be tested end to end. Returns [{name, text}] with paths like a real export. */
  function msJava(d, h) { var dt = new Date(D.toMs(d) + (h || 0) * 3600000); var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; var hh = dt.getUTCHours(), ap = hh >= 12 ? "PM" : "AM"; hh = hh % 12 || 12; return M[dt.getUTCMonth()] + " " + dt.getUTCDate() + ", " + dt.getUTCFullYear() + " " + hh + ":" + D.pad(dt.getUTCMinutes()) + ":" + D.pad(dt.getUTCSeconds()) + " " + ap; }
  function toGarminFiles(data) {
    var files = [], uds = [], sleep = [], hs = [], read = [], load = [], vo2 = [], first = data.days[0].date, last = data.days[data.days.length - 1].date;
    var iso = function (ms) { return new Date(ms).toISOString().replace("Z", "").replace(/\.\d+$/, ".0"); };
    data.days.forEach(function (d, i) {
      var o = { userProfilePK: 1, calendarDate: i % 2 ? d.date : { date: msJava(d.date) }, totalKilocalories: d.kcalTotal, activeKilocalories: d.kcalActive, totalSteps: d.steps, dailyStepGoal: d.stepGoal, totalDistanceMeters: d.distanceM, moderateIntensityMinutes: d.modMin, vigorousIntensityMinutes: d.vigMin, minHeartRate: d.minHr, maxHeartRate: d.maxHr, restingHeartRate: d.rhr,
        wellnessStartTimeGmt: { date: msJava(d.date, -d.tzOffsetMin / 60) }, wellnessStartTimeLocal: { date: msJava(d.date) },
        allDayStress: { aggregatorList: [{ type: "TOTAL", averageStressLevel: d.stressAvg, maxStressLevel: d.stressMax }, { type: "ASLEEP", averageStressLevel: d.sleepStress }] },
        bodyBattery: { chargedValue: d.bbCharged, drainedValue: d.bbDrained, bodyBatteryStatList: [{ bodyBatteryStatType: "HIGHEST", statsValue: d.bbHigh }, { bodyBatteryStatType: "LOWEST", statsValue: d.bbLow }] }, averageSpo2Value: d.spo2Avg, lowestSpo2Value: d.spo2Low, avgWakingRespirationValue: d.respAvg };
      uds.push(o);
      sleep.push({ sleepStartTimestampGMT: iso(d.sleepStart), sleepEndTimestampGMT: iso(d.sleepEnd), calendarDate: d.date, sleepWindowConfirmationType: "ENHANCED_CONFIRMED_FINAL", deepSleepSeconds: d.deepSec, lightSleepSeconds: d.lightSec, remSleepSeconds: d.remSec, awakeSleepSeconds: d.awakeSec, unmeasurableSeconds: 0, retro: false, averageRespiration: d.sleepResp, awakeCount: d.awakeCount, avgSleepStress: d.sleepStress, restlessMomentCount: d.restless, sleepScores: { overallScore: d.sleepScore } });
      if (d.hrv !== undefined) hs.push({ calendarDate: d.date, metrics: [{ type: "HRV", value: d.hrv, baselineLowerLimit: d.hrvLow, baselineUpperLimit: d.hrvHigh, status: d.hrvStatus }, { type: "HR", value: d.hsRhr }, { type: "SKIN_TEMP_C", value: d.skinTemp }] });
      read.push({ calendarDate: d.date, timestamp: d.date + "T12:00:00.0", score: d.readiness, level: d.readiness >= 70 ? "HIGH" : d.readiness >= 40 ? "MODERATE" : "LOW" });
      if (d.vo2max !== undefined) vo2.push({ calendarDate: d.date, sport: "RUNNING", vo2MaxValue: d.vo2max });
    });
    var chunk = function (arr) { var out = []; for (var i = 0; i < arr.length; i += 90) out.push(arr.slice(i, i + 90)); return out; };
    chunk(uds).forEach(function (c) { var a = D.dayKey(c[0].calendarDate), b = D.dayKey(c[c.length - 1].calendarDate); files.push({ name: "DI_CONNECT/DI-Connect-Aggregator/UDSFile_" + a + "_" + b + ".json", text: JSON.stringify(c) }); });
    chunk(sleep).forEach(function (c, i) { files.push({ name: "DI_CONNECT/DI-Connect-Wellness/" + first + "_" + last + "_" + (100 + i) + "_sleepData.json", text: JSON.stringify(c) }); });
    files.push({ name: "DI_CONNECT/DI-Connect-Wellness/" + first + "_" + last + "_1_healthStatusData.json", text: JSON.stringify(hs) });
    files.push({ name: "DI_CONNECT/DI-Connect-Metrics/TrainingReadinessDTO_" + first + "_" + last + "_1.json", text: JSON.stringify(read) });
    files.push({ name: "DI_CONNECT/DI-Connect-Metrics/ActivityVo2Max_" + first + "_" + last + "_1.json", text: JSON.stringify(vo2) });
    files.push({ name: "DI_CONNECT/DI-Connect-Fitness/demo@example.com_0_summarizedActivities.json", text: JSON.stringify([{ summarizedActivitiesExport: data.activities.map(function (a) { return { activityId: +a.id.replace("demo-", "9000"), name: a.name, activityType: a.type, startTimeGmt: a.start, startTimeLocal: a.start + a.tzOffsetMin * 60000, duration: a.durationSec * 1000, distance: a.distanceM ? a.distanceM * 100 : 0, avgHr: a.avgHr, maxHr: a.maxHr, calories: a.calories, elevationGain: a.ascentM ? a.ascentM * 100 : undefined, aerobicTrainingEffect: a.te }; }) }]) });
    return files;
  }
  return { generate: generate, toGarminFiles: toGarminFiles, rng: rng };
});
