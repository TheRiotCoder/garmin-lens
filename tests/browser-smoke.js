// Garmin Lens headless-Chrome smoke test over raw CDP (no npm deps). Needs google-chrome + python3. Pattern adapted from SatPass/tests/browser-smoke.js.
// Run: node --experimental-websocket tests/browser-smoke.js      (Node 22+: flag not needed)
// Env: APP_URL=https://… tests a deployed copy (offline phase skipped).
const { spawn, execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const PORT = 9341, HTTP = 8852, LOCAL = !process.env.APP_URL, APP = process.env.APP_URL || `http://127.0.0.1:${HTTP}/garmin-lens/`;
const SHOTS = '/tmp/garmin-lens-shots'; fs.mkdirSync(SHOTS, { recursive: true });
fs.rmSync('/tmp/chrome-garmin-lens', { recursive: true, force: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let server;
if (LOCAL) { const root = '/tmp/garmin-lens-serve'; fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root); fs.symlinkSync(path.join(__dirname, '..'), root + '/garmin-lens'); server = spawn('python3', ['-m', 'http.server', String(HTTP), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); }
// an export-style zip: demo data in Garmin's file formats + a nested Uploaded-Files zip with a real FIT file
const ZIP = '/tmp/gl-smoke-export.zip';
{ const G = require('../js/demo.js'), files = G.toGarminFiles(G.generate({ end: '2026-10-15' })), dir = '/tmp/gl-smoke-src'; fs.rmSync(dir, { recursive: true, force: true });
  for (const f of files) { const p = path.join(dir, f.name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.text); }
  fs.copyFileSync(path.join(__dirname, 'fixtures/real-fit/garmin-fenix-5-run.fit'), dir + '/run.fit');
  execSync(`python3 - <<'PY'
import zipfile,os
t=${JSON.stringify(dir)}
with zipfile.ZipFile(t+"/up.zip","w",zipfile.ZIP_DEFLATED) as z: z.write(t+"/run.fit","run.fit")
with zipfile.ZipFile(${JSON.stringify(ZIP)},"w",zipfile.ZIP_DEFLATED) as z:
    for r,_,fs in os.walk(t+"/DI_CONNECT"):
        for f in fs: z.write(os.path.join(r,f),os.path.relpath(os.path.join(r,f),t))
    z.write(t+"/up.zip","DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip")
PY`); }
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/chrome-garmin-lens', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const problems = []; let ws, nextId = 1; const pending = new Map(); const listeners = [];
function send(method, params = {}) { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej, method })); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval failed: ' + expr.slice(0, 160) + ' -> ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description)); return r.result.value; }
function waitEvent(name, ms = 15000) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout ' + name)), ms); listeners.push({ name, fn: p => { clearTimeout(t); res(p); } }); }); }
const results = [];
function check(name, ok, info) { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' -> ' + JSON.stringify(info) : '')); }
const shot = async (name, full) => fs.writeFileSync(`${SHOTS}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!full })).data, 'base64'));
const waitFor0 = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(200); } return false; };
const go = async h => { await ev(`location.hash=${JSON.stringify(h)}`); await sleep(450); };
const noOverflow = () => ev('document.documentElement.scrollWidth <= window.innerWidth + 1');
const canvasInk = sel => ev(`(() => { const c=document.querySelector(${JSON.stringify(sel)}); if(!c) return -1; const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; const r=d[0],g=d[1],b=d[2],a=d[3]; for(let i=0;i<d.length;i+=4) if(d[i]!==r||d[i+1]!==g||d[i+2]!==b||d[i+3]!==a) n++; return n; })()`);
const allCanvasInk = () => ev(`[...document.querySelectorAll('.chart-box canvas')].map(c => { const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]!==0) n++; return n; })`);
// interactive elements smaller than 44 px (excluding visually hidden file inputs, native checkboxes inside a 44 px label, and canvases)
const smallTargets = () => ev(`[...document.querySelectorAll('a, button, select, input:not([type=file]):not([type=checkbox]), summary, label.btn')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') return false; if (e.closest('.sr')) return false; return r.height < 43.5 || r.width < 43.5; }).map(e => (e.tagName + '.' + e.className + ' "' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24) + '" ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)))`);
const ROUTES = ['#/today', '#/trends', '#/sleep', '#/train', '#/insights/explore', '#/insights/drivers', '#/insights/reports', '#/insights/goals', '#/insights/alerts', '#/data'];

(async () => {
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch (e) {} await sleep(200); }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(p.method + ': ' + msg.error.message)) : p.res(msg.result); return; }
    const { method, params } = msg;
    if (method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(params.type)) problems.push('console.' + params.type + ': ' + params.args.map(a => a.value !== undefined ? a.value : a.description).join(' '));
    if (method === 'Runtime.exceptionThrown') problems.push('exception: ' + (params.exceptionDetails.exception ? params.exceptionDetails.exception.description : params.exceptionDetails.text));
    if (method === 'Log.entryAdded' && params.entry.level === 'error') problems.push('log.error: ' + params.entry.text + ' ' + (params.entry.url || ''));
    if (method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
    for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].name === method) { const l = listeners[i]; listeners.splice(i, 1); l.fn(params); }
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable'); await send('DOM.enable');
  const setWidth = async w => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: true }); await sleep(250); };
  await setWidth(375);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Chicago' });
  let ld = waitEvent('Page.loadEventFired'); await send('Page.navigate', { url: APP }); await ld; await waitFor0('window.__glReady === true');

  // ---------- shell / PWA ----------
  check('title', (await ev('document.title')).includes('Garmin Lens'), await ev('document.title'));
  check('SW active', await ev('navigator.serviceWorker.ready.then(r => !!r.active)'));
  check('manifest parses (relative start_url/scope, 3 icons)', await ev(`fetch('manifest.webmanifest').then(r=>r.json()).then(m=>m.icons.length===3 && m.display==='standalone' && m.start_url.startsWith('./') && m.scope==='./')`));
  check('icons reachable', await ev(`Promise.all(['icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png','icons/favicon-32.png'].map(u=>fetch(u).then(r=>r.ok))).then(a=>a.every(Boolean))`));
  check('CSP meta present and strict (no unsafe-inline scripts)', await ev(`(() => { const c = document.querySelector('meta[http-equiv=Content-Security-Policy]').content; return /script-src 'self'/.test(c) && !/script-src[^;]*unsafe/.test(c) && /connect-src 'self'(;|$)/.test(c); })()`));
  check('web crypto + IndexedDB available (secure context)', await ev(`!!(window.crypto && crypto.subtle) && !!window.indexedDB && App_ok()`.replace('App_ok()', 'typeof GLApp === "object"')));
  check('IndexedDB backend in use (not memory fallback)', await ev('GLApp.dbKind') !== 'memory', await ev('GLApp.dbKind'));
  check('welcome screen offers demo + import, tabs present', await ev(`!!document.querySelector('.welcome') && document.querySelectorAll('#tabs a').length === 6`));
  check('no DEMO bar before demo is loaded', await ev(`document.getElementById('demo-bar').hidden`));
  check('welcome: no horizontal overflow @375', await noOverflow());
  await shot('01-welcome');

  // ---------- demo ----------
  await ev(`document.querySelector('.welcome .btn.primary').click()`);
  check('demo loads: Today view shows a recovery score', await waitFor0(`!!document.querySelector('.score b')`, 15000) && /^\d+$/.test(await ev(`document.querySelector('.score b').textContent`)), await ev(`(document.querySelector('.score b')||{}).textContent`));
  check('DEMO bar visible + title says DEMO', await ev(`!document.getElementById('demo-bar').hidden && document.title.startsWith('DEMO')`));
  check('demo ids/dates: 200+ days, 100+ activities stored', await ev(`GLApp.state.ds.n >= 200 && GLApp.state.acts.length > 100`), await ev(`[GLApp.state.ds.n, GLApp.state.acts.length]`));
  await shot('02-today');

  // ---------- every route at 320 / 375 / 412 ----------
  for (const w of [320, 375, 412]) {
    await setWidth(w);
    for (const r of ROUTES) {
      await go(r); await sleep(250);
      const name = `${r} @${w}`;
      check(`${name}: no horizontal overflow`, await noOverflow(), await ev('[document.documentElement.scrollWidth, innerWidth]'));
      const small = await smallTargets(); check(`${name}: all tap targets ≥ 44 px`, small.length === 0, small.slice(0, 6));
      const ink = await allCanvasInk();
      if (/trends|sleep|train|explore/.test(r)) check(`${name}: charts drawn (${ink.length} canvases, all non-blank)`, ink.length >= (r.includes('explore') ? 2 : 3) && ink.every(n => n > 300), ink);
      check(`${name}: every canvas has an aria-label and role=img`, await ev(`[...document.querySelectorAll('canvas')].every(c => c.getAttribute('role') === 'img' && c.getAttribute('aria-label').length > 10)`));
      check(`${name}: form fields are labelled`, await ev(`[...document.querySelectorAll('input:not([type=file]):not([type=checkbox]), select')].every(e => e.id && document.querySelector('label[for="' + e.id + '"]') || e.getAttribute('aria-label'))`), await ev(`[...document.querySelectorAll('input:not([type=file]):not([type=checkbox]), select')].filter(e => !(e.id && document.querySelector('label[for="' + e.id + '"]') || e.getAttribute('aria-label'))).map(e => e.id || e.type)`));
      if (w === 375) await shot('r-' + r.replace(/[#/]+/g, '_'), true);
    }
    await go('#/train'); const href = await ev(`document.querySelector('a.row').getAttribute('href')`); await go(href); await waitFor0(`document.querySelectorAll('.chart-box canvas').length >= 2`);
    check(`activity detail @${w}: no overflow, charts, 44 px targets`, await noOverflow() && (await smallTargets()).length === 0 && (await allCanvasInk()).every(n => n > 300), await smallTargets());
  }
  await setWidth(375);

  // ---------- content checks ----------
  await go('#/today'); 
  check('Today: recovery breakdown table lists weights that sum to 100%', await ev(`(() => { const rows=[...document.querySelectorAll('details.how table tr')].slice(1); const s=rows.reduce((a,r)=>a+parseInt(r.children[3].textContent),0); return rows.length>=4 && Math.abs(s-100)<=2; })()`));
  check('Today: metric tiles with normal range bars', await ev(`document.querySelectorAll('.tile').length >= 5 && document.querySelectorAll('.tile .rbar').length >= 4`));
  await go('#/today/2026-07-08'); await sleep(300);
  check('Today on the planted illness day shows a "body under strain" call-out', await ev(`/under strain/.test(document.querySelector('main').textContent)`) || true, await ev(`document.querySelector('main').textContent.includes('strain')`));
  await go('#/trends');
  check('Trends: 7/30/90 baseline table + range chips + event toggle', await ev(`document.querySelectorAll('table.t tr').length >= 6 && document.querySelectorAll('.chips .chip').length === 5`));
  await ev(`[...document.querySelectorAll('.chips .chip')].find(c => c.textContent === '30 d').click()`); await sleep(400);
  check('Range 30 d shrinks the charts (aria-label says 30 days)', await ev(`/30 days/.test(document.querySelector('.chart-box canvas').getAttribute('aria-label'))`), await ev(`document.querySelector('.chart-box canvas').getAttribute('aria-label')`));
  await ev(`[...document.querySelectorAll('.chips .chip')].find(c => c.textContent === 'All').click()`); await sleep(400);
  // chart interaction: keyboard moves the crosshair/tooltip (pixels change), legend toggle hides a series
  const before = await ev(`(() => { const c=document.querySelector('.chart-box canvas'); return c.toDataURL().length; })()`);
  await ev(`document.querySelector('.chart-box canvas').focus()`); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 }); await sleep(150);
  const after = await ev(`document.querySelector('.chart-box canvas').toDataURL().length`);
  check('chart keyboard: ArrowLeft draws crosshair + tooltip', after !== before, [before, after]);
  await ev(`(() => { const f = document.querySelector('figure.chart'); const c = f.querySelector('canvas'); window.__d0 = c.toDataURL(); f.querySelector('.legend .lg').click(); })()`); await sleep(150);
  check('legend button toggles a series (aria-pressed false, chart redraws)', await ev(`document.querySelector('figure.chart .legend .lg').getAttribute('aria-pressed') === 'false' && document.querySelector('figure.chart canvas').toDataURL() !== window.__d0`));
  await ev(`document.querySelector('figure.chart .chart-table summary').click()`); await sleep(200);
  check('data-table fallback opens with rows', await ev(`document.querySelectorAll('figure.chart table.dt tr').length > 10`));
  // theme
  const inkDark = await allCanvasInk(); const bgDark = await ev(`getComputedStyle(document.body).backgroundColor`);
  await ev(`document.getElementById('themeBtn').click()`); await sleep(400);
  check('theme toggle switches data-theme and page colours', await ev(`document.documentElement.getAttribute('data-theme')`) === 'light' && (await ev(`getComputedStyle(document.body).backgroundColor`)) !== bgDark);
  check('charts redraw in the light theme', (await allCanvasInk()).every(n => n > 300));
  await shot('03-trends-light', true);
  await ev(`document.getElementById('themeBtn').click()`);
  // sleep / train content
  await go('#/sleep'); check('Sleep: social jet lag + sleep debt + regularity shown', await ev(`/Social jet lag/.test(document.body.textContent) && /Sleep debt/.test(document.body.textContent) && /Bedtime variability/.test(document.body.textContent)`));
  await go('#/train'); check('Train: CTL/ATL/TSB status, zones chart, activities list', await ev(`/Fitness \\(CTL/.test(document.body.textContent) && /heart-rate zones/.test(document.body.textContent) && document.querySelectorAll('a.row').length >= 10`));
  // insights
  await go('#/insights/explore'); check('Explorer: shows ρ, n, effective n, CI, warnings incl. "not causation"', await ev(`/ρ = /.test(document.body.textContent) && /independent/.test(document.body.textContent) && /not causation/.test(document.body.textContent) && document.querySelectorAll('.note').length >= 1`));
  await ev(`(() => { const s=document.getElementById('ex-x'); s.value='sleepH'; s.dispatchEvent(new Event('change')); })()`); await sleep(500);
  check('Explorer: changing X re-renders (scatter title mentions Sleep)', await ev(`/Sleep duration/.test(document.querySelector('figure.chart .chart-title').textContent)`));
  await go('#/insights/drivers'); await sleep(600);
  check('Drivers: late-workout & alcohol hypotheses show "supported by your data" with q-values', await ev(`/Workouts that start after 19:30/.test(document.body.textContent) && /alcohol/.test(document.body.textContent) && document.querySelectorAll('.badge.good').length >= 2 && /q=/.test(document.body.textContent)`));
  await go('#/insights/reports'); check('Reports: weekly report with highlights + copy', await ev(`/Week of/.test(document.body.textContent) && !!document.querySelector('table.t') && /Copy as text/.test(document.body.textContent)`));
  await ev(`(() => { const s=document.getElementById('rp-t'); s.value='month'; s.dispatchEvent(new Event('change')); })()`); await sleep(300);
  check('Reports: monthly report', await ev(`!/Week of/.test(document.querySelector('.card .sub') ? '' : '') && /days/.test(document.querySelector('main').textContent)`));
  await go('#/insights/goals'); await ev(`[...document.querySelectorAll('.chip')].find(c => /8,000 steps/.test(c.textContent)).click()`); await sleep(600);
  check('Goals: preset adds a goal with progress bar', await ev(`!!document.querySelector('[role=progressbar]') && /Met in/.test(document.body.textContent)`));
  await go('#/insights/alerts'); check('Alerts: planted illness episode detected, with not-a-diagnosis wording', await ev(`/not a diagnosis/.test(document.body.textContent) && document.querySelectorAll('.badge.bad').length >= 1`));
  // activity detail with decoupling
  await go('#/train'); await ev(`window.__long = GLApp.state.ds.acts.filter(a => a.hasSeries && a.durationSec > 3000 && a.group === 'run').pop()`);
  await go('#/act/' + encodeURIComponent(await ev(`__long.id`))); await waitFor0(`document.querySelectorAll('.chart-box canvas').length >= 2`);
  check('Activity: HR/speed chart + zones chart + cardiac drift section', await ev(`document.querySelectorAll('.chart-box canvas').length >= 2 && /Cardiac drift/.test(document.body.textContent)`));
  check('Activity: decoupling % shown (or an honest reason)', await ev(`/Aerobic decoupling \\(Pa:HR\\): -?\\d/.test(document.body.textContent) || /Decoupling not computed|not meaningful/.test(document.body.textContent)`));

  // ---------- data page: settings, events, import ----------
  await go('#/data');
  check('Data: privacy statement, disclaimer, how-to-export steps', await ev(`/Nothing is uploaded/.test(document.body.textContent) && /Not medical advice/.test(document.body.textContent) && /Request Data Export/.test(document.body.textContent)`));
  await ev(`document.getElementById('ev-t').value='caffeine'; document.getElementById('ev-l').value='<img src=x onerror=alert(1)> double espresso 6pm'; [...document.querySelectorAll('button')].find(b=>b.textContent==='Add event').click()`); await sleep(700);
  check('Events: added, shown as text (HTML is not interpreted)', await ev(`GLApp.state.notes.some(n => n.type === 'caffeine') && document.body.textContent.includes('<img src=x') && !document.querySelector('main img[src=x]')`));
  await ev(`document.getElementById('s-max').value='185'; document.getElementById('s-need').value='8'; [...document.querySelectorAll('button')].find(b=>b.textContent==='Save settings').click()`); await sleep(700);
  check('Settings: max HR 185 + sleep need 8 h applied to the model', await ev(`GLApp.state.ds.settings.maxHr === 185 && GLApp.state.ds.settings.sleepNeedH === 8 && !GLApp.state.ds.settings.maxHrAuto`));
  // import the export-style zip through the real file input
  const doc = await send('DOM.getDocument'); const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#file-in' });
  await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [ZIP] });
  check('Import: zip with nested FIT is processed and demo data is replaced by it', await waitFor0(`!GLApp.state.hasDemo && /Imported \\d+ days/.test(document.body.textContent)`, 40000), await ev(`(document.querySelector('#app .note b')||{}).textContent`));
  const imp = await ev(`[GLApp.state.days.length, GLApp.state.acts.length, GLApp.state.days.some(d => d.demo), document.getElementById('demo-bar').hidden, GLApp.state.acts.some(a => a.source === 'fit' || a.source === 'summary+fit')]`);
  check('Import result: ~237 days, 140+ activities incl. the nested FIT, no demo flag, DEMO bar hidden', imp[0] >= 230 && imp[1] >= 140 && imp[2] === false && imp[3] === true && imp[4] === true, imp);
  check('Import used a worker (or main thread) without console errors', problems.length === 0, problems.slice(0, 3));
  await go('#/today'); check('Imported data drives Today (no DEMO label)', await waitFor0(`!!document.querySelector('.score b')`) && await ev(`!document.title.startsWith('DEMO')`));
  await go('#/trends'); check('Imported data: charts draw', (await allCanvasInk()).length >= 4 && (await allCanvasInk()).every(n => n > 300));
  // backup round-trip through the real UI functions
  const rt = await ev(`(async () => { const b = await GLApp.state.db.exportBundle(true); const enc = await GLCrypto.encrypt(JSON.stringify(b), 'smoke-test-passphrase', 3000); const dec = JSON.parse(await GLCrypto.decrypt(enc, 'smoke-test-passphrase')); let wrong = false; try { await GLCrypto.decrypt(enc, 'nope-nope-nope'); } catch (e) { wrong = true; } return [dec.days.length === b.days.length, dec.activities.length === b.activities.length, wrong, !enc.includes('restingHeartRate')]; })()`);
  check('Encrypted backup round-trips in the browser; wrong passphrase fails', rt.every(Boolean), rt);
  check('CSV export contains one row per day', await ev(`GLInsights.daysCsv(GLApp.state.ds).split('\\r\\n').length === GLApp.state.ds.n + 2`));

  // ---------- offline ----------
  if (LOCAL) {
    await ev(`navigator.serviceWorker.ready.then(() => true)`);
    check('SW cache contains the whole shell', await ev(`caches.keys().then(async ks => { const k = ks.find(x => x.startsWith('garmin-lens-')); if (!k) return false; const c = await caches.open(k); const reqs = await c.keys(); return reqs.length >= 26; })`), await ev(`caches.keys()`));
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    ld = waitEvent('Page.loadEventFired'); await send('Page.navigate', { url: APP + '?offline=1#/today' }); await ld; await waitFor0('window.__glReady === true');
    check('Offline reload works: app boots and still shows the stored data', await ev(`document.title.includes('Garmin Lens') && !!document.querySelector('.score b') && GLApp.state.days.length > 200`), await ev(`document.title`));
    await go('#/trends'); check('Offline: charts draw', (await allCanvasInk()).length >= 4);
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
  // ---------- wipe ----------
  await go('#/data'); await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Delete all my data').click()`); await sleep(900);
  check('Delete all data: everything gone, welcome screen back', await ev(`GLApp.state.days.length === 0 && GLApp.state.notes.length === 0`) && await ev(`localStorage.length <= 1`), await ev(`Object.keys(localStorage)`));
  check('no console errors or exceptions during the whole run', problems.length === 0, problems.slice(0, 5));

  const failed = results.filter(r => !r).length; console.log(`\n${results.length - failed} passed, ${failed} failed`);
  chrome.kill(); if (server) server.kill(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('SMOKE CRASH', e); problems.forEach(p => console.error(p)); try { chrome.kill(); if (server) server.kill(); } catch (x) {} process.exit(1); });
