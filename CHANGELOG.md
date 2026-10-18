# Changelog

## 1.2.0 – 2026-10-18
Review fixes (AutoService + earlier items), on top of 1.1.1.
- **Privacy wording made precise everywhere** (app, README, METHODS): the page cannot send data; the import worker is code-audited with no network calls (a test now includes the worker and checks its `importScripts`). README notes that a dedicated Cloudflare Pages origin would add a header-enforced CSP (not done; not authorised for this app).
- **Shared github.io origin** stated honestly in README and on the Data page (other apps by the same author share the origin): install as a PWA, prefer the encrypted backup, dedicated origin available on request.
- **HRV fallbacks:** `avgOvernightHrv` from `sleepData`, then the weekly average from `TrainingReadiness.hrvWeeklyAverage`; weekly-only HRV is labelled lower resolution (half weight in recovery, no HRV strain flags); explicit "No HRV found in this export" note.
- **Service-worker version guard:** `tools/stamp.js` fingerprint + test that fails when precached files change without a VERSION bump.
- **iOS** Add-to-Home-Screen hint with backup advice (Safari may evict storage after ~7 days unused).
- **Importer:** skips JSON in account, customer-service, user, social, payment, content, device and golf folders (`userBiometrics.json` excepted); duplicate UDSFile records (later zero ignored, max for cumulative fields); `activityType` as `{typeKey}`; `calendarDate` as `{year,month,day}` or inside `dailySleepDTO`; unit/plausibility sanity checks (ms-vs-s sleep, out-of-range values dropped with a warning).
- **UI:** import progress is real (files read of known total, 100 % while saving) instead of sticking at 95 %; install banner no longer covers the toast; deleting a cycle event asks for confirmation; event types show human labels; tap targets re-checked on the Data page with events listed (and the iOS hint).
- Tests: more Node checks (parsers, importer, models, shell/worker audit, cache fingerprint); browser smoke gains cycle-event, confirm, label, progress, iOS-hint, toast and Data-page tap-target checks.
- Service-worker cache renamed to `garmin-lens-v1.2.0`.

## 1.1.1 – 2026-10-18
- **Sustained-change cap on the anomaly baseline.** Flagged days are still kept out of the baseline, but only for the first 14 consecutive flagged days. At 14 days the wording becomes "Sustained change for 2 weeks. If this isn't explained by something you know about, it's worth discussing with a clinician", and from the next flagged day on the new level is let into the baseline so the flag clears once it is stable. A permanent shift (post-illness, new medication, fitness change, altitude) no longer flags forever.
- Tests: 10-, 13- and 20-day episodes still flag every day; a 30-day permanent shift flags days 1–14, shows "sustained" from day 14, then clears on day 22 and stays clear; a further jump on top of the settled level flags again.
- Service-worker cache renamed to `garmin-lens-v1.1.1`.

## 1.1.0 – 2026-10-18
Review fixes (physiology review, round 2).
- **Anomaly baseline:** flagged days are excluded from the baseline of later days, so a long illness-like episode keeps flagging instead of normalising itself after ~4–5 days. Tests: 10- and 20-day episodes flag every day.
- **Menstrual cycle:** new "cycle" event type (optional "until" date). Cycle days are a confounder note on flags/episodes and are never tested as a cause. With sex = female, strain-pattern text says the luteal phase can look like this.
- **Recovery score:** sleep bonus capped at +1 (oversleeping not rewarded; short nights not capped) and the explanation says so. Display says 50 = typical for you, not absolute fitness. Explains that the form component rewards a rested but detrained state.
- **TRIMP:** female uses Banister 0.86·e^(1.67x) (male 0.64·e^(1.92x)) in both per-sample load and the one-hour threshold normaliser.
- **Docs:** METHODS.md notes the 7-night HRV z-score compression, the form-component caveat, baseline hygiene and the cycle handling.
- Service-worker cache renamed to `garmin-lens-v1.1.0` so installed copies update.

## 1.0.0 – 2026-10-18
First release: import of the Garmin "Export Your Data" ZIP and individual files, private offline PWA, recovery/trends/sleep/training/activity/insights views, physiology-review wording (wake-date timing, worth-watching vs strain-pattern, ln-HRV 7-night readiness, shared 1.3 load threshold, estimated max HR, caveats).
