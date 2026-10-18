/* Garmin Lens – FIT file parser (own implementation of the public FIT protocol; pure, UMD).
   Handles: 12/14-byte headers, definition + data messages (little/big endian), compressed-timestamp headers, developer fields (skipped),
   arrays, scale/offset for the fields below, chained FIT files, file CRC. Unknown messages are skipped (counted). Truncated files return what was read.
   The message/field table is a SUBSET of the FIT global profile (field numbers from the public FIT SDK profile); every field used by the app is
   cross-checked against python-fitparse output on real Garmin files in tests/fit.test.js. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GLFit = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var FIT_EPOCH_MS = 631065600000; // 1989-12-31T00:00:00Z
  var SEMI = 180 / 2147483648;
  // base types: [size, signed?, kind, invalid]
  var BT = { 0: [1, 0, "u", 0xFF], 1: [1, 1, "i", 0x7F], 2: [1, 0, "u", 0xFF], 3: [2, 1, "i", 0x7FFF], 4: [2, 0, "u", 0xFFFF], 5: [4, 1, "i", 0x7FFFFFFF], 6: [4, 0, "u", 0xFFFFFFFF], 7: [1, 0, "s", 0],
    8: [4, 1, "f", null], 9: [8, 1, "d", null], 10: [1, 0, "u", 0], 11: [2, 0, "u", 0], 12: [4, 0, "u", 0], 13: [1, 0, "u", 0xFF], 14: [8, 1, "I", null], 15: [8, 0, "U", null], 16: [8, 0, "U", 0] };
  // field spec: [name, scale, offset, kind]  kind: "ts" (FIT seconds -> unix ms), "deg" (semicircles -> degrees)
  function F(name, scale, off, kind) { return { n: name, s: scale || 1, o: off || 0, k: kind || "" }; }
  var PROFILE = {
    0: { name: "file_id", f: { 0: F("type"), 1: F("manufacturer"), 2: F("product"), 3: F("serial_number"), 4: F("time_created", 1, 0, "ts"), 5: F("number") } },
    18: { name: "session", f: { 253: F("timestamp", 1, 0, "ts"), 0: F("event"), 1: F("event_type"), 2: F("start_time", 1, 0, "ts"), 3: F("start_lat", 1, 0, "deg"), 4: F("start_lon", 1, 0, "deg"), 5: F("sport"), 6: F("sub_sport"),
      7: F("total_elapsed_time", 1000), 8: F("total_timer_time", 1000), 9: F("total_distance", 100), 11: F("total_calories"), 14: F("avg_speed", 1000), 15: F("max_speed", 1000), 16: F("avg_heart_rate"), 17: F("max_heart_rate"),
      18: F("avg_cadence"), 19: F("max_cadence"), 20: F("avg_power"), 21: F("max_power"), 22: F("total_ascent"), 23: F("total_descent"), 24: F("total_training_effect", 10), 26: F("num_laps"), 34: F("normalized_power"), 35: F("training_stress_score", 10),
      36: F("intensity_factor", 1000), 64: F("min_heart_rate"), 124: F("enhanced_avg_speed", 1000), 125: F("enhanced_max_speed", 1000), 137: F("anaerobic_training_effect", 10) } },
    19: { name: "lap", f: { 253: F("timestamp", 1, 0, "ts"), 0: F("event"), 1: F("event_type"), 2: F("start_time", 1, 0, "ts"), 7: F("total_elapsed_time", 1000), 8: F("total_timer_time", 1000), 9: F("total_distance", 100), 11: F("total_calories"),
      13: F("avg_speed", 1000), 14: F("max_speed", 1000), 15: F("avg_heart_rate"), 16: F("max_heart_rate"), 17: F("avg_cadence"), 21: F("total_ascent"), 22: F("total_descent"), 110: F("enhanced_avg_speed", 1000), 111: F("enhanced_max_speed", 1000) } },
    20: { name: "record", f: { 253: F("timestamp", 1, 0, "ts"), 0: F("lat", 1, 0, "deg"), 1: F("lon", 1, 0, "deg"), 2: F("altitude", 5, 500), 3: F("heart_rate"), 4: F("cadence"), 5: F("distance", 100), 6: F("speed", 1000), 7: F("power"), 13: F("temperature"),
      73: F("enhanced_speed", 1000), 78: F("enhanced_altitude", 5, 500) } },
    21: { name: "event", f: { 253: F("timestamp", 1, 0, "ts"), 0: F("event"), 1: F("event_type"), 3: F("data") } },
    34: { name: "activity", f: { 253: F("timestamp", 1, 0, "ts"), 0: F("total_timer_time", 1000), 1: F("num_sessions"), 2: F("type"), 5: F("local_timestamp") } },
    55: { name: "monitoring", f: { 253: F("timestamp", 1, 0, "ts"), 26: F("timestamp_16"), 27: F("heart_rate"), 3: F("cycles", 2), 2: F("distance", 100), 5: F("activity_type"), 28: F("intensity"), 19: F("active_calories"), 29: F("duration_min") } },
    78: { name: "hrv", f: { 0: F("time", 1000) } },
    103: { name: "monitoring_info", f: { 253: F("timestamp", 1, 0, "ts"), 0: F("local_timestamp") } }
  };
  var FILE_TYPES = { 1: "device", 2: "settings", 3: "sport", 4: "activity", 5: "workout", 6: "course", 9: "weight", 11: "totals", 12: "goals", 14: "blood_pressure", 15: "monitoring_a", 20: "activity_summary", 28: "monitoring_daily", 32: "monitoring_b", 34: "segment", 35: "segment_list" };
  var SPORTS = { 0: "generic", 1: "running", 2: "cycling", 3: "transition", 4: "fitness_equipment", 5: "swimming", 6: "basketball", 7: "soccer", 8: "tennis", 9: "american_football", 10: "training", 11: "walking", 12: "cross_country_skiing", 13: "alpine_skiing", 14: "snowboarding", 15: "rowing", 16: "mountaineering", 17: "hiking", 18: "multisport", 19: "paddling", 25: "golf", 37: "stand_up_paddleboarding", 38: "surfing", 53: "diving", 62: "hiit" };

  function crc16(u8, start, end, crc) {
    var T = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
    crc = crc || 0;
    for (var i = start; i < end; i++) {
      var b = u8[i], tmp = T[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ T[b & 0xF];
      tmp = T[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ T[(b >> 4) & 0xF];
    }
    return crc;
  }

  function readValue(dv, off, bt, size, little) {
    var t = BT[bt & 0x1F]; if (!t) return null;
    var tsz = t[0], kind = t[2], n = Math.floor(size / tsz), vals = [], i, v, allBad = true;
    if (kind === "s") { var s = "", j = 0; for (; j < size; j++) { var c = dv.getUint8(off + j); if (!c) break; s += String.fromCharCode(c); } try { s = decodeURIComponent(escape(s)); } catch (e) {} return s || null; }
    if (n < 1) return null;
    for (i = 0; i < n; i++) {
      var o = off + i * tsz;
      switch (kind) {
        case "u": v = tsz === 1 ? dv.getUint8(o) : tsz === 2 ? dv.getUint16(o, little) : dv.getUint32(o, little); break;
        case "i": v = tsz === 1 ? dv.getInt8(o) : tsz === 2 ? dv.getInt16(o, little) : dv.getInt32(o, little); break;
        case "f": v = dv.getFloat32(o, little); if (!isFinite(v)) v = null; break;
        case "d": v = dv.getFloat64(o, little); if (!isFinite(v)) v = null; break;
        case "I": v = Number(dv.getBigInt64(o, little)); break;
        case "U": v = Number(dv.getBigUint64(o, little)); break;
      }
      if (v !== null && t[3] !== null && v === t[3] && kind !== "f" && !((bt & 0x1F) === 13 && n > 1)) v = null; // byte arrays: 0xFF is a normal value unless every byte is 0xFF
      else if (kind === "U" && t[3] === null && v === 18446744073709552000) v = null;
      if (v !== null && !((bt & 0x1F) === 13 && n > 1 && v === 0xFF)) allBad = false; vals.push(v);
    }
    if (allBad) return null;
    return n === 1 ? vals[0] : vals;
  }
  function conv(spec, v) {
    if (v === null) return null;
    if (Array.isArray(v)) return v.map(function (x) { return conv(spec, x); });
    if (spec.k === "ts") return v < 0x10000000 ? null : (v + 631065600) * 1000; // values below 0x10000000 are "system time" (seconds since power-on), not a date
    if (spec.k === "deg") return v * SEMI;
    if (spec.s !== 1) v = v / spec.s;
    if (spec.o) v = v - spec.o;
    return v;
  }

  /* parse(u8, opts): opts.only = array of message names to keep (default: all known); opts.keepUnknown; opts.maxMessages */
  function parse(u8, opts) {
    opts = opts || {};
    var keep = opts.only ? {} : null; if (keep) opts.only.forEach(function (n) { keep[n] = true; });
    var out = { messages: {}, unknown: {}, fileType: null, fileId: null, crcOk: true, truncated: false, files: 0, errors: [] };
    var pos = 0, len = u8.length;
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    while (pos + 12 <= len) {
      var hsize = u8[pos];
      if ((hsize !== 12 && hsize !== 14) || String.fromCharCode(u8[pos + 8], u8[pos + 9], u8[pos + 10], u8[pos + 11]) !== ".FIT") {
        if (out.files === 0) throw new Error("Not a FIT file (bad header)");
        break; // trailing garbage after a valid file
      }
      var dsize = dv.getUint32(pos + 4, true), start = pos + hsize, end = start + dsize;
      if (hsize === 14) { var hc = dv.getUint16(pos + 12, true); if (hc !== 0 && hc !== crc16(u8, pos, pos + 12)) out.errors.push("header CRC mismatch"); }
      if (end + 2 > len) { out.truncated = true; end = len; } else { var fc = dv.getUint16(end, true); if (crc16(u8, pos, end) !== fc) { out.crcOk = false; out.errors.push("file CRC mismatch"); } }
      parseBody(u8, dv, start, end, out, keep, opts);
      out.files++;
      pos = end + 2;
      if (out.truncated) break;
    }
    if (!out.files) throw new Error("Not a FIT file");
    return out;
  }

  function parseBody(u8, dv, p, end, out, keep, opts) {
    var defs = {}, lastTs = 0, count = 0, csd = { last: null, acc: 0 };
    try {
      while (p < end) {
        var h = u8[p++], local, def, compTs = null;
        if (h & 0x80) { local = (h >> 5) & 3; compTs = h & 0x1F; }
        else if (h & 0x40) { // definition message
          local = h & 0x0F; var hasDev = !!(h & 0x20);
          var little = u8[p + 1] === 0, num = dv.getUint16(p + 2, little), nf = u8[p + 4]; p += 5;
          var fields = [], size = 0, i;
          for (i = 0; i < nf; i++) { fields.push({ num: u8[p], size: u8[p + 1], bt: u8[p + 2] }); size += u8[p + 1]; p += 3; }
          var dev = [];
          if (hasDev) { var nd = u8[p++]; for (i = 0; i < nd; i++) { dev.push({ size: u8[p + 1] }); size += u8[p + 1]; p += 3; } }
          defs[local] = { little: little, num: num, fields: fields, dev: dev, size: size };
          continue;
        } else local = h & 0x0F;
        def = defs[local];
        if (!def) throw new Error("data message with no definition (local type " + local + ")");
        if (p + def.size > end) { out.truncated = true; break; }
        var prof = PROFILE[def.num], wanted = prof && (!keep || keep[prof.name]);
        var msg = null, q = p, fi, f, hadTs = false;
        if (wanted || opts.keepUnknown) msg = {};
        for (fi = 0; fi < def.fields.length; fi++) {
          f = def.fields[fi];
          if (f.num === 253 || msg) {
            var raw = readValue(dv, q, f.bt, f.size, def.little);
            if (f.num === 253 && raw !== null && typeof raw === "number") { lastTs = raw; hadTs = true; }
            if (msg) {
              var spec = prof && prof.f[f.num];
              if (prof && prof.name === "record" && f.num === 8 && Array.isArray(raw) && raw.length === 3 && raw[0] !== null) { // compressed_speed_distance: 12-bit speed (1/100 m/s) + 12-bit rolling distance (1/16 m)
                var sp = (raw[0] | ((raw[1] & 0x0F) << 8)) / 100, dr = (raw[2] << 4) | (raw[1] >> 4);
                csd.acc = csd.last === null ? dr : csd.acc + ((dr - csd.last) & 0xFFF); csd.last = dr;
                if (msg.speed == null) msg.speed = sp; if (msg.distance == null) msg.distance = csd.acc / 16;
              } else if (spec) msg[spec.n] = conv(spec, raw); else if (!prof || opts.keepUnknown) msg["f" + f.num] = raw;
            }
          }
          q += f.size;
        }
        if (compTs !== null) { // compressed timestamp header: rebuild a full timestamp from the last one
          var t = (lastTs & ~0x1F) + compTs; if (compTs < (lastTs & 0x1F)) t += 0x20; lastTs = t;
          if (msg) msg.timestamp = t < 0x10000000 ? null : (t + 631065600) * 1000;
          hadTs = true;
        }
        if (msg && hadTs) msg._t = lastTs; // raw FIT seconds (also valid for devices that report "system time" instead of a UTC date)
        p += def.size;
        if (msg) {
          var nm = prof ? prof.name : "msg_" + def.num;
          if (prof && prof.name === "monitoring" && msg.timestamp === undefined && msg.timestamp_16 != null) { /* 16-bit rollover reconstruction */
            var t16 = (lastTs & ~0xFFFF) + msg.timestamp_16; if (msg.timestamp_16 < (lastTs & 0xFFFF)) t16 += 0x10000; msg.timestamp = (t16 + 631065600) * 1000;
          } else if (prof && msg.timestamp === undefined && compTs === null && def.fields.every(function (x) { return x.num !== 253; })) { /* messages without a timestamp field keep none */ }
          (out.messages[nm] = out.messages[nm] || []).push(msg);
          if (nm === "file_id" && !out.fileId) { out.fileId = msg; out.fileType = FILE_TYPES[msg.type] || ("type_" + msg.type); }
          if (opts.stopAfterFileId && nm === "file_id") return;
        } else if (!prof) out.unknown[def.num] = (out.unknown[def.num] || 0) + 1;
        if (opts.maxMessages && ++count > opts.maxMessages) { out.truncated = true; break; }
      }
    } catch (e) {
      if (opts.stopAfterFileId && out.fileId) return;
      out.errors.push(e.message); out.truncated = true;
    }
  }
  // cheap look at the file type (used to skip the thousands of all-day monitoring files in an export)
  function peek(u8) {
    try { var r = parse(u8, { only: ["file_id"], stopAfterFileId: true }); return { fileType: r.fileType, fileId: r.fileId }; }
    catch (e) { return { fileType: null, error: e.message }; }
  }
  return { parse: parse, peek: peek, crc16: crc16, FIT_EPOCH_MS: FIT_EPOCH_MS, SPORTS: SPORTS, FILE_TYPES: FILE_TYPES, PROFILE: PROFILE };
});
