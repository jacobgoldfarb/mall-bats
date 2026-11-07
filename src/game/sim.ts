import { BUILD, LOT, NOOK_SMELL, canRotate, type BuildId } from './defs';
import { agentNode, coolHeat, crewLeaves, crowdNow, idleBubble, noiseFromCrew, sendCrewHome, updateCrew } from './crew';
import { closeStore, dailyCandidates, planDay, randomHourly, runScript, visitorsLeave } from './events';
import { banditForage, updateBandit } from './bandit';
import { costumesWearOff, ventOfferings } from './hijinx';
import { decoyPrice, inspectionHotspotUpdate, rollInspection, scheduleInspection } from './inspect';
import { LAYOUT, N, W, H, idx, inBounds } from './layout';
import { FOOD_PRICE, MEAL_HOURS, hourlyMood, serveMeal } from './needs';
import { checkObjectives } from './objectives';
import { auctionBid, earn, log, pa, pressure, pushModal, raiseSuspicion, rand, sfx, suspicionDecay, suspicionLevel, unlock, updateCameras } from './ops';
import { detection, ensureStaff, onPatrolRoute, spawnShopper, startInspector, trackStaffDoors, updateCrewDanger, updateMallItems, updateNpcs } from './npc';
import type { Crew, GameState, Placed } from './state';
import { AUCTION_DAY, dayOf, hourCurve, mallHours, md, minuteOfDay, phaseAt, seasonFactor, weekday, type Phase } from './time';
import { addObject, canPlace, getDerived, markDirty, roomTiles } from './world';

export const noiseField = new Float32Array(N);

function spread(f: Float32Array, x: number, y: number, n: number) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const k = dx === 0 && dy === 0 ? 1 : dx === 0 || dy === 0 ? 0.5 : 0.3;
      f[idx(nx, ny)] += n * k;
    }
  }
}

export function computeNoise(s: GameState) {
  noiseField.fill(0);
  const d = getDerived(s);
  for (const o of s.objects) {
    const def = BUILD[o.type];
    if (!def.noise || !o.powered) continue;
    if (def.noiseWhen === 'use' && o.usedUntil <= s.time) continue;
    spread(noiseField, o.x, o.y, def.noise);
  }
  noiseFromCrew(s, noiseField, spread);
  for (let i = 0; i < N; i++) noiseField[i] *= d.insulation[i];
}

function updateSmell(s: GameState, dt: number) {
  const d = getDerived(s);
  const neat = s.crew.some((c) => c.traits.includes('neat'));
  for (const p of d.hotPlates) {
    if (p.usedUntil <= s.time) continue;
    const amt = BUILD.hot_plate.smell! * (neat ? 0.5 : 1) * (d.nookOf.get(p.id) === 'kitchen' ? NOOK_SMELL : 1) * dt;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (inBounds(x, y)) s.smell[idx(x, y)] += amt * (dx === 0 && dy === 0 ? 1 : 0.5);
      }
  }
  for (let i = 0; i < N; i++) {
    if (s.smell[i] <= 0.01) {
      s.smell[i] = 0;
      continue;
    }
    s.smell[i] = Math.min(150, s.smell[i] * Math.max(0, 1 - (0.015 + 0.05 * d.fanAt[i]) * dt));
  }
}

export function presence(s: GameState, roomIdx: number, phase: Phase): number {
  const r = LAYOUT.rooms[roomIdx];
  const m = minuteOfDay(s.time);
  const weekdayNow = weekday(dayOf(s.time));
  switch (r.kind) {
    case 'security':
      return phase === 'night' ? 0.6 : 1;
    case 'office':
      return weekdayNow > 0 && weekdayNow < 6 && m >= 540 && m < 1020 ? 1 : 0;
    case 'maint':
      return m >= 360 && m < 960 ? 0.6 : 0;
    case 'service':
      return phase === 'night' ? 0.1 : 0.3;
    default:
      return phase === 'open' ? 1 : phase === 'morning' ? 0.6 : phase === 'closing' ? 0.5 : 0;
  }
}

const isBlackFriday = (s: GameState) => {
  const [m, d] = md(dayOf(s.time));
  return m === 11 && d === 26;
};

