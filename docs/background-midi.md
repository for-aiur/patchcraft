# Switching to your instrument

Visual Lab and the camera MIDI page continue processing when focus moves to a DAW or plugin. Capture uses a bounded worker heartbeat instead of relying on animation rendering. Visibility alone does not stop MIDI.

If the same source temporarily stops delivering frames, no stale controls are sent. Visual Lab shows **Waiting for frames** and resumes on fresh frames while output remains enabled. Stop, source replacement, recipe loading and MIDI disconnection cancel sending; reconnecting a port never authorizes output automatically. Closing the page stops capture.

Browsers and operating systems can still freeze/discard tabs or suspend media, especially when minimized, sleeping or under memory pressure. This implementation does not guarantee background operation under those conditions. Keep the browser running and exclude the performance tab from browser energy/memory saving where available. No silent audio workaround is used.

## Hardware acceptance

On the target Windows/browser/virtual MIDI/Vital or Ableton setup, run a camera recipe, assign its CC, then switch repeatedly between browser and instrument for ten minutes. Separately test another browser tab, minimizing, video pause/resume, camera removal and MIDI disconnection. Record software versions and whether messages continue, pause or require explicit restart. Focus changes must not require a camera restart. Synthetic visibility tests and mocked MIDI are regression checks, not proof of background scheduling on every OS or physical latency.
