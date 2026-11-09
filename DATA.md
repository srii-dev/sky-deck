# Data inventory

What SkyDeck stores, where, for how long, and how to delete it. This is the working note behind the public privacy page (Phase 16e), which does not exist yet. Keep it in step with the code.

## In the visitor's browser only (never sent to us)

Saved with localStorage under these keys (the list is `STORAGE_KEYS` in `src/lib/local-settings.ts`): units, map style, last map position, layer choices, saved views, recent searches, feature flags, battery saver, smooth motion, shortcuts and whether the quick guide was seen. They stay until the visitor clears them: Settings, "Delete my saved data" removes them, and "Download my data (JSON)" exports them.

## With an account (Supabase, only if the visitor creates one)

| Data                                                                                                | Where                                                               | Why                                     | Deleted                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| Email address and password hash                                                                     | Supabase Auth (`auth.users`)                                        | to sign in                              | Account dialog, "Delete my account" removes it at once            |
| Profile row (optional display name, created date)                                                   | `public.profiles`                                                   | future saved data                       | removed together with the account (cascade)                       |
| Watchlist (kind, flight number, airframe code or airport code, a label, date added; at most 50)     | `public.watchlist_items`                                            | alerts and quick access on every device | the entry when the visitor removes it; all of it with the account |
| Recently viewed flights (airframe code, flight number, registration, type, last viewed; at most 15) | `public.recent_flights`                                             | quick access on every device            | "Clear" in the Watchlist dialog; all of it with the account       |
| Session token                                                                                       | the visitor's browser (localStorage, key `sb-<project>-auth-token`) | stay signed in                          | removed on sign-out or account deletion                           |

Nothing else about an account is stored yet. The same two lists are also kept in this browser's localStorage whether or not there is an account (keys `skydeck:watchlist` and `skydeck:recent-flights`); signing out keeps them there, and Settings, Delete my saved data removes them. Passwords are never visible to SkyDeck: Supabase stores a hash.

## On the server

- Aircraft, weather and airport answers are cached in memory of the running server for seconds to hours and are not written to disk.
- Browser error reports are written as one line each to the hosting platform's log (`[client-error]`): message, stack, page path and a boundary name. No address, account or flight data is added by the app.
- The visitor's network address is used only as an in-memory key for rate limiting and is not logged or stored by the app (the hosting platform and Supabase keep their own request logs under their own terms).

## Sent to third parties

- Map tiles and imagery are requested by the browser from OpenFreeMap, Esri and AWS (so those providers see the visitor's address and the area viewed).
- Radar tiles and the radar index are requested by the browser from RainViewer; ACARS messages from Airframes, on demand.
- Aircraft, weather, airport and route data are requested by our server, not the browser.
- AI providers (Gemini, Cloudflare Workers AI) receive only what a feature sends them. No feature sends anything yet.

## Not done yet

- A public privacy page and a data-export file for account data (the local export covers browser data only).
- Retention rules for data that later features will store (watchlists, wait reports); each must be added here before it ships.