const STRAIN_WARN = 2;
const STRAIN_CLOSE = 4;
const STRAIN_FADE_PER_DAY = 1 / 7;

function strainStore(s: GameState, ri: number) {
  const r = LAYOUT.rooms[ri];
  const rs = s.rooms[ri];
  if (r.kind !== 'store' || rs.vacant) return;
  const before = rs.strain;
  rs.strain += 1;
  const focus = { x: Math.floor((r.x0 + r.x1) / 2), y: Math.floor((r.y0 + r.y1) / 2), layer: 1 as const };
  if (rs.strain >= STRAIN_CLOSE) closeStore(s, r.id, true);
  else if (before < STRAIN_WARN && rs.strain >= STRAIN_WARN) log(s, `The manager at ${r.name} told Ms. Pruitt that one more bad week and they're breaking the lease.`, 'warn', focus);
}

function reportStore(s: GameState, ri: number, reason: string) {
  const lockdown = suspicionLevel(s.suspicion) >= 4;
  raiseSuspicion(s, COMPLAINT_REPORT, reason);
  strainStore(s, ri);
  if (lockdown && !s.inspections.some((i) => i.kind === 'sweep' && i.state !== 'done')) scheduleInspection(s, ri, 'sweep', 'Mall Management called the police.');
}

function complaints(s: GameState, dt: number) {
  const phase = phaseAt(s.time);
  const crowd = crowdNow(s);
  const d = getDerived(s);
  const festival = isBlackFriday(s);
  for (let ri = 0; ri < LAYOUT.rooms.length; ri++) {
    const r = LAYOUT.rooms[ri];
    const rs = s.rooms[ri];
    if (!r.ceiling) continue;
    rs.complaint = Math.max(0, rs.complaint - 0.025 * dt);
    if (rs.vacant || rs.popup) {
      rs.complaint = 0;
      continue;
    }
    if (festival) continue;
    const p = presence(s, ri, phase);
    if (p <= 0) continue;
    const mask = phase === 'open' ? r.noiseMask * (0.55 + 0.45 * Math.min(1, crowd)) : r.noiseMask * 0.3;
    let noise = 0;
    let smell = 0;
    let drops = 0;
    let skims = 0;
    for (const i of roomTiles(ri)) {
      noise += noiseField[i];
      smell += s.smell[i];
      if (d.drops.has(i)) drops++;
      if (phase === 'open' && isSkimming(d.objAt.get(i))) skims++;
    }
    const rate = p * r.sensitivity * (noise * (1 - mask) * 0.07 + smell * (1 - r.smellMask) * 0.004 + drops * 0.02 + skims * SKIM_COMPLAINT);
    rs.complaint += rate * dt;
    if (rs.complaint >= 60 && rs.lastWarn !== dayOf(s.time)) {
      rs.lastWarn = dayOf(s.time);
      const what = smell * (1 - r.smellMask) * 0.004 > noise * (1 - mask) * 0.07 ? 'a weird smell' : 'noises';
      log(s, `Staff at ${r.name} keep complaining about ${what} in the ceiling. (${Math.round(rs.complaint)}%)`, 'warn', { x: rs.hotX || r.x0, y: rs.hotY || r.y0, layer: 1 });
    }
    if (rs.complaint >= 100) {
      rs.complaint = COMPLAINT_AFTER_REPORT;
      reportStore(s, ri, `${r.name} reported ${r.kind === 'service' || r.kind === 'concourse' ? 'creaking' : 'noises and smells'} in the ceiling`);
    }
  }
}

const SKIM_COMPLAINT = 0.04;
const COMPLAINT_REPORT = 3;
const COMPLAINT_AFTER_REPORT = 40;
const JAM_CHANCE = 0.05;

const isSkimming = (o: Placed | undefined) => !!o && !!BUILD[o.type].racket && o.powered && !o.jammed;

function skimRackets(s: GameState) {
  if (phaseAt(s.time) !== 'open') return;
  const crowd = crowdNow(s);
  for (const o of s.objects) {
    if (!isSkimming(o)) continue;
    const r = LAYOUT.rooms[LAYOUT.roomAt[idx(o.x, o.y)]];
    earn(s, Math.round(rand.range(4, 9) * (r.traffic ?? 0.6) * crowd));
    if (rand.chance(JAM_CHANCE)) {
      o.jammed = true;
      log(s, `The Coin Siphon above ${r.name} jammed on a Canadian quarter. Clear it for 5 parts.`, 'warn', { x: o.x, y: o.y, layer: 1 });
    }
  }
}

