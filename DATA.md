# Data inventory

What SkyDeck stores, where, for how long, and how to delete it. This is the working note behind the public privacy page (`/privacy`, text in `src/lib/legal-content.ts`, Phase 16e). Keep the two in step with the code and with each other.

## In the visitor's browser only (never sent to us)

Saved with localStorage under these keys (the list is `STORAGE_KEYS` in `src/lib/local-settings.ts`): units, map style, last map position, layer choices, saved views, recent searches, feature flags, battery saver, smooth motion, shortcuts and whether the quick guide was seen. They stay until the visitor clears them: Settings, "Delete my saved data" removes them, and "Download my data (JSON)" exports them.

## Alert rules (this browser only)

The rules a visitor creates (conditions, a name, areas as a centre and radius) are kept in this browser's localStorage under `skydeck:alert-rules`. They are not sent anywhere or saved to an account. Settings, Delete my saved data removes them.

## Tracked flight stages (this browser only)

The last stage changes of watched flights (flight number, stage, time; at most a few per flight) are kept in this browser's localStorage under `skydeck:flight-stages`. They are not sent anywhere or saved to an account. Settings, Delete my saved data removes them. Looking up a watched flight's route sends only its flight number to our server, as for the aircraft panel.

## Theme (this browser only)

The page theme choice (dark, light or system) is kept in this browser's localStorage under `skydeck:theme`. It is not sent anywhere or saved to an account. Settings, Delete my saved data removes it.

## Collection (this browser only)

The aircraft types and registrations a visitor opens on the map (code, first time, times opened), achievements unlocked, and today's challenge progress are kept in this browser's localStorage under `skydeck:collection`, at most 600 types and 3,000 registrations. They are not sent anywhere or saved to an account. The Collection dialog's Clear collection and Settings, Delete my saved data remove them.

## Service worker (this browser only)

In the built app a small service worker (`/sw.js`) keeps copies of the app's own files (scripts, styles, fonts, icons) and an offline page in the browser's cache storage, so the app starts faster. It never stores aircraft, weather, airport, sign-in or other data requests. Clearing the site's data in the browser removes it.

## With an account (Supabase, only if the visitor creates one)

| Data                                                                                                | Where                                                               | Why                                     | Deleted                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| Email address and password hash                                                                     | Supabase Auth (`auth.users`)                                        | to sign in                              | Account dialog, "Delete my account" removes it at once            |
| Profile row (optional display name, created date)                                                   | `public.profiles`                                                   | future saved data                       | removed together with the account (cascade)                       |
| Watchlist (kind, flight number, airframe code or airport code, a label, date added; at most 50)     | `public.watchlist_items`                                            | alerts and quick access on every device | the entry when the visitor removes it; all of it with the account |
| Recently viewed flights (airframe code, flight number, registration, type, last viewed; at most 15) | `public.recent_flights`                                             | quick access on every device            | "Clear" in the Watchlist dialog; all of it with the account       |
| Session token                                                                                       | the visitor's browser (localStorage, key `sb-<project>-auth-token`) | stay signed in                          | removed on sign-out or account deletion                           |

Nothing else about an account is stored yet. The same two lists are also kept in this browser's localStorage whether or not there is an account (keys `skydeck:watchlist` and `skydeck:recent-flights`); signing out keeps them there, and Settings, Delete my saved data removes them. Passwords are never visible to SkyDeck: Supabase stores a hash.

## In the page's memory only (never stored or sent)

- **Session replay (Phase 9a):** the positions, flight numbers, registrations, types and squawk codes of the aircraft the page received over about the last 30 minutes, up to 150,000 position reports. It lives in the page's memory, is never written to disk or sent anywhere, and disappears when the page is closed or reloaded.

## On the server

- Aircraft, weather and airport answers are cached in memory of the running server for seconds to hours and are not written to disk.
- Browser error reports are written as one line each to the hosting platform's log (`[client-error]`): message, stack, page path and a boundary name. No address, account or flight data is added by the app.
- The visitor's network address is used only as an in-memory key for rate limiting and is not logged or stored by the app (the hosting platform and Supabase keep their own request logs under their own terms).

## Sent to third parties

- Map tiles and imagery are requested by the browser from OpenFreeMap, Esri and AWS (so those providers see the visitor's address and the area viewed).
- Radar tiles and the radar index are requested by the browser from RainViewer; ACARS messages from Airframes, on demand.
- Aircraft, weather, airport and route data are requested by our server, not the browser.
- The status page (`/status`) makes our server ask adsb.lol, airplanes.live, the Aviation Weather Center, the FAA and Supabase whether they answer, at most once a minute for all visitors together. No visitor data is sent.
- Feedback goes to the project's public GitHub issues page, under GitHub's terms; nothing is sent from the app itself.
- AI providers (Gemini, Cloudflare Workers AI) receive only what a feature sends them. No feature sends anything yet.

## Not done yet

- A public privacy page and a data-export file for account data (the local export covers browser data only).
- Retention rules for data that later features will store (watchlists, wait reports); each must be added here before it ships.
