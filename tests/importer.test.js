const { ok, eq, near, done } = require("./harness");
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const G = require("../js/demo.js"), Imp = require("../js/importer.js"), Z = require("../js/zip.js");
(async () => {
  const demo = G.generate(), files = G.toGarminFiles(demo);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "glimp-")), fit = n => path.join(__dirname, "fixtures/real-fit", n);
  const put = (rel, data) => { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
  files.forEach(f => put("DI_CONNECT/" + f.name.replace(/^DI_CONNECT\//, ""), f.text));
  // a summarizedActivities record that matches the real Fenix-5 FIT start (1497191649000) within 30 s
  put("DI_CONNECT/DI-Connect-Fitness/old_summarizedActivities.json", JSON.stringify([{ summarizedActivitiesExport: [{ activityId: 555, name: "Old run", activityType: "running", startTimeGmt: 1497191649000 + 30000, startTimeLocal: 1497191649000 + 30000 - 4 * 3600000, duration: 57000, distance: 15000, avgHr: 150, maxHr: 170, calories: 20 }] }]));
  fs.copyFileSync(fit("garmin-fenix-5-run.fit"), path.join(tmp, "run.fit")); fs.copyFileSync(fit("MonitoringFile.fit"), path.join(tmp, "mon.fit")); fs.copyFileSync(fit("Activity.fit"), path.join(tmp, "act.fit"));
  put("__MACOSX/._junk.json", "{not json"); put("DI_CONNECT/readme.txt", "hello");
  cp.execSync(`python3 - <<'PY'
import zipfile,os
t=${JSON.stringify(tmp)}
with zipfile.ZipFile(os.path.join(t,"uploaded.zip"),"w",zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(t,"run.fit"),"run.fit"); z.write(os.path.join(t,"mon.fit"),"mon.fit"); z.write(os.path.join(t,"act.fit"),"act.fit")
with zipfile.ZipFile(os.path.join(t,"export.zip"),"w",zipfile.ZIP_DEFLATED) as z:
    for root,_,fs in os.walk(os.path.join(t,"DI_CONNECT")):
        for f in fs: z.write(os.path.join(root,f),os.path.relpath(os.path.join(root,f),t))
    z.write(os.path.join(t,"uploaded.zip"),"DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip")
    z.write(os.path.join(t,"__MACOSX/._junk.json"),"__MACOSX/._junk.json")
PY`);
  const imp = Imp.create({}); const progress = [];
  imp.opts.onProgress = p => progress.push(p.current);
  await imp.addFile({ name: "export.zip", bytes: new Uint8Array(fs.readFileSync(path.join(tmp, "export.zip"))) });
  const r = imp.result();
  ok("imports days from the zip", r.days.length >= 230, r.days.length);
  eq("day count equals demo days", r.days.length, demo.days.length);
  const d0 = r.days.find(d => d.date === demo.days[50].date), s0 = demo.days[50];
  ok("day merged from UDS + sleep + health status", d0.rhr === s0.rhr && d0.sleepSec === s0.sleepSec && Math.abs((d0.hrv || 0) - (s0.hrv || 0)) < 1.5 && d0.steps === s0.steps, { rhr: [d0.rhr, s0.rhr], hrv: [d0.hrv, s0.hrv], sleep: [d0.sleepSec, s0.sleepSec] });
  ok("demo flag does not leak into parsed real-format files", !r.stats.demo || r.days.every(d => d.demo === undefined || d.demo === true));
  ok("activities from summary all present", r.activities.filter(a => a.source !== "fit").length >= demo.activities.length, r.activities.length);
  ok("activities with a series carry an HR histogram (so load can be recomputed for any max HR)", r.activities.filter(a => a.series && a.series.hr).every(a => a.hrHist ? a.hrHist.reduce((x, y) => x + y, 0) > 0 : !a.series.hr.some(v => v > 20)) && r.activities.some(a => a.hrHist));
  const old = r.activities.find(a => a.date === "2017-06-11" || a.name === "Old run");
  ok("old summary linked to FIT detail (within 120 s) = one merged activity with series", old && old.source === "summary+fit" && !!old.series, old && old.source);
  eq("only one activity near 2017-06-11 (no duplicate)", r.activities.filter(a => a.start > 1497191000000 && a.start < 1497192000000).length, 1);
  ok("monitoring FIT counted as fit-other, not an activity", r.stats.fitOther >= 1 && r.stats.kinds["fit-other"] >= 1, r.stats.kinds);
  ok("junk (__MACOSX, txt) ignored without error", r.stats.errors.length === 0 && r.stats.ignored >= 1, r.stats.errors);
  ok("progress callback saw file names", progress.length > 5);
  // loose files + duplicates + errors
  const imp2 = Imp.create({});
  await imp2.addFiles([{ name: "UDSFile_x.json", text: JSON.stringify([{ calendarDate: "2026-01-01", totalSteps: 1000, restingHeartRate: 50 }]) }, { name: "UDSFile_y.json", text: JSON.stringify([{ calendarDate: "2026-01-01", totalSteps: 1200 }]) }, { name: "broken.fit", bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) }, { name: "notes.txt", text: "x" }, { name: "bad_sleepData.json", text: "{{{" }]);
  const r2 = imp2.result();
  eq("same date merged field-wise (newer steps win, RHR kept)", [r2.days.length, r2.days[0].totalSteps === undefined ? r2.days[0].steps : 0, r2.days[0].rhr], [1, 1200, 50]);
  ok("broken files reported as errors/warnings, import continues", r2.stats.errors.length + r2.stats.warnings.length >= 1, { e: r2.stats.errors, w: r2.stats.warnings });
  // CSV activity duplicates are dropped when a summary exists for same day/sport/duration
  const imp3 = Imp.create({});
  const a0 = demo.activities.find(a => a.type === "running");
  const hh = n => String(Math.floor(n / 3600)).padStart(2, "0") + ":" + String(Math.floor(n % 3600 / 60)).padStart(2, "0") + ":" + String(Math.round(n % 60)).padStart(2, "0");
  const csv = "Activity Type,Date,Title,Distance,Calories,Time,Avg HR,Max HR\nRunning," + a0.date + " 07:00:00,Dup run,10.0,500," + hh(a0.durationSec) + ",150,170\nRunning,2025-01-05 07:00:00,Other run,5.0,300,00:30:00,140,160\n";
  await imp3.addFile({ name: "export.zip", bytes: new Uint8Array(fs.readFileSync(path.join(tmp, "export.zip"))) });
  await imp3.addFile({ name: "Activities.csv", text: csv });
  const r3 = imp3.result();
  ok("CSV row that duplicates a summary activity (same day, sport, duration) is dropped", !r3.activities.some(a => a.name === "Dup run"));
  ok("CSV row with no counterpart is kept", r3.activities.some(a => a.name === "Other run"));
  // nested depth guard
  ok("Importer exports mergeDay/mergeActivity", typeof Imp.mergeDay === "function" && typeof Imp.mergeActivity === "function");
  const m = Imp.mergeDay({ a: 1, b: 2 }, { b: null, c: 3 }); eq("mergeDay ignores null overwrite", m, { a: 1, b: 2, c: 3 });
  

  // ---------- v1.2: duplicate daily records, private folders, HRV availability, progress
  {
    const md = Imp.mergeDay;
    eq("duplicate UDS records: cumulative counters keep the maximum", md({ steps: 8000, kcalTotal: 2300, distanceM: 6000 }, { steps: 9500, kcalTotal: 2250, distanceM: 6500 }), { steps: 9500, kcalTotal: 2300, distanceM: 6500 });
    eq("a later ZERO never wipes an earlier real value (steps and non-cumulative)", md({ steps: 8000, stepGoal: 9000, stressAvg: 31 }, { steps: 0, stepGoal: 0, stressAvg: 0 }), { steps: 8000, stepGoal: 9000, stressAvg: 31 });
    eq("an earlier zero is replaced by a later real value", md({ steps: 0, stressAvg: 0 }, { steps: 40, stressAvg: 12 }), { steps: 40, stressAvg: 12 });
    eq("non-cumulative later value still replaces (resting HR 55 -> 53)", md({ rhr: 55 }, { rhr: 53 }).rhr, 53);
    const i2 = Imp.create({}); await i2.addFile({ name: "UDSFile_a.json", text: JSON.stringify([{ calendarDate: "2026-03-10", totalSteps: 9000, restingHeartRate: 52 }, { calendarDate: "2026-03-10", totalSteps: 0, restingHeartRate: 53 }]) });
    const d2 = i2.result().days; eq("end to end: one day, steps 9000 (later 0 ignored), rhr 53", [d2.length, d2[0].steps, d2[0].rhr], [1, 9000, 53]);

    const uds = JSON.stringify([{ calendarDate: "2026-03-11", totalSteps: 5000, restingHeartRate: 50 }]);
    const i3 = Imp.create({});
    for (const n of ["DI_CONNECT/DI-Connect-User/UDSFile_u.json", "DI_CONNECT/DI-Connect-Account/UDSFile_a.json", "x/Golf/UDSFile_g.json", "x/DI-Connect-Device/UDSFile_d.json", "x/DI-Connect-Social/UDSFile_s.json", "x/DI-Connect-Payment/UDSFile_p.json", "x/DI-Connect-Content/UDSFile_c.json", "x/DI-Connect-Customer-Service/UDSFile_cs.json"]) await i3.addFile({ name: n, text: uds });
    eq("8 JSON files in private folders: none parsed, all counted as skipped", [i3.result().days.length, i3.stats.skippedPrivate, i3.stats.files], [0, 8, 0]);
    await i3.addFile({ name: "DI_CONNECT/DI-Connect-Aggregator/UDSFile_ok.json", text: uds });
    eq("same file in a normal folder is parsed", i3.result().days.length, 1);
    await i3.addFile({ name: "DI_CONNECT/DI-Connect-User/userBiometrics.json", text: JSON.stringify([{ metaData: { calendarDate: "2026-03-11" }, lactateThreshold: { heartRate: 158 }, weight: { weight: 80000 } }]) });
    eq("userBiometrics.json is still read from a user folder (threshold HR + weight)", [i3.result().days[0].lthr, i3.result().days[0].weightKg], [158, 80]);
    const zdir = path.join(tmp, "zp"); fs.mkdirSync(path.join(zdir, "DI_CONNECT/DI-Connect-User"), { recursive: true }); fs.mkdirSync(path.join(zdir, "DI_CONNECT/DI-Connect-Aggregator"), { recursive: true });
    fs.writeFileSync(path.join(zdir, "DI_CONNECT/DI-Connect-User/UDSFile_u.json"), uds); fs.writeFileSync(path.join(zdir, "DI_CONNECT/DI-Connect-Aggregator/UDSFile_ok.json"), JSON.stringify([{ calendarDate: "2026-03-12", totalSteps: 7000, restingHeartRate: 50 }]));
    cp.execSync(`python3 - <<'PY'
import zipfile,os
t=${JSON.stringify(zdir)}
with zipfile.ZipFile(os.path.join(t,"..","private.zip"),"w",zipfile.ZIP_DEFLATED) as z:
    for r,_,fs in os.walk(os.path.join(t,"DI_CONNECT")):
        for f in fs: z.write(os.path.join(r,f),os.path.relpath(os.path.join(r,f),t))
PY`);
    const i4 = Imp.create({});
    await i4.addFile({ name: "private.zip", bytes: new Uint8Array(fs.readFileSync(path.join(tmp, "private.zip"))) });
    eq("ZIP: JSON inside DI-Connect-User is skipped, the other entry is parsed", [i4.result().days.map(d => d.date), i4.stats.skippedPrivate], [["2026-03-12"], 1]);

    const mkd = (n, f) => Array.from({ length: n }, (_, k) => Object.assign({ date: "2026-03-" + String(k + 1).padStart(2, "0") }, f(k)));
    const run = async (days) => { const im = Imp.create({}); await im.addFile({ name: "garmin-lens-bundle.json", text: JSON.stringify({ format: "garmin-lens-bundle", version: 1, days, activities: [] }) }); return im; };
    const rNo = (await run(mkd(5, () => ({ rhr: 52 })))).result();
    eq("no HRV anywhere: explicit note + flag", [rNo.stats.noHrv, rNo.stats.warnings.some(w => w === Imp.NO_HRV), /No HRV found in this export/.test(Imp.NO_HRV)], [true, true, true]);
    const nightly = (await run(mkd(5, () => ({ hrv: 50 })))).result(); eq("nightly HRV present: no note", [nightly.stats.noHrv, nightly.stats.warnings.length, nightly.stats.hrv.nightly], [false, 0, 5]);
    const slp = (await run(mkd(5, () => ({ hrvSleep: 50 })))).result(); eq("sleepData HRV counts as found", [slp.stats.noHrv, slp.stats.hrv.sleep], [false, 5]);
    const wk = (await run(mkd(5, () => ({ hrvWeeklyAvg: 50 })))).result(); eq("weekly-only HRV: lower-resolution warning, not 'no HRV'", [wk.stats.noHrv, wk.stats.warnings.some(w => /only the weekly average/.test(w))], [false, true]);
    eq("no days at all (e.g. only FIT files): no HRV note", (await run([])).result().stats.noHrv, false);

    const i5 = Imp.create({}), p5 = []; i5.opts.onProgress = p => p5.push([p.done, p.total]);
    await i5.addFiles([{ name: "UDSFile_1.json", text: uds }, { name: "UDSFile_2.json", text: uds }, { name: "UDSFile_3.json", text: uds }]);
    eq("progress reports done/total and ends at 3 of 3", p5[p5.length - 1], [3, 3]);
    const i6 = Imp.create({}), p6 = []; i6.opts.onProgress = p => p6.push([p.done, p.total]); await i6.addFile({ name: "export.zip", bytes: new Uint8Array(fs.readFileSync(path.join(tmp, "export.zip"))) }); await i6.addFiles([]);
    eq("zip import: total = entry count (incl. nested zip entries), done ends equal to total, never above it", [p6.length > 0, p6.every(p => p[0] <= p[1]), p6[p6.length - 1][0] === p6[p6.length - 1][1], p6[p6.length - 1][1] >= 15], [true, true, true, true]);
  }

done();
})().catch(e => { console.error(e); process.exit(1); });