export function clearJam(s: GameState, o: Placed): string | null {
  if (s.parts < 5) return 'Needs 5 parts';
  s.parts -= 5;
  o.jammed = false;
  return null;
}

function powerAccrual(s: GameState, dt: number) {
  if ((s.flags.blackoutUntil ?? 0) > s.time) return;
  for (const o of s.objects) {
    const def = BUILD[o.type];
    if (!def.supply || def.offGrid || !o.powered || o.tapRoom < 0) continue;
    s.rooms[o.tapRoom].power += (o.supplyLoad * dt) / 60 / 1000;
  }
}

export const POWER_MULT = { easy: 1.4, normal: 1, hard: 0.8 };

export const powerCap = (s: GameState, ri: number) => LAYOUT.rooms[ri].powerCap * POWER_MULT[s.difficulty] * (3 - 2 * pressure(s, 6, 8));

function biggestTap(s: GameState, ri: number) {
  const tap = s.objects.filter((o) => o.type === 'splice' && o.tapRoom === ri).sort((a, b) => b.supplyLoad - a.supplyLoad)[0];
  return tap ? { x: tap.x, y: tap.y } : undefined;
}

function overBudget(s: GameState, projection: number) {
  return LAYOUT.rooms
    .map((r, ri) => ({ ri, ratio: r.ceiling ? (s.rooms[ri].power * projection) / powerCap(s, ri) : 0 }))
    .filter((o) => o.ratio > 1)
    .sort((a, b) => b.ratio - a.ratio);
}

function billReview(s: GameState) {
  const [worst, ...squeaked] = overBudget(s, 1);
  if (worst) {
    scheduleInspection(s, worst.ri, 'power', `The electric bill is ${Math.round(worst.ratio * 100)}% of normal.`, biggestTap(s, worst.ri));
    strainStore(s, worst.ri);
  }
  for (const rs of s.rooms) {
    rs.power = 0;
    rs.decoys = 0;
  }
  const others = squeaked.map((o) => LAYOUT.rooms[o.ri].name).join(', ');
  log(
    s,
    worst ? `Monday utility review: ${LAYOUT.rooms[worst.ri].name}'s bill got flagged.${others ? ` ${others} squeaked by.` : ''}` : 'Monday utility review: all electric bills look normal. Nice.',
    worst ? 'bad' : 'good',
  );
}

const DAYS_BEFORE_REVIEW = 4;

function billPreview(s: GameState) {
  const running = overBudget(s, 7 / DAYS_BEFORE_REVIEW);
  if (!running.length) return;
  const names = running.map((o) => LAYOUT.rooms[o.ri].name).join(', ');
  const at = biggestTap(s, running[0].ri);
  log(s, `The electric bills at ${names} are running high.`, 'warn', at && { ...at, layer: 1 });
}

function ebay(s: GameState, dt: number) {
  const d = getDerived(s);
  if (!d.pc || s.goods < 1 || (s.flags.blackoutUntil ?? 0) > s.time) return;
  s.ebayTimer += dt;
  if (s.ebayTimer < 110) return;
  s.ebayTimer = 0;
  const lot = Math.min(LOT, s.goods);
  s.goods -= lot;
  const price = Math.round(rand.range(30, 54) * (lot / LOT));
  earn(s, price);
  s.stats.ebaySold += lot;
  if (s.stats.ebaySold >= 50) unlock(s, 'POWERSELLER');
  log(s, `eBay: "VINTAGE ${rand.pick(['WALKMAN', 'TAMAGOTCHI', 'GAME BOY COLOR', 'DISCMAN', 'FURBY', 'PALM PILOT', 'ZIP DRIVE', 'BOOMBOX'])} L@@K!! RARE" (lot of ${lot}) sold for $${price}.`, 'good');
  sfx('cash');
}

