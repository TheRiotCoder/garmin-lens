const { ok, eq, rejects, done } = require("./harness");
const Z = require("../js/zip.js"), zlib = require("zlib"), cp = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
(async () => {
  // inflate fallback vs zlib on several shapes of data (fixed + dynamic Huffman, stored, repeats)
  const rnd = (n, seed) => { const b = Buffer.alloc(n); let s = seed; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; b[i] = s >> 16; } return b; };
  const samples = { empty: Buffer.alloc(0), text: Buffer.from("hello hello hello garmin lens ".repeat(500)), random: rnd(5000, 7), json: Buffer.from(JSON.stringify(Array.from({ length: 800 }, (_, i) => ({ calendarDate: "2026-01-" + (i % 28 + 1), restingHeartRate: 50 + (i % 9), totalSteps: i * 13 })))), zeros: Buffer.alloc(70000) };
  for (const [name, buf] of Object.entries(samples)) {
    for (const lvl of [0, 1, 9]) { const c = zlib.deflateRawSync(buf, { level: lvl }); ok(`JS inflate = original (${name}, zlib level ${lvl})`, Buffer.compare(Buffer.from(Z.inflateRawJS(new Uint8Array(c))), buf) === 0); }
  }
  const fixed = zlib.deflateRawSync(samples.text, { strategy: zlib.constants.Z_FIXED }); ok("JS inflate handles fixed-Huffman blocks", Buffer.compare(Buffer.from(Z.inflateRawJS(new Uint8Array(fixed))), samples.text) === 0);
  ok("crc32 known answer ('123456789' = CBF43926)", Z.crc32(new Uint8Array(Buffer.from("123456789"))) === 0xCBF43926);
  // real zip made by the system zip/python (stored + deflated + nested + unicode + dir entries)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "glzip-"));
  fs.mkdirSync(path.join(tmp, "DI_CONNECT/DI-Connect-Aggregator"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "DI_CONNECT/DI-Connect-Aggregator/UDSFile_a_b.json"), samples.json);
  fs.writeFileSync(path.join(tmp, "DI_CONNECT/ünï.txt"), "héllo");
  fs.writeFileSync(path.join(tmp, "empty.bin"), "");
  cp.execSync(`python3 - <<'PY'
import zipfile,os
t=${JSON.stringify(tmp)}
inner=os.path.join(t,"inner.zip")
with zipfile.ZipFile(inner,"w",zipfile.ZIP_DEFLATED) as z: z.writestr("a.fit",b"FIT-bytes-"*50)
with zipfile.ZipFile(os.path.join(t,"x.zip"),"w") as z:
    z.write(os.path.join(t,"DI_CONNECT/DI-Connect-Aggregator/UDSFile_a_b.json"),"DI_CONNECT/DI-Connect-Aggregator/UDSFile_a_b.json",zipfile.ZIP_DEFLATED)
    z.write(os.path.join(t,"DI_CONNECT/ünï.txt"),"DI_CONNECT/ünï.txt",zipfile.ZIP_STORED)
    z.write(os.path.join(t,"empty.bin"),"empty.bin",zipfile.ZIP_STORED)
    z.write(inner,"DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip",zipfile.ZIP_STORED)
    z.writestr("dir/",b"")
PY`);
  const zipBytes = new Uint8Array(fs.readFileSync(path.join(tmp, "x.zip")));
  const zip = await Z.open(Z.fromBytes(zipBytes));
  eq("entry names", zip.entries.map(e => e.name).sort(), ["DI_CONNECT/DI-Connect-Aggregator/UDSFile_a_b.json", "DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip", "DI_CONNECT/ünï.txt", "dir/", "empty.bin"]);
  const e1 = zip.entries.find(e => /UDSFile/.test(e.name));
  ok("deflated entry reads back identical (CRC verified)", Buffer.compare(Buffer.from(await zip.read(e1)), samples.json) === 0 && e1.method === 8);
  ok("unicode + stored entry", Z.utf8(await zip.read(zip.entries.find(e => /ünï/.test(e.name)))) === "héllo");
  ok("empty entry", (await zip.read(zip.entries.find(e => e.name === "empty.bin"))).length === 0);
  const nested = await Z.open(Z.fromBytes(await zip.read(zip.entries.find(e => /Part1\.zip$/.test(e.name)))));
  ok("nested zip opens, entry readable", Z.utf8(await nested.read(nested.entries[0])) === "FIT-bytes-".repeat(50));
  ok("isZipBytes", Z.isZipBytes(zipBytes) && !Z.isZipBytes(new Uint8Array([1, 2, 3, 4])));
  // corruption
  const bad = zipBytes.slice(); const off = e1.offset + 30 + 60; bad[off] ^= 0xff;
  const zb = await Z.open(Z.fromBytes(bad)); await rejects("corrupted data is detected (CRC or inflate error)", zb.read(zb.entries.find(e => /UDSFile/.test(e.name))), /CRC|inflate|mismatch/i);
  await rejects("non-zip rejected", Z.open(Z.fromBytes(new Uint8Array(100))), /Not a ZIP/);
  await rejects("tiny file rejected", Z.open(Z.fromBytes(new Uint8Array(5))), /too small/);
  // ZIP64 flavour (python can force it)
  cp.execSync(`python3 -c "
import zipfile
with zipfile.ZipFile('${tmp}/z64.zip','w',allowZip64=True) as z:
    with z.open('big.txt','w',force_zip64=True) as f: f.write(b'abc'*1000)
"`);
  const z64 = await Z.open(Z.fromBytes(new Uint8Array(fs.readFileSync(path.join(tmp, "z64.zip")))));
  ok("ZIP64 entry (forced) reads", Z.utf8(await z64.read(z64.entries[0])) === "abc".repeat(1000));
  fs.rmSync(tmp, { recursive: true, force: true });
  done();
})();
