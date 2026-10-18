/* Garmin Lens – small DOM helpers (no innerHTML: every string from a file or from the user goes through textContent). */
(function (root) {
  "use strict";
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { var v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else if (k === "style" && typeof v === "object") Object.assign(e.style, v); else e.setAttribute(k, v === true ? "" : v); }
    add(e, kids); return e;
  }
  function add(e, kids) { if (kids === undefined || kids === null || kids === false) return e; if (!Array.isArray(kids)) kids = [kids]; kids.forEach(function (k) { if (Array.isArray(k)) add(e, k); else if (k !== null && k !== undefined && k !== false) e.appendChild(typeof k === "object" ? k : document.createTextNode(String(k))); }); return e; }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function num(v, d) { if (typeof v !== "number" || !isFinite(v)) return "–"; var s = v.toFixed(d === undefined ? 0 : d); return s; }
  function dur(sec) { if (typeof sec !== "number" || !isFinite(sec)) return "–"; var m = Math.round(sec / 60), hh = Math.floor(m / 60), mm = m % 60; return hh ? hh + " h " + (mm < 10 ? "0" : "") + mm + " m" : mm + " min"; }
  function hm(hours) { return dur(hours * 3600); }
  function clock(minSince18) { var m = (((minSince18 + 1080) % 1440) + 1440) % 1440, hh = Math.floor(m / 60), mm = Math.round(m % 60); if (mm === 60) { hh = (hh + 1) % 24; mm = 0; } return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm; }
  function sign(v, d) { return typeof v !== "number" || !isFinite(v) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d === undefined ? 1 : d); }
  var toastT = null;
  function toast(msg) { var t = document.getElementById("toast"); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3500); }
  function card(title, kids, cls) { return h("section", { class: "card" + (cls ? " " + cls : "") }, [title ? h("h2", { text: title }) : null, kids]); }
  function download(name, text, type) { var b = new Blob([text], { type: type || "text/plain" }), u = URL.createObjectURL(b), a = h("a", { href: u, download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }
  root.GLUI = { h: h, $: $, num: num, dur: dur, hm: hm, clock: clock, sign: sign, toast: toast, card: card, download: download };
})(typeof self !== "undefined" ? self : this);
