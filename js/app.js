/* Garmin Lens – app core: state, storage, import, routing, PWA plumbing. Views live in views.js / data-view.js. All data stays on this device. */
(function () {
  "use strict";
  var APP_VERSION = "1.0.0";
  var h = GLUI.h, $ = GLUI.$, M = GLModels, I = GLInsights, S = GLStats, D = GLDates, toast = GLUI.toast;
  var state = { db: null, days: [], acts: [], notes: [], goals: [], settings: {}, ds: null, range: 90, showNotes: true, charts: [], autoMaxHr: null, hasDemo: false };
  var views = {}, App = { state: state, views: views, APP_VERSION: APP_VERSION };
  window.GLApp = App;

  /* ---------- data ---------- */
  function effectiveSettings() {
    var st = Object.assign({}, state.settings), clean = {};
    ["maxHr", "restHr", "lthr", "sleepNeedH"].forEach(function (k) { if (S.ok(+st[k]) && st[k] !== "" && st[k] !== null) clean[k] = +st[k]; });
    clean.sex = st.sex === "f" ? "f" : "m"; clean.freeDays = Array.isArray(st.freeDays) ? st.freeDays : [6, 0];
    if (!clean.maxHr) { var est = M.estimateMaxHr(state.acts); state.autoMaxHr = est.value; clean.maxHr = est.value; clean.maxHrAuto = true; clean.maxHrSource = est.source; }
    return clean;
  }
  function loadAll() {
    var db = state.db;
    return Promise.all([db.getDays(), db.getActivities(), db.getNotes(), db.getMeta("goals", []), db.getMeta("settings", {})]).then(function (r) {
      state.days = r[0]; state.acts = r[1]; state.notes = r[2]; state.goals = r[3] || []; state.settings = r[4] || {};
      state.hasDemo = state.days.some(function (d) { return d.demo; });
      state.ds = state.days.length || state.acts.length ? M.prepare(state.days, state.acts, state.notes, effectiveSettings()) : null;
      var bar = $("#demo-bar"); if (bar) bar.hidden = !state.hasDemo;
      document.title = (state.hasDemo ? "DEMO – " : "") + "Garmin Lens";
    });
  }
  function reload() { return loadAll().then(function () { render(true); }); }
  function saveSettings(patch) { state.settings = Object.assign({}, state.settings, patch); return state.db.setMeta("settings", state.settings).then(reload); }
  function saveGoals(list) { state.goals = list; return state.db.setMeta("goals", list).then(reload); }

  /* ---------- import ---------- */
  function importWithWorker(files, onProgress) {
    return new Promise(function (resolve, reject) {
      var w; try { w = new Worker("js/worker.js"); } catch (e) { return reject(e); }
      w.onmessage = function (e) { var m = e.data; if (m.type === "progress") onProgress && onProgress(m); else if (m.type === "done") { w.terminate(); resolve(m.result); } else if (m.type === "error") { w.terminate(); reject(new Error(m.message)); } };
      w.onerror = function (e) { w.terminate(); reject(new Error(e.message || "worker failed")); };
      w.postMessage({ files: files, distanceUnit: state.settings.csvDistanceUnit || "auto" });
    });
  }
  function importOnMainThread(files, onProgress) {
    var imp = GLImporter.create({ distanceUnit: state.settings.csvDistanceUnit || "auto", onProgress: function (p) { onProgress && onProgress({ files: p.files, current: p.current }); } });
    return imp.addFiles(files).then(function () { return imp.result(); });
  }
  function runImport(fileList, onProgress) {
    var files = Array.prototype.map.call(fileList, function (f) { return { name: f.name, size: f.size, blob: f }; });
    return importWithWorker(files, onProgress).catch(function (err) { console.info("worker unavailable, importing on the main thread:", err.message); return importOnMainThread(files, onProgress); }).then(function (r) {
      var real = !r.stats.demo;
      return state.db.putDays(r.days).then(function () { return state.db.putActivities(r.activities); }).then(function () { return real && state.hasDemo ? state.db.clearDemo().then(function () { r.stats.demoCleared = true; }) : null; })
        .then(function () { return loadAll(); }).then(function () { return r; });
    });
  }
  function loadDemo() {
    var d = GLDemo.generate({ end: D.addDays(D.todayKey(), -1) });
    d.activities.forEach(GLImporter.addHrHist);
    return state.db.clearDemo().then(function () { return state.db.putDays(d.days); }).then(function () { return state.db.putActivities(d.activities); }).then(function () { return Promise.all(d.annotations.map(function (n) { return state.db.putNote(n); })); }).then(reload);
  }
  App.runImport = runImport; App.loadDemo = loadDemo; App.reload = reload; App.saveSettings = saveSettings; App.saveGoals = saveGoals; App.loadAll = loadAll;
  App.clearDemo = function () { return state.db.clearDemo().then(reload); };

  /* ---------- charts ---------- */
  App.mountChart = function (container, spec) { var m = GLCharts.mount(container, spec); state.charts.push(m); return m; };
  App.rangeStart = function () { var ds = state.ds; return state.range ? Math.max(0, ds.n - state.range) : 0; };
  App.slice = function (arr) { return arr.slice(App.rangeStart()); };
  App.x = function () { return state.ds.dates.slice(App.rangeStart()); };
  App.notes = function (x) { if (!state.showNotes) return []; var set = {}; x.forEach(function (d) { set[d] = 1; }); return state.notes.filter(function (n) { return set[n.date]; }).map(function (n) { return { date: n.date, type: n.type, label: n.label || n.type }; }); };
  App.rangeChips = function () {
    var opts = [[30, "30 d"], [90, "90 d"], [180, "6 mo"], [0, "All"]];
    return h("div", { class: "chips", role: "group", "aria-label": "Date range" }, opts.map(function (o) { return h("button", { class: "chip", type: "button", "aria-pressed": state.range === o[0] ? "true" : "false", onclick: function () { state.range = o[0]; render(true); } }, o[1]); }).concat([h("button", { class: "chip", type: "button", "aria-pressed": state.showNotes ? "true" : "false", title: "Show your event markers on charts", onclick: function () { state.showNotes = !state.showNotes; render(true); } }, "▲ Events")]));
  };

  /* ---------- routing ---------- */
  var TABS = [["today", "📅", "Today"], ["trends", "📈", "Trends"], ["sleep", "🌙", "Sleep"], ["train", "🏃", "Train"], ["insights", "🔎", "Insights"], ["data", "🗂️", "Data"]];
  function parseHash() { var m = (location.hash || "#/today").replace(/^#\/?/, "").split("/"); return { name: m[0] || "today", arg: m.slice(1).map(decodeURIComponent).join("/") }; }
  function render(keepScroll) {
    var y = window.scrollY, r = parseHash(), main = $("#app");
    state.charts.forEach(function (c) { try { c.destroy(); } catch (e) {} }); state.charts = [];
    main.textContent = "";
    var tab = r.name === "act" ? "train" : r.name; document.querySelectorAll("#tabs a").forEach(function (a) { var on = a.dataset.tab === tab; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $("#title").textContent = ({ today: "Today", trends: "Trends", sleep: "Sleep", train: "Training", act: "Activity", insights: "Insights", data: "Data & setup" })[r.name] || "Garmin Lens";
    var view = views[r.name] || views.today;
    try {
      if ((!state.ds || !state.ds.n) && r.name !== "data") main.appendChild(views.welcome()); else view(main, r.arg);
    } catch (e) { console.error(e); main.appendChild(h("section", { class: "card" }, [h("h2", { text: "Something went wrong drawing this page" }), h("p", { class: "muted", text: String(e && e.message || e) })])); }
    main.appendChild(h("p", { class: "disclaimer", text: "Garmin Lens shows patterns in your own data. It is not a medical device and gives no medical advice, diagnosis or treatment. Talk to a clinician about health concerns." }));
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  }
  App.render = render; App.parseHash = parseHash;

  /* ---------- theme, install, update ---------- */
  function applyTheme(t) { if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme"); }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute("data-theme") || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"), next = cur === "dark" ? "light" : "dark";
    applyTheme(next); try { localStorage.setItem("garmin-lens-theme", next); } catch (e) {}
  }
  var deferredInstall = null;
  function installInit() {
    function isStandalone() { return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }
    function hide() { $("#install-banner").hidden = true; document.body.classList.remove("has-banner"); }
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredInstall = e; var dis = 0; try { dis = +localStorage.getItem("garmin-lens-install-dismissed") || 0; } catch (x) {} if (isStandalone() || Date.now() - dis < 14 * 864e5) return; setTimeout(function () { $("#install-banner").hidden = false; document.body.classList.add("has-banner"); }, 1500); });
    window.addEventListener("appinstalled", function () { deferredInstall = null; hide(); toast("Garmin Lens installed"); });
    $("#install-btn").onclick = function () { if (deferredInstall) { deferredInstall.prompt(); deferredInstall.userChoice.then(function () { deferredInstall = null; hide(); }); } };
    $("#install-dismiss").onclick = function () { try { localStorage.setItem("garmin-lens-install-dismissed", String(Date.now())); } catch (e) {} hide(); };
  }
  function swInit() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      function offer(w) { $("#update-bar").hidden = false; $("#update-btn").onclick = function () { w.postMessage("skipWaiting"); }; }
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", function () { var nw = reg.installing; if (!nw) return; nw.addEventListener("statechange", function () { if (nw.state === "installed" && navigator.serviceWorker.controller) offer(nw); }); });
      function check() { try { reg.update().catch(function () {}); } catch (e) {} }
      document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") check(); }); setInterval(check, 3600e3);
    }).catch(function (e) { console.info("service worker not registered:", e.message); });
    var reloading = false; navigator.serviceWorker.addEventListener("controllerchange", function () { if (reloading || $("#update-bar").hidden) return; reloading = true; location.reload(); });
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    try { applyTheme(localStorage.getItem("garmin-lens-theme")); } catch (e) {}
    var tabs = $("#tabs"); TABS.forEach(function (t) { tabs.appendChild(h("a", { href: "#/" + t[0], "data-tab": t[0] }, [h("span", { "aria-hidden": "true", text: t[1] }), t[2]])); });
    $("#themeBtn").onclick = toggleTheme;
    $("#demo-clear").onclick = function () { if (confirm("Remove the demo data? Your own data (if any) is kept.")) App.clearDemo().then(function () { toast("Demo data removed"); }); };
    window.addEventListener("hashchange", function () { render(false); });
    installInit(); swInit();
    GLDB.open().then(function (db) { state.db = db; App.dbKind = db.kind; return loadAll(); }).then(function () { render(false); window.__glReady = true; }).catch(function (e) { console.error(e); $("#app").textContent = "Could not open local storage: " + e.message; });
  });
})();
