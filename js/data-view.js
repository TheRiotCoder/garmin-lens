/* Garmin Lens – Data & setup view: import, demo, events, settings, backup/export, privacy. */
(function () {
  "use strict";
  var App = window.GLApp, V = App.views, st = App.state, h = GLUI.h, I = GLInsights, toast = GLUI.toast, ok = GLStats.ok;
  function sec(title, sub, kids) { return h("section", { class: "card" }, [h("h2", { text: title }), sub ? h("p", { class: "sub", text: sub }) : null, kids]); }
  function note(t, cls) { return h("p", { class: "note" + (cls ? " " + cls : ""), text: t }); }
  function field(id, label, input, wide) { return h("div", { class: "field" + (wide ? " wide" : "") }, [h("label", { for: id, text: label }), input]); }
  var EVENT_TYPES = [["alcohol", "Alcohol"], ["caffeine", "Late caffeine"], ["hard", "Hard session / race"], ["illness", "Feeling ill"], ["travel", "Travel / time-zone change"], ["stress", "Stressful day"], ["cycle", "Menstrual cycle phase (e.g. luteal)"], ["note", "Other note"]];

  V.data = function (main) {
    var d = st.ds, counts = d ? { days: d.days ? Object.keys(d.days).length : 0, acts: d.acts.length } : { days: 0, acts: 0 };
    /* ---- status ---- */
    main.appendChild(sec("Your data on this device", null, [
      d ? h("dl", { class: "kv" }, [h("dt", { text: "Days with data" }), h("dd", { text: String(counts.days) }), h("dt", { text: "Activities" }), h("dd", { text: String(counts.acts) }), h("dt", { text: "Range" }), h("dd", { text: d.dates[0] + " → " + d.dates[d.n - 1] }), h("dt", { text: "Storage" }), h("dd", { text: App.dbKind === "memory" ? "memory only (private mode – lost on close)" : "IndexedDB in this browser" })]) : h("p", { text: "Nothing loaded yet." }),
      st.hasDemo ? note("Demo data (synthetic) is loaded. It is generated in your browser to show what the app does – it is not anyone's real health data.", "warn") : null,
      h("div", { class: "actions" }, [h("button", { class: "btn", type: "button", onclick: function () { App.loadDemo().then(function () { toast("Demo data loaded"); }); } }, st.hasDemo ? "Regenerate demo data" : "Load demo data"), st.hasDemo ? h("button", { class: "btn", type: "button", onclick: function () { App.clearDemo().then(function () { toast("Demo data removed"); }); } }, "Remove demo data") : null])
    ]));
    /* ---- import ---- */
    var out = h("div", { "aria-live": "polite" }), bar = h("div", { class: "prog", hidden: "" }, h("i", { style: { width: "0%" } })), cur = h("p", { class: "muted" });
    var input = h("input", { type: "file", multiple: "", accept: ".zip,.json,.csv,.fit,.tcx,.gpx", id: "file-in", class: "sr", "aria-label": "Choose Garmin export files", onchange: function (e) { doImport(e.target.files); e.target.value = ""; } });
    function doImport(files) {
      if (!files || !files.length) return; out.textContent = ""; bar.hidden = false; bar.firstChild.style.width = "5%"; cur.textContent = "Reading " + files.length + " file(s)…";
      var t0 = Date.now(), n = 0;
      App.runImport(files, function (p) { n = p.files; cur.textContent = "Processed " + p.files + " files · " + (p.current || "").split("/").pop(); bar.firstChild.style.width = Math.min(95, 5 + n) + "%"; }).then(function (r) {
        bar.hidden = true; cur.textContent = ""; var s = r.stats;
        out.appendChild(h("div", { class: "note" }, [h("b", { text: "Imported " + r.days.length + " days and " + r.activities.length + " activities" }), " from " + s.files + " files in " + ((Date.now() - t0) / 1000).toFixed(1) + " s.", s.demoCleared ? " Demo data was replaced by your data." : ""]));
        if (!r.days.length && !r.activities.length) out.appendChild(note("Nothing recognisable was found. Choose the whole export .zip (or its JSON/FIT/TCX/GPX/CSV files). See the steps below.", "warn"));
        if (s.fitOther) out.appendChild(note(s.fitOther + " non-activity FIT files (monitoring/sleep/etc.) were read but only activity files add to your charts."));
        var kinds = Object.keys(s.kinds).map(function (k) { return k + " " + s.kinds[k]; }).join(" · "); if (kinds) out.appendChild(h("p", { class: "muted", text: "Recognised: " + kinds + (s.ignored ? " · ignored " + s.ignored : "") }));
        s.warnings.slice(0, 8).forEach(function (w) { out.appendChild(note(w, "warn")); }); s.errors.slice(0, 8).forEach(function (w) { out.appendChild(note(w, "bad")); });
        if (r.days.length || r.activities.length) out.appendChild(h("div", { class: "actions" }, h("a", { class: "btn primary", href: "#/today", style: { textDecoration: "none", display: "inline-flex", alignItems: "center" } }, "See my data")));
      }, function (err) { bar.hidden = true; cur.textContent = ""; out.appendChild(note("Import failed: " + err.message, "bad")); });
    }
    var drop = h("div", { class: "drop", id: "drop", ondragover: function (e) { e.preventDefault(); drop.classList.add("over"); }, ondragleave: function () { drop.classList.remove("over"); }, ondrop: function (e) { e.preventDefault(); drop.classList.remove("over"); doImport(e.dataTransfer.files); } }, [h("p", { text: "Drop your Garmin export .zip here, or" }), h("label", { class: "btn primary", for: "file-in", style: { display: "inline-flex", alignItems: "center" }, tabindex: "0", onkeydown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } } }, "Choose files…")]);
    main.appendChild(sec("Import your Garmin data", "Files are read in your browser and never uploaded.", [note("Heads-up: the importer is built from Garmin’s published file formats and public examples, but it has not yet been tested against a real Garmin export (only synthetic data and real FIT files). If something looks wrong or missing after you import, it may be a reading problem on our side – check the import summary and be sceptical of the numbers.", "warn"), input, drop, bar, cur, out,
      h("details", { class: "how", open: !d || st.hasDemo ? "" : null }, [h("summary", { text: "How do I get my data from Garmin?" }), h("ol", null, [
        h("li", { text: "On a computer, sign in at garmin.com/account → “Manage Your Data” → “Export Your Data” (Garmin account page, not Garmin Connect)." }),
        h("li", { text: "Choose “Request Data Export”. Garmin emails a download link; it can take from minutes to several days (Garmin says up to 30 days)." }),
        h("li", { text: "Download the .zip from the email and drop it here whole. Big exports (hundreds of MB) are read in pieces, so they should not crash the page." }),
        h("li", { text: "Optional: for a single activity, Garmin Connect (web) → the activity → ⚙ → Export to FIT/TCX/GPX/CSV – drop those files here too. Connect's Activities list also has “Export CSV”." }),
        h("li", { text: "Re-importing is safe: records are merged by date and activity time, never duplicated." })]),
        h("p", { class: "muted", text: "Which files are used: daily summaries (UDSFile), sleep (sleepData), HRV/health status (healthStatusData), training readiness / load / VO2max metrics, summarizedActivities, and FIT files in the Uploaded-Files archives for second-by-second heart rate. Garmin may change these formats; see the README for what has been verified." })])]));
    /* ---- events ---- */
    var nf = { date: D_today(), type: "alcohol" };
    function D_today() { var d = st.ds; return d ? d.dates[d.n - 1] : GLDates.todayKey(); }
    main.appendChild(sec("Events", "Tag days (alcohol, late caffeine, a hard race, illness, travel, cycle phase…). Cycle events are treated as a possible explanation for strain flags, not tested as a cause. They appear as ▲ markers on charts and become testable hypotheses under Insights → What affects what.", [
      h("div", { class: "fields" }, [field("ev-d", "Date", h("input", { class: "inp", id: "ev-d", type: "date", value: nf.date })), field("ev-t", "Type", h("select", { class: "inp", id: "ev-t" }, EVENT_TYPES.map(function (t) { return h("option", { value: t[0], text: t[1] }); }))), field("ev-u", "Until (optional, for a multi-day phase)", h("input", { class: "inp", id: "ev-u", type: "date" })), field("ev-l", "Label (optional)", h("input", { class: "inp", id: "ev-l", maxlength: "60", placeholder: "e.g. 3 beers at dinner" }), true)]),
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: function () { var date = document.getElementById("ev-d").value, type = document.getElementById("ev-t").value, label = document.getElementById("ev-l").value.trim().slice(0, 60), until = document.getElementById("ev-u").value; if (!/^\d{4}-\d\d-\d\d$/.test(date)) return toast("Pick a date"); if (until && (!/^\d{4}-\d\d-\d\d$/.test(until) || until < date)) return toast("“Until” must be on or after the date"); st.db.putNote({ id: "n" + Date.now() + Math.random().toString(36).slice(2, 6), date: date, until: until || undefined, type: type, label: label || EVENT_TYPES.find(function (t) { return t[0] === type; })[1] }).then(App.reload).then(function () { toast("Event added"); }); } }, "Add event")),
      st.notes.length ? h("ul", { class: "list" }, st.notes.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 40).map(function (n) { return h("li", { style: { display: "flex", gap: "8px", alignItems: "center" } }, [h("span", { style: { flex: 1 } }, [h("b", { text: n.date }), " · " + n.type + (n.until ? " (to " + n.until + ")" : "") + " · " + n.label, n.demo ? h("span", { class: "badge none", text: "demo" }) : null]), h("button", { class: "btn", type: "button", "aria-label": "Delete event " + n.date, onclick: function () { st.db.deleteNote(n.id).then(App.reload); } }, "✕")]); })) : h("p", { class: "muted", text: "No events yet." })]));
    /* ---- settings ---- */
    var s = st.settings, eff = st.ds ? st.ds.settings : {};
    function numIn(id, key, ph, step) { return h("input", { class: "inp", id: id, type: "number", inputmode: "decimal", step: step || "1", value: s[key] !== undefined && s[key] !== "" ? String(s[key]) : "", placeholder: ph }); }
    main.appendChild(sec("Settings", "These shape load, zones and the recovery score. Leave a field empty to let the app estimate it.", [
      h("div", { class: "fields" }, [field("s-max", "Max heart rate (bpm)", numIn("s-max", "maxHr", eff.maxHrAuto ? (eff.maxHrSource === "placeholder" ? "placeholder " + eff.maxHr + " – enter yours" : "estimate " + eff.maxHr + " – please confirm") : "e.g. 188")), field("s-rest", "Resting HR for load (bpm)", numIn("s-rest", "restHr", eff.restHrAuto ? "auto: " + eff.restHr : "e.g. 52")), field("s-lthr", "Threshold HR (bpm)", numIn("s-lthr", "lthr", eff.lthrAuto ? "auto: " + eff.lthr : "e.g. 165")), field("s-need", "Sleep need (hours)", numIn("s-need", "sleepNeedH", "7.5", "0.25")),
        field("s-sex", "Sex (TRIMP weighting)", h("select", { class: "inp", id: "s-sex" }, [["m", "Male coefficient (1.92)"], ["f", "Female coefficient (1.67)"]].map(function (o) { return h("option", { value: o[0], selected: (s.sex || "m") === o[0] ? "" : null, text: o[1] }); }))),
        field("s-dist", "Distance unit in CSV exports", h("select", { class: "inp", id: "s-dist" }, [["auto", "Auto-detect"], ["km", "Kilometres"], ["mi", "Miles"]].map(function (o) { return h("option", { value: o[0], selected: (s.csvDistanceUnit || "auto") === o[0] ? "" : null, text: o[1] }); }))),
        field("s-free", "Free days (for social jet lag)", h("select", { class: "inp", id: "s-free" }, [["6,0", "Saturday + Sunday"], ["5,6", "Friday + Saturday"], ["0,1", "Sunday + Monday"]].map(function (o) { return h("option", { value: o[0], selected: (s.freeDays || [6, 0]).join(",") === o[0] ? "" : null, text: o[1] }); })), true)]),
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: function () { function v(id) { var x = document.getElementById(id).value; return x === "" ? "" : +x; } App.saveSettings({ maxHr: v("s-max"), restHr: v("s-rest"), lthr: v("s-lthr"), sleepNeedH: v("s-need"), sex: document.getElementById("s-sex").value, csvDistanceUnit: document.getElementById("s-dist").value, freeDays: document.getElementById("s-free").value.split(",").map(Number) }).then(function () { toast("Settings saved"); }); } }, "Save settings"))]));
    /* ---- backup & export ---- */
    var pass = h("input", { class: "inp", id: "bk-pass", type: "password", autocomplete: "new-password", placeholder: "Passphrase (8+ characters)" });
    var rest = h("input", { type: "file", accept: ".json", id: "bk-file", class: "sr", "aria-label": "Choose a backup file", onchange: function (e) { var f = e.target.files[0]; e.target.value = ""; if (f) restore(f); } });
    function bundle() { return st.db.exportBundle(true); }
    function restore(f) {
      f.text().then(function (txt) {
        var p = GLCrypto.isEncrypted(txt) ? GLCrypto.decrypt(txt, document.getElementById("bk-pass").value) : Promise.resolve(txt);
        return p.then(function (plain) {
          var b = JSON.parse(plain); if (b.format !== "garmin-lens-bundle") throw new Error("Not a Garmin Lens backup");
          var acts = (b.activities || []).map(function (a) { return a; });
          return st.db.putDays(b.days || []).then(function () { return st.db.putActivities(acts); }).then(function () { return Promise.all((b.annotations || []).map(function (n) { return st.db.putNote(n); })); })
            .then(function () { return b.goals ? st.db.setMeta("goals", b.goals) : null; }).then(function () { return b.settings ? st.db.setMeta("settings", b.settings) : null; }).then(App.reload).then(function () { toast("Backup restored"); });
        });
      }).catch(function (e) { toast("Restore failed: " + e.message); });
    }
    main.appendChild(sec("Back up & export", "Backups are files you keep. The encrypted one uses your passphrase (PBKDF2-SHA-256 250,000 rounds + AES-256-GCM). Lose the passphrase and nobody – including me – can open it.", [
      field("bk-pass", "Passphrase", pass, true),
      h("div", { class: "actions" }, [
        h("button", { class: "btn primary", type: "button", onclick: function () { var pw = document.getElementById("bk-pass").value; bundle().then(function (b) { return GLCrypto.encrypt(JSON.stringify(b), pw); }).then(function (t) { GLUI.download("garmin-lens-backup-" + GLDates.todayKey() + ".enc.json", t, "application/json"); toast("Encrypted backup saved"); }, function (e) { toast(e.message); }); } }, "Encrypted backup"),
        h("button", { class: "btn", type: "button", onclick: function () { bundle().then(function (b) { GLUI.download("garmin-lens-data-" + GLDates.todayKey() + ".json", JSON.stringify(b), "application/json"); }); } }, "Plain JSON export"),
        h("label", { class: "btn", for: "bk-file", tabindex: "0", style: { display: "inline-flex", alignItems: "center" }, onkeydown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); rest.click(); } } }, "Restore backup…")]), rest,
      h("div", { class: "actions" }, [h("button", { class: "btn", type: "button", disabled: !st.ds, onclick: function () { GLUI.download("garmin-lens-days.csv", I.daysCsv(st.ds), "text/csv"); } }, "Daily metrics CSV"), h("button", { class: "btn", type: "button", disabled: !st.ds, onclick: function () { GLUI.download("garmin-lens-activities.csv", I.activitiesCsv(st.ds), "text/csv"); } }, "Activities CSV")]),
      note("Plain JSON and CSV exports are not encrypted. Keep them somewhere you trust. Passphrases are never stored.")]));
    /* ---- privacy ---- */
    main.appendChild(sec("Privacy", null, [
      h("ul", { class: "list" }, ["Everything is processed in this browser tab. Nothing is uploaded: the page's security policy only allows connections back to its own address, so it technically cannot send your data elsewhere.", "No accounts, no analytics, no ads, no cookies. The only thing kept in localStorage is your light/dark choice.", "Your data lives in this browser's IndexedDB. It is not encrypted at rest by the app (your device's own disk encryption and lock screen protect it). Use an encrypted backup for copies.", "Delete everything below, or clear this site's data in your browser settings."].map(function (t) { return h("li", { text: t }); })),
      h("div", { class: "actions" }, h("button", { class: "btn danger", type: "button", onclick: function () { if (confirm("Delete ALL data stored by Garmin Lens on this device (days, activities, events, goals, settings)? This cannot be undone.")) st.db.clearAll().then(App.reload).then(function () { toast("All local data deleted"); }); } }, "Delete all my data"))]));
    main.appendChild(sec("About", null, [h("p", null, [h("b", { text: "Garmin Lens " + App.APP_VERSION }), " – open source (MIT). Not affiliated with or endorsed by Garmin. “Garmin” and “Connect” are trademarks of Garmin Ltd."]), h("p", { class: "muted" }, ["Method notes, formulas, research and known limits: ", h("a", { href: "https://github.com/TheRiotCoder/garmin-lens", rel: "noopener noreferrer", target: "_blank", text: "github.com/TheRiotCoder/garmin-lens", style: { color: "var(--acc)", display: "inline-flex", alignItems: "center", minHeight: "44px" } }), "."]), note("Not medical advice. Garmin Lens describes patterns in your own data; it cannot diagnose, treat or prevent any condition. Wrist sensors are imperfect. Talk to a clinician about health concerns.", "warn")]));
  };
})();
