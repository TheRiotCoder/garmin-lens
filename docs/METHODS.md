# Methods: every number Garmin Lens computes

All of this is code in `js/models.js`, `js/insights.js` and `js/stats.js`, each with known-answer tests in `tests/`. **Nothing here is medical advice**, none of it is clinically validated, and wrist-sensor data is imperfect.

## Baselines, normal ranges, z-scores
- *Personal baseline* = the **previous 28 days** (the day being judged is excluded so an unusual day can't hide itself). Needs ≥ 10 values.
- *Normal range* = 10th–90th percentile of that window (shaded band on charts).
- *z-score* = (value − median) / (1.4826 × MAD) — robust to the odd outlier — with a **minimum spread** per metric (resting HR 1 bpm, ln HRV 0.05, breathing 0.3 brpm, skin temp 0.15 °C, …) so a very steady stretch doesn't turn a trivial change into "+8σ".
- HRV is analysed as **ln(HRV)** (the standard variance-stabilising transform). Garmin's nightly figure is an RMSSD-type value in ms (see RESEARCH.md); wrist devices give no beat-to-beat data.
- 7/30/90-day means need ≥ 40 % of the days in the window. The 90-day trend is an OLS slope per 30 days, shown only when it explains ≥ 10 % of variance.

## Recovery score (Garmin Lens's own, transparent)
`score = round(100 × Φ(1.3 × Σ wᵢ zᵢ))` where Φ is the normal CDF, zᵢ are clamped to ±3, weights are re-normalised if a signal is missing:

| Signal | z | Weight |
|---|---|---|
| Overnight ln HRV, **7-night average** vs 28-day normal (single night only if < 4 nights) | +z | 40 % |
| Resting HR vs 28-day normal | −z (lower is better) | 20 % |
| Sleep duration vs your need | (hours − need)/1 h, **capped at +1** (oversleeping is not rewarded; short nights are not capped, floor −3) | 25 % |
| Prior-day stress vs normal | −z | 7.5 % |
| Training form (TSB at start of day) | TSB/20 (−1 if load ratio > 1.3), clamped ±2.5 | 7.5 % |

**50 means "typical for you"** (everything exactly at your own 28-day normal), not absolute fitness or health. **The form component (7.5 %) rewards being rested, so a rested but detrained state (low CTL, positive TSB) scores well** – it measures freshness, not fitness.

**Why the 7-night HRV z looks small:** the 7-night average is compared with the spread (SD) of *single nights*. Averages of 7 nights vary less than single nights, so its z-score is compressed toward zero (a +0.10 ln single-night rise gives z = 0.29 instead of 2). That is deliberate: readiness should move with a sustained shift, not one noisy night. A sustained 7-night shift of +0.10 ln gives the full z = 2.

Bands: green ≥ 67, yellow 34–66, red < 34. Needs HRV or resting HR plus one more signal. The factor 1.3 widens the spread because an average of several z-scores is less variable than any one. **This is not Garmin's Training Readiness or Body Battery**; those are shown separately when present in your export.

## Training load
- **TRIMP** (Banister): per minute `x · a · e^(b·x)`, `x = (HR − rest)/(max − rest)`; male `a = 0.64, b = 1.92`, female `a = 0.86, b = 1.67` (Banister 1991). The same coefficients are used for per-sample load and for the one-hour-at-threshold normaliser, so hrTSS at LTHR is 100 for either sex.
- **hrTSS** = 100 × TRIMP / TRIMP(one hour at lactate-threshold HR). So an hour at threshold = 100.
- Heart-rate source, best first: second-by-second FIT data (stored as a seconds-per-bpm histogram, so load can be recomputed if you change max HR) → Garmin's time-in-zone summary (zone mid-points) → average HR only (**underestimates intervals; flagged in the UI**) → no HR = no load invented.
- **Max HR** is *estimated* from your activities (≈ 99th percentile of time-weighted heart rate, so brief sensor spikes barely count; falls back to the 95th percentile of per-activity maxima, then to a flagged placeholder of 185). The app asks you to confirm it. TRIMP/hrTSS are approximate.
- **Zones**: % of max HR: 50–60, 60–70, 70–80, 80–90, 90–100.
- **Fitness / fatigue / form** (Banister impulse–response, as popularised by TrainingPeaks): `CTL += (load − CTL)(1 − e^(−1/42))`, `ATL` with τ = 7; **TSB = CTL − ATL** (the "form" you start the day with = previous day's values). Seeded with your first-28-day mean load, so the first weeks are warm-up.
- **Load ratio (rolling 7 d ÷ 28 d)**: needs 28 days and chronic ≥ 5. One shared threshold, **1.3**, is used both for the recovery-score penalty (load component −1) and for the advice text. Above 1.3 the UI says "load jumped quickly – associated with fatigue"; below 0.8 "low". It does **not** claim to predict injury (the evidence for any single cut-off is weak).
- **Monotony** (Foster) = 7-day mean ÷ SD of daily load; **strain** = weekly load × monotony.

## Sleep
- Times are *local clock times* using the time zone stored with each night, shown as minutes after 18:00 so midnight doesn't wrap.
- **Regularity**: SD of bedtime / wake / mid-sleep over 14 nights (≥ 7 nights).
- **Social jet lag** (Roenneberg's MCTQ): `MSF − MSW`, mid-sleep on free days (nights ending on Sat/Sun by default) minus work days; needs ≥ 8 work and ≥ 3 free nights in 8 weeks. The sleep-corrected version `MSFsc = MSF − ½(SDf − SDweek)` applies when you sleep longer on free days, `SDweek = (5·SDw + 2·SDf)/7`. Assumes weekday alarms; the app can't tell.
- **Sleep debt**: Σ over the last 7 nights of (need − slept), floored at 0, shown when ≥ 60 % of nights exist. It does not model "repayment".

## Body-strain ("illness-like") signature
**Wording shown to you:** one flagged night = "worth watching"; ≥ 2 consecutive flagged days = "strain pattern". Always with "not a diagnosis; seek care for fever, chest pain, shortness of breath or fainting". Internally a day is graded **strong** when resting HR is ≥ 1.5σ **and** ≥ 3 bpm above baseline, ln HRV is ≥ 1.5σ **and** ≥ 15 % below, **and** breathing rate (≥ 1.5σ, ≥ 0.8 brpm) or skin temperature (≥ 1.5σ, ≥ 0.5 °C) is up; **possible** with just RHR + HRV (or three signals). Consecutive flagged days merge into an episode. The same pattern follows alcohol, hard training, travel and poor sleep, so episodes next to your own event tags are labelled as possibly explained. It is a screening hint, never a diagnosis.

## Activity analytics
- **Aerobic decoupling (Pa:HR)**: after a 10-minute warm-up, split into halves; efficiency = mean speed ÷ mean HR; `decoupling = (EF₁ − EF₂)/EF₁`. Shown only for ≥ 40-minute activities and labelled "not meaningful" when speed varies a lot within halves (CV > 0.18: intervals, hills, stops). Rules of thumb quoted (< 5 % / 5–10 % / > 10 %) are coaching heuristics, not standards.
- **Cardiac drift**: HR slope after warm-up in bpm per 10 minutes, same steadiness caveat.
- **Best efforts**: fastest continuous segment of 1 km / 1 mile / 5 km / 10 km / half marathon, from the 5-second series.

## Correlations and "what affects what"
- Spearman (default) or Pearson on paired days, with a lag (Y *k* days after X).
- p-values and 95 % CIs use Fisher's z with an **effective sample size** reduced for autocorrelation, `n_eff = n(1 − ρxρy)/(1 + ρxρy)` (Bayley–Hammersley), because daily physiology is strongly autocorrelated and naive p-values are too optimistic.
- The explorer can analyse **deviations from your own 28-day median** to remove slow trends (fitness gain, season) that cause spurious correlations.
- Scans over many pairs/lags report **Benjamini–Hochberg q-values**; a finding is "significant" at q < 0.05 and |ρ| ≥ 0.2. Same-night sleep metrics are never paired with each other (they measure one thing).
- Event hypotheses (late workouts, alcohol/caffeine tags, hard days, high-stress days, short nights) compare the day(s) after flagged days with all other days: Welch t (normal approximation), Cohen's d, BH-corrected q. "Supported" = q < 0.05, |d| ≥ 0.5 and ≥ 8 examples; "possible" = p < 0.1 and |d| ≥ 0.4; < 5 examples = "too few".
- **Correlation is not causation** is displayed on every result. Sample-size warnings appear below 30 pairs (hint) and 14 (too few).

## Reports and goals
Weekly (Mon–Sun) and calendar-month reports compare each metric's mean with the previous period of the same length and highlight changes ≥ 0.5 SD of your 90-day baseline. Goals evaluate daily goals over the last 30 days and weekly goals over 12 weeks; the current incomplete week is never counted as a miss.


## Timing: sleep and HRV are dated by wake-up day
Garmin assigns a night's sleep, overnight HRV and resting HR to the day you **wake up**. So the HRV for date *D* was measured the night **before** *D*'s workout. In the explorer, lag 0 for activity → overnight pairs is labelled a **baseline check**; recovery after a hard day shows up at **+1 day**.

## Other caveats (also shown in the app)
- Wrist-based sleep stages (deep/REM especially) are only roughly accurate.
- Stress is scored against your own baseline, not a fixed scale.
- With several comparisons, one may look significant by chance; q-values reduce but do not remove this.
- The importer has not been tested against a real Garmin export.

## Anomaly baseline hygiene (v1.1.0)
Each day is scored against the median/MAD of the previous 28 days **excluding days that were already flagged** (sequentially). Without this, an illness longer than about half the window drags the median up and the flag switches off while you are still unwell. If fewer than 10 clean days remain the look-back is widened to 84 days; if still fewer, nothing is flagged. Test: 10- and 20-day episodes flag every day; the plain trailing median would have stopped by day 15.

## Menstrual cycle (v1.1.0)
Skin temperature, resting HR and HRV all shift in the luteal phase. Add a **cycle** event (optionally with an "until" date) in Data → Events. Days inside a cycle event are shown as a possible explanation on flags and episodes, and cycle events are never tested as a "cause" in Insights. When sex is set to female in Settings, every strain-pattern message adds that the luteal phase can look like this.

## Sustained change (v1.1.1)
Excluding flagged days from the baseline would flag a *permanent* new level (post-illness, new medication, a big fitness change, altitude) forever. So: the first **14** consecutive flagged days stay out of the baseline (a 10- or 13-day illness behaves exactly as before). From the 15th flagged day on, flagged days are let into the baseline. The message at 14 consecutive days changes from "strain pattern" to **"Sustained change for 2 weeks. If this isn't explained by something you know about, it's worth discussing with a clinician."** and the episode is labelled "sustained change". As the new level fills the 28-day window the median and spread move to it and the flag clears (in the synthetic 30-day shift test it clears on day 22, i.e. about a week after the wording changes). A one-day gap in flags restarts the 14-day count, but unflagged days always enter the baseline, so a noisy permanent shift also settles.

## HRV sources and resolution (v1.2.0)
Nightly HRV is taken from, in order: `healthStatusData` (HRV metric), then `avgOvernightHrv` in `sleepData`. Both are the same kind of number (Garmin's overnight average, an RMSSD-type value in ms) and are treated as nightly. If there are fewer than 10 nightly values but at least 10 days with a weekly average (`hrvWeeklyAverage` in `TrainingReadiness`), **weekly mode** is used: the series is that weekly number repeated for each day. The natural log is applied to whatever series is used, but in weekly mode (a) the recovery HRV component is labelled lower resolution and has half weight (0.20 instead of 0.40, before re-normalisation), (b) the 7-night averaging is skipped (it would only average a step function), and (c) HRV is excluded from the strain flags, because a weekly step cannot show a one-night drop. With no HRV in any of the three places the app says so explicitly ("No HRV found in this export") and HRV charts/flags are empty. `avgOvernightHrv` and `hrvWeeklyAverage` are unverified field names (public API shapes and parser code, no real export seen).

## Import hygiene (v1.2.0)
- Several records for one date: cumulative counters (steps, distance, calories, intensity minutes, floors, Body Battery charged/drained, stress durations) keep the **larger** value; a later **zero** never overwrites an earlier real value; other fields take the later value.
- Shapes: `activityType` string or `{typeKey}` (falls back to `sportType`, then "other"); dates as strings, `{date}`, or `{year, month, day}`; sleep wrapped in `dailySleepDTO` (with `avgOvernightHrv` outside it).
- Unit sanity: sleep stages longer than 24 h "in seconds" are treated as milliseconds. Values outside plausible ranges (e.g. resting HR outside 25–130, steps over 100 000, SpO2 below 50 %, HRV outside 5–300 ms, activity duration over 7 days) are dropped with a warning rather than charted.
- Privacy: JSON in folders named account, customer-service, user, social, payment, content, device or golf is never parsed (`userBiometrics.json` excepted).
- Progress is reported as entries read of entries known (a ZIP adds its entry count when opened), then 100 % while saving – no more bar stuck at 95 %.

## Service-worker versioning (v1.2.0)
`tools/stamp.js` stores a SHA-256 of every precached file plus the cache list in `tools/cache-fingerprint.json`. `tests/shell.test.js` recomputes it: if any precached file changed and `sw.js` `VERSION` did not, the test fails with "bump VERSION"; if VERSION changed but the stamp was not refreshed, it asks you to run `node tools/stamp.js`.
