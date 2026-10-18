/* Garmin Lens – import worker: parses files off the main thread. This worker has no network calls (no fetch/XHR/WebSocket; it only importScripts local files) - a test checks it. On GitHub Pages the page's CSP is a meta tag and does not govern workers, so this is code-audited, not header-enforced. */
"use strict";
importScripts("dates.js", "stats.js", "zip.js", "fit.js", "parsers.js", "importer.js");
self.onmessage = function (e) {
  var msg = e.data, imp = GLImporter.create({ distanceUnit: msg.distanceUnit, onProgress: function (p) { self.postMessage({ type: "progress", files: p.files, current: p.current, done: p.done, total: p.total }); } });
  imp.addFiles(msg.files).then(function () { var r = imp.result(); self.postMessage({ type: "done", result: r }); }, function (err) { self.postMessage({ type: "error", message: String(err && err.message || err) }); });
};
