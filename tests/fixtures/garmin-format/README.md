# Garmin export format fixtures

These mirror the *documented* shapes of Garmin "Export Your Data" files. **They are not real data from anyone's account.**

| File | Provenance |
|---|---|
| `UDSFile_2022-03-15_2022-03-16.json` | Day 1 is the real record pasted in a public forum post (intervals.icu forum, "Resting heart rate misreported", Dec 2022), values kept; `userProfilePK` blanks filled with 0 and the `respiration` object (cut off in the post) is *reconstructed* (unverified shape). Day 2 is invented, and uses the newer ISO-string `calendarDate`. |
| `2019-06-29_2019-10-07_123456789_sleepData.json` | The two records are the real ones shown in `tintin305/GarminSleepAnalytics` README (one confirmed, one UNCONFIRMED). The third is invented to include `sleepScores` etc. (key names from public parsers). |
| `2026-01-01_2026-01-31_123456789_healthStatusData.json` | **Invented** from the schema used by the `radikkhaziev/triathlon-agent` parser (`metrics[] {type,value,baselineLowerLimit,baselineUpperLimit,status}`). Shape verified by one source only. |
| `x_0_summarizedActivities.json` | Run 1 invented; run 2 follows the real record pasted in garmin-grafana issue #189 / PR #191 (units: ms, cm; floats like `1.768573620E+12`). |
| `TrainingReadinessDTO_*.json`, `MetricsAcuteTrainingLoad_*.json`, `ActivityVo2Max_*.json`, `*_userBioMetrics.json` | **Invented** from field names in the `triathlon-agent` parser. |
| `sample.tcx`, `sample.gpx` | Hand-written, standard Garmin TrainingCenterDatabase v2 / GPX 1.1 + Garmin TrackPointExtension v1. |
| `activities.csv` | Hand-written; headers follow the Garmin Connect "Export CSV" list as described on Garmin's forum (unverified). |
| `../real-fit/*` | **Real** FIT files from MIT-licensed `dtcooper/python-fitparse` tests (Garmin Fenix 5, Edge 500, FR70, vivofit monitoring). |
