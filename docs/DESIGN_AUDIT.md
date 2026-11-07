# Mall Bats: Design Audit

Audit of the working tree on Nov 7, 2026, **including the uncommitted rebalance** (fill-in removed, several Suspicion sources removed, scrutiny limits removed). Where a finding comes from that WIP, it's marked **[WIP]**.

Evidence comes from reading every file in `src/game`, `src/ui`, and the parts of `src/render` and `src/input.ts` that carry rules, plus balance bot runs on the working tree and on `HEAD`.

---

## TL;DR

1. **Several systems are shown to the player but do nothing.** The Scrutiny meter, "Excuses wearing thin", the Police Scanner's "they look less closely", the Lockdown ceiling sweep, and the "get predictable" Heat rule from the Help screen.
2. **The night has no teeth.** Being spotted costs a single Bat +15 Heat and nothing else. A guard's grab only becomes an arrest at 100 Heat. Across six bot runs on the working tree: **0 arrests and 89/89 "clean nights", despite 6–15 spottings per run.** This was a deliberate fix for a real problem: penalties grew with crew size and the player had no way to prevent them. Part 3 opens with how to restore the stakes without bringing that problem back.
3. **The $25 Decoy Raccoon cancels any routine inspection, every time.** The bot buys 11–31 of them per game. Only one inspection across all ten runs ended in "found nothing", because there's no reason to clear a zone when a raccoon is guaranteed to work.
4. **Removing fill-in cost about 25% of income.** Bats sit idle once their job is "picked clean". On normal, the bot wins 3 of 4 seeds at `HEAD` and 1 of 4 on the working tree.
5. **The last month is flat.** The bot hits Level 10 around Dec 3. After that there's nothing new to unlock, buy, or decide, just a counter climbing toward the bid.

---

## Part 1: Audit

### 1.1 Bugs (the code disagrees with what the game says)

