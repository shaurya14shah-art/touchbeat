# Touchbeat

A browser football rhythm trainer. A webcam tracks your body and ball, touches are timed against a synthesised beat, and one posture fix is shown at a time. Camera video stays on the device.

## Run locally
Serve `web/` over http (camera access needs localhost or https):

    python3 -m http.server 5173 --directory web

## Layout
- `web/js/engine.js`: ball tracking, touch detection, scoring and form coach. No browser APIs, so the tools below test the exact shipped logic.
- `tools/extract.py`: pose and ball tracks from a video. Footage lives outside this repo in `../touchbeat-footage`.
- `tools/build_reference.mjs`: learns form limits and ghost motion, writes `web/data/reference.json`.
- `tools/eval.mjs`: scores touch detection against `data/labels.json`, writes `web/data/accuracy.json`.
- `tools/e2e.mjs`: runs the full game headlessly with a video file as the camera.
- `supabase/schema.sql`: leaderboard table. Put the project URL and anon key in `web/js/config.js` to enable it.

Dev-only URL parameters: `bpm` overrides tempo, `hold=0` skips the stand-still check.
