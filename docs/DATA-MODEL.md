# Data model

Everything is stored in IndexedDB (`garmin-lens`, `js/db.js`) on the device: stores `days`, `acts`, `series`, `notes`, `meta` (settings, goals). A memory fallback is used where IndexedDB is unavailable (private mode) and the Data page says so.

## Day (keyed by local `date`, `YYYY-MM-DD`)
Flat object, fields present only when the export had them: `steps`, `stepGoal`, `distanceM`, `kcalTotal`, `kcalActive`, `modMin`, `vigMin`, `floors`, `minHr`, `maxHr`, `rhr`, `stressAvg`, `stressMax`, `sleepStress`, `awakeStress`, `stress{Low,Med,High,Rest}Sec`, `bbHigh`, `bbLow`, `bbEnd`, `bbCharged`, `bbDrained`, `spo2Avg`, `spo2Low`, `respAvg`, `respLow`, `respHigh`, `tzOffsetMin`; sleep: `sleepStart`/`sleepEnd` (UTC ms), `sleepTzOffsetMin`, `sleepSec`, `deepSec`, `lightSec`, `remSec`, `awakeSec`, `sleepScore*`, `sleepResp*`, `awakeCount`, `restless`, `sleepSpo2*`; health status: `hrv`, `hrvLow`, `hrvHigh`, `hrvStatus`, `hsRhr`, `hsSpo2`, `skinTemp`, `hsResp`; Garmin's own: `readiness*`, `garminAcute`, `garminChronic`, `garminAcwr`, `vo2max`, `vo2maxCycling`, `maxMet`, `fitnessAge`; `weightKg`, `lthr`. Sentinel values (negative = "no data") are dropped at import. `demo: true` marks synthetic records; a real record always *replaces* a demo record of the same date.

## Activity
`id` (`g<garminId>` summary, `f<startSec>` FIT, `c…` CSV), `source` (`summary`, `fit`, `file`, `csv`, `summary+fit`, `demo`), `name`, `type`, `start` (UTC ms), `tzOffsetMin`, `date` (local), `durationSec`, `movingSec`, `distanceM`, `avgHr`, `maxHr`, `minHr`, `calories`, `ascentM`, `te`, `ante`, `avgPower`, `normPower`, `vo2max`, `garminLoad`, `zoneSec[5]`, `best{1km,1mi,5km,10km,21.1km}`, `hrHist[251]` + `hrStep` (seconds per bpm, for load/zones), `hasSeries`. The 5-second `series` (`hr`, `spd`, `alt`, `dist`, `pwr`, `cad`) lives in its own store and is loaded only on the activity page. A FIT/TCX/GPX file is linked to a summary when starts are within 120 s; CSV rows are dropped as duplicates when date + sport + duration (±15 %) match.

## Notes (events), goals, settings
`{id, date, type, label, demo?}`; goals `{key, op, target, period, agg, label}`; settings `{maxHr, restHr, lthr, sleepNeedH, sex, csvDistanceUnit, freeDays}` (empty = auto).

## Backup bundle
`{"format":"garmin-lens-bundle","version":1,"exportedAt",days,activities,annotations,goals,settings}`. Encrypted form: `{"format":"garmin-lens-encrypted-backup","v":1,"kdf":"PBKDF2-SHA256","iter":250000,"salt","iv","ct"}` (AES-256-GCM; tampering or a wrong passphrase fails authentication).
