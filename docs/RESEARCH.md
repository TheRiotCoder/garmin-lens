# Research: how can a web app get Garmin watch data?

Researched 2026-10-17. "Verified" below means: confirmed on a Garmin page, or in at least one public repository that parses real exports.
Nothing here was verified against Derriel's own account — **no real Garmin data was available** while building Garmin Lens.

## Summary table

| Route | Works for an individual? | Needs server / login? | Verdict |
|---|---|---|---|
| (a) Garmin Connect Developer Program (Health API, Activity API) | **No.** Enterprise/business use only, approval needed, and reviews are currently paused | cloud-to-cloud OAuth, needs a backend | Not usable |
| (b) Garmin account **"Export Your Data"** (GDPR export, ZIP of JSON + FIT) | **Yes** | none. You download a ZIP, the app reads it on your device | **Chosen primary route** |
| (b2) Per-activity export from Garmin Connect web (FIT/TCX/GPX/CSV) and Activities-list CSV | Yes | none | Supported as a supplement |
| (c) Unofficial Garmin Connect API (garminconnect / garth, browser-cookie scrapers) | Technically, but fragile | needs a user-run script (Python), cannot run in a browser | Documented as optional/advanced, *not* built into the app |
| (d) Apple Health / Android Health Connect | Yes, but Garmin only writes a **subset** | export.xml / Health Connect needs a native app | Not built (limited value, see below) |

## (a) Garmin Health API / Activity API (Connect Developer Program)

- Garmin's own FAQ: the program "is available for **enterprise use**" and "is only for **business use**" (no fee, but business only). Apps are cloud-to-cloud with OAuth 2.0 and need a server. Source: <https://developer.garmin.com/gc-developer-program/program-faq/>, overview: <https://developer.garmin.com/gc-developer-program/overview/>.
- Application review: Garmin says it confirms status "within two business days" and integration takes 1–4 weeks (FAQ above). **But** developers on the Garmin forum report (messages dated Mar–Aug 2026) that Garmin is "temporarily paused the review and approval of new API access requests" with no timeline: <https://forums.garmin.com/developer/fit-sdk/f/discussion/435484/developer-onboarding-blocked>. (That is a forum report, not an official Garmin statement.)
- Consequence: a personal, no-server PWA cannot use it. Not an option for Derriel.

## (b) "Export Your Data" (account data export) — the primary route

