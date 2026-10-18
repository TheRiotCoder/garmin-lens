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
| Overnight ln HRV vs 28-day normal | +z | 40 % |
| Resting HR vs 28-day normal | −z (lower is better) | 20 % |
| Sleep duration vs your need | (hours − need)/1 h | 25 % |
| Prior-day stress vs normal | −z | 7.5 % |
| Training form (TSB at start of day) | TSB/20, clamped ±2.5 | 7.5 % |

Bands: green ≥ 67, yellow 34–66, red < 34. Needs HRV or resting HR plus one more signal. The factor 1.3 widens the spread because an average of several z-scores is less variable than any one. **This is not Garmin's Training Readiness or Body Battery**; those are shown separately when present in your export.

## Training load
- **TRIMP** (Banister): per minute `x · 0.64 · e^(b·x)`, `x = (HR − rest)/(max − rest)`, `b = 1.92` (male) / `1.67` (female).
- **hrTSS** = 100 × TRIMP / TRIMP(one hour at lactate-threshold HR). So an hour at threshold = 100.
- Heart-rate source, best first: second-by-second FIT data (stored as a seconds-per-bpm histogram, so load can be recomputed if you change max HR) → Garmin's time-in-zone summary (zone mid-points) → average HR only (**underestimates intervals; flagged in the UI**) → no HR = no load invented.
- **Zones**: % of max HR: 50–60, 60–70, 70–80, 80–90, 90–100.
- **Fitness / fatigue / form** (Banister impulse–response, as popularised by TrainingPeaks): `CTL += (load − CTL)(1 − e^(−1/42))`, `ATL` with τ = 7; **TSB = CTL − ATL** (the "form" you start the day with = previous day's values). Seeded with your first-28-day mean load, so the first weeks are warm-up.
- **Load ratio (ACWR, rolling)**: 7-day mean ÷ 28-day mean; needs 28 days and chronic ≥ 5. Zones < 0.8 low, 0.8–1.3 "sweet spot", 1.3–1.5 caution, > 1.5 high. *Caveat in the UI: the evidence that one threshold predicts injury is weak.*
- **Monotony** (Foster) = 7-day mean ÷ SD of daily load; **strain** = weekly load × monotony.

## Sleep
- Times are *local clock times* using the time zone stored with each night, shown as minutes after 18:00 so midnight doesn't wrap.
- **Regularity**: SD of bedtime / wake / mid-sleep over 14 nights (≥ 7 nights).
- **Social jet lag** (Roenneberg's MCTQ): `MSF − MSW`, mid-sleep on free days (nights ending on Sat/Sun by default) minus work days; needs ≥ 8 work and ≥ 3 free nights in 8 weeks. The sleep-corrected version `MSFsc = MSF − ½(SDf − SDweek)` applies when you sleep longer on free days, `SDweek = (5·SDw + 2·SDf)/7`. Assumes weekday alarms; the app can't tell.
- **Sleep debt**: Σ over the last 7 nights of (need − slept), floored at 0, shown when ≥ 60 % of nights exist. It does not model "repayment".

## Body-strain ("illness-like") signature
A day is flagged **strong** when resting HR is ≥ 1.5σ **and** ≥ 3 bpm above baseline, ln HRV is ≥ 1.5σ **and** ≥ 15 % below, **and** breathing rate (≥ 1.5σ, ≥ 0.8 brpm) or skin temperature (≥ 1.5σ, ≥ 0.5 °C) is up; **possible** with just RHR + HRV (or three signals). Consecutive flagged days merge into an episode. The same pattern follows alcohol, hard training, travel and poor sleep, so episodes next to your own event tags are labelled as possibly explained. It is a screening hint, never a diagnosis.

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