| # | Issue | Where |
|---|---|---|
| B1 | **Scrutiny is cosmetic.** `forecastInspection` returns `sign` or `raccoon` whenever one is in range, regardless of scrutiny. The inspection panel still shows a SCRUTINY bar and "EXCUSES WEARING THIN +N". **[WIP]** removed `SIGN_LIMIT`/`RACCOON_LIMIT`. | `src/game/inspect.ts:113-122`, `src/ui/hud.tsx:677,687-694` |
| B2 | **Being spotted doesn't count as being spotted.** `escaped()` no longer sets `spottedTonight` **[WIP]**, so the "clean night" Suspicion bonus, the "SPOTTED TONIGHT" label, and the GHOST achievement ("10 nights without being spotted") only react to arrests. | `src/game/crew.ts:1032-1040`, `src/game/sim.ts:227-236`, `src/game/ops.ts:127` |
| B3 | **The Lockdown sweep never happens.** The Lockdown tier says "One more slip and they sweep the ceiling", but no code schedules a `'sweep'` inspection. The kind exists only in types, radius tables and NPC names. | `src/game/defs.ts:357`, `src/game/inspect.ts:8,86` |
| B4 | **POWERSELLER needs 250 goods, not 50.** The check is `ebaySold >= 50 * LOT`, but `ebaySold` already counts goods. | `src/game/sim.ts:194` vs `src/game/ops.ts:126` |
| B5 | **The power-bill tooltip shows the wrong cap.** The tooltip uses `powerCap × difficulty`, but the Monday review uses `× (3 − 2·ramp(L6→L8))`. Early on the real cap is 3× what's shown, so the tooltip flags red bills that will never be reviewed. | `src/ui/hud.tsx:835` vs `src/game/sim.ts:166` |
| B6 | **The Token Shake estimate is about 35% low.** The Job Board uses `3 + handy·1.6` per cycle, but the job pays `4 + handy·2.2`. | `src/game/jobs.ts:37` vs `src/game/crew.ts:401` |
| B7 | **Heat multipliers also scale cooling.** `heatTick` applies Invisible (×0.1), Crackdown (×2) and Halloween (×0) to negative rates too. An Invisible-by-Day Bat at the kiosk cools 10× slower than anyone else, and a Crackdown makes the kiosk cool *faster*. | `src/game/crew.ts:1085-1091` |
| B8 | **Bagged cameras still draw their red cone.** The renderer checks `c.active` instead of `cameraLive`, so the Out of Order Bag looks like it did nothing. | `src/render/renderer.ts:766-767` |
| B9 | **Floor items can't be selected, inspected or removed.** Clicks on the mall layer never select objects, and `demolishAt` only checks the ceiling. The "Good for N more inspections" text for Asbestos signs can never be displayed, and a misplaced $40 sign can't be refunded. | `src/input.ts:97-99`, `src/game/sim.ts:400`, `src/ui/hud.tsx:901` |
| B10 | **"Rest" lasts forever, not one shift.** The tooltip says "Off the clock for this shift", but `restCrew` overwrites `dayJob`/`nightJob`, so the Bat stays on Rest until reassigned. | `src/ui/hud.tsx:583`, `src/game/crew.ts:1010-1013` |
| B11 | **Reassigning a job clears "Lying low after being spotted".** `setJob` zeroes `waitUntil` and `jobCooldown`, so dragging a Bat off a job and back skips the 50-minute cooldown. | `src/ui/jobs.tsx:44-49` |
| B12 | **Gifts to an insider Gary waste food.** Once Gary is an insider, the gift job is still allowed. Goodwill is already capped and no longer used. | `src/game/crew.ts:228-231` |
| B13 | **Every inspector is "Dale".** The sign and "found nothing" logs always say Dale, even for Pest Control or the Fire Marshal. The power PA says "An electrician" but sends an NPC named "Dale (Maintenance)". | `src/game/inspect.ts:38,181,227`, `src/game/npc.ts:330` |
| B14 | **Contradictory inspection logs.** A search that finds nothing logs "Nothing up here but dust" (−2 Suspicion), then "They saw someone" (+3 per Bat) when a Bat was in the zone. | `src/game/inspect.ts:222-234` |
| B15 | **Gary's nap starts early.** The log says "Expect him to nod off around midnight", but Gary falls asleep at 22:00 wherever he's standing. | `src/game/events.ts:268-273` |
| B16 | **The wallet hijinx says "Gary was touched"** but doesn't add goodwill, and still says it after Gary has quit. | `src/game/hijinx.ts:53-57` |
| B17 | **Three different definitions of "cold".** The heater gives comfort from Nov 20 (`isColdNow`). The cold mood penalty starts Dec 1. `time.ts:isCold` duplicates the first and is unused. | `src/game/world.ts:222-226`, `src/game/needs.ts:90`, `src/game/time.ts:91` |
| B18 | **"Tomorrow morning" is sometimes today.** An inspection scheduled before 6:30 AM happens the same morning. The ceiling label also uses a 24-hour clock while the rest of the game uses AM/PM. | `src/game/inspect.ts:10-14,39`, `src/render/renderer.ts:1285` |
| B19 | **The psychic's refund counts as earnings.** The Tower card refund goes through `earn()`, adding $20 toward the next level. | `src/game/hijinx.ts:168,178` |
| B20 | **Help promises a Heat rule that doesn't exist.** It says "get spotted **or get predictable**", and VOICE.md mentions "how Heat ramps on a repeated job". There's no repetition mechanic. | `src/ui/App.tsx:379` |
| B21 | **The scanner's description oversells it.** "Hear inspectors coming" adds nothing, since every inspection is already announced a day ahead with a forecast. Its only real effect is ×0.85 on Suspicion gains. | `src/game/defs.ts:117` |
| B22 | **The recruit hint is stricter than the rule.** The objective says "Have a spare bed", but recruiting only requires `crew < beds + 1`, so one Bat can sleep on plywood. | `src/game/objectives.ts:29`, `src/game/events.ts:17` |

### 1.2 Unused and dead mechanisms

- **The fill-in system [WIP].** `Crew.fillIn`, `fillInJob`, `SAFE_ENOUGH_TO_FILL_IN` and `NEVER_FILL_IN` are dead code. `jobs.tsx:47` still writes `fillIn`, and `scripts/bot.ts:140` still sets it, so the bot believes fill-in exists.
- **The `'sweep'` inspection kind:** typed, named and given a radius, but never scheduled.
- **The scrutiny and excuse-fatigue mechanics:** computed, decayed, displayed, and never read by a decision (B1).
- **Unused state fields:** `Crew.recall`, `GameState.lastHour`, `GameState.todayBlackFriday`, `Camera.cooldown` (written at `npc.ts:560`, never read), `gary.gifts`, and `Derived.supplyTotal`/`demandTotal`.
- **Stats nobody sees:** `stats.bestNightStreak` and `stats.inspectionsFoundNothing` are tracked but never shown.
- **The Job Board's `risk` label** only drove fill-in. Now it's just a label.
- **Light radius and color** on items are purely cosmetic. That's fine, but players may assume lamps help, for example by reducing noise or making Bats feel safer.

### 1.3 Confusing behaviours

