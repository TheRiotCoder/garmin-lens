/* Garmin Lens – on-device storage. IndexedDB when available, otherwise an in-memory store with the same interface (also used by the tests).
   Stores: days{date}, acts{id}, series{id}, notes{id}, meta{key}. Everything stays in this browser profile; nothing is sent anywhere. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./importer.js"));
  else root.GLDB = factory(root.GLImporter);
})(typeof self !== "undefined" ? self : this, function (Imp) {
  "use strict";
  var NAME = "garmin-lens", VERSION = 1, STORES = { days: "date", acts: "id", series: "id", notes: "id", meta: "key" };

  /* ----- backend: memory ----- */
  function memoryBackend() {
    var data = {}; Object.keys(STORES).forEach(function (s) { data[s] = {}; });
    var clone = function (x) { return x === undefined ? x : (typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x))); };
    return {
      kind: "memory",
      getAll: function (s) { return Promise.resolve(Object.keys(data[s]).map(function (k) { return clone(data[s][k]); })); },
      get: function (s, k) { return Promise.resolve(clone(data[s][k])); },
      putMany: function (s, list) { list.forEach(function (o) { data[s][o[STORES[s]]] = clone(o); }); return Promise.resolve(); },
      delMany: function (s, keys) { keys.forEach(function (k) { delete data[s][k]; }); return Promise.resolve(); },
      clear: function (s) { data[s] = {}; return Promise.resolve(); },
      count: function (s) { return Promise.resolve(Object.keys(data[s]).length); }
    };
  }
  /* ----- backend: IndexedDB ----- */
  function idbBackend() {
    return new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(NAME, VERSION); } catch (e) { return reject(e); }
      req.onupgradeneeded = function () { var db = req.result; Object.keys(STORES).forEach(function (s) { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: STORES[s] }); }); };
      req.onerror = function () { reject(req.error || new Error("IndexedDB open failed")); };
      req.onblocked = function () { reject(new Error("IndexedDB blocked")); };
      req.onsuccess = function () {
        var db = req.result;
        function tx(s, mode, fn) { return new Promise(function (res, rej) { var t = db.transaction(s, mode), st = t.objectStore(s), out = fn(st); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : undefined); }; t.onerror = t.onabort = function () { rej(t.error || new Error("IndexedDB transaction failed")); }; }); }
        resolve({
          kind: "indexeddb",
          getAll: function (s) { return tx(s, "readonly", function (st) { return st.getAll(); }); },
          get: function (s, k) { return tx(s, "readonly", function (st) { return st.get(k); }); },
          putMany: function (s, list) { return tx(s, "readwrite", function (st) { list.forEach(function (o) { st.put(o); }); }); },
          delMany: function (s, keys) { return tx(s, "readwrite", function (st) { keys.forEach(function (k) { st.delete(k); }); }); },
          clear: function (s) { return tx(s, "readwrite", function (st) { st.clear(); }); },
          count: function (s) { return tx(s, "readonly", function (st) { return st.count(); }); }
        });
      };
    });
  }

  function wrap(be) {
    var db = {
      kind: be.kind,
      // merge incoming day records into stored ones. A real record replaces a demo record of the same date (never mixes the two).
      putDays: function (list) {
        return be.getAll("days").then(function (all) {
          var by = {}; all.forEach(function (d) { by[d.date] = d; });
          var out = list.map(function (d) { var p = by[d.date]; var m = p && !!p.demo === !!d.demo ? Imp.mergeDay(p, d) : d; if (!m.demo) delete m.demo; return m; });
          return be.putMany("days", out);
        });
      },
      getDays: function () { return be.getAll("days").then(function (a) { return a.sort(function (x, y) { return x.date < y.date ? -1 : 1; }); }); },
      putActivities: function (list) {
        var series = [], slim = list.map(function (a) { var o = {}, k; for (k in a) if (k !== "series") o[k] = a[k]; if (a.series) { o.hasSeries = true; series.push({ id: a.id, series: a.series }); } return o; });
        return be.putMany("acts", slim).then(function () { return series.length ? be.putMany("series", series) : null; });
      },
      getActivities: function () { return be.getAll("acts").then(function (a) { return a.sort(function (x, y) { return x.start - y.start; }); }); },
      getSeries: function (id) { return be.get("series", id).then(function (r) { return r ? r.series : null; }); },
      putNote: function (n) { return be.putMany("notes", [n]); },
      deleteNote: function (id) { return be.delMany("notes", [id]); },
      getNotes: function () { return be.getAll("notes").then(function (a) { return a.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; }); }); },
      setMeta: function (key, value) { return be.putMany("meta", [{ key: key, value: value }]); },
      getMeta: function (key, dflt) { return be.get("meta", key).then(function (r) { return r ? r.value : dflt; }); },
      counts: function () { return Promise.all(["days", "acts", "notes"].map(function (s) { return be.count(s); })).then(function (c) { return { days: c[0], activities: c[1], notes: c[2] }; }); },
      hasDemo: function () { return be.getAll("days").then(function (a) { return a.some(function (d) { return d.demo; }); }); },
      clearDemo: function () {
        return Promise.all([be.getAll("days"), be.getAll("acts"), be.getAll("notes")]).then(function (r) {
          var dd = r[0].filter(function (d) { return d.demo; }).map(function (d) { return d.date; }), da = r[1].filter(function (a) { return a.demo; }).map(function (a) { return a.id; }), dn = r[2].filter(function (n) { return n.demo; }).map(function (n) { return n.id; });
          return Promise.all([be.delMany("days", dd), be.delMany("acts", da), be.delMany("series", da), be.delMany("notes", dn)]);
        });
      },
      clearAll: function () { return Promise.all(["days", "acts", "series", "notes", "meta"].map(function (s) { return be.clear(s); })); },
      // everything as a Garmin Lens bundle (JSON-able). includeSeries=false keeps it small.
      exportBundle: function (includeSeries) {
        return Promise.all([db.getDays(), db.getActivities(), db.getNotes(), db.getMeta("goals", null), db.getMeta("settings", null)]).then(function (r) {
          var acts = r[1], p = includeSeries ? Promise.all(acts.map(function (a) { return a.hasSeries ? db.getSeries(a.id).then(function (s) { return s ? Object.assign({}, a, { series: s }) : a; }) : a; })) : Promise.resolve(acts.map(function (a) { var o = Object.assign({}, a); delete o.hasSeries; return o; }));
          return p.then(function (acts2) { return { format: "garmin-lens-bundle", version: 1, exportedAt: new Date().toISOString(), demo: r[0].some(function (d) { return d.demo; }), days: r[0], activities: acts2, annotations: r[2], goals: r[3], settings: r[4] }; });
        });
      }
    };
    return db;
  }
  function open() { return (typeof indexedDB !== "undefined" ? idbBackend() : Promise.reject(new Error("no indexedDB"))).then(wrap, function () { return wrap(memoryBackend()); }); }
  function memory() { return wrap(memoryBackend()); }
  return { open: open, memory: memory };
});
