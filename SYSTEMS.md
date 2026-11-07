# Mall Bats Systems

The simulation is a bag of functions that mutate one `GameState`. `src/game` never touches the DOM. The HUD calls those functions and then `refresh()`. `src/main.tsx` is the only place that turns a tick into pixels and sound.

Read this before changing rules. `VOICE.md` still owns copy.

## One tick

`tick(s, minutes)` chops time into steps of at most half a minute. It stops while a modal is open or the run is over. When it finishes, it copies `rand.state` onto `s.rng`.

Each step, in order:

1. Advance `s.time`.
2. On a phase change, `onPhase` (PA at open, send the crew home at closing, mark the night worked).
3. On a new mall-day, `newDay`.
4. On a new hour, `onHour` (mood, inspection roll, meals at 8:00 and 20:00, the scripted calendar, Monday's power bill at 8:00).
5. On a new minute, `perMinute` (noise, smell, complaints, power stolen, eBay, staff, shoppers while the mall is open).
6. Move NPCs, then each Bat (`updateCrew`, then heat cools), then detection.
7. Start inspections whose time has come, drop finished ones, then check eviction, an empty crew, and the auction deadline.

A mall-day turns at 6:00 AM, not midnight. The day key is `dayOf(s.time - 360)`. That is when suspicion decays, a worked night with nobody spotted counts toward the clean streak, food spoils, pools refill, Gary's affinity slips, store strain fades, rent comes out, the morning report sums yesterday's `tally`, visitors at the ladder give up, and `planDay` draws the day's random event into `agenda`. `lastDay` stores that key. Set it if you jump the clock, or the day fires again.

Phases come from `phaseAt`: night, morning (from 6:00 until open), open, closing (90 minutes after close). Sunday hours differ. A few calendar days are closed or short. Jobs only run during `open` (day job) and `night` (night job). Morning and closing count as rest.

## Dirty derived state

`getDerived(s)` rebuilds the maps the sim reads: what occupies a tile, which objects have power, beds, nooks, insulation, smell fans, signs. The rebuild also writes `powered`, `supplyLoad`, and `tapRoom` back onto the objects.

It caches until `markDirty()`. Call `markDirty()` after changing the deck, the object list, or whether a room is vacant or a pop-up. Forgetting it serves pathing, power, and placement a stale map. The cache is one slot for one `GameState` object. A different object forces a rebuild. The same object, mutated and not marked dirty, does not.

`crewDanger` and `floorAvoid` are module buffers, recomputed when the sim asks. They are not on `GameState`.

## What a save keeps

`saveGame` JSON-stringifies `GameState` into `localStorage`. `loadGame` rejects a different `SAVE_VERSION`, turns a null `awayUntil` back into `Infinity` (`JSON` drops infinities), restores `rand.state` from `s.rng`, and marks derived state dirty.

These are not in the save, and they do not survive a reload:

- The UI in `app` (selection, camera, pause, open panels).
- `rand`, except the integer copied to `s.rng` at the end of a tick.
- `sfxQueue`, `noticeQueue`, `levelUpQueue`, `achievementQueue`. The sim pushes them. `main.tsx` drains them. A headless caller should clear them or they grow forever.
- `noiseField`.
- The derived cache.
- Two `WeakMap`s on crew, in `crew.ts`: the thought to resume after hiding, and the last time a Bat ducked. The thought string on the crew object itself is saved. Duck memory is not.
- `zoneState`, the game `escapeGoals` reads while a Bat is fleeing.

`flags` is an open `Record<string, number>`. Modal buttons are strings (`bail:<crewId>:<cash>`, `hijinx:<key>:<index>:<crewId>`), split in `resolveModal`. A typo fails only when the button is clicked.

## Crew

`updateCrew` is one function and the first thing it matches wins. An early return skips everything below it. Order:

1. `away` — wait out `awayUntil` (bail, or `Infinity` until the modal resolves), then appear at the hatch.
2. Energy. Sleeping restores it. Anything else drains it, faster while `toWork` or `working`, and faster still after a missed meal.
3. `fleeing` — run for the ceiling. Climbing up counts as escaped.
4. On the ceiling inside an active inspection, and not already `evacuating` or `toHome` — path out. That sets `evacuating`.
5. On the mall floor, not mid-climb, once `detect` passes 0.22. A watcher within 4.5 tiles and `detect` at or under 0.75 is a duck. `detect` above 0.75, or a close watcher they fail to duck, sends them home. Otherwise they hold still. A duck already in progress skips this until `detect` passes 0.75.
6. Travel states move along `path`: `toWork`, `toHome`, `toBed`, `toLeisure`, `toErrand`, `evacuating`, `ducking`. On the way they wait for a guard, a camera, or someone under the next ceiling tile. Arriving switches to the matching activity.
7. Activity states spend `timer` or `workTimer`: `working`, `errand`, `eating`, `sleeping`, `leisure`, `idle`. `idle` calls `decide`, which picks the next state.

`working` runs the job in `activeJob` for `workTimer` minutes, then `doCycle`. If the assigned job changed, or the cycle says stop, `decide` runs again.

`jobBlocked` is the reason a job cannot be assigned. `jobUnavailable` adds exhaustion, "lying low" and cooldowns on top of it. `planJob` returns the shift's job, or rest when it's unavailable. A Bat whose `calledOff` matches `shiftKey(s)` rests until the shift changes. The HUD and the bot both call these. Change the text and update both.

Jobs with `home` run beside one of those objects in the ceiling. They skip "lying low", and a day job at home cools Heat as fast as Rest. Jobs with a `spot` take at most `MAX_PER_SPOT` Bats.

States: `idle`, `toWork`, `working`, `toHome`, `sleeping`, `eating`, `leisure`, `toLeisure`, `toBed`, `fleeing`, `evacuating`, `ducking`, `toErrand`, `errand`, `away`.
