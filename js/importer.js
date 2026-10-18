/* Garmin Lens – import orchestration (pure, UMD): walks files and (nested) ZIPs, parses what it recognises, merges everything by date / activity.
   No network. Works in a Web Worker, on the main thread, and in Node (tests). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./zip.js"), require("./parsers.js"), require("./dates.js"));
  else root.GLImporter = factory(root.GLZip, root.GLParsers, root.GLDates);
})(typeof self !== "undefined" ? self : this, function (Z, P, D) {
  "use strict";
  var MAX_DEPTH = 3;

  // field-wise merge of day records: a newer non-empty value replaces an older one
  function mergeDay(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in b) if (b[k] !== undefined && b[k] !== null) {
      if (k === "sleepUnconfirmed") { if (a.sleepSec === undefined) o[k] = b[k]; continue; }
      o[k] = b[k];
    }
    if (o.sleepSec !== undefined) delete o.sleepUnconfirmed;
    return o;
  }
  function sameActivity(a, b) { return Math.abs(a.start - b.start) <= 120000; }
  function mergeActivity(a, b) { // a = summary-ish (preferred identity), b = detail source
    var o = {}, k; for (k in b) o[k] = b[k]; for (k in a) if (a[k] !== undefined && a[k] !== null) o[k] = a[k];
    if (b.series && !a.series) o.series = b.series;
    if (b.best && !a.best) o.best = b.best;
    if (b.rrCount && !a.rrCount) o.rrCount = b.rrCount;
    o.source = a.source === "summary" && b.series ? "summary+fit" : a.source;
    return o;
  }

  function Importer(opts) {
    this.opts = opts || {};
    this.days = {}; this.acts = {}; this.annotations = []; this.goals = null;
    this.stats = { files: 0, kinds: {}, ignored: 0, fitOther: 0, fitActivities: 0, warnings: [], errors: [], demo: false };
    this.warned = {};
  }
  Importer.prototype.warn = function (w) { if (!this.warned[w]) { this.warned[w] = 1; if (this.stats.warnings.length < 50) this.stats.warnings.push(w); } };
  Importer.prototype.err = function (name, e) { if (this.stats.errors.length < 50) this.stats.errors.push(name + ": " + (e && e.message || e)); };
  Importer.prototype.progress = function (msg) { if (this.opts.onProgress) this.opts.onProgress({ files: this.stats.files, current: msg }); };
  Importer.prototype.absorb = function (r, name) {
    var self = this;
    self.stats.files++; self.stats.kinds[r.kind] = (self.stats.kinds[r.kind] || 0) + 1;
    if (r.kind === "fit-other") self.stats.fitOther++;
    (r.warnings || []).forEach(function (w) { self.warn(w); });
    (r.days || []).forEach(function (d) { self.days[d.date] = self.days[d.date] ? mergeDay(self.days[d.date], d) : d; });
    (r.activities || []).forEach(function (a) {
      var prev = self.acts[a.id];
      if (r.kind === "fit-activity") self.stats.fitActivities++;
      self.acts[a.id] = prev ? mergeActivity(a, prev) : a;
    });
    if (r.annotations && r.annotations.length) self.annotations = self.annotations.concat(r.annotations);
    if (r.goals) self.goals = r.goals;
    if (r.demo) self.stats.demo = true;
  };
  // add one user-selected file ({name, size, blob|bytes|text}) or a ZIP entry
  Importer.prototype.addFile = function (f, depth) {
    var self = this; depth = depth || 0;
    var kind = P.classify(f.name);
    var getBytes = function () { return f.bytes ? Promise.resolve(f.bytes) : f.blob ? f.blob.arrayBuffer().then(function (b) { return new Uint8Array(b); }) : Promise.resolve(new TextEncoder().encode(f.text)); };
    if (kind === "zip" || (f.bytes && Z.isZipBytes(f.bytes) && kind === "other")) {
      if (depth >= MAX_DEPTH) { self.warn("Nested ZIP deeper than " + MAX_DEPTH + " levels skipped"); return Promise.resolve(); }
      var src = f.blob ? Promise.resolve(Z.fromBlob(f.blob)) : getBytes().then(function (b) { return Z.fromBytes(b); });
      return src.then(Z.open).then(function (zip) {
        var list = zip.entries.filter(function (e) { return !e.isDir && !/(^|\/)__MACOSX\//.test(e.name) && !/(^|\/)\._/.test(e.name); }), i = 0;
        function next() {
          if (i >= list.length) return Promise.resolve();
          var e = list[i++], k = P.classify(e.name);
          if (k === "other") { self.stats.ignored++; return next(); }
          self.progress(e.name);
          return zip.read(e).then(function (bytes) {
            if (k === "zip") return self.addFile({ name: e.name, bytes: bytes }, depth + 1);
            return self.addParsed({ name: e.name, bytes: bytes, kind: k });
          }).catch(function (err) { self.err(e.name, err); }).then(next);
        }
        return next();
      }).catch(function (err) { self.err(f.name, err); });
    }
    if (kind === "other") { self.stats.ignored++; if (f.name) self.warn("Ignored file type: " + f.name); return Promise.resolve(); }
    return getBytes().then(function (bytes) { return self.addParsed({ name: f.name, bytes: bytes, kind: kind }); }).catch(function (err) { self.err(f.name, err); });
  };
  Importer.prototype.addParsed = function (file) {
    var r;
    try { r = P.parseFile(file, this.opts); } catch (e) { this.err(file.name, e); return Promise.resolve(); }
    this.absorb(r, file.name);
    return Promise.resolve();
  };
  Importer.prototype.addFiles = function (files) {
    var self = this, i = 0;
    function next() { if (i >= files.length) return Promise.resolve(self); return self.addFile(files[i++]).then(next); }
    return next();
  };
  // final merge: link FIT/TCX/GPX activities to the matching summary, drop duplicate CSV rows
  Importer.prototype.result = function () {
    var list = Object.keys(this.acts).map(function (k) { return this.acts[k]; }, this).sort(function (a, b) { return a.start - b.start; }), out = [];
    var details = list.filter(function (a) { return a.source === "fit" || a.source === "file"; }), others = list.filter(function (a) { return a.source !== "fit" && a.source !== "file" && a.source !== "csv"; }), csv = list.filter(function (a) { return a.source === "csv"; });
    var used = {};
    others.forEach(function (s) {
      var m = details.find(function (d) { return !used[d.id] && sameActivity(s, d); });
      if (m) { used[m.id] = 1; out.push(mergeActivity(s, m)); } else out.push(s);
    });
    details.forEach(function (d) { if (!used[d.id]) out.push(d); });
    csv.forEach(function (c) { // CSV start is local wall time: treat as duplicate when same date, same sport group and similar duration
      var dup = out.some(function (a) { return a.date === c.date && P.sportGroup(a.type) === P.sportGroup(c.type) && (!a.durationSec || !c.durationSec || Math.abs(a.durationSec - c.durationSec) / c.durationSec < 0.15); });
      if (!dup) out.push(c);
    });
    out.sort(function (a, b) { return a.start - b.start; });
    var days = Object.keys(this.days).sort().map(function (k) { return this.days[k]; }, this);
    // days that only exist because of an activity are not created here (analysis handles activity-only days)
    return { days: days, activities: out, annotations: this.annotations, goals: this.goals, stats: this.stats };
  };
  function create(opts) { return new Importer(opts); }
  return { create: create, mergeDay: mergeDay, mergeActivity: mergeActivity };
});