function refillPools(s: GameState) {
  const day = dayOf(s.time);
  const tf = seasonFactor(day) * (0.5 + 0.6 * s.mallHealth);
  const open = (id: string) => !s.rooms[LAYOUT.roomIndex[id]].vacant;
  s.pools.fountain = Math.round(30 + 90 * tf);
  s.pools.dumpster = Math.round(12 + 18 * tf);
  s.pools.vending = 10;
  s.pools.arcade = open('funzone') ? Math.round(60 + 140 * tf) : 0;
  s.pools.radiohut = open('radiohut') ? 55 : 0;
  s.pools.pallets = Math.round(60 + 40 * tf);
  s.pools.stockroom = 45;
  s.pools.lostfound = 5 + (tf > 1.5 ? 3 : 0);
  s.pools.samples = Math.round(16 + 8 * tf);
}

function newDay(s: GameState) {
  const day = dayOf(s.time);
  const d = getDerived(s);
  refillPools(s);
  if (!d.fridge && s.food > 0) {
    const spoiled = Math.ceil(s.food * 0.08);
    s.food -= spoiled;
    if (spoiled >= 2) log(s, `${spoiled} food spoiled overnight. A Mini-Fridge would fix that.`, 'info');
  }
  s.food = Math.min(s.food, d.foodCap);
  s.gary.affinity = Math.max(0, s.gary.affinity - (s.gary.insider ? 0 : 1));
  s.mallHealth = Math.max(0.1, s.mallHealth - 0.0035);
  for (const rs of s.rooms) rs.strain = Math.max(0, rs.strain - STRAIN_FADE_PER_DAY);

  s.suspicion = Math.max(0, s.suspicion - suspicionDecay(s, !s.spottedTonight));
  updateCameras(s);
  if (!s.spottedTonight && s.flags.workedTonight) {
    s.stats.nightsClean++;
    s.stats.bestNightStreak = Math.max(s.stats.bestNightStreak, s.stats.nightsClean);
    if (s.stats.nightsClean >= 10) unlock(s, 'GHOST');
  } else if (s.spottedTonight) s.stats.nightsClean = 0;
  s.spottedTonight = false;
  s.flags.workedTonight = 0;

  if (s.business.kiosk) {
    if (s.cash >= 20) s.cash -= 20;
    else {
      s.business.kiosk = false;
      log(s, "You couldn't make kiosk rent. The lease is gone.", 'bad');
    }
  }
  if (s.business.popupRoom >= 0) {
    if (s.cash >= POPUP_RENT) s.cash -= POPUP_RENT;
    else {
      s.rooms[s.business.popupRoom].popup = false;
      s.business.popupRoom = -1;
      markDirty();
      log(s, "You couldn't make pop-up rent. The landlord changed the locks.", 'bad');
    }
  }

  misery(s);
  heistAftermath(s);
  developerPressure(s);
  if (day >= 1) morningReport(s);

  s.dailyIncome.push(Math.round(s.todayIncome));
  s.todayIncome = 0;
  dailyCandidates(s);
  visitorsLeave(s);
  banditForage(s);
  ventOfferings(s);
  costumesWearOff(s);
  planDay(s);
  if (day >= 3) log(s, `Day ${day + 1}. Developer bid: $${auctionBid(s).toLocaleString()}. Cash: $${Math.floor(s.cash).toLocaleString()}.`, 'info');
}

const MISERY_WARN = 12;
const MISERY_QUIT = 18;

const worstOff = (s: GameState): Crew =>
  [...s.crew].filter((c) => c.state !== 'away').sort((a, b) => Number(b.bedId < 0) - Number(a.bedId < 0) || a.energy - b.energy)[0] ?? s.crew[0];

function misery(s: GameState) {
  if (!s.crew.length) return;
  if (s.miserable < MISERY_WARN) {
    s.flags.packing = 0;
    return;
  }
  if (s.miserable < MISERY_QUIT) {
    if (!s.flags.packing) log(s, `${worstOff(s).name} is packing a bag. Turn the mood around or they're gone by morning.`, 'bad');
    s.flags.packing = 1;
    return;
  }
  if (s.crew.length === 1 && !s.flags.lastChance) {
    s.flags.lastChance = 1;
    pushModal(s, {
      title: 'Last One in the Ceiling',
      art: 'intro',
      body: `${s.crew[0].name} has their bag packed and one foot on the ladder. The bus station has heat. It has a vending machine.\n\nThen again, so does this place.`,
      choices: [{ label: 'Stay. Give it one more week.', action: 'laststand' }],
    });
    return;
  }
  crewLeaves(s, worstOff(s), 'The mood up here has been miserable for days. "I\'d rather sleep in the bus station."');
  s.miserable = 8;
  s.flags.packing = 0;
}

