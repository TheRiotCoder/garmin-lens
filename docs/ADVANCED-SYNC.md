# Optional: pulling data with an unofficial script (UNTESTED)

> **Status: idea only. Not part of the app, not tested by me, and possibly against Garmin's terms. Garmin can break or block it at any time.** The app never asks for your Garmin password and never contacts Garmin.

The sanctioned way to get your history is the account **Export Your Data** ZIP (see README). If you want fresher data between exports, community libraries log in as you and call the same endpoints the Garmin Connect app uses:

- `cyberjunky/python-garminconnect` (MIT) – <https://github.com/cyberjunky/python-garminconnect>. Release 0.3.0 replaced `garth` after Garmin changed its mobile auth flow in March 2026.
- `matin/garth` – deprecated by its author on 2026-03-27 (<https://github.com/matin/garth/discussions/222>).

A run-it-yourself script would: log in (handling MFA), loop over dates calling methods such as `get_stats(date)`, `get_sleep_data(date)`, `get_hrv_data(date)`, `get_rhr_day(date)`, then write one JSON file in a shape Garmin Lens understands (a `UDSFile_*.json`-style array of `{calendarDate, totalSteps, restingHeartRate, …}` objects is enough – name the file `UDSFile_custom.json` so the importer recognises it). I have **not** run any of this, so no code is shipped; check the library's README for current method names and the account-security advice (use an app-specific flow where offered, never paste your password into a website).

If you do try it: keep the output file private (it is your health data), import it like any other file, and tell me which field names it produced so the parser can be verified against real output.
