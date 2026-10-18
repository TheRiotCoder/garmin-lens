# Changelog

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
