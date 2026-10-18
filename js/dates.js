/* Garmin Lens – date helpers (pure, UMD). Day keys are "YYYY-MM-DD" strings. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GLDates = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var DAY = 86400000;
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function key(y, m, d) { return y + "-" + pad(m + 1) + "-" + pad(d); }
  function keyUTC(ms) { var d = new Date(ms); return key(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  function keyShifted(ms, offsetMin) { return keyUTC(ms + (offsetMin || 0) * 60000); }
  function isKey(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function toMs(k) { var p = k.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { return keyUTC(toMs(k) + n * DAY); }
  function diffDays(a, b) { return Math.round((toMs(b) - toMs(a)) / DAY); }
  function range(from, to) { var out = [], n = diffDays(from, to); for (var i = 0; i <= n; i++) out.push(addDays(from, i)); return out; }
  function dow(k) { return new Date(toMs(k)).getUTCDay(); }              // 0 = Sunday
  function weekStart(k) { var d = dow(k); return addDays(k, -((d + 6) % 7)); } // Monday
  function monthKey(k) { return k.slice(0, 7); }

  // Garmin writes dates in several shapes. Returns {ms, hasTime} where ms is the wall-clock time read as if it were UTC ("naive").
  //   number            -> epoch milliseconds (kept as is)
  //   {date: "..."}     -> unwrap
  //   "2019-08-05"      -> midnight
  //   "2019-08-04T20:28:00.0" / "...Z" / "...+01:00" -> ISO (zone applied if present, otherwise naive)
  //   "Mar 15, 2022 12:00:00 AM" -> Java/Gson default format, naive
  function parse(v) {
    if (v == null) return null;
    if (typeof v === "object") { if (v.date != null) return parse(v.date); return null; }
    if (typeof v === "number") return isFinite(v) ? { ms: v, hasTime: true } : null;
    if (typeof v !== "string") return null;
    var s = v.trim(), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3]), hasTime: false };
    if ((m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s))) {
      var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), m[7] ? Math.round(parseFloat("0." + m[7]) * 1000) : 0);
      if (m[8] && m[8] !== "Z") { var z = /([+-])(\d{2}):?(\d{2})/.exec(m[8]); ms -= (z[1] === "-" ? -1 : 1) * (+z[2] * 60 + +z[3]) * 60000; }
      return { ms: ms, hasTime: true };
    }
    if ((m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)?$/i.exec(s))) {
      var mo = MONTHS[m[1].toLowerCase()]; if (mo === undefined) return null;
      var h = +m[4]; if (m[7]) { var pm = /pm/i.test(m[7]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
      return { ms: Date.UTC(+m[3], mo, +m[2], h, +m[5], +m[6]), hasTime: true };
    }
    if (/^\d{10,14}(\.\d+)?$/.test(s)) return { ms: parseFloat(s), hasTime: true };
    return null;
  }
  // a calendar date (local day) from any of the shapes; epoch numbers are read as UTC dates
  function dayKey(v) { var p = parse(v); return p ? keyUTC(p.ms) : null; }
  // an absolute instant (ms since epoch, UTC) from a "...GMT" timestamp
  function instant(v) { var p = parse(v); return p && p.hasTime ? p.ms : null; }
  // JS heuristics: epoch values below 1e11 are seconds, otherwise milliseconds
  function epochMs(v) { if (typeof v !== "number" || !isFinite(v)) return null; return v < 1e11 ? v * 1000 : v; }
  function fmtShort(k) { var p = k.split("-"); return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+p[1] - 1] + " " + (+p[2]); }
  function todayKey(d) { d = d || new Date(); return key(d.getFullYear(), d.getMonth(), d.getDate()); }
  return { DAY: DAY, pad: pad, keyUTC: keyUTC, keyShifted: keyShifted, isKey: isKey, toMs: toMs, addDays: addDays, diffDays: diffDays, range: range, dow: dow, weekStart: weekStart, monthKey: monthKey, parse: parse, dayKey: dayKey, instant: instant, epochMs: epochMs, fmtShort: fmtShort, todayKey: todayKey };
});
