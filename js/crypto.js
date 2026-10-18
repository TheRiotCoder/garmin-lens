/* Garmin Lens – passphrase-encrypted backups (WebCrypto: PBKDF2-SHA256 -> AES-256-GCM). The passphrase never leaves the device and is never stored. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(globalThis.crypto);
  else root.GLCrypto = factory(root.crypto);
})(typeof self !== "undefined" ? self : this, function (crypto) {
  "use strict";
  var ITER = 250000, MAGIC = "garmin-lens-encrypted-backup";
  function b64(u8) { var s = ""; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function key(pass, salt, iter, usage) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, usage);
    });
  }
  function encrypt(plain, pass, iter) {
    if (!pass || pass.length < 8) return Promise.reject(new Error("Passphrase must be at least 8 characters"));
    iter = iter || ITER;
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return key(pass, salt, iter, ["encrypt"]).then(function (k) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, new TextEncoder().encode(plain)); }).then(function (ct) {
      return JSON.stringify({ format: MAGIC, v: 1, kdf: "PBKDF2-SHA256", iter: iter, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) });
    });
  }
  function isEncrypted(text) { try { var o = JSON.parse(text); return !!o && o.format === MAGIC; } catch (e) { return false; } }
  function decrypt(text, pass) {
    var o; try { o = JSON.parse(text); } catch (e) { return Promise.reject(new Error("Not a Garmin Lens encrypted backup")); }
    if (!o || o.format !== MAGIC || o.v !== 1) return Promise.reject(new Error("Not a Garmin Lens encrypted backup"));
    if (!(o.iter >= 1000 && o.iter <= 5e6)) return Promise.reject(new Error("Bad key-derivation settings"));
    return key(pass || "", unb64(o.salt), o.iter, ["decrypt"]).then(function (k) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, k, unb64(o.ct)); })
      .then(function (pt) { return new TextDecoder().decode(pt); }, function () { throw new Error("Wrong passphrase or damaged backup"); });
  }
  return { encrypt: encrypt, decrypt: decrypt, isEncrypted: isEncrypted, ITER: ITER };
});
