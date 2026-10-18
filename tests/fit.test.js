const { ok, near, eq, throws, done } = require("./harness");
const fs = require("fs"), path = require("path"), F = require("../js/fit.js");
const dir = path.join(__dirname, "fixtures", "real-fit"), rd = f => new Uint8Array(fs.readFileSync(path.join(dir, f)));
const exp = JSON.parse(fs.readFileSync(path.join(dir, "fitparse-expected.json"), "utf8"));
const csvRows = f => { const l = fs.readFileSync(path.join(dir, f), "utf8").trim().split(/\r?\n/); const h = l.shift().split(",").map(s => s.trim()); return l.map(r => Object.fromEntries(r.split(",").map((v, i) => [h[i], v]))); };

// ---- real Garmin Fenix 5 run (python-fitparse test file) vs python-fitparse's own decoding + its CSV dump
{
  const r = F.parse(rd("garmin-fenix-5-run.fit")), e = exp["garmin-fenix-5-run.fit"];
  ok("fenix5 run: CRC ok, not truncated, file type activity", r.crcOk && !r.truncated && r.fileType === "activity", [r.crcOk, r.truncated, r.fileType]);
  eq("fenix5 run: message counts match python-fitparse (record/lap/session/event)", ["record", "lap", "session", "event"].map(k => (r.messages[k] || []).length), ["record", "lap", "session", "event"].map(k => e.counts[k]));
  const csv = csvRows("garmin-fenix-5-run-records.csv"), rec = r.messages.record;
  ok("fenix5 run: 21 records = 21 CSV rows", rec.length === csv.length && csv.length === 21);
  ok("fenix5 run: heart rate of every record = CSV", rec.every((x, i) => x.heart_rate === +csv[i].heart_rate));
  ok("fenix5 run: distance (scale 100) of every record = CSV", rec.every((x, i) => Math.abs(x.distance - +csv[i].distance) < 1e-6), rec.map(x => x.distance).slice(0, 4));
  ok("fenix5 run: speed (scale 1000) = CSV", rec.every((x, i) => Math.abs((x.enhanced_speed ?? x.speed) - +csv[i].speed) < 1e-6));
  ok("fenix5 run: altitude (scale 5, offset 500) = CSV", rec.every((x, i) => Math.abs((x.enhanced_altitude ?? x.altitude) - +csv[i].altitude) < 1e-6), [rec[0].altitude, rec[0].enhanced_altitude, csv[0].altitude]);
  ok("fenix5 run: semicircles -> degrees (CSV lat 456099128 -> 38.2306...)", Math.abs(rec[0].lat - 456099128 * 180 / 2147483648) < 1e-9 && Math.abs(rec[0].lat - 38.2306) < 0.001, rec[0].lat);
  ok("fenix5 run: temperature", rec[0].temperature === +csv[0].temperature);
  // timestamp: CSV says Sun Jun 11 07:34:09 PDT 2017 = 14:34:09Z
  ok("fenix5 run: first record timestamp = 2017-06-11T14:34:09Z", rec[0].timestamp === Date.UTC(2017, 5, 11, 14, 34, 9), new Date(rec[0].timestamp).toISOString());
  const s = r.messages.session[0], es = e.session[0];
  ok("fenix5 run: session fields = python-fitparse (dist, HR avg/max, speed, ascent, sport)", Math.abs(s.total_distance - es.total_distance) < 1e-6 && s.avg_heart_rate === es.avg_heart_rate && s.max_heart_rate === es.max_heart_rate && Math.abs(s.avg_speed - es.avg_speed) < 1e-9 && s.sport === 1 && es.sport === "running", [s.total_distance, s.avg_heart_rate, s.max_heart_rate]);
  ok("fenix5 run: session start_time + elapsed", s.start_time === Date.UTC(2017, 5, 11, 14, 34, 9) && Math.abs(s.total_elapsed_time - es.total_elapsed_time) < 1e-9, [s.total_elapsed_time, s.total_timer_time]);
  ok("fenix5 run: lap fields (total_calories, ascent)", r.messages.lap[0].total_calories === 5 && r.messages.lap[0].total_ascent === 2);
  const hr = r.messages.hrv.flatMap(m => m.time).filter(x => x !== null);
  ok("fenix5 run: hrv R-R intervals (seconds) count = python-fitparse and plausible", hr.length === e.hrv.length && hr.every(x => x > 0.3 && x < 2.5), [hr.length, e.hrv.length]);
  near("fenix5 run: first hrv interval value = python-fitparse", hr[0], e.hrv[0], 1e-9);
  ok("fenix5 run: unknown messages are counted, not fatal", Object.keys(r.unknown).length > 5, Object.keys(r.unknown));
}
// ---- Edge 500, 10,686 records, 9 laps, ~92.6 km ride
{
  const t0 = Date.now(), r = F.parse(rd("garmin-edge-500-activity.fit")), ms = Date.now() - t0, e = exp["garmin-edge-500-activity.fit"];
  ok("edge500: 10686 records, 9 laps, CRC ok", r.messages.record.length === 10686 && r.messages.lap.length === 9 && r.crcOk && !r.truncated);
  const s = r.messages.session[0];
  near("edge500: total_distance 92622.34 m", s.total_distance, 92622.34, 1e-6);
  ok("edge500: avg HR 162, max HR 189, ascent 541, calories 1954, cycling", s.avg_heart_rate === 162 && s.max_heart_rate === 189 && s.total_ascent === 541 && s.total_calories === 1954 && s.sport === 2);
  near("edge500: timer time 10641.06 s", s.total_timer_time, 10641.06, 1e-6);
  const csv = csvRows("garmin-edge-500-activity-records.csv"); ok("edge500: row count = python-fitparse CSV dump", csv.length === 10686, csv.length);
  const keyHr = Object.keys(csv[0]).find(k => /heart/i.test(k)) || "heart_rate";
  let bad = 0; r.messages.record.forEach((x, i) => { const c = csv[i].heart_rate; if (c !== "" && c !== undefined && +c !== x.heart_rate) bad++; }); ok("edge500: heart rate of all 10686 records = CSV", bad === 0, bad);
  const recs = r.messages.record; ok("edge500: timestamps strictly non-decreasing", recs.every((x, i) => i === 0 || x.timestamp >= recs[i - 1].timestamp));
  ok("edge500: parses in < 1.5 s", ms < 1500, ms + " ms");
  // lap totals add up to the session total (consistency of scale handling)
  near("edge500: lap distances sum to session distance", r.messages.lap.reduce((a, l) => a + l.total_distance, 0), s.total_distance, 1);
}
// ---- compressed timestamps (python-fitparse "compressed-speed-distance.fit": a Forerunner 70 with compressed-timestamp headers, system-time clock)
{
  const r = F.parse(rd("compressed-speed-distance.fit")), csv = csvRows("compressed-speed-distance-records.csv"), all = r.messages.record, rec = all.slice(1); // first record carries only a timestamp (the CSV dump skips it)
  ok("compressed: 755 records (first is timestamp-only), 11 laps", all.length === 755 && all[0].heart_rate == null && all[0].distance == null, [all.length, csv.length]); ok("compressed: 11 laps, 754 data rows = CSV", r.messages.lap.length === 11 && csv.length === 754);
  const kT = Object.keys(csv[0])[0], kHr = Object.keys(csv[0])[1], kSp = Object.keys(csv[0])[2], kD = Object.keys(csv[0])[3];
  ok("compressed: raw timestamp seconds of every record = CSV", rec.every((x, i) => x._t === +csv[i][kT]), [rec[0]._t, csv[0][kT]]);
  ok("compressed: HR + distance + speed of every record = CSV", rec.every((x, i) => (csv[i][kHr] === "null" || x.heart_rate === +csv[i][kHr]) && Math.abs(x.distance - +csv[i][kD]) < 1e-6 && Math.abs((x.enhanced_speed ?? x.speed) - +csv[i][kSp]) < 1e-6));
  ok("compressed: system-time clock (not a real date) gives timestamp=null, never a 1989 date", rec.every(x => x.timestamp === null || x.timestamp > Date.UTC(2000, 0, 1)));
  near("compressed: session total_distance 10248.67", r.messages.session[0].total_distance, 10248.67, 1e-6);
}
// ---- small files, developer data, monitoring
{
  const a = F.parse(rd("Activity.fit")); ok("Activity.fit: 14 records, session distance 5.73, sport running", a.messages.record.length === 14 && Math.abs(a.messages.session[0].total_distance - 5.73) < 1e-9 && a.fileId.type === 4);
  const d = F.parse(rd("DeveloperData.fit")); ok("DeveloperData.fit (developer fields) parses, 3 records", d.messages.record.length === 3 && d.crcOk, d.errors);
  const m = F.parse(rd("MonitoringFile.fit")); ok("MonitoringFile.fit: type monitoring_b, 337 monitoring msgs", m.fileType === "monitoring_b" && m.messages.monitoring.length === 337, [m.fileType, (m.messages.monitoring || []).length]);
  const mm = m.messages.monitoring; ok("monitoring: 16-bit timestamps are rebuilt (first = 2014-12-27T13:43Z per python-fitparse epoch math) and ascend", mm[0].timestamp === Date.UTC(2014, 11, 27, 13, 43) && mm.every((x, i) => i === 0 || x.timestamp >= mm[i - 1].timestamp), new Date(mm[0].timestamp).toISOString()); ok("monitoring: step cycles of walking messages (python-fitparse: 50, 157.5)", mm.filter(x => x.cycles != null).slice(0, 2).map(x => x.cycles).join() === "50,157.5", mm.filter(x => x.cycles != null).slice(0, 2).map(x => x.cycles));
  eq("peek() identifies file types cheaply", [F.peek(rd("Activity.fit")).fileType, F.peek(rd("MonitoringFile.fit")).fileType], ["activity", "monitoring_b"]);
  ok("opts.only keeps just the requested messages", Object.keys(F.parse(rd("garmin-fenix-5-run.fit"), { only: ["session"] }).messages).join() === "session");
}
// ---- robustness
{
  const u = rd("garmin-fenix-5-run.fit");
  const cut = F.parse(u.slice(0, 3000)); ok("truncated file: returns partial data and flags it", cut.truncated && cut.messages.record.length > 0 && cut.messages.record.length < 21, [cut.messages.record.length, cut.errors]);
  const bad = u.slice(); bad[100] ^= 0xff; const rb = F.parse(bad); ok("bit-flip is caught by the file CRC", rb.crcOk === false);
  throws("garbage rejected", () => F.parse(new Uint8Array(200)), /Not a FIT/);
  throws("empty rejected", () => F.parse(new Uint8Array(0)), /Not a FIT/);
  const twice = new Uint8Array(u.length * 2); twice.set(u); twice.set(u, u.length);
  const ch = F.parse(twice); ok("chained FIT files are both read", ch.files === 2 && ch.messages.record.length === 42);
  const trail = new Uint8Array(u.length + 5); trail.set(u); const tr = F.parse(trail); ok("trailing garbage after a valid file is ignored", tr.files === 1 && tr.messages.record.length === 21);
  ok("CRC-16 known: header of a real file validates", F.crc16(u, 0, 12) === (u[12] | (u[13] << 8)));
}
done();
