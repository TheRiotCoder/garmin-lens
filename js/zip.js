/* Garmin Lens – minimal ZIP reader (pure, UMD): central directory, stored + deflate entries, ZIP64, lazy per-entry reads, nested archives.
   Works on a "source" = { size, read(start, end) -> Promise<Uint8Array> } so a 2 GB export is never loaded as a whole. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GLZip = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- inflate (RFC 1951) in plain JS: fallback where DecompressionStream("deflate-raw") is missing; also used by the tests ---------- */
  var LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258], LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  var DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577], DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  var CLORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
  function buildTable(lengths) { // canonical Huffman: count[len], symbols sorted by (len, symbol)
    var count = new Uint16Array(16), offs = new Uint16Array(16), syms = new Uint16Array(lengths.length), i;
    for (i = 0; i < lengths.length; i++) count[lengths[i]]++;
    count[0] = 0; for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
    for (i = 0; i < lengths.length; i++) if (lengths[i]) syms[offs[lengths[i]]++] = i;
    return { count: count, syms: syms };
  }
  var FIXED_L, FIXED_D;
  function inflateRawJS(src, sizeHint) {
    var pos = 0, bitBuf = 0, bitCnt = 0, out = new Uint8Array(Math.max(1024, sizeHint || src.length * 4)), op = 0;
    function need(n) { while (bitCnt < n) { if (pos >= src.length) throw new Error("inflate: unexpected end of data"); bitBuf |= src[pos++] << bitCnt; bitCnt += 8; } }
    function bits(n) { if (!n) return 0; need(n); var v = bitBuf & ((1 << n) - 1); bitBuf >>>= n; bitCnt -= n; return v; }
    function ensure(n) { if (op + n > out.length) { var o = new Uint8Array(Math.max(out.length * 2, op + n)); o.set(out); out = o; } }
    function decode(t) {
      var code = 0, first = 0, index = 0;
      for (var len = 1; len < 16; len++) { code |= bits(1); var c = t.count[len]; if (code - c < first) return t.syms[index + (code - first)]; index += c; first += c; first <<= 1; code <<= 1; }
      throw new Error("inflate: bad Huffman code");
    }
    var last;
    do {
      last = bits(1); var type = bits(2);
      if (type === 0) {
        bitBuf = 0; bitCnt = 0; if (pos + 4 > src.length) throw new Error("inflate: truncated stored block");
        var len = src[pos] | (src[pos + 1] << 8), nlen = src[pos + 2] | (src[pos + 3] << 8); pos += 4;
        if ((len ^ 0xffff) !== nlen) throw new Error("inflate: stored block length check failed");
        if (pos + len > src.length) throw new Error("inflate: truncated stored block"); ensure(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
      } else if (type === 1 || type === 2) {
        var lt, dt;
        if (type === 1) {
          if (!FIXED_L) { var fl = new Uint8Array(288), k; for (k = 0; k < 144; k++) fl[k] = 8; for (; k < 256; k++) fl[k] = 9; for (; k < 280; k++) fl[k] = 7; for (; k < 288; k++) fl[k] = 8; FIXED_L = buildTable(fl); var fd = new Uint8Array(30); fd.fill(5); FIXED_D = buildTable(fd); }
          lt = FIXED_L; dt = FIXED_D;
        } else {
          var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4, cl = new Uint8Array(19), i;
          for (i = 0; i < hclen; i++) cl[CLORD[i]] = bits(3);
          var clt = buildTable(cl), lens = new Uint8Array(hlit + hdist); i = 0;
          while (i < hlit + hdist) {
            var sym = decode(clt);
            if (sym < 16) lens[i++] = sym;
            else { var prev = 0, rep; if (sym === 16) { if (!i) throw new Error("inflate: bad repeat"); prev = lens[i - 1]; rep = 3 + bits(2); } else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7); if (i + rep > hlit + hdist) throw new Error("inflate: bad lengths"); while (rep--) lens[i++] = prev; }
          }
          lt = buildTable(lens.subarray(0, hlit)); dt = buildTable(lens.subarray(hlit));
        }
        for (;;) {
          var s = decode(lt);
          if (s < 256) { ensure(1); out[op++] = s; }
          else if (s === 256) break;
          else {
            s -= 257; if (s >= 29) throw new Error("inflate: bad length symbol");
            var l = LBASE[s] + bits(LEXT[s]), ds = decode(dt); if (ds >= 30) throw new Error("inflate: bad distance symbol");
            var d = DBASE[ds] + bits(DEXT[ds]); if (d > op) throw new Error("inflate: distance too far back");
            ensure(l); for (var q = 0; q < l; q++) { out[op] = out[op - d]; op++; }
          }
        }
      } else throw new Error("inflate: bad block type");
    } while (!last);
    return out.subarray(0, op);
  }
  function inflateRaw(u8, sizeHint) {
    if (typeof DecompressionStream === "function") {
      try {
        var ds = new DecompressionStream("deflate-raw");
        var resp = new Response(new Blob([u8]).stream().pipeThrough(ds));
        return resp.arrayBuffer().then(function (b) { return new Uint8Array(b); }, function () { return inflateRawJS(u8, sizeHint); });
      } catch (e) { /* fall through */ }
    }
    return Promise.resolve().then(function () { return inflateRawJS(u8, sizeHint); });
  }

  /* ---------- CRC-32 ---------- */
  var CRC_T = null;
  function crc32(u8, crc) {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
    var x = (crc === undefined ? 0 : crc) ^ 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) x = CRC_T[(x ^ u8[i]) & 0xFF] ^ (x >>> 8);
    return (x ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- sources ---------- */
  function fromBytes(u8) { return { size: u8.length, read: function (s, e) { return Promise.resolve(u8.subarray(s, e)); } }; }
  function fromBlob(blob) { return { size: blob.size, read: function (s, e) { return blob.slice(s, e).arrayBuffer().then(function (b) { return new Uint8Array(b); }); } }; }
  function isZipBytes(u8) { return u8 && u8.length > 3 && u8[0] === 0x50 && u8[1] === 0x4B && (u8[2] === 3 || u8[2] === 5) ; }

  var td = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;
  function utf8(u8) { if (td) return td.decode(u8); var s = ""; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); try { return decodeURIComponent(escape(s)); } catch (e) { return s; } }

  function open(source) {
    var size = source.size;
    if (size < 22) return Promise.reject(new Error("Not a ZIP file (too small)"));
    var tailLen = Math.min(size, 65535 + 22 + 20 + 56);
    return source.read(size - tailLen, size).then(function (tail) {
      var dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength), i;
      for (i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) break;
      if (i < 0) throw new Error("Not a ZIP file (no end-of-central-directory record)");
      var total = dv.getUint16(i + 10, true), cdSize = dv.getUint32(i + 12, true), cdOff = dv.getUint32(i + 16, true);
      var zip64 = total === 0xFFFF || cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF;
      var p = zip64 ? (i >= 20 && dv.getUint32(i - 20, true) === 0x07064b50 ? Number(dv.getBigUint64(i - 20 + 8, true)) : -1) : 0;
      if (zip64) {
        if (p < 0) throw new Error("ZIP64 locator missing");
        return source.read(p, p + 56).then(function (z) {
          var zv = new DataView(z.buffer, z.byteOffset, z.byteLength);
          if (zv.getUint32(0, true) !== 0x06064b50) throw new Error("ZIP64 end record missing");
          return { total: Number(zv.getBigUint64(32, true)), cdSize: Number(zv.getBigUint64(40, true)), cdOff: Number(zv.getBigUint64(48, true)) };
        });
      }
      return { total: total, cdSize: cdSize, cdOff: cdOff };
    }).then(function (cd) {
      return source.read(cd.cdOff, cd.cdOff + cd.cdSize).then(function (buf) {
        var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), o = 0, entries = [];
        while (o + 46 <= buf.length && dv.getUint32(o, true) === 0x02014b50) {
          var flags = dv.getUint16(o + 8, true), method = dv.getUint16(o + 10, true), crc = dv.getUint32(o + 16, true), csize = dv.getUint32(o + 20, true), usize = dv.getUint32(o + 24, true);
          var nlen = dv.getUint16(o + 28, true), xlen = dv.getUint16(o + 30, true), clen = dv.getUint16(o + 32, true), lho = dv.getUint32(o + 42, true);
          var name = utf8(buf.subarray(o + 46, o + 46 + nlen));
          if (usize === 0xFFFFFFFF || csize === 0xFFFFFFFF || lho === 0xFFFFFFFF) { // ZIP64 extra field (0x0001): values appear in this order, only for the saturated fields
            var xo = o + 46 + nlen, xe = xo + xlen;
            while (xo + 4 <= xe) { var id = dv.getUint16(xo, true), sz = dv.getUint16(xo + 2, true); if (id === 1) { var q = xo + 4; if (usize === 0xFFFFFFFF) { usize = Number(dv.getBigUint64(q, true)); q += 8; } if (csize === 0xFFFFFFFF) { csize = Number(dv.getBigUint64(q, true)); q += 8; } if (lho === 0xFFFFFFFF) { lho = Number(dv.getBigUint64(q, true)); } break; } xo += 4 + sz; }
          }
          entries.push({ name: name, method: method, crc: crc, csize: csize, size: usize, offset: lho, encrypted: !!(flags & 1), isDir: /\/$/.test(name) });
          o += 46 + nlen + xlen + clen;
        }
        function read(e, opts) {
          if (e.encrypted) return Promise.reject(new Error("Encrypted ZIP entries are not supported: " + e.name));
          return source.read(e.offset, e.offset + 30).then(function (h) {
            var hv = new DataView(h.buffer, h.byteOffset, h.byteLength);
            if (hv.getUint32(0, true) !== 0x04034b50) throw new Error("Bad local header for " + e.name);
            var start = e.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
            return source.read(start, start + e.csize);
          }).then(function (data) {
            var p = e.method === 0 ? Promise.resolve(data) : e.method === 8 ? inflateRaw(data, e.size) : Promise.reject(new Error("Unsupported ZIP compression method " + e.method + " in " + e.name));
            return p.then(function (u8) {
              if (u8.length !== e.size) throw new Error("Size mismatch for " + e.name);
              if (!(opts && opts.skipCrc) && crc32(u8) !== e.crc) throw new Error("CRC mismatch for " + e.name);
              return u8;
            });
          });
        }
        return { entries: entries, read: read, size: size };
      });
    });
  }
  return { open: open, fromBytes: fromBytes, fromBlob: fromBlob, isZipBytes: isZipBytes, inflateRaw: inflateRaw, inflateRawJS: inflateRawJS, crc32: crc32, utf8: utf8 };
});