function heistAftermath(s: GameState) {
  if (s.flags.zalezHit !== 1) return;
  s.flags.zalezHit = 2;
  const ri = LAYOUT.roomIndex['zalez'];
  pa(s, 'Attention staff: Charm Diamond Centres will open late today. Police are on site.');
  raiseSuspicion(s, 15, 'Charm Diamond Centres reported a break-in');
  scheduleInspection(s, ri, 'sweep', 'Someone came through the ceiling at Charm.');
}

const PREMIUM_PER_DAY = [0, 0, 0, 250, 500];

function developerPressure(s: GameState) {
  const lvl = suspicionLevel(s.suspicion);
  if (!s.flags.auctionKnown || !PREMIUM_PER_DAY[lvl]) {
    s.flags.premiumWarned = 0;
    return;
  }
  s.bidPremium += PREMIUM_PER_DAY[lvl];
  if (s.flags.premiumWarned) return;
  s.flags.premiumWarned = 1;
  log(s, 'Prestige Lifestyle heard there are squatters in the ceiling. They raised their bid.', 'bad');
}

const names = (crew: Crew[]) => crew.map((c) => c.name).join(' and ');

function morningReport(s: GameState) {
  const reasons = Object.entries(s.tally.suspicion)
    .filter(([, t]) => t.amount >= 0.5)
    .sort((a, b) => b[1].amount - a[1].amount);
  const gained = reasons.reduce((a, [, t]) => a + t.amount, 0);
  const present = s.crew.filter((c) => c.state !== 'away');
  const hot = present.filter((c) => c.heat >= 60);
  const empty = present.filter((c) => c.energy < 20);
  const lines = [`Morning report: $${Math.round(s.todayIncome).toLocaleString()} came in yesterday.`];
  for (const [reason, t] of reasons.slice(0, 3)) lines.push(`${reason}${t.count > 1 ? `, ${t.count} times` : ''}.`);
  if (hot.length) lines.push(`Officer Dana keeps noticing ${names(hot)}.`);
  if (empty.length) lines.push(`${names(empty)} ${empty.length === 1 ? 'is' : 'are'} running on empty.`);
  log(s, lines.join(' '), gained >= 3 ? 'warn' : 'info');
  s.tally = { suspicion: {} };
}

function onHour(s: GameState) {
  const day = dayOf(s.time);
  const hour = Math.floor(minuteOfDay(s.time) / 60);
  hourlyMood(s);
  rollInspection(s);
  if (MEAL_HOURS.includes(hour)) serveMeal(s);
  runScript(s, day, hour);
  randomHourly(s, hour);
  if (hour === 8 && weekday(day) === 1) billReview(s);
  if (hour === 8 && weekday(day) === 5) billPreview(s);
  if (s.business.popupRoom >= 0 && phaseAt(s.time) === 'open') {
    const amt = Math.round(POPUP_WALK_INS * crowdNow(s));
    if (amt > 0) earn(s, amt);
  }
  skimRackets(s);
  const [m, dd] = md(day);
  if (m === 11 && dd === 26 && hour === 23 && s.todayIncome >= 1000) unlock(s, 'BLACK_FRIDAY');
}

function onPhase(s: GameState, next: Phase) {
  if (next === 'open') pa(s, 'Good morning, shoppers! Northgate Mall is now open.');
  if (next === 'closing') {
    pa(s, 'Attention shoppers: Northgate Mall is now closed. Please make your way to the nearest exit. Thank you for shopping with us!');
    for (const c of s.crew) if (c.layer === 0 && c.state !== 'away' && c.state !== 'fleeing') sendCrewHome(s, c, 'Shift over. Heading home');
  }
  if (next === 'night') {
    log(s, 'The lights dim. Gary starts his rounds.', 'info');
    if (s.crew.some((c) => c.nightJob !== 'rest')) s.flags.workedTonight = 1;
  }
}

