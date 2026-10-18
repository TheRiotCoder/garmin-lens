const { ok, near, eq, done } = require("./harness");
const S = require("../js/stats.js"), D = require("../js/dates.js");
// --- known answers (checked by hand / numpy)
near("mean", S.mean([2, 4, 4, 4, 5, 5, 7, 9]), 5, 1e-12);
near("sample sd of [2,4,4,4,5,5,7,9] = 2.13809", S.sd([2, 4, 4, 4, 5, 5, 7, 9]), 2.138089935, 1e-8);
near("median even", S.median([1, 3, 2, 4]), 2.5, 1e-12);
near("percentile 90 of 1..11 (linear) = 10", S.percentile([1,2,3,4,5,6,7,8,9,10,11], 90), 10, 1e-12);
near("MAD of [1,1,2,2,4,6,9] = 1", S.mad([1, 1, 2, 2, 4, 6, 9]), 1, 1e-12);
ok("nulls/NaN skipped", S.mean([1, null, NaN, 3, undefined]) === 2 && S.sd([5]) === null && S.mean([]) === null);
near("z-score", S.z(70, 60, 5), 2, 1e-12);
ok("z with zero sd is null", S.z(1, 1, 0) === null);
near("robust z", S.robustZ(20, [10, 11, 9, 10, 12, 10, 11]), (20 - 10) / (1.4826 * 1), 1e-9);
// baseline excludes the current day
const ser = [60, 61, 59, 60, 62, 60, 61, 80];
const b = S.baseline(ser, 7, 7, 5);
ok("baseline excludes today", b && b.n === 7 && Math.abs(b.mean - 60.428571) < 1e-5, b);
ok("baseline needs minimum data", S.baseline([1, 2, 3], 2, 7, 5) === null);
eq("rolling mean window 3", S.rolling([1, 2, 3, 4, 5], 3).map(x => S.round(x, 3)), [1, 1.5, 2, 3, 4]);
eq("ema alpha 0.5", S.ema([10, 20, 30], 0.5), [10, 15, 22.5]);
// regression y = 2x + 1
const lr = S.linreg([1, 2, 3, 4, 5], [3, 5, 7, 9, 11]);
ok("linreg exact line", Math.abs(lr.slope - 2) < 1e-12 && Math.abs(lr.intercept - 1) < 1e-12 && Math.abs(lr.r2 - 1) < 1e-12);
// pearson/spearman known answers (scipy: pearsonr([1,2,3,4,5],[2,1,4,3,5]) = 0.8)
near("pearson 0.8", S.pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]), 0.8, 1e-12);
near("spearman monotone nonlinear = 1", S.spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 100]), 1, 1e-12);
near("spearman with ties = 4.5/sqrt(22.5) (hand-computed on average ranks)", S.spearman([1, 2, 2, 3], [1, 3, 2, 4]), 0.9486832981, 1e-9);
eq("average ranks with ties", S.ranks([10, 20, 20, 30]), [1, 2.5, 2.5, 4]);
ok("pearson constant series is null", S.pearson([1, 1, 1, 1], [1, 2, 3, 4]) === null);
near("normal cdf(1.96) = .975", S.normCdf(1.96), 0.975, 5e-4);
near("p for r=0.5, n=30 (Fisher z, scipy ~0.0049)", S.corrP(0.5, 30), 0.0049, 0.0012);
const ci = S.corrCI(0.5, 30); ok("Fisher CI for r=.5,n=30 ≈ [0.17, 0.73]", Math.abs(ci[0] - 0.17) < 0.02 && Math.abs(ci[1] - 0.73) < 0.02, ci);
// lag: y is x shifted 1 day later -> perfect correlation at lag 1
const x = [1, 5, 2, 8, 3, 9, 4, 7, 6, 10, 2, 8], y = [0].concat(x.slice(0, -1));
const l1 = S.laggedCorr(x, y, 1), l0 = S.laggedCorr(x, y, 0);
ok("laggedCorr finds the true lag", l1.r > 0.999 && l1.n === 11 && l0.r < 0.9, [l0.r, l1.r]);
const g = S.groupDiff([10, 12, 11, 13, 12], [8, 9, 7, 9, 8]);
ok("groupDiff direction + size", g.diff > 3 && g.d > 2.5 && g.p < 0.01 && g.n1 === 5, g);
// dates
ok("dayKey from Java date string", D.dayKey("Mar 15, 2022 12:00:00 AM") === "2022-03-15");
ok("dayKey from {date:..}", D.dayKey({ date: "Mar 14, 2022 11:00:00 PM" }) === "2022-03-14");
ok("Java PM hour parse", D.parse("Mar 15, 2022 4:38:00 PM").ms === Date.UTC(2022, 2, 15, 16, 38) && D.parse("Mar 15, 2022 12:13:00 AM").ms === Date.UTC(2022, 2, 15, 0, 13) && D.parse("Mar 15, 2022 12:30:00 PM").ms === Date.UTC(2022, 2, 15, 12, 30));
ok("ISO GMT timestamp read as UTC", D.instant("2019-08-04T20:28:00.0") === Date.UTC(2019, 7, 4, 20, 28));
ok("ISO with offset", D.instant("2019-08-04T20:28:00+02:00") === Date.UTC(2019, 7, 4, 18, 28));
ok("epoch ms (float string form of 1.764139178E+12)", D.dayKey(1.764139178E+12) === "2025-11-26");
ok("addDays/diffDays/range across month + leap", D.addDays("2024-02-28", 2) === "2024-03-01" && D.diffDays("2026-01-01", "2026-03-01") === 59 && D.range("2026-10-30", "2026-11-02").length === 4);
ok("weekStart is Monday", D.weekStart("2026-10-17") === "2026-10-12" && D.weekStart("2026-10-12") === "2026-10-12" && D.weekStart("2026-10-18") === "2026-10-12");
ok("garbage dates -> null", D.parse("yesterday") === null && D.parse(null) === null && D.dayKey({}) === null);
done();
