// tiny shared test harness (same shape as SatPass)
let pass = 0, fail = 0;
function ok(name, cond, info) { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (info !== undefined ? "  -> " + (typeof info === "string" ? info : JSON.stringify(info)) : "")); }
function near(name, got, want, tol) { ok(name, got === want || (typeof got === "number" && Math.abs(got - want) <= tol), "got " + got + ", want " + want + " ±" + tol); }
function eq(name, got, want) { const a = JSON.stringify(got), b = JSON.stringify(want); ok(name, a === b, a === b ? undefined : "got " + a + ", want " + b); }
function throws(name, fn, re) { let m = "no error", good = false; try { fn(); } catch (e) { m = e.message; good = !re || re.test(m); } ok(name, good, "throws: " + m); }
async function rejects(name, p, re) { let m = "no error", good = false; try { await p; } catch (e) { m = e.message; good = !re || re.test(m); } ok(name, good, "rejects: " + m); }
function done() { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
module.exports = { ok, near, eq, throws, rejects, done };
