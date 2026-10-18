/* Garmin Lens – views: Today, Trends, Sleep, Train, Activity, Insights. All text from data goes through textContent (GLUI.h). */
(function () {
  "use strict";
  var App = window.GLApp, V = App.views, st = App.state, h = GLUI.h, num = GLUI.num, M = GLModels, I = GLInsights, S = GLStats, D = GLDates, C = GLCharts, L = M.LABELS;
  var ok = S.ok, card = GLUI.card;
  function ds() { return st.ds; }
  function lastIdx() { var d = ds(); for (var i = d.n - 1; i >= 0; i--) if (ok(d.s.rhr[i]) || ok(d.s.hrv[i]) || ok(d.s.sleepH[i]) || ok(d.s.steps[i])) return i; return d.n - 1; }
  function avg7(arr) { return S.rolling(arr, 7, S.mean); }
  var bandCache = {};
  function band(key) { var d = ds(), k = key + "|" + d.n + "|" + d.dates[0]; return bandCache[k] || (bandCache[k] = M.rollingBand(d, key)); }
  function expArr(a) { return a.map(function (v) { return ok(v) ? Math.exp(v) : null; }); }
  function line(c, spec) { return App.mountChart(c, Object.assign({ height: 210 }, spec)); }
  function sec(title, sub, kids) { return h("section", { class: "card" }, [h("h2", { text: title }), sub ? h("p", { class: "sub", text: sub }) : null, kids]); }
  function note(text, cls) { return h("p", { class: "note" + (cls ? " " + cls : ""), text: text }); }
  function badge(text, cls) { return h("span", { class: "badge " + cls, text: text }); }
  function fmtZ(z) { return (z >= 0 ? "+" : "−") + Math.abs(z).toFixed(1) + "σ"; }

  V.welcome = function () {
    return h("section", { class: "card welcome" }, [
      h("h2", { text: "Welcome to Garmin Lens" }),
      h("p", { text: "Deeper charts and insights from your Garmin data – processed only on this device." }),
      h("p", { class: "muted", text: "No Garmin data is loaded yet. You can look around with clearly-labelled synthetic demo data, or import your own Garmin export." }),
      h("div", { class: "actions", style: { justifyContent: "center" } }, [
        h("button", { class: "btn primary", type: "button", onclick: function () { App.loadDemo().then(function () { GLUI.toast("Demo data loaded (synthetic)"); }); } }, "Explore with demo data"),
        h("a", { class: "btn", href: "#/data", style: { textDecoration: "none", display: "inline-flex", alignItems: "center" } }, "Import my Garmin data")
      ])
    ]);
  };

  /* ================= TODAY ================= */
  function whatStandsOut(d, i) {
    var out = [], defs = [["lnHrv", "Overnight HRV", function (z) { var pct = (Math.exp(z.value - z.mean) - 1) * 100; return Math.abs(pct).toFixed(0) + "% " + (pct < 0 ? "below" : "above") + " your normal (" + Math.exp(z.value).toFixed(0) + " vs ~" + Math.exp(z.mean).toFixed(0) + " ms)"; }, -1],
      ["rhr", "Resting heart rate", function (z) { var dl = z.value - z.mean; return Math.abs(dl).toFixed(1) + " bpm " + (dl > 0 ? "above" : "below") + " your normal (" + z.value + " vs ~" + z.mean.toFixed(0) + ")"; }, 1],
      ["sleepH", "Sleep duration", function (z) { return GLUI.hm(z.value) + " vs your usual ~" + GLUI.hm(z.mean); }, -1],
      ["stress", "Stress", function (z) { return z.value + " vs your usual ~" + z.mean.toFixed(0); }, 1],
      ["resp", "Breathing rate", function (z) { return z.value.toFixed(1) + " vs ~" + z.mean.toFixed(1) + " brpm"; }, 1],
      ["skin", "Skin temperature", function (z) { return GLUI.sign(z.value, 1) + " °C vs ~" + GLUI.sign(z.mean, 1); }, 1],
      ["bbHigh", "Body Battery peak", function (z) { return z.value + " vs ~" + z.mean.toFixed(0); }, -1], ["spo2", "Overnight SpO2", function (z) { return z.value + "% vs ~" + z.mean.toFixed(0) + "%"; }, -1]];
    defs.forEach(function (df) { var z = M.zScore(d, df[0], i); if (z && Math.abs(z.z) >= 1.5) out.push({ cls: z.z * df[3] > 0 ? "bad" : "good", text: df[1] + ": " + df[2](z) + " (" + fmtZ(z.z) + ")." }); });
    var an = M.anomalyStatus(d, i);
    if (an.kind) { var sigs = an.signals.filter(function (x) { return x.pass; }).map(function (x) { return x.label; }).join(", ");
      out.unshift(an.kind === "pattern" ? { cls: "bad", text: "Strain pattern: " + sigs + " for " + an.days + " days in a row, against your own baseline. It shows up with illness, but also with alcohol, hard training, poor sleep or travel." + (an.lutealNote ? " " + M.LUTEAL_NOTE : "") + (an.cycleTagged ? " You tagged this day as part of your cycle, which may explain it." : "") + " " + M.ANOMALY_CARE }
        : { cls: "warn", text: "Worth watching: last night " + sigs + " against your own baseline. One night is often just noise. If it is still there tomorrow it becomes a “strain pattern”." + (an.cycleTagged ? " You tagged this day as part of your cycle, which may explain it." : "") + " " + M.ANOMALY_CARE }); }
    var debt = M.sleepDebt(d, i); if (debt && debt.hours >= 3) out.push({ cls: "warn", text: "Sleep debt: about " + debt.hours.toFixed(1) + " h short of your " + debt.need + " h target over the last " + debt.nights + " nights." });
    var ac = M.acwr(d.s.load, i); if (ac && ac.ratio > M.ACWR_HIGH) out.push({ cls: "warn", text: "Training load jumped quickly: this week is " + ac.ratio.toFixed(2) + "× your 4-week average (above " + M.ACWR_HIGH + "). Quick jumps in load are associated with fatigue, so an easier day may suit you." }); else if (ac && ac.ratio < M.ACWR_LOW) out.push({ cls: "warn", text: "Training load is low: this week is " + ac.ratio.toFixed(2) + "× your 4-week average." });
    var tsb = d.s.tsbPrior[i]; if (i >= 42 && ok(tsb)) { if (tsb < -25) out.push({ cls: "warn", text: "Training form is " + tsb.toFixed(0) + ": you are carrying a lot of recent load, so an easier day may suit you." }); else if (tsb > 15) out.push({ cls: "good", text: "Training form is +" + tsb.toFixed(0) + ": you look fresh – a harder session may suit you." }); }
    return out;
  }
  function tile(d, i, o) {
    var v = d.s[o.key][i], rng = M.normalRange(d, o.rkey || o.key, i), z = M.zScore(d, o.zkey || o.key, i), kids = [h("div", { class: "k", text: o.label }), h("div", { class: "v" }, [ok(v) ? o.fmt(v) : "–", o.unit ? h("small", { text: " " + o.unit }) : null])];
    if (o.extra) kids.push(h("div", { class: "d", text: o.extra }));
    if (rng && ok(v)) {
      var lo = o.rkey === "hrv" ? rng.lo : rng.lo, hi = rng.hi, span = Math.max(hi - lo, 1e-9), a = lo - span * 0.9, b = hi + span * 0.9, pos = S.clamp((v - a) / (b - a), 0, 1) * 100;
      kids.push(h("div", { class: "rbar", role: "img", "aria-label": o.label + " " + (z ? fmtZ(z.z) + " versus your normal" : "") }, [h("i", { style: { left: ((lo - a) / (b - a) * 100) + "%", width: (span / (b - a) * 100) + "%" } }), h("u", { style: { left: "calc(" + pos + "% - 2px)" } })]));
      kids.push(h("div", { class: "d" }, ["normal " + o.fmt(rng.lo) + "–" + o.fmt(rng.hi) + " ", z ? h("span", { class: Math.abs(z.z) >= 1.5 ? "z-hi" : "z-ok", text: fmtZ(z.z) }) : null]));
    }
    return h("div", { class: "tile" }, kids);
  }
  V.today = function (main, arg) {
    var d = ds(), i = arg && d.idx[arg] !== undefined ? d.idx[arg] : lastIdx(), date = d.dates[i], day = d.days[date] || {};
    function go(k) { if (k >= 0 && k < d.n) location.hash = "#/today/" + d.dates[k]; }
    main.appendChild(h("div", { class: "datebar" }, [h("button", { class: "btn", type: "button", "aria-label": "Previous day", disabled: i <= 0, onclick: function () { go(i - 1); } }, "‹"), h("input", { class: "inp", type: "date", value: date, min: d.dates[0], max: d.dates[d.n - 1], "aria-label": "Choose a date", onchange: function (e) { if (d.idx[e.target.value] !== undefined) location.hash = "#/today/" + e.target.value; } }), h("button", { class: "btn", type: "button", "aria-label": "Next day", disabled: i >= d.n - 1, onclick: function () { go(i + 1); } }, "›")]));
    var rec = M.recovery(d, i);
    if (rec) {
      var txt = rec.band === "green" ? "Higher than your recent normal – you look well recovered." : rec.band === "red" ? "Lower than your recent normal – an easy day may suit you." : "Close to your recent normal.";
      var rows = rec.components.map(function (c) { var cd = c.detail, val = c.key === "hrv" ? Math.exp(cd.value).toFixed(0) + " ms (normal ~" + Math.exp(cd.mean).toFixed(0) + ")" : c.key === "rhr" ? cd.value + " bpm (normal ~" + cd.mean.toFixed(0) + ")" : c.key === "sleep" ? GLUI.hm(cd.value) + " (need " + GLUI.hm(cd.need) + ")" : c.key === "stress" ? cd.value + " (normal ~" + cd.mean.toFixed(0) + ")" : "form " + GLUI.sign(cd.tsb, 0); return h("tr", null, [h("td", { text: c.label.split(" vs ")[0].replace("Overnight ", "").replace("Yesterday's ", "Prior-day ") }), h("td", { text: val }), h("td", { text: GLUI.sign(c.z, 1) }), h("td", { text: Math.round(c.weight * 100) + "%" }), h("td", { text: GLUI.sign(c.contribution, 2) })]); });
      main.appendChild(h("section", { class: "card" }, [
        h("div", { class: "hero" }, [h("div", { class: "score " + rec.band, role: "img", "aria-label": "Recovery score " + rec.score + " out of 100, " + rec.band }, [h("b", { text: String(rec.score) }), h("small", { text: "recovery" })]),
          h("div", { class: "txt" }, [h("h2", { text: "Recovery: " + rec.band[0].toUpperCase() + rec.band.slice(1) }), h("p", { text: txt }), h("p", { class: "muted", text: "Built from your own HRV, resting HR, sleep, stress and training form – compared with your own last 28 days. 50 means “typical for you”; it is not a measure of absolute fitness or health." })])]),
        h("details", { class: "how" }, [h("summary", { text: "How this score is calculated" }), h("div", { class: "tw" }, h("table", { class: "t" }, [h("tr", null, ["Signal", "Today", "z", "Weight", "Adds"].map(function (x) { return h("th", { text: x }); }))].concat(rows))),
          h("p", { class: "muted", text: "Each signal is turned into a z-score against your own previous 28 days (robust median/MAD, with a minimum spread so a very steady metric doesn't over-react). HRV is handled on a log scale and uses your 7-night average (a single night only drives the warning flags). Stress is compared with your own normal, not a fixed scale. HRV and sleep are dated by the day you wake up, so today's reading is last night's. Score = 100 × Φ(1.3 × Σ weight × z), weights HRV 40%, resting HR 20%, sleep 25%, prior-day stress 7.5%, training form 7.5%, minus 1 when your load ratio is above " + M.ACWR_HIGH + " (re-normalised when a signal is missing). Sleep beyond your need counts at most +1 (oversleeping is not rewarded). The training-form part (7.5%) is higher when you are rested, so a rested but detrained state also scores well – it rewards freshness, not fitness. Green ≥ 67, yellow 34–66, red < 34. This is Garmin Lens's own transparent formula – it is not Garmin's Training Readiness or Body Battery and has not been clinically validated." })])
      ]));
    } else main.appendChild(sec("Recovery", null, note("Not enough history yet for this day (needs about two weeks of resting HR or HRV before it). Pick a later date or import more data.")));
    var so = whatStandsOut(d, i);
    main.appendChild(sec("What stands out", date, so.length ? h("ul", { class: "list" }, so.map(function (x) { return h("li", null, [badge(x.cls === "bad" ? "watch" : x.cls === "warn" ? "note" : "good", x.cls), " ", x.text]); })) : h("p", { text: "Nothing unusual compared with your own normal." })));
    var sleepVal = ok(d.s.sleepH[i]) ? d.s.sleepH[i] : null;
    var tiles = [
      { key: "hrv", rkey: "hrv", zkey: "lnHrv", label: "Overnight HRV", unit: "ms", fmt: function (v) { return num(v, 0); } },
      { key: "rhr", label: "Resting HR", unit: "bpm", fmt: function (v) { return num(v, 0); } },
      { key: "sleepH", label: "Sleep", fmt: function (v) { return GLUI.hm(v); }, extra: ok(d.s.sleepScore[i]) ? "Score " + d.s.sleepScore[i] + (ok(d.s.onset[i]) ? " · " + GLUI.clock(d.s.onset[i]) + "–" + GLUI.clock(d.s.wake[i]) : "") : null },
      { key: "stress", label: "Stress (avg)", fmt: function (v) { return num(v, 0); } },
      { key: "bbHigh", label: "Body Battery peak", fmt: function (v) { return num(v, 0); }, extra: ok(d.s.bbLow[i]) ? "Low " + d.s.bbLow[i] : null },
      { key: "steps", label: "Steps", fmt: function (v) { return v.toLocaleString(); } },
      { key: "resp", label: "Sleep breathing", unit: "brpm", fmt: function (v) { return num(v, 1); } },
      { key: "spo2", label: "SpO2 (avg)", unit: "%", fmt: function (v) { return num(v, 0); } },
      { key: "skin", label: "Skin temp", unit: "°C dev.", fmt: function (v) { return GLUI.sign(v, 1); } },
      { key: "readiness", label: "Garmin readiness", fmt: function (v) { return num(v, 0); }, extra: "Garmin's own number" },
      { key: "vo2max", label: "VO2max", fmt: function (v) { return num(v, 1); } },
      { key: "weight", label: "Weight", unit: "kg", fmt: function (v) { return num(v, 1); } }
    ].filter(function (o) { return ok(d.s[o.key][i]) || ["hrv", "rhr", "sleepH", "stress", "steps"].indexOf(o.key) >= 0; });
    main.appendChild(h("div", { class: "tiles" }, tiles.map(function (o) { return tile(d, i, o); })));
    // training status
    var ac = M.acwr(d.s.load, i), mo = M.monotony(d.s.load, i);
    main.appendChild(sec("Training status", null, h("dl", { class: "kv" }, [h("dt", { text: "Fitness (CTL)" }), h("dd", { text: num(d.s.ctl[i], 0) }), h("dt", { text: "Fatigue (ATL)" }), h("dd", { text: num(d.s.atl[i], 0) }), h("dt", { text: "Form (TSB, start of day)" }), h("dd", { text: ok(d.s.tsbPrior[i]) ? GLUI.sign(d.s.tsbPrior[i], 0) : "–" }), h("dt", { text: "Load ratio (7 d / 28 d)" }), h("dd", { text: ac ? ac.ratio.toFixed(2) + " · " + M.acwrZone(ac.ratio) : "needs 4 weeks" }), h("dt", { text: "7-day load · monotony" }), h("dd", { text: mo ? num(mo.weekly, 0) + (mo.monotony ? " · " + mo.monotony.toFixed(1) : "") : "–" })])));
    var acts = d.actsByDate[date] || [];
    if (acts.length) main.appendChild(sec("Activities", null, acts.map(function (a) { return actRow(a); })));
  };
  function actRow(a) {
    var meta = [GLUI.dur(a.durationSec)].concat(a.distanceM ? [(a.distanceM / 1000).toFixed(a.distanceM >= 10000 ? 1 : 2) + " km"] : [], ok(a.avgHr) ? [a.avgHr + " bpm"] : []).join(" · ");
    return h("a", { class: "row", href: "#/act/" + encodeURIComponent(a.id) }, [h("div", { class: "main" }, [h("b", { text: a.name || a.type || "Activity" }), h("span", { class: "muted", text: a.date + " · " + meta })]), h("div", { class: "end" }, [ok(a.hrtss) ? h("b", { text: Math.round(a.hrtss) }) : "–", h("div", { class: "muted", text: "load" })])]);
  }

  /* ================= TRENDS ================= */
  function trendChart(c, title, key, o) {
    o = o || {}; var d = ds(), x = App.x(), raw = d.s[key], arr = o.transform ? o.transform(raw) : raw, b = band(key);
    var bl = o.transform ? b.map(function (r) { return r ? { lo: o.transform([r.lo])[0], hi: o.transform([r.hi])[0] } : null; }) : b;
    var series = [{ name: o.name || "Daily", data: App.slice(arr), color: "c1", width: 1.4, dots: true, digits: o.digits, fmt: o.fmt }, { name: "7-day avg", data: App.slice(avg7(arr)), color: "c4", width: 2.6, digits: o.digits, fmt: o.fmt }];
    return line(c, { title: title, x: x, series: series, bands: [{ lo: App.slice(bl.map(function (r) { return r ? r.lo : null; })), hi: App.slice(bl.map(function (r) { return r ? r.hi : null; })), color: "c1", alpha: 0.13 }], notes: App.notes(x), yFmt: o.yFmt, yMin: o.yMin, yMax: o.yMax, hlines: o.hlines, note: o.note === false ? null : "Shaded band = your personal normal range (10th–90th percentile of the previous 28 days)." });
  }
  var SHORT = { rhr: "Resting HR", hrv: "HRV (ms)", sleepH: "Sleep (h)", sleepScore: "Sleep score", stress: "Stress", bbHigh: "Battery peak", steps: "Steps", recovery: "Recovery", vo2max: "VO2max", weight: "Weight" };
  V.trends = function (main) {
    var d = ds(); main.appendChild(App.rangeChips());
    var rows = ["rhr", "hrv", "sleepH", "sleepScore", "stress", "bbHigh", "steps", "recovery", "vo2max", "weight"].filter(function (k) { return d.s[k].some(ok); }).map(function (k) {
      var t = I.trendSummary(d, k), f = function (v) { return ok(v) ? (k === "steps" ? Math.round(v).toLocaleString() : k === "sleepH" ? v.toFixed(2) : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) : "–"; };
      return h("tr", null, [h("td", { text: SHORT[k] || L[k] }), h("td", { text: f(t.latest) }), h("td", { text: f(t.avg7) }), h("td", { text: f(t.avg30) }), h("td", { text: f(t.avg90) }), h("td", { class: t.z !== null && Math.abs(t.z) >= 1.5 ? "z-hi" : "", text: t.z === null || t.z === undefined ? "–" : fmtZ(t.z) }), h("td", { text: t.slopePer30 === null ? "–" : (t.slopeR2 > 0.1 ? GLUI.sign(t.slopePer30, Math.abs(t.slopePer30) < 10 ? 2 : 0) : "flat") })]);
    });
    main.appendChild(sec("Baselines at a glance", "Latest value, 7/30/90-day averages, z-score of the latest value vs the 28 days before it, and the 90-day trend per 30 days (shown only when the line explains ≥10% of the variation).", h("div", { class: "tw" }, h("table", { class: "t" }, [h("tr", null, ["Metric", "Now", "7d", "30d", "90d", "z", "Δ30d"].map(function (x) { return h("th", { text: x }); }))].concat(rows)))));
    var c = h("section", { class: "card" }); main.appendChild(c);
    if (d.s.recovery.some(ok)) line(c, { title: "Recovery score", x: App.x(), series: [{ name: "Recovery", data: App.slice(d.s.recovery), color: "c1", width: 1.4, dots: true }, { name: "7-day avg", data: App.slice(avg7(d.s.recovery)), color: "c4", width: 2.6 }], zones: [{ from: 67, to: 100, color: "good", alpha: 0.1 }, { from: 0, to: 34, color: "bad", alpha: 0.1 }], yMin: 0, yMax: 100, notes: App.notes(App.x()), note: "Green zone ≥ 67, red zone < 34 (Garmin Lens's own score – see Today for the formula)." });
    if (d.s.hrv.some(ok)) trendChart(c, "Overnight HRV (ms)", "hrv", { digits: 0 });
    if (d.s.rhr.some(ok)) trendChart(c, "Resting heart rate (bpm)", "rhr", { digits: 0 });
    if (d.s.sleepH.some(ok)) line(c, { title: "Sleep duration (h)", x: App.x(), series: [{ name: "Sleep", type: "bar", data: App.slice(d.s.sleepH), color: "c5", digits: 1, fmt: function (v) { return GLUI.hm(v); } }, { name: "7-day avg", data: App.slice(avg7(d.s.sleepH)), color: "c4", width: 2.6, digits: 1, fmt: function (v) { return GLUI.hm(v); } }], hlines: [{ y: d.settings.sleepNeedH, label: "need " + d.settings.sleepNeedH + " h", color: "good" }], notes: App.notes(App.x()), yMin: 0 });
    if (d.s.stress.some(ok)) trendChart(c, "Stress (daily average, 0–100)", "stress", { digits: 0, note: false });
    if (d.s.bbHigh.some(ok)) line(c, { title: "Body Battery (daily high / low)", x: App.x(), series: [{ name: "High", data: App.slice(d.s.bbHigh), color: "c3", width: 1.8 }, { name: "Low", data: App.slice(d.s.bbLow), color: "c2", width: 1.8 }], yMin: 0, yMax: 100, notes: App.notes(App.x()) });
    if (d.s.steps.some(ok)) line(c, { title: "Steps", x: App.x(), series: [{ name: "Steps", type: "bar", data: App.slice(d.s.steps), color: "c1", digits: 0 }, { name: "7-day avg", data: App.slice(avg7(d.s.steps)), color: "c4", width: 2.6, digits: 0 }], notes: App.notes(App.x()), yFmt: function (v) { return v >= 1000 ? (v / 1000) + "k" : v; } });
    ["resp", "spo2", "skin"].forEach(function (k) { if (d.s[k].some(ok)) trendChart(c, L[k], k, { digits: k === "spo2" ? 0 : 1, note: false }); });
    if (d.s.vo2max.some(ok)) line(c, { title: "VO2max (Garmin estimate)", x: App.x(), series: [{ name: "VO2max", data: App.slice(d.s.vo2max), color: "c3", width: 2, dots: true, digits: 1 }], note: "Garmin updates this only after suitable outdoor runs/rides, so it moves in steps." });
    if (d.s.weight.some(ok)) line(c, { title: "Weight (kg)", x: App.x(), series: [{ name: "Weight", data: App.slice(d.s.weight), color: "c6", width: 2, dots: true, digits: 1 }] });
  };

  /* ================= SLEEP ================= */
  V.sleep = function (main) {
    var d = ds(), i = lastIdx(); main.appendChild(App.rangeChips());
    var debt = M.sleepDebt(d, i), reg = M.sleepRegularity(d, i, 14), sj = M.socialJetLag(d, i);
    var kv = [];
    if (debt) kv.push(h("dt", { text: "Sleep debt (last 7 nights)" }), h("dd", { text: GLUI.hm(debt.hours) + " vs " + debt.need + " h need" }));
    if (reg) kv.push(h("dt", { text: "Bedtime variability (14 nights, SD)" }), h("dd", { text: Math.round(reg.bedtimeSd) + " min" }), h("dt", { text: "Wake-time variability (SD)" }), h("dd", { text: Math.round(reg.wakeSd) + " min" }), h("dt", { text: "Average bed → wake" }), h("dd", { text: GLUI.clock(reg.meanOnset) + " → " + GLUI.clock(reg.meanWake) }));
    if (sj) kv.push(h("dt", { text: "Social jet lag (8 weeks)" }), h("dd", { text: Math.round(Math.abs(sj.jetlagMin)) + " min" }), h("dt", { text: "…sleep-corrected" }), h("dd", { text: Math.round(Math.abs(sj.jetlagCorrectedMin)) + " min" }), h("dt", { text: "Work-night / free-night sleep" }), h("dd", { text: GLUI.hm(sj.workH) + " / " + GLUI.hm(sj.freeH) }));
    main.appendChild(sec("Sleep health", null, [kv.length ? h("dl", { class: "kv" }, kv) : note("Not enough nights with sleep data yet."),
      sj ? note("Social jet lag is the gap between the middle of your sleep on weekends and on weekdays (Roenneberg's MCTQ). Over ~1 h is common and is linked in research to worse health outcomes on average – it says nothing certain about you. Free days are taken as Sat/Sun (change in Data → Settings)." ) : null,
      reg ? note("Irregular sleep timing is a risk marker in population studies; a bedtime SD under ~30 min is considered regular. These are rules of thumb, not diagnoses.") : null]));
    var c = h("section", { class: "card" }); main.appendChild(c); var x = App.x(), days = d.dates.map(function (dt) { return d.days[dt] || {}; });
    function hrs(k) { return App.slice(days.map(function (dd) { return ok(dd[k]) ? dd[k] / 3600 : null; })); }
    if (d.s.sleepH.some(ok)) line(c, { title: "Sleep stages (hours)", x: x, stack: true, series: [{ name: "Deep", type: "bar", data: hrs("deepSec"), color: "#6366f1", digits: 1 }, { name: "REM", type: "bar", data: hrs("remSec"), color: "#ec4899", digits: 1 }, { name: "Light", type: "bar", data: hrs("lightSec"), color: "#38bdf8", digits: 1 }, { name: "Awake", type: "bar", data: hrs("awakeSec"), color: "#f59e0b", digits: 1 }], hlines: [{ y: d.settings.sleepNeedH, label: "need", color: "good" }], notes: App.notes(x), note: "Stage times are Garmin's estimates from heart rate and movement. Wrist-based sleep stages are only roughly accurate (deep and REM especially), so read them as trends, not exact minutes." });
    if (d.s.sleepScore.some(ok)) line(c, { title: "Sleep score", x: x, series: [{ name: "Score", data: App.slice(d.s.sleepScore), color: "c5", width: 1.4, dots: true }, { name: "7-day avg", data: App.slice(avg7(d.s.sleepScore)), color: "c4", width: 2.6 }], yMin: 0, yMax: 100, notes: App.notes(x) });
    if (d.s.onset.some(ok)) line(c, { title: "Bedtime and wake time", x: x, series: [{ name: "Fell asleep", data: App.slice(d.s.onset), color: "c5", width: 1.6, dots: true, fmt: GLUI.clock }, { name: "Woke up", data: App.slice(d.s.wake), color: "c4", width: 1.6, dots: true, fmt: GLUI.clock }], yFmt: GLUI.clock, notes: App.notes(x), note: "Local clock times (using the time zone recorded with each night). Weekend shifts show up as steps." });
    if (d.s.sleepH.some(ok)) trendChart(c, "Sleep duration (h)", "sleepH", { digits: 1, fmt: function (v) { return GLUI.hm(v); }, note: false });
    var dd = days.filter(function (x2) { return x2.sleepSec; });
    if (d.s.deepPct.some(ok)) trendChart(c, "Deep sleep share (%)", "deepPct", { digits: 1, note: false });
    // weekday vs weekend
    var wk = [[], []]; d.dates.forEach(function (dt, k) { if (!ok(d.s.sleepH[k]) || k < i - 56) return; wk[d.settings.freeDays.indexOf(D.dow(dt)) >= 0 ? 1 : 0].push(k); });
    if (wk[0].length > 4 && wk[1].length > 1) main.appendChild(sec("Weekdays vs weekends (last 8 weeks)", null, h("div", { class: "tw" }, h("table", { class: "t" }, [h("tr", null, ["", "Weekday", "Weekend"].map(function (x2) { return h("th", { text: x2 }); })), h("tr", null, [h("td", { text: "Sleep" }), h("td", { text: GLUI.hm(S.mean(wk[0].map(function (k) { return d.s.sleepH[k]; }))) }), h("td", { text: GLUI.hm(S.mean(wk[1].map(function (k) { return d.s.sleepH[k]; }))) })]), h("tr", null, [h("td", { text: "Mid-sleep" }), h("td", { text: GLUI.clock(S.mean(wk[0].map(function (k) { return d.s.mid[k]; }))) }), h("td", { text: GLUI.clock(S.mean(wk[1].map(function (k) { return d.s.mid[k]; }))) })]), h("tr", null, [h("td", { text: "Sleep score" }), h("td", { text: num(S.mean(wk[0].map(function (k) { return d.s.sleepScore[k]; })), 0) }), h("td", { text: num(S.mean(wk[1].map(function (k) { return d.s.sleepScore[k]; })), 0) })])]))));
  };

  /* ================= TRAIN ================= */
  var zoneColors = ["#60a5fa", "#34d399", "#fbbf24", "#fb923c", "#f87171"];
  V.train = function (main) {
    var d = ds(), i = d.n - 1; main.appendChild(App.rangeChips());
    var ac = M.acwr(d.s.load, i), mo = M.monotony(d.s.load, i), src = { series: 0, zones: 0, avg: 0, none: 0 }; d.acts.forEach(function (a) { src[a.loadSource] = (src[a.loadSource] || 0) + 1; });
    var s = d.settings;
    main.appendChild(sec("Training status", "As of " + d.dates[i], [h("dl", { class: "kv" }, [h("dt", { text: "Fitness (CTL, 42-day)" }), h("dd", { text: num(d.s.ctl[i], 0) }), h("dt", { text: "Fatigue (ATL, 7-day)" }), h("dd", { text: num(d.s.atl[i], 0) }), h("dt", { text: "Form (TSB = CTL − ATL)" }), h("dd", { text: GLUI.sign(d.s.tsb[i], 0) }), h("dt", { text: "Load ratio (7 d / 28 d)" }), h("dd", { text: ac ? ac.ratio.toFixed(2) + " · " + M.acwrZone(ac.ratio) : "–" }), h("dt", { text: "Monotony · strain (7 d)" }), h("dd", { text: mo && mo.monotony ? mo.monotony.toFixed(1) + " · " + num(mo.strain, 0) : "–" })]),
      note("Load = heart-rate TSS (hrTSS): an approximate Banister TRIMP scaled so one hour at your lactate-threshold HR = 100. It is an estimate from wrist heart rate, not a measurement. Settings used: max HR " + s.maxHr + (s.maxHrAuto ? (s.maxHrSource === "placeholder" ? " (placeholder – no heart-rate data yet; please enter yours)" : s.maxHrSource === "sustained" ? " (estimated from the 99th percentile of your sustained heart rate – please confirm or correct it in Data → Settings)" : " (estimated from your activities’ peak heart rates – please confirm or correct it in Data → Settings)") : "") + ", resting HR " + s.restHr + (s.restHrAuto ? " (auto)" : "") + ", threshold HR " + s.lthr + (s.lthrAuto ? " (auto: 88% of max)" : "") + ". Change them in Data → Settings; wrong values shift every number here."),
      (src.avg || src.none) ? note((src.avg ? src.avg + " activities only have an average heart rate (load is underestimated for interval sessions). " : "") + (src.none ? src.none + " activities have no heart rate and are not counted in load." : ""), "warn") : null]));
    var c = h("section", { class: "card" }); main.appendChild(c); var x = App.x();
    line(c, { title: "Fitness, fatigue and form", x: x, series: [{ name: "Fitness (CTL)", data: App.slice(d.s.ctl), color: "c1", width: 2.4, digits: 0 }, { name: "Fatigue (ATL)", data: App.slice(d.s.atl), color: "c2", width: 1.8, digits: 0 }, { name: "Form (TSB, right axis)", data: App.slice(d.s.tsb), color: "c3", width: 1.6, axis: "right", digits: 0 }], notes: App.notes(x), note: "Banister impulse-response model (τ 42 d / 7 d). Positive form = fresh, strongly negative = carrying fatigue. The first weeks are seeded from your average load, so treat them as warm-up." });
    var ratio = d.dates.map(function (_, k) { var a = M.acwr(d.s.load, k); return a ? a.ratio : null; });
    line(c, { title: "Daily load and 7-day / 28-day ratio", x: x, series: [{ name: "Load (hrTSS)", type: "bar", data: App.slice(d.s.load), color: "c1", digits: 0 }, { name: "Ratio (right axis)", data: App.slice(ratio), color: "c4", width: 2.2, axis: "right", digits: 2 }], hlines: [{ y: 1.3, axis: "right", label: "1.3", color: "warn" }, { y: 0.8, axis: "right", label: "0.8", color: "warn" }], notes: App.notes(x), yRightMin: 0, note: "A ratio above " + M.ACWR_HIGH + " means load jumped quickly compared with your last 4 weeks; that is associated with fatigue. It does not predict injury (the evidence for any single cut-off is weak) – use it as a prompt to look at your week, not a rule. The same " + M.ACWR_HIGH + " line is used for the recovery-score penalty and for the advice." });
    var wks = I.weeks(d).slice(-16), zs = wks.map(function (w) { return M.weeklyZoneDistribution(d, w); });
    if (zs.some(function (z) { return z.total > 0; })) line(c, { title: "Weekly time in heart-rate zones (hours)", x: wks, stack: true, series: [1, 2, 3, 4, 5].map(function (z) { return { name: M.ZONE_NAMES[z - 1], type: "bar", color: zoneColors[z - 1], data: zs.map(function (w) { return w.zones[z] / 3600; }), digits: 1 }; }), xFmt: function (v) { return D.fmtShort(v); }, note: "Zones are % of max HR (50–60, 60–70, 70–80, 80–90, 90–100). Activities with only an average HR are excluded here." });
    var wl = wks.map(function (w) { return S.sum(d.dates.map(function (dt, k) { return dt >= w && dt <= D.addDays(w, 6) ? d.s.load[k] : 0; })); });
    line(c, { title: "Weekly load", x: wks, series: [{ name: "hrTSS", type: "bar", data: wl, color: "c1", digits: 0 }], xFmt: function (v) { return D.fmtShort(v); } });
    if (d.s.vo2max.some(ok)) line(c, { title: "VO2max", x: x, series: [{ name: "VO2max", data: App.slice(d.s.vo2max), color: "c3", width: 2, dots: true, digits: 1 }] });
    // personal records
    var pr = M.personalRecords(d.acts), recs = Object.keys(pr.records).map(function (k) { return pr.records[k]; }).filter(function (r) { return r.group === "run"; }).sort(function (a, b) { return parseFloat(a.dist) - parseFloat(b.dist); });
    if (recs.length) main.appendChild(sec("Running best efforts", "Fastest continuous segment inside any activity that has second-by-second data.", h("div", { class: "tw" }, h("table", { class: "t" }, [h("tr", null, ["Distance", "Time", "Pace", "Date"].map(function (x2) { return h("th", { text: x2 }); }))].concat(recs.map(function (r) { var km = r.dist === "1mi" ? 1.609344 : parseFloat(r.dist); return h("tr", null, [h("td", { text: r.dist }), h("td", { text: fmtT(r.sec) }), h("td", { text: M.paceStr(km * 1000 / r.sec) }), h("td", null, h("a", { href: "#/act/" + encodeURIComponent(r.id), text: r.date, style: { color: "var(--acc)", display: "inline-block", minHeight: "44px", lineHeight: "44px" } }))]); }))))));
    // activity list
    var groups = {}; d.acts.forEach(function (a) { groups[a.group] = (groups[a.group] || 0) + 1; });
    var filter = V._actFilter || "all", limit = V._actLimit || 25;
    var list = d.acts.slice().sort(function (a, b) { return b.start - a.start; }).filter(function (a) { return filter === "all" || a.group === filter; });
    main.appendChild(sec("Activities (" + list.length + ")", null, [h("div", { class: "chips" }, ["all"].concat(Object.keys(groups)).map(function (g) { return h("button", { class: "chip", type: "button", "aria-pressed": filter === g ? "true" : "false", onclick: function () { V._actFilter = g; V._actLimit = 25; App.render(true); } }, g === "all" ? "All" : g + " (" + groups[g] + ")"); })), list.slice(0, limit).map(actRow), list.length > limit ? h("button", { class: "btn block", type: "button", onclick: function () { V._actLimit = limit + 25; App.render(true); } }, "Show more") : null]));
  };
  function fmtT(sec) { var m = Math.floor(sec / 60), s = Math.round(sec - m * 60); if (s === 60) { m++; s = 0; } return m >= 60 ? Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") + ":" + String(s).padStart(2, "0") : m + ":" + String(s).padStart(2, "0"); }
  function downsample(arr, maxN) { if (arr.length <= maxN) return arr.slice(); var f = Math.ceil(arr.length / maxN), out = []; for (var i = 0; i < arr.length; i += f) { var v = arr.slice(i, i + f).filter(ok); out.push(v.length ? S.mean(v) : null); } return { data: out, f: f }; }

  /* ================= ACTIVITY ================= */
  V.act = function (main, id) {
    var d = ds(), a = d.acts.find(function (x) { return x.id === id; });
    main.appendChild(h("p", null, h("a", { href: "#/train", class: "btn", style: { textDecoration: "none", display: "inline-flex", alignItems: "center" }, text: "‹ Training" })));
    if (!a) { main.appendChild(sec("Activity not found", null, h("p", { text: "It may have been removed or replaced by a later import." }))); return; }
    var kv = [["Date", a.date], ["Type", a.type + (a.demo ? " (demo)" : "")], ["Duration", GLUI.dur(a.durationSec)]];
    if (a.distanceM) kv.push(["Distance", (a.distanceM / 1000).toFixed(2) + " km"], ["Avg pace / speed", a.group === "run" || a.group === "walk" ? M.paceStr(a.distanceM / (a.movingSec || a.durationSec)) : (a.distanceM / (a.movingSec || a.durationSec) * 3.6).toFixed(1) + " km/h"]);
    if (ok(a.avgHr)) kv.push(["Avg / max HR", a.avgHr + " / " + (a.maxHr || "–") + " bpm"]); if (ok(a.ascentM)) kv.push(["Ascent", Math.round(a.ascentM) + " m"]); if (ok(a.calories)) kv.push(["Calories", Math.round(a.calories) + " kcal"]); if (ok(a.te)) kv.push(["Garmin aerobic TE", a.te.toFixed(1)]);
    if (ok(a.hrtss)) kv.push(["Load (hrTSS)", Math.round(a.hrtss) + " · TRIMP " + Math.round(a.trimp)]);
    main.appendChild(sec(a.name || a.type, null, [h("dl", { class: "kv" }, kv.reduce(function (acc, p) { acc.push(h("dt", { text: p[0] }), h("dd", { text: p[1] })); return acc; }, [])), a.loadSource === "avg" ? note("Load uses only the average heart rate, so it understates interval or variable sessions.", "warn") : a.loadSource === "none" ? note("No heart rate recorded, so no load was calculated.", "warn") : note("Load source: " + (a.loadSource === "series" ? "second-by-second heart rate" : "Garmin's time-in-zone summary") + ".")]));
    if (a.zoneSecAll && a.loadSource !== "avg") { var z = a.zoneSecAll, tot = S.sum(z.slice(1)); var c0 = h("section", { class: "card" }); main.appendChild(c0); App.mountChart(c0, { title: "Time in heart-rate zones (minutes)", kind: "line", height: 170, x: M.ZONE_NAMES.map(function (n) { return n.split(" ")[0]; }), xFmt: function (v) { return v; }, series: [{ name: "Minutes", type: "bar", data: z.slice(1).map(function (s) { return s / 60; }), colors: zoneColors, color: "c1", digits: 1 }], note: M.ZONE_NAMES.join(" · ") + (z[0] ? " · plus " + GLUI.dur(z[0]) + " below 50%." : "") }); }
    var holder = h("div", { id: "act-series" }, h("p", { class: "muted", text: a.hasSeries ? "Loading second-by-second data…" : "No second-by-second data for this activity (import its FIT file from the export's Uploaded-Files archive to see charts, decoupling and best efforts)." })); main.appendChild(holder);
    if (a.hasSeries || a.series) st.db.getSeries(a.id).then(function (ser) {
      if (!ser || !holder.isConnected) return; holder.textContent = ""; var c = h("section", { class: "card" }); holder.appendChild(c);
      var step = ser.step || 5, hr = downsample(ser.hr, 500), f = hr.f || 1, mins = hr.data ? hr.data.map(function (_, k) { return k * f * step / 60; }) : ser.hr.map(function (_, k) { return k * step / 60; });
      var hrD = hr.data || hr, spd = downsample(ser.spd || [], 500), spdD = (spd.data || spd).map(function (v) { return ok(v) && v > 0 ? v * 3.6 : null; }), alt = ser.alt && ser.alt.some(function (v) { return v; }) ? downsample(ser.alt, 500) : null;
      var run = a.group === "run" || a.group === "walk";
      App.mountChart(c, { title: "Heart rate and speed", x: mins, xFmt: function (v) { return Math.round(v) + " min"; }, height: 230, series: [{ name: "Heart rate (bpm)", data: hrD.map(function (v) { return v > 20 ? v : null; }), color: "c2", width: 1.6, digits: 0 }, { name: "Speed (km/h, right)", data: spdD, color: "c1", width: 1.4, axis: "right", digits: 1, fmt: function (v) { return v.toFixed(1) + " km/h" + (run ? " (" + M.paceStr(v / 3.6) + ")" : ""); } }].concat(alt ? [{ name: "Elevation (m, right)", type: "area", data: (alt.data || alt), color: "c3", width: 1, axis: "right", digits: 0, legend: true }] : []), note: "Tap or drag across the chart to read values." });
      var dc = M.decoupling(ser), slope = ser.hr.length > 200 ? M.hrDriftSlope(ser) : null, kvs = [];
      if (dc && dc.ok) { kvs.push(h("p", null, [h("b", { text: "Aerobic decoupling (Pa:HR): " + dc.pct.toFixed(1) + "%" }), " – speed-per-heartbeat in the 2nd half vs the 1st (after a 10-min warm-up). HR went " + Math.round(dc.hr1) + " → " + Math.round(dc.hr2) + " bpm at " + (dc.speed1 * 3.6).toFixed(1) + " → " + (dc.speed2 * 3.6).toFixed(1) + " km/h."])); kvs.push(dc.steady ? note(dc.pct < 5 ? "Under ~5% is the usual rule-of-thumb for a well-developed aerobic base at that effort." : dc.pct < 10 ? "5–10% suggests some drift (heat, dehydration, fatigue or pace creep)." : "Over ~10% means heart rate climbed a lot for the same speed: heat, fatigue, fuelling or too hard a pace.") : note("Your speed varied a lot within the halves (intervals, hills or stops), so this number is not meaningful for this activity.", "warn")); }
      else if (dc) kvs.push(note("Decoupling not computed: " + dc.reason + "."));
      if (slope && dc && dc.ok && dc.steady) kvs.push(h("p", { class: "muted", text: "HR drift trend after warm-up: " + GLUI.sign(slope.slopePer10Min, 1) + " bpm per 10 min (R² " + slope.r2.toFixed(2) + ")." }));
      c.appendChild(h("h2", { text: "Cardiac drift" })); kvs.forEach(function (k) { c.appendChild(k); });
    });
    if (a.best && Object.keys(a.best).length) { var pr = M.personalRecords(d.acts); main.appendChild(sec("Best efforts in this activity", null, h("ul", { class: "list" }, Object.keys(a.best).map(function (k) { var km = k === "1mi" ? 1.609344 : parseFloat(k), rec = pr.records[a.group + ":" + k]; return h("li", null, [h("b", { text: k + "  " }), fmtT(a.best[k]) + " · " + M.paceStr(km * 1000 / a.best[k]), rec && rec.id === a.id ? [" ", badge("all-time best in your data", "good")] : null]); })))); }
  };

  /* ================= INSIGHTS ================= */
  var SECS = [["explore", "Explorer"], ["drivers", "What affects what"], ["reports", "Reports"], ["goals", "Goals"], ["alerts", "Alerts"]];
  V.insights = function (main, arg) {
    var cur = arg || "explore"; main.appendChild(h("div", { class: "chips", role: "navigation", "aria-label": "Insights sections" }, SECS.map(function (s) { return h("a", { class: "chip" + (cur === s[0] ? " on" : ""), href: "#/insights/" + s[0], style: { textDecoration: "none", display: "inline-flex", alignItems: "center" }, "aria-current": cur === s[0] ? "page" : null }, s[1]); })));
    ({ explore: explorer, drivers: drivers, reports: reports, goals: goals, alerts: alerts }[cur] || explorer)(main);
  };
  var EX = { x: "load", y: "lnHrv", lag: 1, method: "spearman", detrend: true };
  var EX_KEYS = ["lnHrv", "rhr", "sleepH", "sleepScore", "deepPct", "stress", "sleepStress", "bbHigh", "bbLow", "resp", "spo2", "skin", "steps", "activeMin", "load", "ctl", "atl", "tsb", "recovery", "onset", "mid", "weight", "vo2max"];
  function explorer(main) {
    var d = ds(), keys = EX_KEYS.filter(function (k) { return d.s[k] && S.clean(d.s[k]).length >= 20; });
    if (keys.indexOf(EX.x) < 0) EX.x = keys[0]; if (keys.indexOf(EX.y) < 0) EX.y = keys[1] || keys[0];
    function sel(id, label, val, onchange) { return h("div", { class: "field" }, [h("label", { for: id, text: label }), h("select", { class: "inp", id: id, onchange: function (e) { onchange(e.target.value); App.render(true); } }, keys.map(function (k) { return h("option", { value: k, selected: k === val ? "" : null, text: L[k] || k }); }))]); }
    var lagSel = h("div", { class: "field" }, [h("label", { for: "ex-lag", text: "Timing" }), h("select", { class: "inp", id: "ex-lag", onchange: function (e) { EX.lag = +e.target.value; App.render(true); } }, [-3, -2, -1, 0, 1, 2, 3].map(function (l) { return h("option", { value: String(l), selected: l === EX.lag ? "" : null, text: l === 0 ? "Same day (baseline check)" : l > 0 ? "Y is " + l + " day" + (l > 1 ? "s" : "") + " after X" : "Y is " + (-l) + " day" + (l < -1 ? "s" : "") + " before X" }); }))]);
    main.appendChild(sec("Correlation explorer", "Pick any two measures and see how they move together – with honest caveats.", [h("div", { class: "fields" }, [sel("ex-x", "X (the possible driver)", EX.x, function (v) { EX.x = v; }), sel("ex-y", "Y (the outcome)", EX.y, function (v) { EX.y = v; }), lagSel, h("div", { class: "field" }, [h("label", { for: "ex-m", text: "Method" }), h("select", { class: "inp", id: "ex-m", onchange: function (e) { EX.method = e.target.value; App.render(true); } }, [["spearman", "Spearman (rank, robust)"], ["pearson", "Pearson (linear)"]].map(function (m) { return h("option", { value: m[0], selected: EX.method === m[0] ? "" : null, text: m[1] }); }))]), h("label", { class: "wide", style: { display: "flex", gap: "10px", alignItems: "center", minHeight: "44px" } }, [h("input", { type: "checkbox", checked: EX.detrend ? "" : null, style: { width: "22px", height: "22px" }, onchange: function (e) { EX.detrend = e.target.checked; App.render(true); } }), "Compare day-to-day deviations from my own 28-day normal (recommended: removes slow trends that fake correlations)"])])]));
    var e = I.explore(d, EX.x, EX.y, { lag: EX.lag, method: EX.method, detrend: EX.detrend }), box = h("section", { class: "card" }); main.appendChild(box);
    if (e.r === null || e.r === undefined) { box.appendChild(h("p", { text: "Not enough overlapping days for this pair." })); }
    else {
      var lagTxt = EX.lag === 0 ? (I.isBaselineCheck(EX.x, EX.y) ? "that same morning (a baseline check: the reading came before the activity)" : "on the same day") : EX.lag > 0 ? EX.lag + " day" + (EX.lag > 1 ? "s" : "") + " later" : "(Y happened " + (-EX.lag) + " day" + (EX.lag < -1 ? "s" : "") + " before X)";
      box.appendChild(h("h2", null, [e.strength[0].toUpperCase() + e.strength.slice(1) + " relationship  ", badge("ρ = " + e.r.toFixed(2), Math.abs(e.r) >= 0.3 ? "warn" : "none")]));
      box.appendChild(h("p", { text: "When " + (L[EX.x] || EX.x) + " is higher, " + (L[EX.y] || EX.y) + " tends to be " + (e.r > 0 ? "higher" : "lower") + " " + lagTxt + "." }));
      box.appendChild(h("p", { class: "muted", text: "n = " + e.n + " paired days (≈ " + e.nEff + " independent) · 95% CI " + e.ci[0].toFixed(2) + " to " + e.ci[1].toFixed(2) + " · p " + (e.p < 0.001 ? "< 0.001" : "= " + e.p.toFixed(3)) + (e.lr ? " · slope " + e.lr.slope.toPrecision(2) + " per unit" : "") }));
      e.warnings.forEach(function (w) { box.appendChild(note(w, /Only|few/.test(w) ? "warn" : "")); });
      var sc = h("div", {}); box.appendChild(sc);
      App.mountChart(sc, { kind: "scatter", title: (L[EX.x] || EX.x) + " vs " + (L[EX.y] || EX.y) + (EX.detrend ? " (deviation from normal)" : ""), height: 250, points: e.xs.map(function (v, k) { return { x: v, y: e.ys[k], date: e.dates[k] }; }), fit: e.lr, xLabel: L[EX.x] || EX.x, yLabel: L[EX.y] || EX.y, xName: L[EX.x] || EX.x, yName: L[EX.y] || EX.y });
      var ls = I.lagScan(d, EX.x, EX.y, [-3, -2, -1, 0, 1, 2, 3], { method: EX.method, detrend: EX.detrend }), lc = h("div", {}); box.appendChild(lc);
      App.mountChart(lc, { title: "Correlation by timing (days Y is after X)", height: 180, x: ls.results.map(function (r) { return (r.lag > 0 ? "+" : "") + r.lag + "d"; }), xFmt: function (v) { return v; }, series: [{ name: "ρ", type: "bar", data: ls.results.map(function (r) { return r.r; }), color: "c1", digits: 2, colors: ls.results.map(function (r) { return r.q !== null && r.q < 0.05 ? "#22c55e" : "#94a3b8"; }) }], yMin: -1, yMax: 1, hlines: [{ y: 0, dash: false }], note: "Green bars survive correction for testing 7 timings (q < 0.05). " + ls.note });
    }
  }
  function verdictBadge(v) { return v === "supported" ? badge("supported by your data", "good") : v === "hint" ? badge("possible", "warn") : v === "too-few" ? badge("too few examples", "none") : badge("no clear effect", "none"); }
  function drivers(main) {
    var d = ds(), hyp = d._hyp || (d._hyp = I.hypotheses(d)), as = d._assoc || (d._assoc = I.associations(d));
    main.appendChild(note("These are comparisons inside your own history. They show what has gone together for you, not proof of cause. Each result is corrected for the number of comparisons made (q-values, Benjamini–Hochberg); “supported” needs q < 0.05, a medium-or-larger effect (|d| ≥ 0.5) and at least 8 examples. With several comparisons, one may look significant by chance – re-check a surprising result later before acting on it."));
    hyp.forEach(function (hy) {
      main.appendChild(h("section", { class: "card" }, [h("h2", null, [hy.title + "  ", verdictBadge(hy.verdict)]), h("p", { class: "sub", text: hy.days + " day" + (hy.days === 1 ? "" : "s") + " matched · effect measured " + hy.when }),
        hy.effects.length ? h("ul", { class: "list" }, hy.effects.map(function (e) { return h("li", null, [verdictBadge(e.verdict), " ", e.text, h("span", { class: "muted", text: "  d=" + (e.d === null ? "–" : e.d.toFixed(2)) + ", q=" + (e.q < 0.001 ? "<0.001" : e.q.toFixed(3)) })]); })) : h("p", { class: "muted", text: hy.days < 3 ? "Needs at least 3 matching days." : "No data for these measures." })]));
    });
    var top = as.results.filter(function (r) { return r.significant; }).slice(0, 12);
    main.appendChild(sec("What affects what – strongest associations", as.tests + " pairs tested", [top.length ? h("ul", { class: "list" }, top.map(function (r) { return h("li", null, [r.text, h("span", { class: "muted", text: " q " + (r.q < 0.001 ? "<0.001" : r.q.toFixed(3)) })]); })) : h("p", { text: "No association stood out after correcting for multiple testing – common with under ~2 months of data." }), note(as.note)]));
    main.appendChild(h("p", null, h("a", { href: "#/data", text: "Add events (alcohol, late caffeine, illness, travel…) in Data → Events to test your own hypotheses.", style: { color: "var(--acc)" } })));
  }
  var REP = { type: "week", pick: null };
  function reports(main) {
    var d = ds(), isW = REP.type === "week", list = (isW ? I.weeks(d) : I.months(d)).slice().reverse();
    if (!REP.pick || list.indexOf(REP.pick) < 0 || REP.pickType !== REP.type) { REP.pick = list[0]; REP.pickType = REP.type; }
    main.appendChild(h("div", { class: "fields" }, [h("div", { class: "field" }, [h("label", { for: "rp-t", text: "Report" }), h("select", { class: "inp", id: "rp-t", onchange: function (e) { REP.type = e.target.value; App.render(true); } }, [["week", "Weekly"], ["month", "Monthly"]].map(function (o) { return h("option", { value: o[0], selected: REP.type === o[0] ? "" : null, text: o[1] }); }))]), h("div", { class: "field" }, [h("label", { for: "rp-p", text: isW ? "Week starting (Mon)" : "Month" }), h("select", { class: "inp", id: "rp-p", onchange: function (e) { REP.pick = e.target.value; App.render(true); } }, list.map(function (k) { return h("option", { value: k, selected: REP.pick === k ? "" : null, text: k }); }))])]));
    var r = isW ? I.weeklyReport(d, REP.pick) : I.monthlyReport(d, REP.pick); if (!r) { main.appendChild(sec("Report", null, h("p", { text: "No data." }))); return; }
    var lines = [(isW ? "Week of " : "Month ") + REP.pick + " (" + r.from + " → " + r.to + ", " + r.days + " days)"].concat(r.highlights, r.metrics.filter(function (m) { return m.mean !== null && m.mean !== undefined; }).map(function (m) { return m.label + ": " + (Math.abs(m.mean) >= 100 ? m.mean.toFixed(0) : m.mean.toFixed(1)) + (m.delta !== null ? " (" + GLUI.sign(m.delta, Math.abs(m.delta) < 10 ? 1 : 0) + " vs previous)" : ""); }), ["Activities: " + r.activities + ", " + r.distanceKm.toFixed(1) + " km, " + r.durationH.toFixed(1) + " h, load " + Math.round(r.load)]);
    main.appendChild(sec((isW ? "Week of " : "") + REP.pick, r.from + " → " + r.to + " · " + r.days + " days", [
      r.highlights.length ? h("ul", { class: "list" }, r.highlights.map(function (t) { return h("li", { text: t }); })) : h("p", { text: "No change stands out versus the previous " + r.days + " days." }),
      h("div", { class: "tw" }, h("table", { class: "t" }, [h("tr", null, ["Metric", "Average", "Previous", "Δ"].map(function (x) { return h("th", { text: x }); }))].concat(r.metrics.map(function (m) { var f = function (v) { return v === null || v === undefined ? "–" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1); }; return h("tr", null, [h("td", { text: m.label }), h("td", { text: f(m.mean) }), h("td", { text: f(m.prev) }), h("td", { text: m.delta === null ? "–" : GLUI.sign(m.delta, Math.abs(m.delta) < 10 ? 1 : 0) })]); })))),
      h("p", { text: r.activities + " activities · " + r.distanceKm.toFixed(1) + " km · " + r.durationH.toFixed(1) + " h · load " + Math.round(r.load) + " · fitness (CTL) " + num(r.ctlEnd, 0) + ", form " + GLUI.sign(r.tsbEnd, 0) }),
      r.bestRecovery ? h("p", { text: "Best recovery: " + r.bestRecovery.v + " on " + r.bestRecovery.date + " · lowest: " + r.worstRecovery.v + " on " + r.worstRecovery.date }) : null,
      r.sleepRegularity ? h("p", { text: "Bedtime variability (SD): " + Math.round(r.sleepRegularity.bedtimeSd) + " min" }) : null,
      r.anomalies.length ? note("Body-strain signature days: " + r.anomalies.map(function (a) { return a.start + (a.end !== a.start ? "→" + a.end : ""); }).join(", ")) : null,
      r.notes.length ? h("p", { class: "muted", text: "Your events: " + r.notes.map(function (n) { return n.date.slice(5) + " " + (n.label || n.type); }).join("; ") }) : null,
      h("div", { class: "actions" }, [h("button", { class: "btn", type: "button", onclick: function () { var t = lines.join("\n"); if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { GLUI.toast("Copied"); }, function () { GLUI.toast("Copy failed"); }); } }, "Copy as text"), h("button", { class: "btn", type: "button", onclick: function () { window.print(); } }, "Print / save PDF")])]));
  }
  var GOAL_KEYS = [["steps", "Steps", "day"], ["sleepH", "Sleep hours", "day"], ["stress", "Stress (avg)", "day"], ["rhr", "Resting HR", "day"], ["activeMin", "Intensity minutes", "week"], ["sessions", "Workouts", "week"], ["distanceKm", "Distance (km)", "week"], ["load", "Training load (hrTSS)", "week"]];
  function goals(main) {
    var d = ds(), presets = [{ key: "steps", op: ">=", target: 8000, period: "day", label: "8,000 steps a day" }, { key: "sleepH", op: ">=", target: 7, period: "day", label: "Sleep at least 7 h" }, { key: "sessions", agg: "sum", op: ">=", target: 3, period: "week", label: "3 workouts a week" }, { key: "stress", op: "<=", target: 35, period: "day", label: "Average stress ≤ 35" }];
    var list = st.goals;
    main.appendChild(sec("Goals", "Progress over the last 30 days (daily goals) or 12 weeks (weekly goals).", list.length ? list.map(function (g, k) {
      var ev = I.evaluateGoal(d, g), cur = ev.current, pct = ev.rate === null ? null : Math.round(ev.rate * 100);
      return h("div", { class: "card", style: { background: "var(--bg)" } }, [h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, [h("b", { style: { flex: 1 }, text: g.label || g.key }), h("button", { class: "btn danger", type: "button", "aria-label": "Delete goal " + (g.label || g.key), onclick: function () { App.saveGoals(st.goals.filter(function (_, j) { return j !== k; })); } }, "✕")]),
        h("div", { class: "prog", role: "progressbar", "aria-valuenow": pct === null ? "0" : String(pct), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Goal met in " + (pct === null ? 0 : pct) + "% of periods" }, h("i", { style: { width: (pct || 0) + "%" } })),
        h("p", { class: "muted", text: pct === null ? "No data yet." : "Met in " + ev.met + " of " + ev.periods + " " + (g.period === "week" ? "weeks" : "days") + " (" + pct + "%) · current streak " + ev.streak + (cur && ok(cur.value) ? " · latest " + (Math.abs(cur.value) >= 100 ? cur.value.toFixed(0) : cur.value.toFixed(1)) : "") })]);
    }) : h("p", { text: "No goals yet. Add one below." })));
    var f = { key: "steps", op: ">=", target: 8000 };
    main.appendChild(sec("Add a goal", null, [h("div", { class: "actions", style: { marginTop: 0 } }, presets.map(function (p) { return h("button", { class: "chip", type: "button", onclick: function () { App.saveGoals(st.goals.concat([p])); } }, "+ " + p.label); })),
      h("div", { class: "fields", style: { marginTop: "10px" } }, [h("div", { class: "field" }, [h("label", { for: "g-k", text: "Measure" }), h("select", { class: "inp", id: "g-k", onchange: function (e) { f.key = e.target.value; } }, GOAL_KEYS.map(function (g) { return h("option", { value: g[0], text: g[1] + " (per " + g[2] + ")" }); }))]), h("div", { class: "field" }, [h("label", { for: "g-o", text: "Direction" }), h("select", { class: "inp", id: "g-o", onchange: function (e) { f.op = e.target.value; } }, [h("option", { value: ">=", text: "at least" }), h("option", { value: "<=", text: "at most" })])]), h("div", { class: "field wide" }, [h("label", { for: "g-t", text: "Target" }), h("input", { class: "inp", id: "g-t", type: "number", inputmode: "decimal", value: "8000", onchange: function (e) { f.target = +e.target.value; } })])]),
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: function () { var gk = GOAL_KEYS.find(function (g) { return g[0] === f.key; }), t = +document.getElementById("g-t").value; if (!ok(t)) return; f.target = t; f.op = document.getElementById("g-o").value; f.key = document.getElementById("g-k").value; gk = GOAL_KEYS.find(function (g) { return g[0] === f.key; }); App.saveGoals(st.goals.concat([{ key: f.key, op: f.op, target: f.target, period: gk[2], agg: gk[2] === "week" && f.key !== "rhr" ? "sum" : "avg", label: gk[1] + (f.op === ">=" ? " ≥ " : " ≤ ") + f.target + " per " + gk[2] }])); } }, "Add goal"))]));
  }
  function alerts(main) {
    var d = ds(), eps = M.anomalyEpisodes(d).reverse();
    main.appendChild(note("A flag means resting HR is up and HRV is down against your own baseline (HRV measured on a log scale), ideally with higher breathing rate or skin temperature too. One flagged night is only “worth watching”; 2 or more days in a row is a “strain pattern”. The same pattern follows alcohol, very hard training, travel, bad sleep and, for some people, the luteal phase of the menstrual cycle (tag it as a “cycle” event in Data → Events). Flagged days are left out of the baseline, so a long illness keeps showing instead of becoming your new normal. " + M.ANOMALY_CARE));
    main.appendChild(sec("Detected episodes", eps.length + " found in your data", eps.length ? h("ul", { class: "list" }, eps.map(function (e) { return h("li", null, [badge(e.kind === "pattern" ? "strain pattern" : "worth watching", e.kind === "pattern" ? "bad" : "warn"), " ", h("b", { text: e.start + (e.end !== e.start ? " → " + e.end : "") }), " (" + e.length + " day" + (e.length > 1 ? "s" : "") + "): " + e.signals.join(", "), e.matchesNote ? h("div", { class: "muted", text: "Your own event tags nearby: " + e.notes.join(", ") + " – may explain it." }) : null]); })) : h("p", { text: "No episodes. That is normal – it needs at least ~2 weeks of baseline." })));
  }
})();
