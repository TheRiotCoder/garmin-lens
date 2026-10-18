// Static checks on the shell: service-worker precache completeness, manifest, CSP meta == _headers, no external hosts, no secrets, version agreement.
const { ok, eq, done } = require("./harness");
const fs = require("fs"), path = require("path"), root = path.join(__dirname, ".."), rd = f => fs.readFileSync(path.join(root, f), "utf8");
const html = rd("index.html"), sw = rd("sw.js"), headers = rd("public/_headers"), app = rd("js/app.js"), man = JSON.parse(rd("manifest.webmanifest"));
const shell = JSON.parse("[" + sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].replace(/,\s*$/, "") + "]");
// every file listed in the service worker exists
for (const f of shell) if (f !== "./") ok("SHELL file exists: " + f, fs.existsSync(path.join(root, f)));
// every <script>, <link> in index.html is precached
const refs = [...html.matchAll(/(?:src|href)="((?:js|css|icons)\/[^"]+|manifest\.webmanifest)"/g)].map(m => m[1]);
for (const r of refs) ok("index.html asset precached: " + r, shell.includes(r));
ok("worker.js precached (loaded via new Worker)", shell.includes("js/worker.js"));
ok("every js/*.js file is precached", fs.readdirSync(path.join(root, "js")).filter(f => f.endsWith(".js")).every(f => shell.includes("js/" + f)), fs.readdirSync(path.join(root, "js")).filter(f => !shell.includes("js/" + f)));
for (const icon of man.icons) ok("manifest icon exists + precached: " + icon.src, fs.existsSync(path.join(root, icon.src)) && shell.includes(icon.src));
ok("manifest has a maskable icon and relative start_url/scope", man.icons.some(i => i.purpose === "maskable") && man.start_url.startsWith("./") && man.scope === "./");
// versions agree
const swV = sw.match(/const VERSION = "garmin-lens-v([\d.]+)"/)[1], appV = app.match(/APP_VERSION = "([\d.]+)"/)[1];
eq("sw.js VERSION matches APP_VERSION", swV, appV);
eq("CHANGELOG top entry is the current version", fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8").match(/^## ([\d.]+)/m)[1], appV);
eq("version bumped past 1.1.0 so installed copies update", appV, "1.1.1");
ok("sw deletes only its own old caches", /startsWith\("garmin-lens-"\)/.test(sw));
ok("sw rebuilds redirected responses (plain())", /function plain\(/.test(sw) && /res\.redirected/.test(sw));
ok("sw never touches cross-origin requests", /url\.origin !== self\.location\.origin\) return/.test(sw));
// CSP
const meta = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1], hdr = headers.match(/Content-Security-Policy: (.+)/)[1];
eq("CSP in _headers = meta CSP + frame-ancestors", hdr, meta + "; frame-ancestors 'none'");
for (const must of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "connect-src 'self'", "form-action 'none'", "worker-src 'self'"]) ok("CSP has " + must, meta.includes(must));
ok("CSP allows no remote origins and no unsafe-inline scripts/eval", !/https?:\/\//.test(meta) && !/script-src[^;]*unsafe/.test(meta));
ok("no inline <script> or on* handler attributes in index.html", !/<script(?![^>]*\bsrc=)[^>]*>/.test(html) && !/\son[a-z]+="/.test(html));
// no external hosts anywhere in the shipped code (docs links live in README/docs, only one deliberate repo link is allowed in the UI)
const files = ["index.html", "sw.js", ...fs.readdirSync(path.join(root, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f), "css/style.css"];
for (const f of files) {
  const urls = [...rd(f).matchAll(/https?:\/\/[^\s"'`)<>]+/g)].map(m => m[0]).filter(u => !/^https?:\/\/(www\.)?(w3\.org|github\.com\/TheRiotCoder\/garmin-lens)/.test(u));
  ok("no external URLs in " + f, urls.length === 0, urls);
}
ok("no fetch/XMLHttpRequest/WebSocket/sendBeacon/EventSource in app code (data never leaves the device)", files.filter(f => f.startsWith("js/") && !["js/worker.js"].includes(f)).every(f => !/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\s*\(/.test(rd(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))));
ok("no CDN / vendor dependencies", !fs.existsSync(path.join(root, "js/vendor")) || fs.readdirSync(path.join(root, "js/vendor")).length === 0);
// secrets / tokens must never be committed
const all = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (["node_modules", ".git"].includes(e.name)) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p) : all.push(p); } })(root);
const bad = all.filter(p => /\.(js|json|md|html|css|sh|py|txt|webmanifest)$/.test(p) && /(cfut_[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16})/.test(fs.readFileSync(p, "utf8")));
ok("no secrets/tokens in the repo", bad.length === 0, bad);
ok(".nojekyll present (GitHub Pages serves files as-is)", fs.existsSync(path.join(root, ".nojekyll")));
ok("LICENSE present", fs.existsSync(path.join(root, "LICENSE")));
ok("README mentions not-medical-advice and the privacy model", !fs.existsSync(path.join(root, "README.md")) || (/not medical advice/i.test(rd("README.md")) && /privacy/i.test(rd("README.md"))));
ok("disclaimer shown in UI", /not a medical device/.test(app) && /Not medical advice/i.test(rd("js/data-view.js")));
ok("viewport meta allows zoom (accessibility)", !/user-scalable=no|maximum-scale=1\b/.test(html));
ok("html has lang and a title", /<html lang="en">/.test(html) && /<title>[^<]+<\/title>/.test(html));
done();
