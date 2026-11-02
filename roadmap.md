# Roadmap

Implemented in code. Still needs a browser check:

- [ ] Multi-circle aircraft coverage (≤6 circles, dedupe, partial notice, back-off, refresh logs)
- [ ] Aircraft category icons (server-side kind, map icons, legend)

GitHub export and local IDE work are in place: `README.md` (setup, scripts, no env file because sources are keyless) and `LICENSE`. Baseline on this branch: tests and production build passed; lint fails on existing CRLF Prettier errors.

Phase 1, in order:

- [ ] Schedule the next refresh from when the previous one started, so successful updates land about every 7 s, and log that gap
- [ ] Shorten provider timeouts, cap each circle with an overall deadline, and give search the same back-off plus an airplanes.live fallback
- [ ] Show a calm backup-source notice when a fallback answered, separate from the hard "Data provider busy" failure
- [ ] Paint the base map and HUD first, and add 3D terrain and buildings only after the map is idle
- [ ] Add coverage tests (wide eastern North America, antimeridian, near a pole, 6-circle cap, stable keys) and verify wide coverage in the browser
