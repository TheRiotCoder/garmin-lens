/* Garmin Lens – import worker: parses files off the main thread. Nothing leaves the device (the page's CSP has connect-src 'self'). */
"use strict";
importScripts("dates.js", "stats.js", "zip.js", "fit.js", "parsers.js", "importer.js");
self.onmessage = function (e) {
  var msg = e.data, imp = GLImporter.create({ distanceUnit: msg.distanceUnit, onProgress: function (p) { self.postMessage({ type: "progress", files: p.files, current: p.current }); } });
  imp.addFiles(msg.files).then(function () { var r = imp.result(); self.postMessage({ type: "done", result: r }); }, function (err) { self.postMessage({ type: "error", message: String(err && err.message || err) }); });
};