function perMinute(s: GameState) {
  computeNoise(s);
  updateSmell(s, 1);
  complaints(s, 1);
  powerAccrual(s, 1);
  ebay(s, 1);
  ensureStaff(s);
  updateCrewDanger(s);
  updateMallItems(s);
  const m = Math.floor(s.time);
  if (m % 5 === 0) inspectionHotspotUpdate(s, noiseField, s.smell);
  if (phaseAt(s.time) === 'open') {
    const target = Math.round(crowdNow(s) * 34);
    const shoppers = s.npcs.filter((n) => n.kind === 'shopper').length;
    if (shoppers < target && rand.chance(0.6)) spawnShopper(s);
    if (shoppers < target - 8) spawnShopper(s);
  }
  for (const c of s.crew) idleBubble(s, c);
  checkObjectives(s);
}

function substep(s: GameState, dt: number) {
  const prev = s.time;
  s.time += dt;
  const prevPhase = phaseAt(prev);
  const phase = phaseAt(s.time);
  if (phase !== prevPhase) onPhase(s, phase);
  const dayKey = dayOf(s.time - 360);
  if (dayKey !== s.lastDay) {
    s.lastDay = dayKey;
    newDay(s);
  }
  if (Math.floor(prev / 60) !== Math.floor(s.time / 60)) onHour(s);
  if (Math.floor(prev) !== Math.floor(s.time)) perMinute(s);

  updateNpcs(s, dt, noiseField);
  for (const c of s.crew) {
    const before = agentNode(c);
    updateCrew(s, c, dt);
    coolHeat(c, dt);
    trackStaffDoors(s, c, before);
  }
  updateBandit(s, dt);
  detection(s, dt);

  for (const ins of s.inspections) if (ins.state === 'scheduled' && ins.at <= s.time) startInspector(s, ins.id);
  s.inspections = s.inspections.filter((i) => i.state !== 'done');

  if (s.suspicion >= 100 && !s.over) {
    unlock(s, 'EVICTED');
    s.over = {
      won: false,
      title: 'EVICTED',
      text: 'At 7 AM, eight police officers and Dale from Maintenance pulled down every ceiling tile in Northgate Mall.\n\nThey found the plywood. The extension cords. The lava lamp. The futon. A LiveJournal printout titled "my kingdom."\n\nYour crew is trespassed from the property for life. Somewhere above Spencer\'s, a lava lamp is still glowing.',
    };
  }
  if (!s.over && s.crew.length === 0) {
    s.over = { won: false, title: 'THE CEILING IS EMPTY', text: 'Nobody is left in the ceiling. The plywood creaks under nobody at all. Below, the muzak plays on.' };
  }
  if (!s.over && dayOf(s.time) > AUCTION_DAY) s.over = { won: false, title: 'TIME UP', text: 'The auction came and went.' };
}

export function tick(s: GameState, minutes: number) {
  let remaining = minutes;
  while (remaining > 0 && !s.over && s.modals.length === 0) {
    const dt = Math.min(0.5, remaining);
    substep(s, dt);
    remaining -= dt;
  }
  s.rng = rand.state;
}

export const buildCost = (s: GameState, type: BuildId, x: number, y: number) => (type === 'raccoon' && inBounds(x, y) ? decoyPrice(s, LAYOUT.roomAt[idx(x, y)]) : BUILD[type].cost);

export function placeObject(s: GameState, type: BuildId, x: number, y: number, flipped = false): string | null {
  const err = canPlace(s, type, x, y);
  if (err) return err;
  const { parts = 0 } = BUILD[type];
  const cost = buildCost(s, type, x, y);
  if (s.cash < cost) return 'Not enough cash';
  if (s.parts < parts) return `Needs ${parts} parts`;
  s.cash -= cost;
  s.parts -= parts;
  markDirty();
  if (type === 'deck') {
    s.deck[idx(x, y)] = 1;
    return null;
  }
  const nooksBefore = getDerived(s).nooks.length;
  const { id } = addObject(s, type, x, y, flipped && canRotate(type));
  const formed = getDerived(s).nooks.find((n) => n.members.some((m) => m.id === id));
  if (formed && getDerived(s).nooks.length > nooksBefore) {
    log(s, `${formed.def.name} is set up. ${formed.def.bonus}.`, 'good', { x, y, layer: 1 });
    sfx('good');
  }
  if (type === 'out_of_order' && onPatrolRoute(x + 0.5, y + 0.5)) log(s, "Security walks right past this camera. The bag won't last long.", 'warn', { x, y, layer: 0 });
  return null;
}