- **Suspicion creeps up with no explanation.** Shrinkage (arcade +0.1, RadioHut +0.24–0.48, stockroom +0.08, Lost & Found +0.55 per cycle) is never logged, because `raiseSuspicion` only logs gains of 2 or more. The meter climbs during "quiet" nights with no explanation (`src/game/ops.ts:99`).
- **The Tamagotchi fires when the night starts, not when you want it.** It lures the nearest guard as soon as night begins, which is a ~30-minute distraction at 10:30 PM that the player can't time.
- **Camera 2 is a trap for the Out of Order Bag.** That camera (`33.5, 2.2`) sits on Gary's route right outside Security. A bag there gets torn down almost immediately, for +4 Suspicion.
- **Errands come before everything.** A Bat carrying a floor item down will skip work and sleep to do it, at any hour. Errands in the morning (6 AM to opening) are completely risk-free, because no guard can see anyone.
- **Hijinx ignore where the Bat actually is.** "Ashley dozed off behind the Abercromp window" can fire while Ashley is asleep in the ceiling. Events tagged for mall hours also fire after Sunday's 6 PM close.
- **Misery quits come without warning.** After about 18 hours below 12 Mood, the *newest* Bat leaves at 6 AM. If the player is the only Bat, the run ends ("THE CEILING IS EMPTY"). That breaks VOICE's "Never hide a fail state."
- **Inspections can strand part of home.** Torn-out decks can split home in two. Bats and beds on the far side become unreachable.
- **The Asbestos sign goes on the mall floor but protects the ceiling,** and its 3-tile radius is never drawn.
- **Hour-gated random events almost never happen.** Gary's nap (22:00 only), Crackdown (10:00) and Dock clearance (20:00) each fire **about 0.4 times per game**, because they need the 3%-per-hour roll to land on one specific hour and then win a weighted draw. Hijinx take about 25 of the ~30 random events per run.

### 1.4 Bad logic and balance

**Bot results (normal difficulty, 4 seeds, plus easy and hard on seed 1):**

| Build | Wins | Final cash | Arrests | Clean nights | Raccoons used |
|---|---|---|---|---|---|
| Working tree | 1/4 normal, easy win, hard loss | $20.5k–28.7k vs a $28.7k bid | 0 in all 6 runs | 89 every run | 11–25 |
| `HEAD` | 3/4 normal | $28.1k–40.6k | 0–9 | 0–5 | 14–31 |

What this shows:

- **The night threat is gone in the working tree.** Spotting gives +15 Heat and has no Suspicion cost. Heat fades 15–30 a day. An arrest needs a grab at 100 Heat. In the bot's weekly snapshots, Suspicion never went above 31 on normal.
- **Inspections are a toll, not a puzzle.** Portable items are always stashed, because inspections happen at 7 AM when everyone is home. Everything else is saved by a $25 raccoon. The interesting choices (moving things, signs, clearing out) aren't needed.
- **Idle Bats [WIP].** When a pool runs dry (the fountain empties in about 3 hours), the Bat rests for the rest of the shift. That's the main reason the working tree earns about 25% less than `HEAD`.
- **Parts are overstocked and goods run dry.** Parts sit at the cap (450–500) from mid-October on, and "wasted: stash full" fires constantly. Goods sit at 0, because eBay, kiosk, pop-up and returns all compete for whatever one or two Workbenches make. RadioHut, Dock Pallets and the stockroom stop mattering after Level 5.
- **eBay is the engine.** It brings in about 25–30% of all earnings, passively. Everything else in the goods loop exists to feed it.
- **The pop-up barely covers its own rent.** Rent is $90/day. Passive income is `$9 × crowd` per open hour, which comes to about $85/day in December and less in late November. It only makes money when a Bat staffs it, and goods are scarce. Players who open it as "passive income" end up roughly even and can't tell why.
- **Bats who work both shifts burn out without warning.** Work drains 6 energy/hour, and nothing makes a Bat stop working. A Bat with day and night jobs reaches 0 energy by day 2 and stays "Overworked" for good, dragging everyone's Mood down by up to 24.
- **The late game is flat.** The last unlock comes at $18k earned (about Dec 3). After that, 28 days pass with no new decisions. The win check is all-or-nothing at noon on Dec 31.
- **The player can't affect the bid.** The bid drops only through five scripted store closures and a slow daily decline. Lowering it is the most thematic lever in the game, and the player can't touch it.

---

## Part 2: Mechanics

### 2.1 User-facing mechanics (explicit or easy to understand)

**Goal and calendar**
- The run goes from Fri, Oct 1, 2004 (9:35 PM) to the auction at noon on Fri, Dec 31. If your cash beats the developer's bid, you win.
- The bid drops as stores close. Five stores close on a schedule: Sam Groovy (Oct 13), Blockbusted (Nov 8), Claire-voyant (Nov 30), KB Toyz (Dec 10) and RadioHut (Dec 20). Each closure is announced along with the new bid.
- **Phases:** Open (shoppers, Officer Dana), Closing (90 minutes, janitors), After Hours (Gary), and Staff Arriving (6 AM until opening). Holiday hours vary: the mall is closed on Thanksgiving and Christmas, and Black Friday runs 5 AM to 11 PM.
- **Time and speed:** 1×, 3× or 8×, or paused. Inspections can auto-pause the game.