- Where: Garmin account → Data Management / "Data & Privacy" → **Export Your Data → Request Data Export** (<https://www.garmin.com/en-US/account/datamanagement/>; Garmin's FAQ: <https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8>).
- Garmin emails a download link when it is ready. Third-party write-ups say this takes "anywhere from a few minutes to a day or two" (Runalyze blog) or "a few hours/days" (Kyoro-HealthHub docs). Garmin's page itself did not state a time in what I could fetch.
- Format: a ZIP with a UUID-named folder → `DI_CONNECT/` with sub-folders (structure confirmed by Runalyze's blog, several parser repos):

```
DI_CONNECT/
  DI-Connect-Aggregator/   UDSFile_<from>_<to>.json                    daily summaries (steps, HR, stress, body battery, respiration, SpO2 ...)
  DI-Connect-Wellness/     <from>_<to>_<profileId>_sleepData.json       sleep sessions (stages, scores, respiration, SpO2)
                           <from>_<to>_<profileId>_healthStatusData.json   "Health Status": overnight HRV, resting HR, SpO2, skin temp, respiration + baselines
                           <profileId>_userBioMetrics.json              weight / height / lactate threshold
                           *_AbnormalHrEvents.json, LifestyleLogging*.json, *_wellnessActivities.json (health snapshots), FitnessAgeData.json
  DI-Connect-Fitness/      <email>_<n>_summarizedActivities.json         one summary per activity
  DI-Connect-Uploaded-Files/ UploadedFiles_0-_PartN.zip                  ZIPs (nested!) of raw .fit files (activities AND all-day monitoring)
  DI-Connect-Metrics/      TrainingReadinessDTO_*.json, MetricsAcuteTrainingLoad_*.json, ActivityVo2Max_*.json,
                           EnduranceScore_*.json, MetricsMaxMetData_*.json, RunRacePredictions_*.json
```

### Field names (what Garmin Lens reads) and how they were verified

"V" = seen in a public repo that parses real exports (and, where available, a pasted real record). "U" = not verified, handled defensively.

| File | Fields used | Status / source |
|---|---|---|
| `UDSFile_*.json` | JSON **array** of days. `calendarDate` (older exports: `{"date":"Mar 15, 2022 12:00:00 AM"}`; newer: a `"YYYY-MM-DD"` string), `totalSteps`, `dailyStepGoal`, `totalDistanceMeters`, `totalKilocalories`, `activeKilocalories`, `bmrKilocalories`, `moderateIntensityMinutes`, `vigorousIntensityMinutes`, `floorsAscendedInMeters`, `minHeartRate`, `maxHeartRate`, `restingHeartRate`, `currentDayRestingHeartRate`, `wellnessStartTimeGmt/Local` (`{"date":...}`), `allDayStress.aggregatorList[]` with `type` TOTAL/AWAKE/ASLEEP and `averageStressLevel`, `maxStressLevel`, `highDuration/mediumDuration/lowDuration/restDuration`, `bodyBattery.chargedValue/drainedValue/bodyBatteryStatList[]` (`bodyBatteryStatType` HIGHEST/LOWEST/MOSTRECENT/ENDOFDAY, `statsValue`), `averageSpo2Value`, `lowestSpo2Value`, `latestSpo2Value`, `respiration` object, flat `avgWakingRespirationValue`, `highestRespirationValue`, `lowestRespirationValue` | V — a real pasted record from the intervals.icu forum (<https://forum.intervals.icu/t/resting-heart-rate-misreported/17500>), plus parsers `adam1brownell/garmin_data`, `radikkhaziev/triathlon-agent`, `arpanghosh8453/garmin-grafana`. The shape of the `respiration` sub-object and the two respiration spellings are only partly confirmed (the flat names come from adam1brownell's column list; the nested object was cut off in the forum post) → handled with fallbacks. |
| `*_sleepData.json` | array of sessions: `calendarDate` (string), `sleepStartTimestampGMT`, `sleepEndTimestampGMT` (`"2019-08-04T20:28:00.0"`, UTC without Z), `deepSleepSeconds`, `lightSleepSeconds`, `remSleepSeconds`, `awakeSleepSeconds`, `unmeasurableSeconds`, `sleepWindowConfirmationType`, `retro`, `averageRespiration`, `lowestRespiration`, `highestRespiration`, `awakeCount`, `avgSleepStress`, `restlessMomentCount`, `avgHeartRate`, `sleepScores{overallScore,qualityScore,durationScore,recoveryScore,deepScore,remScore,lightScore,restfulnessScore,feedback,insight}`, `spo2SleepSummary`/`spo2Summary` | V for the stage seconds + timestamps (README of `tintin305/GarminSleepAnalytics` shows real records), V for `sleepScores` keys (`adam1brownell`, `radikkhaziev`), U for SpO2 object names (two spellings seen in different repos) |
| `*_healthStatusData.json` | array of days: `calendarDate`, `metrics[]` each `{type, value, baselineLowerLimit, baselineUpperLimit, status}` with `type` ∈ `HRV`, `HR`, `SPO2`, `SKIN_TEMP_C`, `RESPIRATION` | V by one public parser (`radikkhaziev/triathlon-agent`) and Runalyze's blog (file is "HRV"/"Health Status"). **Only one independent source; no real record seen.** HRV unit: Garmin's overnight HRV is an RMSSD-type ms value (Garmin Developer docs of the HRV summary: `LastNightAvg`, `LastNight5MinHigh`, <https://support.mydatahelps.org/garmin-heart-rate-variability-summary-export-format>) |
| `*_summarizedActivities.json` | `[ { "summarizedActivitiesExport": [ {activity}, ... ] } ]`; activity: `activityId`, `name`, `activityType` (string like `running`, `strength_training`), `sportType`, `startTimeGmt` / `startTimeLocal` (**ms since epoch, as floats like `1.764139178E+12`**), `duration` / `elapsedDuration` / `movingDuration` (**milliseconds**), `distance` (**centimetres**), `elevationGain` (cm), `avgHr`, `maxHr`, `minHr`, `calories`, `steps`, `aerobicTrainingEffect`, `anaerobicTrainingEffect`, `avgSpeed`, `maxSpeed`, `summarizedExerciseSets[]`, `hrTimeInZone_1..5` | V — real records pasted in <https://github.com/arpanghosh8453/garmin-grafana/pull/191> and issue #189; units from `pablovilas/pacecraft` and `andreugordillovazquez/health-dashboard` (distance cm, duration ms). `hrTimeInZone_N` and the training-load field names are **U** (seen only as a truncated key name). `avgSpeed` unit is unclear, so Garmin Lens recomputes speed from distance/duration. |
| `TrainingReadinessDTO_*.json` | `calendarDate`, `timestamp`, `score`, `level`, `feedbackShort`, `sleepScore`, `recoveryTime`, `acuteLoad`, `hrvWeeklyAverage`, `hrvFactorPercent`, `sleepScoreFactorPercent`, `recoveryTimeFactorPercent`, `acwrFactorPercent`, `stressHistoryFactorPercent`, `sleepHistoryFactorPercent` | V (`radikkhaziev`; API-shaped example in garmin-grafana issue #16) |
| `MetricsAcuteTrainingLoad_*.json` | `calendarDate` (ms epoch), `dailyTrainingLoadAcute`, `dailyTrainingLoadChronic`, `dailyAcuteChronicWorkloadRatio`, `acwrStatus` | V (`radikkhaziev`) — one source |
| `ActivityVo2Max_*.json` | `calendarDate`, `sport` (RUNNING/CYCLING), `vo2MaxValue` | V (`radikkhaziev`) — one source |
| `MetricsMaxMetData_*.json` | `calendarDate`, `maxMet`, `fitnessAge`, `vo2MaxValue` | V for `maxMet`/`fitnessAge` (one source). `vo2MaxValue` here: U |
| `*_userBioMetrics.json` | `metaData.calendarDate`, `weight.weight` (grams), `height`, `lactateThreshold{heartRate,speed}` | V (`radikkhaziev`) |
| FIT files | standard FIT SDK messages (`record`, `session`, `lap`, `hrv`...) | V — parser verified against **real Garmin FIT files** in `dtcooper/python-fitparse` (see tests) |

Other facts that matter:
- Garmin's own Connect API exposes health history only ~2 years back and activities ~5 years (Runalyze blog), the export has everything. The export also contains items the Connect web UI never shows (resting-HR timestamp, sleep stress, ...), per a Garmin forum post (<https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/271967/>).
- Overnight HRV samples are not in a tidy JSON: HRV lives in `healthStatusData.json` (nightly value) and in `_HRV_STATUS.fit` files buried in `UploadedFiles_*.zip` (Garmin forum: <https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/423807/>).
- **Wrist watches give no beat-to-beat data**, so no DFA-α1/real HRV analysis from the export beyond Garmin's nightly summary.
- The export is big (hundreds of MB to GB for years of data; the FIT ZIPs are nested). Garmin Lens reads zip entries lazily and never loads the whole archive into memory.

### Per-activity export from Garmin Connect (web)
- An activity page → gear icon → **Export Original** (the original `.fit`, often zipped) / **Export to TCX** / **Export to GPX**; **Export to CSV** gives a lap/split table. The Activities list also has an **Export CSV** button which exports only what is currently loaded (scroll to the end first); its columns vary with the activity types/filters (Garmin forum: <https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/390753/>). The menu wording could not be re-checked without an account — treat the exact labels as approximate.
- Garmin Lens reads all four: FIT (full parser), TCX, GPX (heart-rate extension `gpxtpx:hr`), and the Activities-list CSV (header names are matched loosely, English headers only).

## (c) Unofficial Garmin Connect API (garminconnect / garth / scrapers)

- Libraries: `cyberjunky/python-garminconnect` (MIT) and `matin/garth`. They log in with your username/password (+ MFA) against Garmin's private mobile SSO and call the same JSON endpoints the Connect app uses (sleep, HRV, training readiness, body battery...).
- **Fragile**: on 2026-03-27 the garth author deprecated it because "Garmin recently changed their auth flow, breaking the mobile auth approach" (<https://github.com/matin/garth/discussions/222>). Users report HTTP 429 from Cloudflare in front of Garmin SSO; community workarounds (browser User-Agent, TLS impersonation with `curl_cffi`, headless browsers) work some of the time. `python-garminconnect` 0.3.0+ replaced garth with its own auth + TLS impersonation + MFA (<https://github.com/cyberjunky/python-garminconnect/releases/tag/0.3.0>) — I did not run it.
- **Not usable from a browser**: no CORS on Garmin's endpoints, needs your password, and TLS-fingerprint blocking. It would need a server or a script on your computer.
- **Terms of service**: this is not a sanctioned access path; I did **not** check Garmin's current Terms of Use text, so I can't say whether it is prohibited — assume it is a grey area and that Garmin can break or block it at any time. Garmin Lens therefore never asks for your Garmin credentials.
- `docs/ADVANCED-SYNC.md` documents an *optional*, **untested** user-run script idea that writes a Garmin Lens JSON bundle you then import.

## (d) Apple Health / Android Health Connect

- Garmin Connect → Apple Health writes: active/resting energy, body fat, BMI, flights climbed, heart rate, sleep analysis, steps, walking/running distance, water, weight, workouts. It does **not** write HRV, resting HR, SpO2, respiratory rate, skin temperature, body battery, stress or GPS tracks (Garmin Russia support article; see also <https://support.garmin.ru/support/solutions/articles/26000046832>).
- Android Health Connect gets steps, distance, calories, workouts, heart rate, sleep stages, weight, body fat, floors; **not** HRV, resting HR, SpO2, respiration, body battery, stress, training load (Android Central: <https://www.androidcentral.com/wearables/garmin/heres-everything-garmin-will-and-wont-share-with-google-health-connect>).
- Apple Health's `export.xml` can be exported from the Health app, but it would be a *poorer* source than Garmin's own export for exactly the metrics that matter here (HRV, resting HR, stress, body battery). Health Connect has no file export a web app can read and needs a native app. **Not built.** (Next-step idea: import Apple Health `export.xml` for people whose watch isn't a Garmin.)

## Decision

1. **Primary**: local-first PWA that imports the Garmin "Export Your Data" ZIP (and individual JSON/CSV/FIT/TCX/GPX files). Parsing and storage happen on the device (IndexedDB). No server, no account, no network calls (CSP `connect-src 'self'`).
2. **Optional/advanced** (documented, untested): a user-run script using `python-garminconnect` to write a Garmin Lens bundle.
3. Because it is a snapshot, the user re-exports from time to time (the importer merges by date and never duplicates).
