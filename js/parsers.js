/* Garmin Lens – parsers for Garmin export files (pure, UMD).
   parseFile({name, text|bytes}) -> { kind, days:[{date,...}], activities:[...], warnings:[...] }
   Day records use the flat field names documented in docs/DATA-MODEL.md. Field names of the Garmin files are documented in docs/RESEARCH.md (verified vs. unverified). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./dates.js"), require("./fit.js"), require("./stats.js"));
  else root.GLParsers = factory(root.GLDates, root.GLFit, root.GLStats);
})(typeof self !== "undefined" ? self : this, function (D, FIT, S) {
  "use strict";
  var ok = S.ok;
  function num(v) { if (typeof v === "string" && v.trim() !== "" && isFinite(+v)) v = +v; return typeof v === "number" && isFinite(v) ? v : null; }
  function pos(v) { v = num(v); return v !== null && v > 0 ? v : null; }       // 0 / negative = "no data" in many Garmin fields
  function nn(v) { v = num(v); return v !== null && v >= 0 ? v : null; }
  function put(o, k, v) { if (v !== null && v !== undefined) o[k] = v; }
  function round(v, d) { return v === null ? null : S.round(v, d); }
  function tryJson(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    try { return JSON.parse(text); } catch (e) { throw new Error("Not valid JSON: " + e.message.slice(0, 80)); }
  }
  function arr(x) { return Array.isArray(x) ? x : x && typeof x === "object" ? [x] : []; }

  /* ---------- sport mapping ---------- */
  var RUN = /^(running|treadmill_running|trail_running|track_running|virtual_run|indoor_running|obstacle_run|ultra_run)$/;
  var BIKE = /(cycling|biking|virtual_ride|bmx|e_bike|gravel)/;
  var WALK = /^(walking|hiking|casual_walking|speed_walking|mountaineering)$/;
  var SWIM = /swim/;
  function sportGroup(t) { t = String(t || "").toLowerCase(); if (RUN.test(t)) return "run"; if (BIKE.test(t)) return "bike"; if (WALK.test(t)) return "walk"; if (SWIM.test(t)) return "swim"; if (/strength|weight|hiit|cardio|fitness|yoga|pilates|training/.test(t)) return "gym"; return "other"; }
  function fitSportName(sport, sub) { var n = FIT.SPORTS[sport] || "other"; if (n === "running" && sub === 1) return "treadmill_running"; if (n === "running" && sub === 3) return "trail_running"; if (n === "cycling" && sub === 6) return "indoor_cycling"; return n; }

  /* ---------- UDSFile (daily summaries) ---------- */
  function parseUds(data) {
    var days = [], warnings = [];
    arr(data).forEach(function (r) {
      if (!r || typeof r !== "object" || r.hydration && !r.calendarDate) return;
      var date = D.dayKey(r.calendarDate); if (!date) return;
      var d = { date: date };
      put(d, "steps", nn(r.totalSteps)); put(d, "stepGoal", pos(r.dailyStepGoal)); put(d, "distanceM", nn(r.totalDistanceMeters));
      put(d, "kcalTotal", pos(r.totalKilocalories)); put(d, "kcalActive", nn(r.activeKilocalories));
      put(d, "modMin", nn(r.moderateIntensityMinutes)); put(d, "vigMin", nn(r.vigorousIntensityMinutes));
      put(d, "floors", r.floorsAscendedInMeters != null ? round(nn(r.floorsAscendedInMeters) / 3.048, 0) : null);
      put(d, "minHr", pos(r.minHeartRate)); put(d, "maxHr", pos(r.maxHeartRate)); put(d, "rhr", pos(r.restingHeartRate));
      var agg = (r.allDayStress && r.allDayStress.aggregatorList) || [];
      agg.forEach(function (a) {
        var t = String(a.type || "").toUpperCase();
        if (t === "TOTAL") { put(d, "stressAvg", nn(a.averageStressLevel)); put(d, "stressMax", nn(a.maxStressLevel)); put(d, "stressHighSec", nn(a.highDuration)); put(d, "stressMedSec", nn(a.mediumDuration)); put(d, "stressLowSec", nn(a.lowDuration)); put(d, "stressRestSec", nn(a.restDuration)); }
        else if (t === "ASLEEP") put(d, "sleepStress", nn(a.averageStressLevel));
        else if (t === "AWAKE") put(d, "awakeStress", nn(a.averageStressLevel));
      });
      if (d.stressAvg === undefined && r.totalAverageStressLevel != null) put(d, "stressAvg", nn(r.totalAverageStressLevel));
      var bb = r.bodyBattery;
      if (bb) {
        arr(bb.bodyBatteryStatList).forEach(function (s) { var t = s.bodyBatteryStatType, v = nn(s.statsValue); if (t === "HIGHEST") put(d, "bbHigh", v); else if (t === "LOWEST") put(d, "bbLow", v); else if (t === "ENDOFDAY") put(d, "bbEnd", v); });
        put(d, "bbCharged", nn(bb.chargedValue)); put(d, "bbDrained", nn(bb.drainedValue));
      } else { put(d, "bbHigh", nn(r.maxBodyBattery)); put(d, "bbLow", nn(r.minBodyBattery)); }
      put(d, "spo2Avg", pos(r.averageSpo2Value)); put(d, "spo2Low", pos(r.lowestSpo2Value));
      var rs = r.respiration || {};
      put(d, "respAvg", pos(r.avgWakingRespirationValue != null ? r.avgWakingRespirationValue : rs.avgWakingRespirationValue));
      put(d, "respLow", pos(r.lowestRespirationValue != null ? r.lowestRespirationValue : rs.lowestRespirationValue)); put(d, "respHigh", pos(r.highestRespirationValue != null ? r.highestRespirationValue : rs.highestRespirationValue));
      var g = D.parse(r.wellnessStartTimeGmt), l = D.parse(r.wellnessStartTimeLocal);
      if (g && l) { var off = Math.round((l.ms - g.ms) / 60000); if (Math.abs(off) <= 14 * 60 && off % 15 === 0) d.tzOffsetMin = off; }
      days.push(d);
    });
    return { days: days, activities: [], warnings: warnings };
  }

  /* ---------- sleepData ---------- */
  function sleepScore(s) {
    if (!s) return null;
    if (s.overallScore != null) return pos(s.overallScore);
    if (s.overall && typeof s.overall === "object") return pos(s.overall.value);
    if (s.overall != null) return pos(s.overall);
    return null;
  }
  function parseSleep(data) {
    var byDate = {}, warnings1 = [];
    arr(data).forEach(function (r0) {
      if (!r0 || typeof r0 !== "object") return;
      // some exports wrap the night as {dailySleepDTO: {...}, avgOvernightHrv, ...}: read the inner record, keep the outer extras
      var r = r0.dailySleepDTO && typeof r0.dailySleepDTO === "object" ? Object.assign({}, r0, r0.dailySleepDTO) : r0;
      var date = D.dayKey(r.calendarDate) || D.dayKey(r.calendarDate && r.calendarDate.date) || (r.sleepEndTimestampGMT ? D.dayKey(r.sleepEndTimestampGMT) : null); if (!date) return;
      var d = { date: date };
      var st = D.instant(r.sleepStartTimestampGMT), en = D.instant(r.sleepEndTimestampGMT);
      var stL = D.instant(r.sleepStartTimestampLocal), enL = D.instant(r.sleepEndTimestampLocal);
      put(d, "sleepStart", st); put(d, "sleepEnd", en);
      if (st !== null && stL !== null) d.sleepTzOffsetMin = Math.round((stL - st) / 60000);
      var deep = nn(r.deepSleepSeconds), light = nn(r.lightSleepSeconds), rem = nn(r.remSleepSeconds), awake = nn(r.awakeSleepSeconds);
      if (Math.max(deep || 0, light || 0, rem || 0, awake || 0) > 86400) { // a stage longer than 24 h in "seconds": the file is probably in milliseconds
        var big = [deep, light, rem, awake].map(function (x) { return x === null ? null : x / 1000; });
        if (Math.max.apply(null, big.map(function (x) { return x || 0; })) <= 86400) { deep = big[0]; light = big[1]; rem = big[2]; awake = big[3]; warnings1.push("Sleep stage durations looked like milliseconds; converted to seconds."); }
      }
      var confirmed = String(r.sleepWindowConfirmationType || "").toUpperCase() !== "UNCONFIRMED" && (deep !== null || light !== null || rem !== null);
      if (confirmed) {
        put(d, "deepSec", deep); put(d, "lightSec", light); put(d, "remSec", rem); put(d, "awakeSec", awake);
        d.sleepSec = (deep || 0) + (light || 0) + (rem || 0);
      } else d.sleepUnconfirmed = true;
      var sc = r.sleepScores || {};
      put(d, "sleepScore", sleepScore(sc)); put(d, "sleepScoreDuration", pos(sc.durationScore)); put(d, "sleepScoreRecovery", pos(sc.recoveryScore)); put(d, "sleepScoreRestful", pos(sc.restfulnessScore)); put(d, "sleepScoreDeep", pos(sc.deepScore)); put(d, "sleepScoreRem", pos(sc.remScore));
      put(d, "hrvSleep", pos(r.avgOvernightHrv != null ? r.avgOvernightHrv : r0.avgOvernightHrv)); put(d, "sleepResp", pos(r.averageRespiration != null ? r.averageRespiration : r.averageRespirationValue)); put(d, "sleepRespLow", pos(r.lowestRespiration)); put(d, "sleepRespHigh", pos(r.highestRespiration));
      put(d, "sleepStress", nn(r.avgSleepStress)); put(d, "awakeCount", nn(r.awakeCount)); put(d, "restless", nn(r.restlessMomentCount));
      var sp = r.spo2SleepSummary || r.spo2Summary || null; if (sp) { put(d, "sleepSpo2", pos(sp.averageSPO2 != null ? sp.averageSPO2 : sp.avg != null ? sp.avg : sp.averageSpO2)); put(d, "sleepSpo2Low", pos(sp.lowestSPO2 != null ? sp.lowestSPO2 : sp.lowest)); }
      if (typeof sc.feedback === "string") d.sleepFeedback = sc.feedback;
      var prev = byDate[date];
      if (!prev || (d.sleepSec || 0) > (prev.sleepSec || 0)) byDate[date] = d; // several sessions per date (naps): keep the longest as the night
    });
    return { days: Object.keys(byDate).map(function (k) { return byDate[k]; }), activities: [], warnings: warnings1 };
  }

  /* ---------- healthStatusData (HRV etc.) ---------- */
  function parseHealthStatus(data) {
    var days = [];
    arr(data).forEach(function (r) {
      var date = D.dayKey(r && r.calendarDate); if (!date) return;
      var d = { date: date }, m = {};
      arr(r.metrics).forEach(function (x) { if (x && x.type) m[String(x.type).toUpperCase()] = x; });
      if (m.HRV) { put(d, "hrv", pos(m.HRV.value)); put(d, "hrvLow", pos(m.HRV.baselineLowerLimit)); put(d, "hrvHigh", pos(m.HRV.baselineUpperLimit)); if (typeof m.HRV.status === "string") d.hrvStatus = m.HRV.status; }
      if (m.HR) put(d, "hsRhr", pos(m.HR.value));
      if (m.SPO2) put(d, "hsSpo2", pos(m.SPO2.value));
      if (m.SKIN_TEMP_C) put(d, "skinTemp", num(m.SKIN_TEMP_C.value));
      if (m.RESPIRATION) put(d, "hsResp", pos(m.RESPIRATION.value));
      if (Object.keys(d).length > 1) days.push(d);
    });
    return { days: days, activities: [], warnings: [] };
  }

  /* ---------- Metrics folder ---------- */
  function lastPerDay(list, tsKey) { var by = {}; list.forEach(function (x) { var p = by[x.date]; if (!p || (x._ts || 0) >= (p._ts || 0)) by[x.date] = x; }); return Object.keys(by).map(function (k) { var o = by[k]; delete o._ts; return o; }); }
  function parseReadiness(data) {
    var list = [];
    arr(data).forEach(function (r) {
      var date = D.dayKey(r && r.calendarDate); if (!date) return;
      var d = { date: date, _ts: D.instant(r.timestamp) || 0 };
      put(d, "readiness", nn(r.score)); if (typeof r.level === "string") d.readinessLevel = r.level;
      put(d, "readinessRecoveryMin", nn(r.recoveryTime)); put(d, "garminAcuteLoad", nn(r.acuteLoad)); put(d, "readinessHrvPct", nn(r.hrvFactorPercent)); put(d, "readinessSleepPct", nn(r.sleepScoreFactorPercent)); put(d, "hrvWeeklyAvg", pos(r.hrvWeeklyAverage));
      if (typeof r.feedbackShort === "string") d.readinessFeedback = r.feedbackShort;
      list.push(d);
    });
    return { days: lastPerDay(list), activities: [], warnings: [] };
  }
  function parseLoad(data) {
    var list = [];
    arr(data).forEach(function (r) {
      var date = D.dayKey(r && r.calendarDate); if (!date) return; var d = { date: date, _ts: typeof r.timestamp === "number" ? r.timestamp : 0 };
      put(d, "garminAcute", nn(r.dailyTrainingLoadAcute)); put(d, "garminChronic", nn(r.dailyTrainingLoadChronic)); put(d, "garminAcwr", nn(r.dailyAcuteChronicWorkloadRatio)); if (typeof r.acwrStatus === "string") d.garminAcwrStatus = r.acwrStatus;
      list.push(d);
    });
    return { days: lastPerDay(list), activities: [], warnings: [] };
  }
  function parseVo2(data) {
    var days = [];
    arr(data).forEach(function (r) {
      var date = D.dayKey(r && r.calendarDate); if (!date) return; var d = { date: date }, sport = String(r.sport || "").toUpperCase();
      var v = pos(r.vo2MaxValue); if (v === null) return;
      if (sport.indexOf("CYCL") >= 0) d.vo2maxCycling = v; else d.vo2max = v;
      days.push(d);
    });
    return { days: days, activities: [], warnings: [] };
  }
  function parseMaxMet(data) {
    var days = [];
    arr(data).forEach(function (r) {
      var date = D.dayKey(r && r.calendarDate); if (!date) return; var d = { date: date };
      put(d, "maxMet", pos(r.maxMet)); put(d, "fitnessAge", pos(r.fitnessAge)); put(d, "vo2maxMetDerived", r.maxMet ? round(pos(r.maxMet) * 3.5, 1) : null);
      if (Object.keys(d).length > 1) days.push(d);
    });
    return { days: days, activities: [], warnings: ["MetricsMaxMetData: VO2max derived as maxMet × 3.5 (unverified assumption)"] };
  }
  function parseBio(data) {
    var days = [];
    arr(data).forEach(function (r) {
      var date = D.dayKey(r && r.metaData && r.metaData.calendarDate); if (!date) return; var d = { date: date };
      var w = r.weight && num(r.weight.weight); if (w) d.weightKg = round(w / 1000, 1);
      var lt = r.lactateThreshold; if (lt && pos(lt.heartRate)) d.lthr = pos(lt.heartRate);
      if (Object.keys(d).length > 1) days.push(d);
    });
    return { days: days, activities: [], warnings: [] };
  }

  /* ---------- summarizedActivities ---------- */
  function msOf(v) { v = num(v); return v === null ? null : (v < 1e11 ? v * 1000 : v); }
  // activityType is a string in most exports, but an object ({typeId, typeKey, parentTypeId}) in some
  function typeKeyOf(t) { if (t && typeof t === "object") t = t.typeKey || t.key || t.name; return typeof t === "string" && t ? t.toLowerCase() : ""; }
  function parseSummarized(data) {
    var acts = [], warnings = [];
    var items = [];
    arr(data).forEach(function (w) { if (w && Array.isArray(w.summarizedActivitiesExport)) items = items.concat(w.summarizedActivitiesExport); else if (w && w.activityId !== undefined) items.push(w); });
    items.forEach(function (a) {
      var st = msOf(a.startTimeGmt != null ? a.startTimeGmt : a.beginTimestamp); if (st === null) return;
      var stl = msOf(a.startTimeLocal);
      var out = { id: "g" + (a.activityId != null ? a.activityId : st), source: "summary", name: typeof a.name === "string" ? a.name : "", type: typeKeyOf(a.activityType) || typeKeyOf(a.sportType) || "other", start: st };
      if (stl !== null) out.tzOffsetMin = Math.round((stl - st) / 60000);
      out.date = D.keyShifted(st, out.tzOffsetMin || 0);
      var dur = pos(a.duration != null ? a.duration : a.elapsedDuration); if (dur) out.durationSec = Math.round(dur / 10) / 100; // ms -> s
      var mov = pos(a.movingDuration); if (mov) out.movingSec = Math.round(mov / 10) / 100;
      var dist = pos(a.distance); if (dist) out.distanceM = Math.round(dist) / 100;     // cm -> m
      put(out, "avgHr", pos(a.avgHr)); put(out, "maxHr", pos(a.maxHr)); put(out, "minHr", pos(a.minHr)); put(out, "calories", pos(a.calories));
      var asc = pos(a.elevationGain); if (asc) out.ascentM = Math.round(asc) / 100;
      put(out, "steps", pos(a.steps)); put(out, "te", pos(a.aerobicTrainingEffect)); put(out, "ante", pos(a.anaerobicTrainingEffect));
      put(out, "avgPower", pos(a.avgPower)); put(out, "normPower", pos(a.normPower)); put(out, "vo2max", pos(a.vO2MaxValue)); put(out, "garminLoad", pos(a.activityTrainingLoad));
      var z = [1, 2, 3, 4, 5].map(function (i) { return nn(a["hrTimeInZone_" + i]); });
      if (z.every(function (x) { return x !== null; })) { // unit unverified: ms in the samples I saw -> accept only if it is consistent with the duration
        var tot = S.sum(z), ds = out.durationSec || 0;
        if (ds && tot / 1000 <= ds * 1.05 && tot / 1000 >= ds * 0.05) out.zoneSec = z.map(function (x) { return Math.round(x / 1000); });
        else if (ds && tot <= ds * 1.05 && tot >= ds * 0.05) out.zoneSec = z.map(Math.round);
      }
      acts.push(out);
    });
    return { days: [], activities: acts, warnings: warnings };
  }

  /* ---------- FIT activity files ---------- */
  var STEP_S = 5;
  function bestEfforts(t, d) { // t seconds (ascending), d metres (cumulative); fastest time over standard distances
    var targets = { "1km": 1000, "1mi": 1609.344, "5km": 5000, "10km": 10000, "21.1km": 21097.5 }, out = {};
    var n = t.length; if (n < 2) return out;
    Object.keys(targets).forEach(function (k) {
      var tgt = targets[k], best = Infinity, j = 0;
      if (d[n - 1] - d[0] < tgt) return;
      for (var i = 0; i < n; i++) {
        while (j < n && d[j] - d[i] < tgt) j++;
        if (j >= n) break;
        // interpolate the exact time at which distance d[i]+tgt is reached
        var f = d[j] === d[j - 1] ? 0 : (d[i] + tgt - d[j - 1]) / (d[j] - d[j - 1]); var tj = t[j - 1] + f * (t[j] - t[j - 1]);
        if (j - 1 < i) tj = t[j];
        var el = tj - t[i]; if (el > 0 && el < best) best = el;
      }
      if (best < Infinity) out[k] = Math.round(best * 10) / 10;
    });
    return out;
  }
  function buildSeries(recs) {
    var pts = recs.filter(function (r) { return r.timestamp != null; });
    if (pts.length < 2) return null;
    var t0 = pts[0].timestamp, n = Math.floor((pts[pts.length - 1].timestamp - t0) / (STEP_S * 1000)) + 1;
    if (n < 2 || n > 20000) return null;
    var hr = new Array(n), spd = new Array(n), alt = new Array(n), dist = new Array(n), pwr = new Array(n), cad = new Array(n), cnt = new Array(n), i;
    for (i = 0; i < n; i++) { hr[i] = 0; spd[i] = 0; alt[i] = 0; dist[i] = null; pwr[i] = 0; cad[i] = 0; cnt[i] = { h: 0, s: 0, a: 0, p: 0, c: 0 }; }
    pts.forEach(function (r) {
      var k = Math.floor((r.timestamp - t0) / (STEP_S * 1000)), c = cnt[k];
      if (ok(r.heart_rate) && r.heart_rate > 20 && r.heart_rate < 250) { hr[k] += r.heart_rate; c.h++; }
      var sp = r.enhanced_speed != null ? r.enhanced_speed : r.speed; if (ok(sp)) { spd[k] += sp; c.s++; }
      var al = r.enhanced_altitude != null ? r.enhanced_altitude : r.altitude; if (ok(al)) { alt[k] += al; c.a++; }
      if (ok(r.power)) { pwr[k] += r.power; c.p++; }
      if (ok(r.cadence)) { cad[k] += r.cadence; c.c++; }
      if (ok(r.distance)) dist[k] = r.distance;
    });
    var last = null;
    for (i = 0; i < n; i++) {
      var c = cnt[i];
      hr[i] = c.h ? Math.round(hr[i] / c.h) : 0; spd[i] = c.s ? Math.round(spd[i] / c.s * 1000) / 1000 : 0; alt[i] = c.a ? Math.round(alt[i] / c.a * 10) / 10 : null; pwr[i] = c.p ? Math.round(pwr[i] / c.p) : 0; cad[i] = c.c ? Math.round(cad[i] / c.c) : 0;
      if (dist[i] !== null) last = dist[i]; else dist[i] = last; // carry the cumulative distance forward
    }
    var hasDist = dist.some(function (x) { return x !== null; });
    return { step: STEP_S, t0: t0, hr: hr, spd: spd, alt: alt.map(function (x) { return x === null ? 0 : x; }), dist: hasDist ? dist.map(function (x) { return x === null ? 0 : Math.round(x * 10) / 10; }) : null, pwr: pwr.some(Boolean) ? pwr : null, cad: cad.some(Boolean) ? cad : null };
  }
  function fitToActivity(r, nameHint) {
    var ses = (r.messages.session || [])[0], act = (r.messages.activity || [])[0], recs = r.messages.record || [], warnings = [];
    if (r.fileType && r.fileType !== "activity") return null;
    var start = ses && ses.start_time != null ? ses.start_time : (recs.find(function (x) { return x.timestamp != null; }) || {}).timestamp;
    if (!start) return { skipped: "no real clock time in this FIT file (device 'system time')" };
    var out = { id: "f" + start, source: "fit", name: nameHint || "", start: start };
    var tz = null; if (act && act.local_timestamp != null && act.timestamp != null) { var tzm = Math.round(((act.local_timestamp + 631065600) * 1000 - act.timestamp) / 60000); if (Math.abs(tzm) <= 14 * 60) tz = tzm; }
    if (tz !== null) out.tzOffsetMin = tz;
    out.date = D.keyShifted(start, tz || 0);
    var sport = ses ? fitSportName(ses.sport, ses.sub_sport) : "other"; out.type = sport;
    if (ses) {
      put(out, "durationSec", pos(ses.total_elapsed_time)); put(out, "movingSec", pos(ses.total_timer_time)); put(out, "distanceM", pos(ses.total_distance));
      put(out, "avgHr", pos(ses.avg_heart_rate)); put(out, "maxHr", pos(ses.max_heart_rate)); put(out, "minHr", pos(ses.min_heart_rate)); put(out, "calories", pos(ses.total_calories)); put(out, "ascentM", pos(ses.total_ascent));
      put(out, "te", pos(ses.total_training_effect)); put(out, "ante", pos(ses.anaerobic_training_effect)); put(out, "avgPower", pos(ses.avg_power)); put(out, "normPower", pos(ses.normalized_power)); put(out, "tss", pos(ses.training_stress_score));
    }
    var series = buildSeries(recs);
    if (series) {
      out.series = series;
      if (!out.durationSec) out.durationSec = (series.hr.length - 1) * STEP_S;
      var g = sportGroup(sport);
      if ((g === "run" || g === "bike" || g === "walk") && series.dist) { // best efforts from the raw 1 Hz records
        var tt = [], dd = []; recs.forEach(function (x) { if (x.timestamp != null && ok(x.distance)) { tt.push((x.timestamp - start) / 1000); dd.push(x.distance); } });
        var be = bestEfforts(tt, dd); if (Object.keys(be).length) out.best = be;
      }
    }
    var hrv = r.messages.hrv; if (hrv && hrv.length) { var rr = []; hrv.forEach(function (m) { arr(m.time).forEach(function (x) { if (ok(x) && x > 0.25 && x < 2.5) rr.push(x); }); }); if (rr.length > 30) out.rrCount = rr.length; }
    if (r.truncated) warnings.push("FIT file is truncated; used what could be read");
    if (!r.crcOk) warnings.push("FIT file CRC mismatch; data may be damaged");
    return { activity: out, warnings: warnings };
  }
  function parseFit(bytes, name) {
    var pk = FIT.peek(bytes);
    if (pk.fileType && pk.fileType !== "activity") return { kind: "fit-other", days: [], activities: [], warnings: [], fileType: pk.fileType };
    var r = FIT.parse(bytes, { only: ["file_id", "session", "record", "activity", "hrv"] });
    var a = fitToActivity(r, name);
    if (!a) return { kind: "fit-other", days: [], activities: [], warnings: [], fileType: r.fileType };
    if (a.skipped) return { kind: "fit-activity", days: [], activities: [], warnings: [a.skipped] };
    return { kind: "fit-activity", days: [], activities: [a.activity], warnings: a.warnings };
  }

  /* ---------- tiny XML helpers for TCX / GPX (regex based; these files are machine-written) ---------- */
  function tag(s, name) { var m = new RegExp("<(?:[\\w-]+:)?" + name + "(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?" + name + ">", "i").exec(s); return m ? m[1].trim() : null; }
  function attr(s, name) { var m = new RegExp("\\b" + name + "=\"([^\"]*)\"", "i").exec(s); return m ? m[1] : null; }
  function haversine(a, b) { var R = 6371000, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r, x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function pointsToActivity(pts, sportRaw, nameHint, id) {
    pts = pts.filter(function (p) { return p.timestamp != null; }).sort(function (a, b) { return a.timestamp - b.timestamp; });
    if (pts.length < 2) return null;
    var cum = 0, prev = null;
    pts.forEach(function (p) { if (p.distance == null && p.ll) { if (prev && prev.ll) cum += haversine(prev.ll, p.ll); p.distance = cum; } if (p.distance != null) cum = p.distance; prev = p; });
    var recs = pts.map(function (p) { return { timestamp: p.timestamp, heart_rate: p.hr, altitude: p.alt, distance: p.distance, speed: p.speed }; });
    // speed from distance when missing
    recs.forEach(function (r, i) { if (r.speed == null && i > 0 && r.distance != null && recs[i - 1].distance != null) { var dt = (r.timestamp - recs[i - 1].timestamp) / 1000; if (dt > 0 && dt < 30) r.speed = (r.distance - recs[i - 1].distance) / dt; } });
    var sport = String(sportRaw || "other").toLowerCase(); sport = /run/.test(sport) ? "running" : /bik|cycl/.test(sport) ? "cycling" : /walk/.test(sport) ? "walking" : /hik/.test(sport) ? "hiking" : /swim/.test(sport) ? "swimming" : sport === "other" || sport === "" ? "other" : sport;
    var start = pts[0].timestamp, hrs = pts.map(function (p) { return p.hr; }).filter(function (x) { return x != null; });
    var out = { id: id || "f" + start, source: "file", name: nameHint || "", start: start, type: sport, date: D.keyUTC(start), durationSec: Math.round((pts[pts.length - 1].timestamp - start) / 1000) };
    var d = pts[pts.length - 1].distance; if (d > 0) out.distanceM = Math.round(d * 100) / 100;
    if (hrs.length) { out.avgHr = Math.round(S.mean(hrs)); out.maxHr = S.max(hrs); }
    var ascent = 0; for (var i = 1; i < pts.length; i++) if (pts[i].alt != null && pts[i - 1].alt != null && pts[i].alt - pts[i - 1].alt > 0.5) ascent += pts[i].alt - pts[i - 1].alt; if (ascent > 0) out.ascentM = Math.round(ascent);
    out.series = buildSeries(recs);
    if (out.series && out.series.dist && /running|cycling|walking/.test(sport)) { var tt = [], dd = []; recs.forEach(function (r) { if (r.distance != null) { tt.push((r.timestamp - start) / 1000); dd.push(r.distance); } }); var be = bestEfforts(tt, dd); if (Object.keys(be).length) out.best = be; }
    return out;
  }
  function parseTcx(text, name) {
    var warnings = [], acts = [];
    var actRe = /<Activity\b([^>]*)>([\s\S]*?)<\/Activity>/gi, m;
    while ((m = actRe.exec(text))) {
      var sport = attr(m[1], "Sport"), body = m[2], pts = [], tpRe = /<Trackpoint\b[^>]*>([\s\S]*?)<\/Trackpoint>/gi, t;
      while ((t = tpRe.exec(body))) {
        var b = t[1], time = tag(b, "Time"), ts = time ? D.instant(time) : null;
        var hrm = /<HeartRateBpm[^>]*>\s*<Value>([^<]*)<\/Value>/i.exec(b);
        var dist = tag(b, "DistanceMeters"), alt = tag(b, "AltitudeMeters"), spd = tag(b, "Speed");
        pts.push({ timestamp: ts, hr: hrm ? num(hrm[1]) : null, distance: dist !== null ? num(dist) : null, alt: alt !== null ? num(alt) : null, speed: spd !== null ? num(spd) : null });
      }
      var a = pointsToActivity(pts, sport, name); if (a) acts.push(a);
    }
    if (!acts.length) warnings.push("No activity with timed trackpoints found in TCX");
    return { kind: "tcx", days: [], activities: acts, warnings: warnings };
  }
  function parseGpx(text, name) {
    var pts = [], m, re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;
    while ((m = re.exec(text))) {
      var lat = num(attr(m[1], "lat")), lon = num(attr(m[1], "lon")), b = m[2], time = tag(b, "time"), hr = tag(b, "hr"), ele = tag(b, "ele");
      pts.push({ timestamp: time ? D.instant(time) : null, hr: hr !== null ? num(hr) : null, alt: ele !== null ? num(ele) : null, ll: lat !== null && lon !== null ? [lat, lon] : null });
    }
    var type = tag(text, "type"), a = pointsToActivity(pts, type, name);
    return { kind: "gpx", days: [], activities: a ? [a] : [], warnings: a ? [] : ["No timed track points found in GPX"] };
  }

  /* ---------- CSV ---------- */
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], cur = "", q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function hms(s) { var m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/.exec(String(s).trim()); return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) : null; }
  function norm(h) { return String(h).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  // Garmin Connect "Activities" list CSV. Header names vary by language / account (only English handled; matching is loose). Distance unit follows the account setting, which the file does not say -> opts.distanceUnit.
  function parseActivitiesCsv(rows, opts) {
    var head = rows[0].map(norm), idx = function (names) { for (var i = 0; i < names.length; i++) { var k = head.indexOf(names[i]); if (k >= 0) return k; } return -1; };
    var iType = idx(["activity type"]), iDate = idx(["date"]), iTitle = idx(["title"]), iDist = idx(["distance"]), iTime = idx(["time", "elapsed time"]), iAvg = idx(["avg hr", "average hr"]), iMax = idx(["max hr"]), iCal = idx(["calories"]), iAsc = idx(["total ascent"]);
    var unit = (opts && opts.distanceUnit) || "km", f = unit === "mi" ? 1609.344 : 1000, acts = [], warnings = [];
    if (iDate < 0 || iType < 0) return { kind: "csv-activities", days: [], activities: [], warnings: ["Activities CSV: could not find 'Activity Type' and 'Date' columns (English headers only)"] };
    rows.slice(1).forEach(function (r) {
      var dt = D.parse((r[iDate] || "").trim()); if (!dt) return;
      var dur = iTime >= 0 ? hms(r[iTime]) : null;
      var a = { id: "c" + dt.ms + "-" + norm(r[iType] || "").replace(/ /g, "_"), source: "csv", name: iTitle >= 0 ? r[iTitle] : "", type: norm(r[iType] || "other").replace(/ /g, "_"), start: dt.ms, date: D.keyUTC(dt.ms) }; // start is LOCAL wall time here (no zone in the CSV)
      a.localOnly = true;
      if (dur) a.durationSec = dur;
      var dist = iDist >= 0 ? num((r[iDist] || "").replace(/,/g, "")) : null; if (dist) a.distanceM = Math.round(dist * f);
      var ah = iAvg >= 0 ? pos(r[iAvg]) : null, mh = iMax >= 0 ? pos(r[iMax]) : null, cal = iCal >= 0 ? pos((r[iCal] || "").replace(/,/g, "")) : null, asc = iAsc >= 0 ? pos((r[iAsc] || "").replace(/,/g, "")) : null;
      put(a, "avgHr", ah); put(a, "maxHr", mh); put(a, "calories", cal); put(a, "ascentM", asc);
      acts.push(a);
    });
    if (iDist >= 0) warnings.push("Activities CSV: distances read as " + unit + " (the file does not say which unit your account uses)");
    warnings.push("Activities CSV has no time zone: start times are treated as already local");
    return { kind: "csv-activities", days: [], activities: acts, warnings: warnings };
  }
  // generic per-day CSV (first column a date). Column names are matched loosely against these aliases.
  var DAY_ALIASES = {
    rhr: ["rhr", "resting hr", "resting heart rate", "resting"], hrv: ["hrv", "hrv ms", "overnight hrv", "rmssd"], sleepHours: ["sleep hours", "sleep h", "sleep"], sleepScore: ["sleep score"], steps: ["steps"], stressAvg: ["stress", "avg stress", "stress avg", "average stress"],
    bbHigh: ["body battery high", "body battery max", "bb high"], bbLow: ["body battery low", "body battery min", "bb low"], respAvg: ["respiration", "resp", "resp avg", "respiration rate"], spo2Avg: ["spo2", "spo2 avg", "pulse ox"], weightKg: ["weight", "weight kg"], vo2max: ["vo2max", "vo2 max"], skinTemp: ["skin temp", "skin temperature"], readiness: ["training readiness", "readiness"]
  };
  function parseDaysCsv(rows) {
    var head = rows[0].map(norm), map = {}, di = head.findIndex(function (h) { return h === "date" || h === "day" || h === "calendar date" || h === "calendardate"; });
    if (di < 0) return null;
    Object.keys(DAY_ALIASES).forEach(function (k) { for (var i = 0; i < head.length; i++) if (DAY_ALIASES[k].indexOf(head[i]) >= 0) { map[k] = i; break; } });
    if (!Object.keys(map).length) return null;
    var days = [];
    rows.slice(1).forEach(function (r) {
      var date = D.dayKey((r[di] || "").trim()); if (!date) return; var d = { date: date };
      Object.keys(map).forEach(function (k) { var v = num((r[map[k]] || "").replace(",", ".")); if (v === null) return; if (k === "sleepHours") { d.sleepSec = Math.round(v * 3600); } else d[k] = v; });
      if (Object.keys(d).length > 1) days.push(d);
    });
    return { kind: "csv-days", days: days, activities: [], warnings: [] };
  }

  /* ---------- Garmin Lens bundle (own format; written by the app's JSON export and by tools/garmin_dump.py) ---------- */
  function parseBundle(data) {
    if (!data || data.format !== "garmin-lens-bundle") throw new Error("Not a Garmin Lens bundle");
    var days = arr(data.days).filter(function (d) { return d && D.isKey(d.date); });
    var acts = arr(data.activities).filter(function (a) { return a && a.id && a.start; });
    return { kind: "bundle", days: days, activities: acts, annotations: arr(data.annotations), goals: data.goals || null, warnings: [], demo: !!data.demo };
  }

  /* ---------- routing ---------- */
  function sniffJson(data) {
    var first = Array.isArray(data) ? data[0] : data; if (!first || typeof first !== "object") return null;
    if (first.format === "garmin-lens-bundle") return "bundle";
    if (first.summarizedActivitiesExport) return "activities";
    if (first.sleepStartTimestampGMT || first.deepSleepSeconds !== undefined) return "sleep";
    if (first.wellnessStartTimeGmt || first.totalSteps !== undefined || first.allDayStress) return "uds";
    if (Array.isArray(first.metrics) && first.calendarDate) return "healthStatus";
    if (first.hrvFactorPercent !== undefined || first.level !== undefined && first.score !== undefined) return "readiness";
    if (first.dailyTrainingLoadAcute !== undefined) return "load";
    if (first.vo2MaxValue !== undefined && first.sport) return "vo2max";
    if (first.maxMet !== undefined) return "maxmet";
    if (first.metaData && (first.weight || first.lactateThreshold)) return "bio";
    return null;
  }
  function classify(name) {
    var n = String(name).replace(/\\/g, "/"), base = n.split("/").pop(), lb = base.toLowerCase();
    if (/udsfile_.*\.json$/i.test(base)) return "uds";
    if (/sleepdata\.json$/i.test(base)) return "sleep";
    if (/healthstatusdata\.json$/i.test(base)) return "healthStatus";
    if (/summarizedactivities\.json$/i.test(base)) return "activities";
    if (/trainingreadiness.*\.json$/i.test(base)) return "readiness";
    if (/metricsacutetrainingload.*\.json$/i.test(base)) return "load";
    if (/activityvo2max.*\.json$/i.test(base)) return "vo2max";
    if (/metricsmaxmetdata.*\.json$/i.test(base)) return "maxmet";
    if (/userbiometrics\.json$/i.test(base)) return "bio";
    if (/garmin-lens-bundle.*\.json$/i.test(base)) return "bundle";
    if (/\.fit$/i.test(lb)) return "fit";
    if (/\.tcx$/i.test(lb)) return "tcx";
    if (/\.gpx$/i.test(lb)) return "gpx";
    if (/\.csv$/i.test(lb)) return "csv";
    if (/\.json$/i.test(lb)) return "json";
    if (/\.zip$/i.test(lb)) return "zip";
    return "other";
  }
  /* ---------- unit / plausibility sanity checks ---------- */
  var DAY_RANGE = { steps: [0, 100000], stepGoal: [100, 100000], distanceM: [0, 300000], kcalTotal: [500, 15000], kcalActive: [0, 12000], modMin: [0, 1440], vigMin: [0, 1440], minHr: [20, 200], maxHr: [60, 250], rhr: [25, 130], hsRhr: [25, 130],
    stressAvg: [0, 100], stressMax: [0, 100], sleepStress: [0, 100], awakeStress: [0, 100], bbHigh: [0, 100], bbLow: [0, 100], bbEnd: [0, 100], spo2Avg: [50, 100], spo2Low: [50, 100], sleepSpo2: [50, 100], sleepSpo2Low: [50, 100], hsSpo2: [50, 100],
    respAvg: [3, 60], respLow: [3, 60], respHigh: [3, 60], sleepResp: [3, 60], sleepRespLow: [3, 60], sleepRespHigh: [3, 60], hsResp: [3, 60], hrv: [5, 300], hrvSleep: [5, 300], hrvWeeklyAvg: [5, 300], hrvLow: [5, 300], hrvHigh: [5, 300],
    sleepSec: [0, 86400], deepSec: [0, 86400], lightSec: [0, 86400], remSec: [0, 86400], awakeSec: [0, 86400], sleepScore: [0, 100], readiness: [0, 100], weightKg: [20, 400], lthr: [80, 220], vo2max: [10, 95], skinTemp: [-15, 45] };
  var ACT_RANGE = { durationSec: [1, 7 * 86400], movingSec: [1, 7 * 86400], distanceM: [0, 1.5e6], avgHr: [30, 230], maxHr: [40, 250], minHr: [20, 230], calories: [0, 30000], vo2max: [10, 95] };
  function sanitize(r) { // drops values that cannot be right (wrong unit, corrupt field) instead of letting them skew every chart
    var bad = {}, n = 0;
    function clean(o, R) { Object.keys(R).forEach(function (k) { var v = o[k]; if (typeof v === "number" && (v < R[k][0] || v > R[k][1])) { delete o[k]; bad[k] = (bad[k] || 0) + 1; n++; } }); }
    (r.days || []).forEach(function (d) { clean(d, DAY_RANGE); });
    (r.activities || []).forEach(function (a) { clean(a, ACT_RANGE); });
    if (n) { r.warnings = (r.warnings || []).concat(["Ignored " + n + " value(s) outside a plausible range (" + Object.keys(bad).slice(0, 6).join(", ") + "). The file may use different units than expected."]); r.sanityDropped = n; }
    return r;
  }
  var JSON_PARSERS = { uds: parseUds, sleep: parseSleep, healthStatus: parseHealthStatus, activities: parseSummarized, readiness: parseReadiness, load: parseLoad, vo2max: parseVo2, maxmet: parseMaxMet, bio: parseBio, bundle: parseBundle };
  // file = {name, text?, bytes?}; kindHint from classify()
  function parseFile(file, opts) {
    var kind = file.kind || classify(file.name);
    if (kind === "fit") return parseFit(file.bytes, file.name.split("/").pop().replace(/\.fit$/i, ""));
    var text = file.text !== undefined ? file.text : new TextDecoder("utf-8").decode(file.bytes);
    if (kind === "tcx") return parseTcx(text, file.name.split("/").pop().replace(/\.tcx$/i, ""));
    if (kind === "gpx") return parseGpx(text, file.name.split("/").pop().replace(/\.gpx$/i, ""));
    if (kind === "csv") {
      var rows = parseCsv(text); if (rows.length < 2) return { kind: "csv", days: [], activities: [], warnings: ["Empty CSV"] };
      var byDays = parseDaysCsv(rows); if (byDays) return byDays;
      return parseActivitiesCsv(rows, opts);
    }
    if (kind === "json" || JSON_PARSERS[kind]) {
      var data = tryJson(text);
      if (kind === "json" || !JSON_PARSERS[kind]) { kind = sniffJson(data); if (!kind) return { kind: "json-unknown", days: [], activities: [], warnings: ["JSON file not recognised as a Garmin export file"] }; }
      else if (kind !== "bundle" && sniffJson(data) === "bundle") kind = "bundle";
      var r = JSON_PARSERS[kind](data); r.kind = kind; return kind === "bundle" ? r : sanitize(r);
    }
    return { kind: "other", days: [], activities: [], warnings: [] };
  }
  // Folders of the export that hold account / personal-service data, not health data. Their JSON is never read.
  var SKIP_TOKENS = { account: 1, accounts: 1, customer: 1, user: 1, users: 1, social: 1, payment: 1, payments: 1, content: 1, device: 1, devices: 1, golf: 1 };
  function isSkippedFolder(name) {
    var segs = String(name).replace(/\\/g, "/").split("/"); segs.pop(); // folders only, not the file name
    return segs.some(function (sg) { return sg.toLowerCase().split(/[^a-z]+/).some(function (t) { return SKIP_TOKENS[t]; }); });
  }
  return { parseFile: parseFile, isSkippedFolder: isSkippedFolder, sanitize: sanitize, typeKeyOf: typeKeyOf, classify: classify, sniffJson: sniffJson, parseUds: parseUds, parseSleep: parseSleep, parseHealthStatus: parseHealthStatus, parseReadiness: parseReadiness, parseLoad: parseLoad, parseSummarized: parseSummarized, parseFit: parseFit, parseTcx: parseTcx, parseGpx: parseGpx, parseCsv: parseCsv, parseActivitiesCsv: parseActivitiesCsv, parseDaysCsv: parseDaysCsv, parseBundle: parseBundle, parseBio: parseBio, parseVo2: parseVo2, parseMaxMet: parseMaxMet, bestEfforts: bestEfforts, buildSeries: buildSeries, sportGroup: sportGroup, STEP_S: STEP_S };
});
