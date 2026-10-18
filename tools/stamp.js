#!/usr/bin/env node
/* Garmin Lens – cache fingerprint. The service worker's VERSION must change whenever any precached app file changes, or installed copies keep serving stale files.
   `node tools/stamp.js`          writes tools/cache-fingerprint.json (run it AFTER bumping VERSION in sw.js and APP_VERSION in js/app.js)
   `node tools/stamp.js --check`  exits 1 with a clear message if the fingerprint is stale (tests/shell.test.js does the same check).
   The hash covers every file in sw.js's SHELL list (+ the list itself), read as bytes. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const root = path.join(__dirname, "..");
function compute() {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const version = sw.match(/const VERSION = "([^"]+)"/)[1];
  const list = JSON.parse("[" + sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].replace(/,\s*$/, "") + "]");
  const h = crypto.createHash("sha256"); h.update(JSON.stringify(list));
  for (const f of list) { if (f === "./") continue; h.update("\0" + f + "\0"); h.update(fs.readFileSync(path.join(root, f))); }
  return { version, hash: h.digest("hex"), files: list.length };
}
function verdict(rec, cur) {
  if (!rec) return "tools/cache-fingerprint.json is missing - run: node tools/stamp.js";
  if (rec.hash === cur.hash && rec.version === cur.version) return null;
  if (rec.hash !== cur.hash && rec.version === cur.version) return "App files (or the SHELL cache list) changed but sw.js VERSION (" + cur.version + ") was not bumped, so installed copies would keep stale files. Bump VERSION in sw.js and APP_VERSION in js/app.js, then run: node tools/stamp.js";
  if (rec.hash === cur.hash) return "VERSION changed (" + rec.version + " -> " + cur.version + ") without any app change; run: node tools/stamp.js";
  return "Fingerprint is out of date; run: node tools/stamp.js";
}
module.exports = { compute, verdict };
if (require.main === module) {
  const file = path.join(__dirname, "cache-fingerprint.json"), cur = compute();
  if (process.argv.includes("--check")) { const rec = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null, v = verdict(rec, cur); if (v) { console.error(v); process.exit(1); } console.log("fingerprint ok (" + cur.version + ")"); }
  else { fs.writeFileSync(file, JSON.stringify(cur, null, 2) + "\n"); console.log("wrote tools/cache-fingerprint.json", cur); }
}