**Home (the ceiling)**
- Plywood decks ($6) spread out from the hatch and must connect to it. Everything sits on plywood, except where there are ducts, the skylight, rooftop AC units, or anchor-store firewalls.
- Build categories are Base, Home, Food, Hide and Work. Items can be rotated (R). Removing an item refunds 60%.
- Items carry tags for watts used or supplied, noise, smell, comfort and beds.
- **Furniture sets:** three specific items placed within 2 tiles of each other form a set with a bonus. Movie Night (+5 comfort), Kitchenette (+2 comfort and less smell), Tool Corner (faster tinkering), Bunk Room (deeper sleep), Rumpus Room (+8 comfort) and Spa Night (+6 comfort).

**Power**
- A Power Splice steals 120W within 5 tiles, and the store below pays for it. The Car Battery Bank supplies 200W within 6 tiles and doesn't bill anyone.
- A Power overlay shows coverage. Bills are reviewed every Monday at 8 AM, and an unusual bill brings an electrician.
- Splices over vacant stores are dead.

**Noise, smell and complaints**
- Noise and Smell overlays show what's leaking. Each store has a noise cover and a smell cover, plus a staff sensitivity. All three are in the tooltip and the room blurb.
- Each room has a complaint bar. A warning comes at 60%, and at 100% the store reports you (+3 Suspicion).
- Foam and the Soundproof Pod muffle noise. Box Fans clear smell.

**Inspections**
- Inspections are announced the day before, with a red zone and a forecast of what they'll find, what will be stashed, and its dollar value.
- Answers: clear out, move things, use a Decoy Raccoon (single use), or an Asbestos sign (two uses). Fire Marshals ignore both.
- A search that finds something tears out decks and confiscates items, plus Suspicion.

**Crew**
- Each Bat has Stealth, Charm and Handy (1–5), traits, Energy and Heat.
- Each Bat gets a day job and a night job on the Job Board. The board shows estimated yield, the stat used, a risk label, what's left today, and why a job is blocked.
- There are 15 jobs, unlocked by level. Pools such as the fountain, dumpster and RadioHut refill each morning.
- Recruits arrive as scripted offers. Each costs 3 food and needs a bed (or the one allowed spare).
- **Getting caught:** pay bail ($60 + $15 per Bat, back in 8 hours), let them sit 5 days, or cut them loose.
- Floor items (Hide gear) are carried down by a free Bat.

**Night stealth**
- Gary's flashlight cone, a second guard at Concerned, and a K-9 at Alarmed are all drawn on screen, along with camera cones and Bats' detection rings (yellow, then amber, then red).
- A spotted Bat runs for the hatch, and the guard gives chase.

**Heat (per Bat)**
- Heat rises when a Bat is spotted or works risky day jobs (Searz Returns especially). At 100, Officer Dana makes an arrest.
- Resting by day cools Heat. Kiosk and Pop-up shifts cool it as well.