export function rotateObject(o: Placed) {
  if (canRotate(o.type)) o.flipped = !o.flipped;
}

export function moveObject(s: GameState, o: Placed, x: number, y: number): string | null {
  if (BUILD[o.type].floor) return 'Floor gear stays where it was set up';
  if (o.x === x && o.y === y) return null;
  const err = canPlace(s, o.type, x, y, o);
  if (err) return err;
  o.x = x;
  o.y = y;
  markDirty();
  return null;
}

export function demolishAt(s: GameState, x: number, y: number, layer: 0 | 1 = 1): string | null {
  const i = idx(x, y);
  const d = getDerived(s);
  const obj = (layer === 0 ? d.floorAt : d.objAt).get(i);
  if (obj) {
    s.objects = s.objects.filter((o) => o !== obj);
    s.cash += Math.floor(BUILD[obj.type].cost * 0.6);
    s.parts = Math.min(getDerived(s).partsCap, s.parts + Math.floor((BUILD[obj.type].parts ?? 0) / 2));
    for (const c of s.crew) if (c.bedId === obj.id) c.bedId = -1;
    markDirty();
    return null;
  }
  if (layer === 0) return 'Nothing to remove';
  if (s.deck[i]) {
    if (s.crew.some((c) => c.layer === 1 && Math.floor(c.x) === x && Math.floor(c.y) === y)) return 'Someone is standing there';
    s.deck[i] = 0;
    s.cash += 3;
    markDirty();
    return null;
  }
  return 'Nothing to remove';
}

export function deckCount(s: GameState) {
  let n = 0;
  for (let i = 0; i < W * H; i++) n += s.deck[i];
  return n;
}

export const KIOSK_COST = 500;
export const POPUP_COST = 1500;
export const POPUP_RENT = 90;
const POPUP_WALK_INS = 12;

export function popupWalkIns(s: GameState): number {
  const day = dayOf(s.time);
  const hours = mallHours(day);
  if (!hours) return 0;
  let total = 0;
  for (let h = Math.ceil(hours.open / 60); h < hours.close / 60; h++) total += Math.round(POPUP_WALK_INS * seasonFactor(day) * hourCurve(h * 60) * (0.5 + 0.6 * s.mallHealth));
  return total;
}
export function leaseKiosk(s: GameState): string | null {
  if (s.business.kiosk) return 'Already leased';
  if (s.cash < KIOSK_COST) return 'Not enough cash';
  s.cash -= KIOSK_COST;
  s.business.kiosk = true;
  log(s, 'You signed a kiosk lease under the name "Phone Charmz LLC". Ms. Pruitt shook your hand. She has no idea.', 'good');
  sfx('cash');
  return null;
}

export function popupName(s: GameState): string {
  const [m] = md(dayOf(s.time));
  return m === 10 ? 'Haunt Hut' : 'Calendar Castle';
}

export function openPopup(s: GameState, roomIdx: number): string | null {
  const rs = s.rooms[roomIdx];
  if (!rs.vacant || rs.popup) return 'That store is not available';
  if (s.cash < POPUP_COST) return 'Not enough cash';
  s.cash -= POPUP_COST;
  rs.popup = true;
  s.business.popupRoom = roomIdx;
  markDirty();
  log(s, `${popupName(s)} is now open in the old ${LAYOUT.rooms[roomIdx].name}. Nobody complains about a store's own ceiling.`, 'good');
  sfx('cash');
  return null;
}

export function buyFood(s: GameState, n: number): string | null {
  const d = getDerived(s);
  const room = Math.max(0, d.foodCap - s.food);
  const amt = Math.min(n, room, Math.floor(s.cash / FOOD_PRICE));
  if (amt <= 0) return room <= 0 ? 'Food storage full' : 'Not enough cash';
  s.cash -= amt * FOOD_PRICE;
  s.food += amt;
  return null;
}