**Suspicion (the mall's)**
- Five tiers: Calm, Watchful, Concerned, Alarmed, Lockdown. Each adds cameras, guards, a dog, or motion sensors.
- Suspicion cools daily, and the meter shows the rate. At 100% the Bats are evicted.

**Food and Mood**
- Meals are at 8 AM and 8 PM. Food Court Runs cost $4 a portion. Without a fridge, food spoils.
- Mood is shared. Comfort, beds and hot meals raise it. Happy Bats work faster, and miserable Bats quit.

**Economy**
- Parts become goods at a Workbench (10 parts for 5 goods).
- Goods sell through Searz Returns (best price, most Heat), the Kiosk ($500 lease plus $20/day), the Pop-Up ($1,500 plus $90/day, December markups) and eBay (needs Wi-Fi from Boundaries).
- The Coin Siphon skims registers while the mall is open and jams on occasion (5 parts to clear).

**Levels:** total money ever earned unlocks 10 levels, and each level unlocks gear or jobs. The level list is viewable.

**Gary:** Cinnabomb gifts (2 food, once a night) build goodwill. At 100, Gary either joins the crew or stays on as an insider.

**Scripted beats:** auction news, Gary tip, recruits, Halloween, Trainee Kyle, fire inspection (Level 7+), Mall Santa, Thanksgiving feast, Black Friday, cold snap, holiday pest sweep, blackout, Christmas with Gary, Boxing Day, and the final countdown.

**Hijinx:** 11 choice events (wallet, mannequin, pretzel cart, ferret, psychic, mallwalkers, vent, hot dog suit, Furby, Glamour Shots), plus random events (real raccoon, Gary naps, crackdown, dock clearance, loose tile, pest check, fountain tip).

### 2.2 Hidden mechanics (felt, not stated)

**The mall gets harder as you earn more.** Three ramps are tied to total earnings, not the calendar:
- **Day Heat:** gains scale from 35% to 100% between Level 3 and Level 6.
- **Random inspections:** zero before Level 4, ramping to full by Level 6. The daily chance is `0.15 + 0.015 × Suspicion`.
- **Power-bill tolerance:** 3× the room cap until Level 6, falling to 1× by Level 8. This causes the mid-November Suspicion spike visible in every bot run.

**Noise and smell only matter when someone is below to hear them.**
- **Complaints need staff present.** Stores have staff while open (100%), in the morning (60%) and at closing (50%), and nobody at night. Mall Management only hears 9–5 on weekdays. Security always hears.
- **Crowds hide noise.** While the mall is open, noise cover is 55–100% of its listed value depending on crowd size. At morning and closing it's only 30%.
- **Guards hear the ceiling.** A guard walking under ceiling noise of 1.1 or more may stop and listen ("...did that ceiling just creak?"), adding +12 complaint. This can happen at most once every 45 minutes per guard.
- **Daytime is party time.** Bats with no day job spend the day on the TV, darts or ball pit, right when stores are full and listening. Snorers make noise while sleeping, and most Bats sleep during the day.
- **Insulation doesn't stack.** Foam and the pod take the best value per tile; they don't add together.
- **Smell fades slowly.** About 1.5% per minute, faster near a fan. Only the first hot plate placed does the cooking.
- **Hot spots aim inspections.** Complaint inspections center on the room's noisiest or smelliest recent tile. Rope drops and siphons count toward that hot spot.

**Inspections**
- **Portables are inspection-proof.** Inspections always come at 7 AM. If any Bat is home, every portable item in the zone is stashed.
- **The hatch tile is never torn out.**
- **Inspections queue.** Each extra pending inspection is pushed back 35 minutes. At most 2 complaint inspections can be pending at once.
- **Routine checks.** With fewer than 10 total complaints but Suspicion of 20 or more, a random check lands near your decks.
- **Bats evacuate automatically.** Bats in an active zone leave on their own. Anyone still there when the ladder goes up is "a face in the ceiling" (+3 Suspicion each).

**Night stealth**
- **Detection fills over time; it isn't instant.** At the center of Gary's cone, an average Bat is spotted in about 6 minutes.
- **What changes detection speed:**
  - Stealth: ×1.15 at Stealth 1, down to ×0.55 at Stealth 5.
  - Hiding: ×0.33–0.45. Working: ×1.15.
  - Within 6 tiles of a periscope: ×0.7. Knows the Routes on the crew: ×0.85.
  - Heat: up to ×1.5.
  - Closing phase: ×0.4.
- **Bats act on their own.** They wait for guards to pass and time camera sweeps (up to about 25 minutes). They duck behind cover when someone is close, freeze and hold their breath when partly seen, and back off for 50 minutes after a close call.
- **Rope drops are emergency exits.** A fleeing Bat will run to the nearest ladder or rope.
- **A grab is not an arrest.** Each grab adds +15 Heat, and a grab only becomes an arrest at 100 Heat. Guards can grab every 20 minutes.
- **Gary's goodwill weakens him.** It cuts his detection by up to 37.5% and slows his chase at 50 or more. As an insider, he's at 30% detection, and that includes the K-9, which walks with Gary.
- **Asleep or gone means harmless.** Night guards leave at 6 AM, and Dana arrives at opening. From 6 AM to opening, nobody can see a Bat on the mall floor.
- **Wet Floor signs steer patrols.** They add a large path cost to the surrounding 3×3, so guards and janitors detour around them.
- **Guards tear down bags.** Any guard passing within 2.5 tiles of a bagged camera removes the bag. Otherwise a bag has a small nightly chance of being noticed anyway.

**Heat**
- Heat fades 15 a day, or 30 a day if the Bat's day job is Rest, including while in custody.
- Heat goes to 40 after an arrest. Halloween resets everyone's Heat to 0.
- By day, Heat only grows from the job's own rate (Returns adds +8 per sale), from Dana seeing a Bat backstage, or from Dana seeing a Bat use the Employees Only door (+8).

**Energy, Mood and food**
- **Energy:** working drains 6/hour and idling 4.2/hour. Sleeping restores 14/hour in a bed (×1.3 in a Bunk Room, ×1.3 for Light Sleeper) and 7/hour on bare plywood.
- **Low energy:** below 15 energy, a Bat moves 25% slower.
- **Double shifts:** nothing stops a Bat with two jobs from working itself to 0. Overworked Bats lower Mood for everyone.
- **Mood drifts toward a target** by 8% an hour:
  - Baseline 38.
  - Comfort per Bat × 4, up to +36. Jolly on the crew +6.
  - Bedless Bats up to −14, overworked Bats up to −24, missed meals −20 to −28, December with no heater −10, more Bats than beds + 1 −6.
  - Feasts, leisure, and reading at Boundaries are temporary; Mood drifts back to its target.
- **Mood sets work speed.** Speed runs from ×0.6 at 0 Mood to ×1.2 at 100. Mood of 80 or more adds +1 to each Bat's best stat; below 30, every stat drops by 1.
- **Hot meals** add +3 Mood each.
- **Hunger:** a missed meal costs every Bat 3 energy/hour and makes work 15% slower.
- **Mealtime fallback:** if the stash is short at mealtime, the crew buys slices at $6 each, which is 50% more than a Food Court Run.
- **Spoilage:** without a fridge, 8% of food spoils every night, and anything over the food cap is lost.

**Economy**
- **Pools** refill at 6 AM. Their size scales with the season and the mall's health. Fountain Fishing with Handy 3 empties the fountain in about 3 hours.
- **A dying mall works against you.** Mall health lowers the bid, but it also shrinks crowds, pools, busking and kiosk sales.
- **Holiday multipliers:** Black Friday has a ×3.2 season crowd factor (busking caps at ×1.6, kiosk sales chance at ×1.5) and ×1.3 kiosk and pop-up prices. Boxing Day returns pay ×1.8.
- **eBay:** sells one lot of 5 goods every 110 minutes at full Wi-Fi, slower and cheaper farther from Boundaries. It stops during the blackout.
- **Siphons** jam 5% of open hours, so about once every two days. They also add to complaints and the hot spot.
- **Stash overflow:** a haul that doesn't fit the stash is lost. Demolishing items refunds parts up to the cap.

**Events and people**
- **Recruits:** each offer appears once. Decline it, or lack the bed or food, and that recruit is gone. The 8 offers (plus Gary) are the only way to grow the crew.
- **Leaving:** when Mood drops, the most recent recruit leaves first.
- **Blackout night:** cameras are off and no power bill accrues, but home stays fully powered.
- **Bandit the ferret** brings back $3–12 or 5 parts every morning.

---

## Part 3: Punch list

Ordered by payoff for effort. P0 restores trust (the UI should never lie). P1 brings tension back into the core loop. P2 adds new toys. P3 is polish.

### Status (Nov 7, 2026)

Every item below is implemented. Choices made along the way:

- **Scrutiny:** the meter is gone. A raccoon above a store costs $25, then $40, $60, $90 for each one that store has already heard this week. Prices reset at Monday's bill review.
- **Spotting:** the first spotting each night costs 3 Suspicion and the clean-night bonus. Later ones only add Heat.
- **Stores breaking leases:** each store report or Monday power flag adds 1 strain. The manager warns at 2, and the store leaves at 4. Strain fades by 1 a week.
- **Bid pressure:** once the auction is known, the bid rises $250 a day at Alarmed and $500 a day at Lockdown.
- **The heist:** "The Charm Job" (Level 9) needs a Rope Drop into Charm Diamond Centres. Motion sensors catch Bats who are moving, unless the power is out. It pays once, and the next morning brings +15 Suspicion and a police sweep.
- **Workbench:** cycle 90 → 75 minutes. Pop-up walk-ins: $9 → $12 per crowd-hour.
- **Random events:** one per day, drawn at 6 AM for an hour that fits the event.
- **Dropped after review:** the makeover (too central for a side mechanic) and backup jobs (a dry job means the Bat rests).
- **Balance after all of this:** pools for the fountain, token machine and Lost & Found are deeper, so Bats idle less, and the developer's base bid dropped from $18,000 to $15,500. The bot wins 4 of 6 normal seeds by 3–15% and loses the other two by under $1k, without ever using the heist, breaking leases, home jobs, or Gary. Easy wins by 54%. Hard loses by about a third.

### The constraint: give players control, don't just remove consequences

The WIP rebalance came from a real problem. Bats act on their own, so with a big crew someone gets spotted most nights, and every spotting used to raise Heat and Suspicion. The only reliable way to cool off was Rest, which stalls the run. Inspections then piled up, often several on one morning, and some couldn't be stopped at all. Removing the consequences fixed the frustration, but it also removed the tension.

Where the frustration comes from in the code:

- **Risk grows with headcount.** Every Bat on the mall floor rolls detection independently, so spottings grow linearly with the number of Bats on night jobs. At `HEAD`, each spotting cost +2–3 Suspicion, and each escape cost another +3 on top.
- **The player has no move once danger appears.** Their only lever is the Job Board. Ducking, waiting, and fleeing are all handled by the AI.
- **Resting is the only way to cool off, and it's idle time.** Rest doubles Heat cooling but earns nothing. The only other jobs that cool Heat are the Kiosk (Level 6) and the Pop-Up (Level 9). The only job a Bat can do at home is Tinker, one Bat per Workbench.
- **Inspections land on top of each other, partly by script.** Across 4 bot seeds (working tree, normal), **Tue, Nov 16 had three or four inspections every time**: the Monday power review plus the scripted fire inspections, which ignore decoys and signs. **Dec 11 had two or three** from the scripted pest sweep, and most other Tuesdays paired a power inspection with a complaint one. All of them land on the same morning, 35 minutes apart.
- **The power trigger is hidden.** The bill cap tightens 3× between Levels 6 and 8 (mid-November for the bot), and the tooltip shows the wrong cap (B5). The first warning is the inspection itself.
- **The only free answer to an inspection is a decoy or sign.** Moving furniture out of the zone costs 40%, because removal refunds 60%.

Every item below follows four rules:

1. **Risk comes from decisions, not headcount.** What a Bat does sets the risk; a bigger crew shouldn't multiply it.
2. **The player gets a move when danger shows up.** Watching the AI handle it isn't a move.
3. **Lying low still makes progress.**
4. **Every inspection has an answer that costs effort, not luck.**

### P0: Stop lying to the player

- [x] **Scrutiny (B1): keep decoys reliable and make wearing them out predictable.** Don't bring back random failure. Either delete the Scrutiny bar and "Excuses wearing thin", or turn excuse fatigue into a visible price: each raccoon used above the same store costs more ($25, then $40, then $60), resetting weekly. Raccoon spam then has a cost the player can plan around, with no dice involved.
- [x] **Count spotting once per night (B2).** The first spotting of the night sets "spotted tonight", which loses the clean-night bonus, and costs a small fixed amount of Suspicion. Later spottings that night only add Heat to that Bat. Being seen matters again, but eight Bats on the floor no longer means eight penalties. Rename GHOST to match.
- [x] **Telegraph the Lockdown sweep (B3).** At 80%+, warn first ("One more report and Mall Management calls the police"). Trigger the sweep on the next store report, not on a spotting, so it follows from something the player could see and act on.
- [x] **Fix the small lies:** POWERSELLER count (B4), the tooltip cap (B5), the Token Shake estimate (B6), bagged camera cones (B8), the Rest tooltip or behaviour (B10), inspector names (B13), Gary's nap copy (B15), and the scanner description (B21).
- [x] **Cut "get predictable" from Help for now (B20).** A repeated-job Heat rule adds pressure, and it's only fair once lying low still makes progress (P1). Revisit it after that.
- [x] **Delete the dead code:** fill-in leftovers, `lastHour`, `todayBlackFriday`, `Camera.cooldown`, `gary.gifts`, `supplyTotal`/`demandTotal`, and `time.ts:isCold`. Update `scripts/bot.ts` so it stops setting `fillIn`. Keep `Crew.recall`, the natural home for the "All home" button below.

### P1: Put the tension back, through control

- [x] **Add an "All home" button.** One button and hotkey that pull every Bat off the mall floor right now, forfeiting the rest of their shift. Add a per-Bat version on the crew card. It's a panic move that costs momentum only when the player chooses to spend it.
- [x] **Never more than one inspection per morning.** Push extra inspections to the following mornings instead of 35 minutes later, and show the queue. Move the scripted fire inspection off Monday's power review. Have the power review flag only the worst room, and warn the Friday before ("RadioHut's bill is running high"), so the player gets a weekend to fix it.
- [x] **Make moving free, and let a bigger crew help.** Add a Move tool that relocates an item without the 40% loss. During an inspection, each Bat at home also stashes one non-portable item from the zone. A big crew then helps during inspections instead of only adding risk at night, and every inspection has an answer that takes effort, not money.
- [x] **Make lying low still pay.** Add jobs Bats can do at home. Possible examples:
  - **List on eBay:** speeds up the PC.
  - **Sort the haul:** turns parts into a little cash.
  - **Rig the splices:** cuts a splice's billed draw.
  - **Watch the periscope:** lowers detection for Bats on the floor.

  A hot Bat can still earn, and Rest stops being the only way to cool down.
- [ ] ~~**Add a way to cool Heat other than Rest.**~~ Dropped. Home jobs cool Heat like Rest instead. The Glamour Shots and Mallwalker hijinx already cut Heat by 40. Make that a purchase, such as "Change your look" at the thrift rack, with a price and a cooldown.
- [x] **Limit Bats per night job.** Allow two Bats per spot (fountain, arcade, Lost & Found, and so on), so a big crew spreads out across the map instead of crowding one guard route. Deciding where the eighth Bat goes becomes a real choice.
- [ ] ~~**Bring back a fallback job, per Bat.**~~ Dropped. Add a "Backup" slot on the Job Board for when the main job is picked clean. This recovers the ~25% income lost to idle Bats and pairs with the per-spot limit.
- [x] **Add a morning report.** One log line or card at 6 AM covering: tonight's haul, Suspicion change with reasons (shrinkage added up per store, so a "Lost & Found items missing ×6" line finally appears), Heat warnings, and pools tomorrow. This turns the silent drift into something the player can act on.
- [x] **Let players kill stores.** This is the biggest fun win. When a store has a high complaint level or high power bills for N days, its manager threatens to leave, and if it continues, the store closes, the bid drops, and the crowd and pools shrink. Every splice and every noisy TV becomes a strategic choice between earning more and making the mall worth less.
- [x] **Warn before burnout and quitting.** Make Bats with two jobs refuse a shift at 0 energy ("Tyler is too tired to go out"). Before a misery quit, log "Kayla is packing a bag" a day ahead, and choose who leaves by who's worst off rather than who joined last. Never let the last Bat quit without a final-chance modal.
- [x] **Fix the goods squeeze.** Give parts a sink (a Workbench upgrade, splice upgrades, or selling scrap at the dock) and raise Workbench throughput, so kiosk, pop-up and returns aren't all starved by eBay.
- [x] **Give the Pop-Up an honest number.** Show expected daily rent against passive income in the card. Or raise passive income enough to clearly beat rent, so opening one feels like a win.

### P2: New toys and a stronger December

- [x] **Plan December around climaxes.** Level 10 lands around Dec 3, so the last four weeks need set pieces. Some options:
  - **The Zalez Jewelers job:** a one-night heist that needs the blackout, a bagged camera and Gary's nap. Big payout, and Suspicion goes to Lockdown.
  - **Black Friday as a festival day:** extra jobs, double sales, a crowd that hides everything.
  - **Countdown pressure:** the developer's bid can *rise* if Suspicion stays high ("Prestige hears there are squatters; they want the building cleared, not sold").
- [x] **Let the player trigger the Tamagotchi.** Add a "Feed it" button on the selected floor item that starts the beeping, so it becomes a planned distraction during a Lost & Found raid. Make floor items selectable and removable while you're at it (B9).
- [x] **Make Gary's insider choice tangible.** As an insider, Gary marks his route on the map each night, cancels one inspection a week ("Dale's ladder is broken"), or both. Block gifts once he's an insider (B12).
- [x] **Recruits wait at the ladder.** Declined or unaffordable recruits wait 3 days before moving on. A visible "someone's at the ladder" badge turns recruiting into a plan instead of a gotcha.
- [x] **Make random events a daily deck.** Replace the 3%/hour roll with "1–2 events a day, drawn from what's eligible", so Gary's nap, the Crackdown and dock clearance actually appear. Set hijinx where the chosen Bat actually is, and only pick Bats who are awake.
- [x] **Hint at the hidden ramps once.** The first time each ramp kicks in, log a line in-world, such as "Ms. Pruitt hired an accountant. The bills get read now." That's one line per ramp, consistent with VOICE.md's "Let them find out" rule.
- [x] **Treat the Out of Order Bag trap as content.** Either move Camera 2 off Gary's route, or show it as "Gary walks right past this one" when the player tries to bag it.

### P3: Polish

- [x] Use AM/PM on inspection labels, and say "this morning" when it's the same day (B18).
- [x] Unify the definition of "cold" (B17).
- [x] Don't count the psychic's refund as earnings (B19).
- [x] Align the recruit hint with the bed rule (B22).
- [x] Make the wallet event add Gary goodwill, and skip the Gary line once he's gone (B16).
- [x] Choose one result per search: a "found nothing" result shouldn't also say "they saw someone" (B14).
- [x] Draw the Asbestos sign's radius when placing it.
- [x] Rebuild the deck path, or warn, when an inspection is about to split home in two.
- [x] Show `bestNightStreak` and "Inspections dodged" on the game-over screen.
- [x] Grade the win (by margin, days without arrest, achievements) so a $33 win and a $12k win don't end the same way.
