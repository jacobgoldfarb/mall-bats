import { ARCHETYPES, BUILD, COSTUMES, FIRST_NAMES, JOB, LOT, NOOK_SLEEP_SPEED, NOOK_TINKER_SPEED, isHomeJob, type JobId } from './defs';
import { LAYOUT, N, W, idx, inBounds } from './layout';
import { addSharedMood, stat, workMult } from './needs';
import { earn, levelOf, log, pressure, rand, raiseSuspicion, sfx, unlock } from './ops';
import type { Candidate, Carry, Crew, GameState, Look, Mover, Npc, Placed } from './state';
import { dayOf, phaseAt, seasonFactor, hourCurve, minuteOfDay, md } from './time';
import { ACCESS_CREW, besideTiles, blocksWalking, cameraWatching, crewDanger, findPath, getDerived, lineOfSight, markDirty, nodeOf, smoothCeilingPath } from './world';

const SKINS = ['#f2d0b1', '#e0b08a', '#c68e62', '#a06a42', '#7a4e2e', '#5a3820', '#f7dcc5'];
const BOTTOMS = ['#2f4a7a', '#3a5a8a', '#22304a', '#5a5a5a', '#c8b48a', '#1a1a1a', '#6a7a9a'];
const SHOES = ['#eee', '#222', '#6a4a2a', '#c84b3a', '#3a3a3a'];

export function makeLook(arch: (typeof ARCHETYPES)[number] | null): Look {
  const top = arch ? rand.pick(arch.look.top) : rand.pick(['#ff8fb8', '#8fd0ff', '#b0ff8f', '#ffe08a', '#c84b3a', '#3a6ac8', '#eeeeee', '#222', '#a24bff', '#2aa6a0', '#ff9e1b']);
  const hair = arch ? rand.pick(arch.look.hair) : rand.pick(['#3a2a1a', '#e8c87a', '#111', '#7a4a2a', '#b03a1a', '#ddd', '#5a4a3a']);
  const hat = arch ? arch.look.hat : rand.chance(0.2) ? rand.pick(['trucker', 'cap', 'beanie', 'visor']) : undefined;
  return {
    skin: rand.pick(SKINS),
    hair,
    hairStyle: rand.int(0, 4),
    top,
    bottom: rand.pick(BOTTOMS),
    shoes: rand.pick(SHOES),
    hat,
    hatColor: rand.pick(['#c84b3a', '#222', '#3a6ac8', '#e8e8e8', '#2aa6a0', '#ff4fa3']),
    build: rand.range(0.9, 1.1),
  };
}

export function makeCandidate(s: GameState, archetypeId?: string): Candidate {
  const pool = ARCHETYPES.filter((a) => !['drifter', 'santa', 'gary', 'grandma'].includes(a.id));
  const arch = archetypeId ? ARCHETYPES.find((a) => a.id === archetypeId)! : rand.pick(pool);
  const used = new Set(s.crew.map((c) => c.name));
  let name = rand.pick(FIRST_NAMES);
  for (let i = 0; i < 10 && used.has(name); i++) name = rand.pick(FIRST_NAMES);
  if (arch.id === 'grandma') name = rand.pick(['Doris', 'Mildred', 'Bev', 'Lorraine']);
  if (arch.id === 'santa') name = 'Big Lou';
  if (arch.id === 'gary') name = 'Gary';
  const jitter = (v: number) => Math.max(1, Math.min(5, v + (archetypeId ? 0 : rand.int(-1, 1))));
  return {
    name,
    archetype: arch.id,
    stealth: jitter(arch.stealth),
    charm: jitter(arch.charm),
    handy: jitter(arch.handy),
    traits: [...arch.traits],
    bio: rand.pick(arch.bios),
    look: makeLook(arch),
  };
}

export function addCrew(s: GameState, c: Candidate, at?: { x: number; y: number; layer: 0 | 1 }): Crew {
  const arch = ARCHETYPES.find((a) => a.id === c.archetype)!;
  const pos = at ?? { x: LAYOUT.hatch.x, y: LAYOUT.hatch.y, layer: 1 as const };
  const crew: Crew = {
    id: s.nextId++,
    x: pos.x + 0.5,
    y: pos.y + 0.5,
    layer: pos.layer,
    path: [],
    pathI: 0,
    goal: -1,
    facing: 0,
    look: c.look,
    moving: false,
    climb: 0,
    name: c.name,
    archetype: c.archetype,
    sprite: c.sprite,
    title: arch.title,
    bio: c.bio,
    stealth: c.stealth,
    charm: c.charm,
    handy: c.handy,
    traits: c.traits,
    energy: 75,
    heat: 0,
    dayJob: 'rest',
    nightJob: 'rest',
    activeJob: 'rest',
    jobCooldown: {},
    state: 'idle',
    timer: 0,
    workTimer: 0,
    useObj: -1,
    carrying: { cash: 0, food: 0, parts: 0, goods: 0 },
    detect: 0,
    bedId: -1,
    awayUntil: 0,
    joinedDay: dayOf(s.time),
    earned: 0,
    thought: 'Settling in',
    spottedBy: -1,
    waitUntil: 0,
    calledOff: '',
    hiding: false,
    replanAt: 0,
    camWait: 0,
  };
  s.crew.push(crew);
  s.stats.peakCrew = Math.max(s.stats.peakCrew, s.crew.length);
  if (s.crew.length >= 8) unlock(s, 'FULL_HOUSE');
  return crew;
}

export const has = (c: Crew, t: string) => c.traits.includes(t as never);

export const costumeOf = (c: Crew) => (c.costume ? COSTUMES[c.costume.id] : null);

export function crewSpeed(c: Crew): number {
  return 0.34 * (has(c, 'quick') ? 1.25 : 1) * (c.energy < 15 ? 0.75 : 1);
}

export function bedCapacity(s: GameState): number {
  return getDerived(s).beds.reduce((a, b) => a + b.slots, 0);
}

export function moveAgent(a: Mover, speed: number, dt: number): boolean {
  let remaining = dt;
  a.moving = false;
  if (a.climb > 0) {
    a.climb -= remaining;
    return false;
  }
  while (remaining > 0 && a.pathI < a.path.length) {
    const node = a.path[a.pathI];
    const layer = node >= N ? 1 : 0;
    const i = node % N;
    const tx = (i % W) + 0.5;
    const ty = Math.floor(i / W) + 0.5;
    if (layer !== a.layer) {
      a.layer = layer as 0 | 1;
      a.x = tx;
      a.y = ty;
      a.pathI++;
      a.climb = 3;
      return false;
    }
    const dx = tx - a.x;
    const dy = ty - a.y;
    const dist = Math.hypot(dx, dy);
    const step = speed * remaining;
    a.moving = true;
    if (dist > 0.001) a.facing = Math.atan2(dy, dx);
    if (step >= dist) {
      a.x = tx;
      a.y = ty;
      remaining -= dist / speed;
      a.pathI++;
    } else {
      a.x += (dx / dist) * step;
      a.y += (dy / dist) * step;
      remaining = 0;
    }
  }
  return a.pathI >= a.path.length;
}

export const agentNode = (a: Mover) => nodeOf(a.layer, Math.floor(a.x), Math.floor(a.y));

export function goTo(s: GameState, a: Mover, goals: number[] | ((n: number) => boolean), access = ACCESS_CREW): boolean {
  const path = findPath(s, agentNode(a), goals, access);
  if (!path) return false;
  a.path = smoothCeilingPath(s, path);
  a.pathI = 1;
  a.goal = path[path.length - 1];
  return true;
}

export function shiftNow(s: GameState): 'day' | 'night' | null {
  const p = phaseAt(s.time);
  return p === 'open' ? 'day' : p === 'night' ? 'night' : null;
}

export const shiftKey = (s: GameState) => `${dayOf(s.time - 360)}:${shiftNow(s)}`;

export function assignedJob(s: GameState, c: Crew): JobId {
  const sh = shiftNow(s);
  return sh === 'day' ? c.dayJob : sh === 'night' ? c.nightJob : 'rest';
}

export const TOO_TIRED = 'Too tired to work';
const TIRED_ENERGY = 10;
export const MAX_PER_SPOT = 2;

export function jobUnavailable(s: GameState, c: Crew, job: JobId): string | null {
  if (c.energy < TIRED_ENERGY) return TOO_TIRED;
  if (!isHomeJob(job) && c.waitUntil > s.time) return 'Lying low after being spotted';
  if ((c.jobCooldown[job] ?? 0) > s.time) return "Can't get there right now";
  return jobBlocked(s, c, job);
}

export function planJob(s: GameState, c: Crew): JobId {
  const job = assignedJob(s, c);
  if (c.calledOff === shiftKey(s) || job === 'rest' || jobUnavailable(s, c, job)) return 'rest';
  return job;
}

export function currentJob(s: GameState, c: Crew): JobId {
  const committed = (c.state === 'toWork' || c.state === 'working') && c.calledOff !== shiftKey(s) && c.activeJob === assignedJob(s, c);
  return committed ? c.activeJob : planJob(s, c);
}

const othersOn = (s: GameState, c: Crew, job: JobId) => s.crew.filter((o) => o !== c && o.activeJob === job && (o.state === 'working' || o.state === 'toWork')).length;

export const onlyToday = (s: GameState, job: JobId) => {
  const only = JOB[job].only;
  if (!only) return true;
  const [m, d] = md(dayOf(s.time));
  return m === only[0] && d === only[1];
};

const SCRAP_PARTS = 10;
const RIGGABLE_KWH = 0.5;

function homeObjectReady(s: GameState, job: JobId, o: Placed): boolean {
  if (job === 'rig') return o.tapRoom >= 0 && s.rooms[o.tapRoom].power > RIGGABLE_KWH;
  return true;
}

function homeObjects(s: GameState, c: Crew, job: JobId): Placed[] {
  const types = JOB[job].home!;
  return s.objects.filter((o) => types.includes(o.type) && o.powered && homeObjectReady(s, job, o) && !s.crew.some((x) => x !== c && x.useObj === o.id && x.state === 'working'));
}

function homeBlocked(s: GameState, c: Crew, job: JobId): string | null {
  const types = JOB[job].home!;
  const name = BUILD[types[0]].name;
  const built = s.objects.filter((o) => types.includes(o.type));
  if (!built.length) return `Needs a ${name}`;
  if (!built.some((o) => o.powered)) return `The ${name} has no power`;
  if (job === 'rig' && !built.some((o) => homeObjectReady(s, job, o))) return 'The meters already read low';
  if (!homeObjects(s, c, job).length) return `Every ${name} is in use`;
  return null;
}

export function jobBlocked(s: GameState, c: Crew, job: JobId): string | null {
  const def = JOB[job];
  if (levelOf(s) < def.level) return `Unlocks at Level ${def.level}`;
  if (!onlyToday(s, job)) return 'Only on Black Friday';
  if (def.spot && othersOn(s, c, job) >= MAX_PER_SPOT) return 'Two Bats are already on it';
  if (def.home) {
    const why = homeBlocked(s, c, job);
    if (why) return why;
  }
  const d = getDerived(s);
  const closed = (id: string) => s.rooms[LAYOUT.roomIndex[id]].vacant;
  switch (job) {
    case 'kiosk':
      if (!s.business.kiosk) return 'Lease the kiosk first (Work tab)';
      if (s.goods < 1) return 'No goods to sell';
      break;
    case 'popup':
      if (s.business.popupRoom < 0) return 'Open a pop-up first (Work tab)';
      if (s.goods < 1) return 'No goods to sell';
      break;
    case 'returns':
      if (s.goods < 1) return 'No goods to return';
      break;
    case 'tinker':
      if (s.parts < 2 * LOT) return `Needs ${2 * LOT} parts`;
      if (s.goods >= d.goodsCap) return 'Goods storage full';
      break;
    case 'scrap':
      if (s.parts < SCRAP_PARTS) return `Needs ${SCRAP_PARTS} parts`;
      break;
    case 'listings':
      if (s.goods < 1) return 'No goods to sell';
      break;
    case 'gary':
      if (s.gary.recruited) return 'Gary is one of us now';
      if (s.gary.insider) return "Gary's already on your side";
      if (s.food < 2) return 'Needs 2 food';
      if (s.flags.garyGiftDay === nightKey(s)) return 'Already left a gift tonight';
      break;
    case 'radiohut':
      if (closed('radiohut')) return 'The Source has closed';
      break;
    case 'arcade':
      if (closed('funzone')) return 'Galaxy has closed';
      break;
    case 'boundaries':
      if (closed('boundaries')) return 'Coles has closed';
      break;
    case 'zalez':
      if (closed('zalez')) return 'Charm has closed';
      if ((s.pools.zalez ?? 0) <= 0) return 'Already cleaned out';
      if (!s.objects.some((o) => o.type === 'rope' && LAYOUT.roomAt[idx(o.x, o.y)] === LAYOUT.roomIndex['zalez'])) return 'Needs a Rope Drop into Charm';
      break;
  }
  const pool = POOL_OF[job];
  if (pool && (s.pools[pool] ?? 0) <= 0) return 'Picked clean for today';
  return null;
}

export const POOL_OF: Partial<Record<JobId, string>> = {
  fountain: 'fountain',
  dumpster: 'dumpster',
  vending: 'vending',
  arcade: 'arcade',
  radiohut: 'radiohut',
  pallets: 'pallets',
  lostfound: 'lostfound',
  samples: 'samples',
  stockroom: 'stockroom',
};

const nightKey = (s: GameState) => dayOf(s.time - 360);

const touching = (c: Crew, o: Placed) => Math.max(Math.abs(Math.floor(c.x) - o.x), Math.abs(Math.floor(c.y) - o.y)) <= 1;

function faceObject(c: Crew, o: Placed) {
  c.facing = Math.atan2(o.y + 0.5 - c.y, o.x + 0.5 - c.x);
}

export function useSpots(s: GameState, o: Placed): number[] {
  return BUILD[o.type].seat ? [nodeOf(1, o.x, o.y)] : besideTiles(s, o);
}

export function jobTarget(s: GameState, c: Crew, job: JobId): number[] | null {
  const def = JOB[job];
  if (def.home) {
    const spots = homeObjects(s, c, job).flatMap((o) => besideTiles(s, o));
    return spots.length ? spots : null;
  }
  if (job === 'popup') {
    const r = LAYOUT.rooms[s.business.popupRoom];
    return spreadOut(s, c, job, Math.floor((r.x0 + r.x1) / 2), Math.floor((r.y0 + r.y1) / 2));
  }
  const spot = LAYOUT.spots[def.spot!];
  return spreadOut(s, c, job, spot.x, spot.y);
}

function spreadOut(s: GameState, c: Crew, job: JobId, x: number, y: number): number[] {
  const taken = new Set(s.crew.filter((o) => o !== c && o.activeJob === job && (o.state === 'working' || o.state === 'toWork')).map((o) => o.goal));
  const spot = nodeOf(0, x, y);
  if (!taken.has(spot)) return [spot];
  const around: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(x + dx, y + dy) && !taken.has(nodeOf(0, x + dx, y + dy))) around.push(nodeOf(0, x + dx, y + dy));
  return around.length ? around : [spot];
}

export function crowdNow(s: GameState): number {
  if (phaseAt(s.time) !== 'open') return 0;
  return seasonFactor(dayOf(s.time)) * hourCurve(minuteOfDay(s.time)) * (0.5 + 0.6 * s.mallHealth);
}

const resumeThoughts = new WeakMap<Crew, string>();

function setThought(c: Crew, t: string) {
  resumeThoughts.delete(c);
  c.thought = t;
}

function waitThought(c: Crew, t: string) {
  if (!resumeThoughts.has(c)) resumeThoughts.set(c, c.thought);
  c.thought = t;
}

function resumeThought(c: Crew) {
  const t = resumeThoughts.get(c);
  if (t === undefined) return;
  c.thought = t;
  resumeThoughts.delete(c);
}

const HAUL_KINDS = ['cash', 'food', 'parts', 'goods'] as const;

function haulBubble(s: GameState, c: Crew, before: Carry) {
  if ((c.bubble?.until ?? 0) > s.time + 7) return;
  const gained = HAUL_KINDS.map((k) => [k, c.carrying[k] - before[k]] as const).filter(([, n]) => n > 0);
  if (gained.length) c.bubble = { text: gained.map(([k, n]) => (k === 'cash' ? `+$${n}` : `+${n} ${k}`)).join(' '), until: s.time + 8, tone: 'happy' };
}

function faceNearbyFixture(c: Crew) {
  let best: { x: number; y: number } | null = null;
  let bestD = 2.6;
  for (const f of LAYOUT.fixtures) {
    const fx = f.x + f.w / 2;
    const fy = f.y + f.d / 2;
    const d = Math.hypot(Math.max(0, Math.abs(fx - c.x) - f.w / 2), Math.max(0, Math.abs(fy - c.y) - f.d / 2));
    if (d < bestD) {
      bestD = d;
      best = { x: fx, y: fy };
    }
  }
  if (best) c.facing = Math.atan2(best.y - c.y, best.x - c.x);
}

function deposit(s: GameState, c: Crew) {
  const d = getDerived(s);
  const k = c.carrying;
  if (!k.cash && !k.food && !k.parts && !k.goods) return;
  const parts: string[] = [];
  if (k.cash) {
    earn(s, k.cash);
    c.earned += k.cash;
    parts.push(`$${k.cash.toFixed(0)}`);
  }
  const room = (cur: number, cap: number, add: number) => Math.max(0, Math.min(add, cap - cur));
  const food = room(s.food, d.foodCap, k.food);
  const partsIn = room(s.parts, d.partsCap, k.parts);
  const goods = room(s.goods, d.goodsCap, k.goods);
  s.food += food;
  s.parts += partsIn;
  s.goods += goods;
  if (k.food) parts.push(`${k.food} food`);
  if (k.parts) parts.push(`${k.parts} parts`);
  if (k.goods) parts.push(`${k.goods} goods`);
  const lost = k.food - food + (k.parts - partsIn) + (k.goods - goods);
  log(s, `${c.name} brought home ${parts.join(', ')}${lost ? ` (${lost} wasted: stash full)` : ''}.`, 'good', { x: Math.floor(c.x), y: Math.floor(c.y), layer: 1 });
  sfx(k.cash ? 'cash' : 'coin');
  c.carrying = { cash: 0, food: 0, parts: 0, goods: 0 };
  s.flags.firstHaul = 1;
  unlock(s, 'FIRST_NIGHT');
}

function doCycle(s: GameState, c: Crew, job: JobId): boolean {
  const k = c.carrying;
  const take = (pool: string, want: number) => {
    const got = Math.min(s.pools[pool] ?? 0, want);
    s.pools[pool] = (s.pools[pool] ?? 0) - got;
    return got;
  };
  const stealthy = 1.3 - stat(s, c, 'stealth') * 0.15;
  const shrinkage = (roomId: string, amt: number) => raiseSuspicion(s, amt * stealthy, `${LAYOUT.rooms[LAYOUT.roomIndex[roomId]].name} reported missing stock`);
  const crowd = crowdNow(s);
  const [m, d] = md(dayOf(s.time));
  const blackFriday = m === 11 && d === 26;
  const boxingDay = m === 12 && d === 26;
  switch (job) {
    case 'fountain': {
      const got = Math.round(take('fountain', (2.5 + stat(s, c, 'handy') * 1.2) * rand.range(0.7, 1.3)));
      k.cash += got;
      s.stats.fountainCash += got;
      if (s.stats.fountainCash >= 100) unlock(s, 'WISHING_WELL');
      if (got) c.bubble = { text: `+$${got}`, until: s.time + 8, tone: 'happy' };
      sfx('coin');
      return got > 0;
    }
    case 'dumpster': {
      const got = take('dumpster', rand.int(2, 4));
      k.food += got;
      if (rand.chance(0.12)) k.parts += 5;
      return got > 0;
    }
    case 'vending': {
      k.food += take('vending', 2);
      k.cash += rand.int(0, 3);
      return (s.pools.vending ?? 0) > 0;
    }
    case 'arcade': {
      const got = Math.round(take('arcade', (4 + stat(s, c, 'handy') * 2.2) * rand.range(0.8, 1.2)));
      k.cash += got;
      shrinkage('funzone', 0.1);
      if (got) c.bubble = { text: `+$${got}`, until: s.time + 8, tone: 'happy' };
      sfx('coin');
      return got > 0;
    }
    case 'radiohut': {
      const got = take('radiohut', stat(s, c, 'handy') >= 4 ? 10 : 5);
      k.parts += got;
      shrinkage('radiohut', 0.048 * got);
      return got > 0;
    }
    case 'pallets': {
      k.parts += take('pallets', rand.int(5, 10));
      return (s.pools.pallets ?? 0) > 0;
    }
    case 'stockroom': {
      const got = take('stockroom', 5);
      if (rand.chance(0.2)) k.goods += got;
      else k.parts += got;
      if (got) raiseSuspicion(s, 0.08 * stealthy, 'Stockroom counts are off');
      return (s.pools.stockroom ?? 0) > 0;
    }
    case 'lostfound': {
      take('lostfound', 1);
      const r = rand.next();
      if (r < 0.4) k.goods += 5;
      else if (r < 0.7) k.cash += rand.int(20, 90);
      else if (r < 0.85) k.parts += 10;
      raiseSuspicion(s, 0.55, 'Lost & Found items missing');
      return (s.pools.lostfound ?? 0) > 0;
    }
    case 'gary': {
      if (s.food < 2) return false;
      s.food -= 2;
      s.gary.affinity = Math.min(100, s.gary.affinity + 6 + stat(s, c, 'charm') * 2);
      s.flags.garyGiftDay = nightKey(s);
      log(s, `${c.name} left a sleeve of NY Fries outside the Security Office. Gary's goodwill: ${s.gary.affinity.toFixed(0)}/100.`, 'good');
      return false;
    }
    case 'busk': {
      const got = Math.round((1 + stat(s, c, 'charm')) * Math.min(1.6, crowd) * (has(c, 'performer') ? 1.6 : 1) * (costumeOf(c)?.busk ?? 1) * rand.range(0.6, 1.4));
      k.cash += got;
      if (got) c.bubble = { text: `+$${got}`, until: s.time + 8, tone: 'happy' };
      return true;
    }
    case 'samples': {
      const got = take('samples', 2);
      k.food += got;
      return got > 0;
    }
    case 'boundaries': {
      addSharedMood(s, 5);
      return true;
    }
    case 'returns': {
      if (s.goods < 1) return false;
      const lot = Math.min(LOT, s.goods);
      s.goods -= lot;
      const pro = has(c, 'returnspro');
      const got = Math.round(rand.range(50, 80) * (lot / LOT) * (pro ? 1.4 : 1) * (boxingDay ? 1.8 : 1));
      k.cash += got;
      addHeat(c, pro ? 4 : 8);
      c.bubble = { text: `+$${got}`, until: s.time + 8, tone: 'happy' };
      return s.goods > 0;
    }
    case 'kiosk':
    case 'popup': {
      if (s.goods < 1) return false;
      const chance = (job === 'kiosk' ? 0.3 : 0.42) + stat(s, c, 'charm') * 0.08;
      const attempts = (job === 'popup' ? 2 : 1) * (blackFriday ? 2 : 1);
      for (let i = 0; i < attempts && s.goods > 0; i++) {
        if (rand.chance(Math.min(0.95, chance * Math.min(1.5, crowd) * (has(c, 'salesman') ? 1.5 : 1)))) {
          const lot = Math.min(LOT, s.goods);
          s.goods -= lot;
          const price = Math.round((job === 'kiosk' ? rand.range(40, 60) : rand.range(58, 84)) * (lot / LOT) * (blackFriday ? 1.3 : 1));
          k.cash += price;
          c.bubble = { text: `SOLD $${price}`, until: s.time + 8, tone: 'happy' };
          sfx('cash');
        }
      }
      c.heat = Math.max(0, c.heat - 3);
      return s.goods > 0;
    }
    case 'tinker': {
      const d2 = getDerived(s);
      if (s.parts < 2 * LOT || s.goods >= d2.goodsCap) return false;
      s.parts -= 2 * LOT;
      s.goods += LOT;
      s.stats.goodsCrafted += LOT;
      c.bubble = { text: `+${LOT} goods`, until: s.time + 8, tone: 'happy' };
      return s.parts >= 2 * LOT && s.goods < d2.goodsCap;
    }
    case 'scrap': {
      if (s.parts < SCRAP_PARTS) return false;
      s.parts -= SCRAP_PARTS;
      const got = 6 + stat(s, c, 'handy') * 2;
      earn(s, got);
      c.earned += got;
      c.bubble = { text: `+$${got}`, until: s.time + 8, tone: 'happy' };
      return s.parts >= SCRAP_PARTS;
    }
    case 'rig': {
      const splice = s.objects.find((o) => o.id === c.useObj);
      if (!splice || splice.tapRoom < 0) return false;
      const rs = s.rooms[splice.tapRoom];
      rs.power = Math.max(0, rs.power - (0.6 + stat(s, c, 'handy') * 0.3));
      c.bubble = { text: 'meter ↓', until: s.time + 8, tone: 'happy' };
      return rs.power > RIGGABLE_KWH;
    }
    case 'listings': {
      if (s.goods < 1) return false;
      const lot = Math.min(LOT, s.goods);
      s.goods -= lot;
      const got = Math.round(rand.range(30, 54) * (lot / LOT) * (0.7 + stat(s, c, 'charm') * 0.1));
      earn(s, got);
      c.earned += got;
      s.stats.ebaySold += lot;
      if (s.stats.ebaySold >= 50) unlock(s, 'POWERSELLER');
      c.bubble = { text: `+$${got}`, until: s.time + 8, tone: 'happy' };
      sfx('cash');
      return s.goods > 0;
    }
    case 'doorbuster': {
      const got = Math.round((3 + stat(s, c, 'charm') * 2) * rand.range(0.7, 1.3));
      k.cash += got;
      c.bubble = { text: `+$${got}`, until: s.time + 8, tone: 'happy' };
      return true;
    }
    case 'zalez': {
      take('zalez', 1);
      const got = Math.round((1600 + stat(s, c, 'stealth') * 250) * rand.range(0.9, 1.1));
      k.cash += got;
      k.goods += 10;
      s.flags.zalezHit = 1;
      c.bubble = { text: `+$${got}`, until: s.time + 10, tone: 'happy' };
      log(s, `${c.name} emptied a display case at Charm Diamond Centres. Now get out.`, 'good', { x: Math.floor(c.x), y: Math.floor(c.y), layer: 0 });
      sfx('cash');
      return false;
    }
  }
  return false;
}

export function baseCycle(s: GameState, c: Crew, job: JobId): number {
  let len = JOB[job].cycle;
  if (job === 'tinker') len = len / (0.6 + stat(s, c, 'handy') * 0.2) / (has(c, 'gearhead') ? 1.5 : 1) / (getDerived(s).nookOf.get(c.useObj) === 'workshop' ? NOOK_TINKER_SPEED : 1);
  return len / workMult(s);
}

function cycleLength(s: GameState, c: Crew, job: JobId): number {
  return baseCycle(s, c, job) * rand.range(0.85, 1.15);
}

let zoneState: GameState | null = null;

export function escapeGoals(n: number) {
  return n >= N && !(zoneState && inActiveZone(zoneState, (n - N) % W, Math.floor((n - N) / W)));
}

export function sendCrewHome(s: GameState, c: Crew, thought = 'Heading home') {
  if (c.layer === 1) {
    c.state = 'idle';
    return;
  }
  zoneState = s;
  if (goTo(s, c, escapeGoals) || goTo(s, c, (n: number) => n >= N)) {
    c.state = 'toHome';
    setThought(c, thought);
  } else {
    c.state = 'idle';
  }
}

function pickBed(s: GameState, c: Crew): number | null {
  const d = getDerived(s);
  const taken = new Map<number, number>();
  for (const o of s.crew) if (o !== c && o.bedId >= 0) taken.set(o.bedId, (taken.get(o.bedId) ?? 0) + 1);
  if (c.bedId >= 0 && d.beds.some((b) => b.obj.id === c.bedId)) {
    const b = d.beds.find((b) => b.obj.id === c.bedId)!;
    return nodeOf(1, b.obj.x, b.obj.y);
  }
  for (const b of d.beds) {
    if ((taken.get(b.obj.id) ?? 0) < b.slots) {
      c.bedId = b.obj.id;
      return nodeOf(1, b.obj.x, b.obj.y);
    }
  }
  c.bedId = -1;
  return null;
}

const isObstacle = (d: ReturnType<typeof getDerived>, i: number) => {
  const o = d.objAt.get(i);
  return !!o && blocksWalking(o);
};

function randomDeck(s: GameState, near?: { x: number; y: number }): number | null {
  const d = getDerived(s);
  const tiles: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!s.deck[i] || isObstacle(d, i)) continue;
    if (near && Math.hypot((i % W) - near.x, Math.floor(i / W) - near.y) > 4) continue;
    tiles.push(i);
  }
  if (!tiles.length) return null;
  return N + rand.pick(tiles);
}

function inActiveZone(s: GameState, x: number, y: number): boolean {
  return s.inspections.some((ins) => (ins.state === 'walking' || ins.state === 'climbing') && Math.max(Math.abs(ins.x - x), Math.abs(ins.y - y)) <= ins.radius);
}

function decide(s: GameState, c: Crew) {
  const job = planJob(s, c);
  const canWork = job !== 'rest';
  const phase = phaseAt(s.time);

  if (c.layer === 0) {
    if (canWork) startWork(s, c, job);
    else {
      const assigned = assignedJob(s, c);
      const why = assigned !== 'rest' && jobUnavailable(s, c, assigned);
      sendCrewHome(s, c, why ? `Heading home. ${why}` : 'Heading home');
    }
    return;
  }
  if (c.energy > ERRAND_MIN_ENERGY && startErrand(s, c)) return;
  if (canWork) return startWork(s, c, job);
  if (assignedJob(s, c) !== 'rest' && c.calledOff !== shiftKey(s) && jobUnavailable(s, c, assignedJob(s, c)) === TOO_TIRED) {
    c.calledOff = shiftKey(s);
    if (!s.flags[`tired_${c.id}`]) log(s, `${c.name} is too tired to go out. They're sleeping this shift off.`, 'warn', { x: Math.floor(c.x), y: Math.floor(c.y), layer: 1 });
    s.flags[`tired_${c.id}`] = 1;
  }
  const sleepy = c.energy < 40 || (phase === 'night' && c.energy < 92) || (phase !== 'open' && c.energy < 70);
  if (sleepy) return startSleep(s, c);
  startLeisure(s, c);
  const assigned = assignedJob(s, c);
  const why = assigned !== 'rest' && jobUnavailable(s, c, assigned);
  if (why) setThought(c, `${JOB[assigned].name}: ${why.toLowerCase()}`);
}

const ERRAND_MIN_ENERGY = 15;
const ERRAND_MINUTES = 6;

const onErrand = (c: Crew) => c.state === 'toErrand' || c.state === 'errand';

export const pendingErrands = (s: GameState) => s.objects.filter((o) => BUILD[o.type].floor && !o.delivered);

function startErrand(s: GameState, c: Crew): boolean {
  const o = pendingErrands(s).find((p) => !s.crew.some((x) => x.useObj === p.id && onErrand(x)));
  if (!o || !goTo(s, c, [nodeOf(0, o.x, o.y)])) return false;
  c.useObj = o.id;
  c.state = 'toErrand';
  setThought(c, `Carrying a ${BUILD[o.type].name} down`);
  return true;
}

function finishErrand(s: GameState, c: Crew) {
  const o = s.objects.find((x) => x.id === c.useObj);
  c.useObj = -1;
  if (o) {
    const def = BUILD[o.type];
    o.delivered = true;
    if (def.lastsDays) o.expires = s.time + def.lastsDays * 1440;
    markDirty();
    log(s, `${c.name} set up the ${def.name}.`, 'good', { x: o.x, y: o.y, layer: 0 });
  }
  sendCrewHome(s, c, 'Errand done. Heading home');
}

function startWork(s: GameState, c: Crew, job: JobId) {
  const targets = jobTarget(s, c, job);
  if (!targets || !goTo(s, c, targets)) {
    c.jobCooldown[job] = s.time + 45;
    setThought(c, `Can't reach ${JOB[job].name}`);
    c.state = 'idle';
    c.timer = 2;
    return;
  }
  c.activeJob = job;
  c.state = 'toWork';
  setThought(c, `Off to ${JOB[job].name}`);
}

function startSleep(s: GameState, c: Crew) {
  const bed = pickBed(s, c);
  const target = bed ?? randomDeck(s, LAYOUT.hatch);
  if (target !== null && goTo(s, c, [target])) {
    c.state = 'toBed';
    const salute = s.objects.some((o) => o.type === 'hotdog') ? 'Saluting the hot dog. ' : '';
    setThought(c, bed ? `${salute}Going to bed` : `${salute}No bed. Sleeping on plywood`);
    return;
  }
  c.state = 'sleeping';
  setThought(c, 'Sleeping');
}

function startLeisure(s: GameState, c: Crew) {
  const d = getDerived(s);
  const options = d.leisure.filter((o) => !s.crew.some((x) => x !== c && x.useObj === o.id && (x.state === 'leisure' || x.state === 'toLeisure')));
  if (options.length && rand.chance(0.75)) {
    const o = rand.pick(options);
    const spots = useSpots(s, o);
    if (spots.length && goTo(s, c, spots)) {
      c.useObj = o.id;
      c.state = 'toLeisure';
      setThought(c, BUILD[o.type].hangout!);
      return;
    }
  }
  const stroll = strollTarget(s, c);
  if (stroll && goTo(s, c, [stroll.node])) {
    c.useObj = -1;
    c.state = 'toLeisure';
    setThought(c, stroll.thought);
    return;
  }
  c.state = 'leisure';
  c.timer = 30;
  setThought(c, rand.pick(IDLE_THOUGHTS));
}

const STROLL_RADIUS = 5;
const HANGOUT_RADIUS = 1.6;
const IDLE_THOUGHTS = ['Pacing the plywood', 'Writing in a LiveJournal', 'Listening to the muzak below', 'Counting ceiling tiles', 'Playing Snake on a Nokia'];

const lounging = (c: Crew) => c.layer === 1 && c.state === 'leisure';

function strollTarget(s: GameState, c: Crew): { node: number; thought: string } | null {
  const pals = s.crew.filter((x) => x !== c && lounging(x) && Math.hypot(x.x - c.x, x.y - c.y) < STROLL_RADIUS * 2);
  if (pals.length && rand.chance(0.45)) {
    const pal = rand.pick(pals);
    const spot = openDeckNear(s, c, pal.x, pal.y, HANGOUT_RADIUS, 0.9);
    if (spot !== null) return { node: spot, thought: `Hanging out with ${pal.name}` };
  }
  const spot = openDeckNear(s, c, c.x, c.y, STROLL_RADIUS, 1.5);
  return spot === null ? null : { node: spot, thought: rand.pick(IDLE_THOUGHTS) };
}

function openDeckNear(s: GameState, c: Crew, x: number, y: number, maxR: number, minR: number): number | null {
  const taken = new Set(s.crew.filter((o) => o !== c).flatMap((o) => [o.goal, agentNode(o)]));
  const derived = getDerived(s);
  const tiles: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!s.deck[i] || taken.has(N + i) || isObstacle(derived, i)) continue;
    const d = Math.hypot((i % W) + 0.5 - x, Math.floor(i / W) + 0.5 - y);
    if (d >= minR && d <= maxR) tiles.push(N + i);
  }
  return tiles.length ? rand.pick(tiles) : null;
}

function faceNearestPal(s: GameState, c: Crew) {
  const pal = s.crew.find((x) => x !== c && x.layer === 1 && x.state !== 'away' && Math.hypot(x.x - c.x, x.y - c.y) <= HANGOUT_RADIUS + 0.5);
  if (pal) c.facing = Math.atan2(pal.y - c.y, pal.x - c.x);
}

const STROLL_PACE = 0.65;
const DUCK_PACE = 1.35;
const strideOf = (c: Crew) => 0.92 + ((c.id * 37) % 17) / 100;
const paceOf = (c: Crew) => crewSpeed(c) * strideOf(c) * (c.state === 'toLeisure' ? STROLL_PACE : c.state === 'ducking' ? DUCK_PACE : 1);

const COVER_RADIUS = 6;
const COVER_GAP = 5;
const MAX_COVER_WAIT = 40;
const DUCK_MEMORY = 45;
const lastDuck = new WeakMap<Crew, number>();

const watcherName = (n: Npc) => (n.kind === 'janitor' ? 'the janitor' : n.name);

function duck(s: GameState, c: Crew, from: Npc): boolean {
  if (s.time - (lastDuck.get(c) ?? -Infinity) < DUCK_MEMORY) return false;
  const cover = (n: number) => {
    if (n >= N || crewDanger[n] > 0) return false;
    const x = (n % W) + 0.5;
    const y = Math.floor(n / W) + 0.5;
    return Math.hypot(x - c.x, y - c.y) <= COVER_RADIUS && Math.hypot(x - from.x, y - from.y) >= COVER_GAP && !lineOfSight(from.x, from.y, x, y);
  };
  if (!goTo(s, c, cover)) return false;
  lastDuck.set(c, s.time);
  c.state = 'ducking';
  c.hiding = false;
  setThought(c, `Ducking out of ${watcherName(from)}'s sight`);
  c.bubble = { text: '!', until: s.time + 5, tone: 'alert' };
  return true;
}

const watcherWithin = (s: GameState, c: Crew, r: number) =>
  s.npcs.some((n) => (n.kind === 'guard' || n.kind === 'janitor') && n.state !== 'asleep' && n.state !== 'offduty' && Math.hypot(n.x - c.x, n.y - c.y) < r);

export function updateCrew(s: GameState, c: Crew, dt: number) {
  if (c.state === 'away') {
    if (s.time >= c.awayUntil) {
      c.state = 'idle';
      c.layer = 1;
      c.x = LAYOUT.hatch.x + 0.5;
      c.y = LAYOUT.hatch.y + 0.5;
      c.path = [];
      c.detect = 0;
      log(s, `${c.name} is back from county lockup, climbing up the ladder.`, 'info');
    }
    return;
  }
  const phase = phaseAt(s.time);
  const night = phase === 'night';
  const working = c.state === 'working' || c.state === 'toWork';
  if (c.state === 'sleeping') {
    const bedBonus = c.bedId < 0 ? 7 : getDerived(s).nookOf.get(c.bedId) === 'bunkroom' ? 14 * NOOK_SLEEP_SPEED : 14;
    c.energy = Math.min(100, c.energy + (bedBonus * (has(c, 'lightsleeper') ? 1.3 : 1) * dt) / 60);
  } else {
    let drain = working ? 6 : 4.2;
    if (night && has(c, 'nightowl')) drain *= 0.6;
    if (!night && has(c, 'earlybird')) drain *= 0.6;
    c.energy = Math.max(0, c.energy - (drain * dt) / 60);
  }
  if (s.missedMeals > 0) c.energy = Math.max(0, c.energy - (3 * dt) / 60);

  const prevLayer = c.layer;
  if (c.state === 'fleeing') {
    const arrived = moveAgent(c, 0.58 * (has(c, 'quick') ? 1.2 : 1), dt);
    if (prevLayer === 0 && c.layer === 1) {
      escaped(s, c);
      return;
    }
    if (arrived && c.layer === 0) startFlee(s, c);
    return;
  }

  if (c.layer === 1 && c.state !== 'evacuating' && c.state !== 'toHome' && inActiveZone(s, Math.floor(c.x), Math.floor(c.y))) {
    const safe = (n: number) => n >= N && !inActiveZone(s, (n - N) % W, Math.floor((n - N) / W));
    if (goTo(s, c, safe)) {
      c.state = 'evacuating';
      setThought(c, 'Inspector coming. Clearing out!');
    }
  }

  if (c.layer === 0 && c.climb <= 0) {
    const ducking = c.state === 'ducking';
    if (c.detect > 0.22 && !(ducking && c.detect <= 0.75)) {
      const source = s.npcs.find((n) => n.id === c.spottedBy);
      const close = !!source && Math.hypot(source.x - c.x, source.y - c.y) < 4.5;
      if (close && c.detect <= 0.75 && c.state !== 'toHome' && duck(s, c, source)) return;
      if (close || c.detect > 0.75) {
        c.hiding = false;
        if (c.state !== 'toHome') {
          c.waitUntil = s.time + 50;
          c.useObj = -1;
          c.bubble = { text: '!?', until: s.time + 8, tone: 'alert' };
          sendCrewHome(s, c, source ? `${source.name} is coming. Backing off` : 'Too exposed. Backing off');
        }
        moveAgent(c, crewSpeed(c) * 1.3, dt);
        if ((c.layer as number) === 1) {
          deposit(s, c);
          c.state = 'idle';
        }
        return;
      }
      if (!c.hiding) {
        c.hiding = true;
        waitThought(c, 'Hiding. Holding breath.');
        c.bubble = { text: '...', until: s.time + 6 };
      }
      c.moving = false;
      return;
    }
    if (c.hiding && c.state !== 'idle') {
      if (c.detect > 0.04) {
        c.moving = false;
        return;
      }
      c.hiding = false;
      resumeThought(c);
    }
  } else c.hiding = false;

  const moving = ['toWork', 'toHome', 'toBed', 'toLeisure', 'toErrand', 'evacuating', 'ducking'].includes(c.state);
  if (moving) {
    const next = c.path[c.pathI];
    if (c.layer === 1 && next !== undefined && next < N && c.climb <= 0) {
      const watcher = watcherNear(s, next % W, Math.floor(next / W));
      if (watcher) {
        waitThought(c, `Waiting for ${watcher} to pass`);
        c.moving = false;
        if (c.state === 'toWork' && currentJob(s, c) !== c.activeJob) decide(s, c);
        return;
      }
    }
    if (c.layer === 0 && next !== undefined && next < N && phaseAt(s.time) !== 'open' && c.climb <= 0 && c.state !== 'ducking') {
      const nx = (next % W) + 0.5;
      const ny = Math.floor(next / W) + 0.5;
      const here = crewDanger[idx(Math.floor(c.x), Math.floor(c.y))];
      if (s.time >= c.replanAt && c.state !== 'evacuating') {
        c.replanAt = s.time + REPLAN_MINUTES;
        if (c.path.slice(c.pathI, c.pathI + LOOKAHEAD).some((n) => n < N && crewDanger[n] > 0) && c.goal >= 0) goTo(s, c, [c.goal]);
      }
      if (crewDanger[next] >= GUARD_WAIT_DANGER && here < GUARD_WAIT_DANGER / 2 && c.camWait < MAX_WAIT) {
        c.camWait += dt;
        c.moving = false;
        waitThought(c, 'Waiting for the guard to look away');
        return;
      }
      if (cameraWatching(s, nx, ny) && !cameraWatching(s, c.x, c.y) && c.camWait < 25) {
        c.camWait += dt;
        c.moving = false;
        waitThought(c, 'Timing the camera sweep');
        return;
      }
    }
    if (c.camWait > 0 && c.moving !== false) c.camWait = Math.max(0, c.camWait - dt * 0.5);
    const arrived = moveAgent(c, paceOf(c), dt);
    if (c.moving) {
      c.camWait = Math.max(0, c.camWait - dt);
      resumeThought(c);
    }
    if (prevLayer === 0 && c.layer === 1) deposit(s, c);
    if (!arrived) {
      c.timer += dt;
      if (c.timer > 30) {
        c.timer = 0;
        if (c.state === 'toWork' && currentJob(s, c) !== c.activeJob) return decide(s, c);
        if (c.goal >= 0 && !goTo(s, c, [c.goal])) {
          c.state = 'idle';
          c.path = [];
        }
      }
      return;
    }
    c.timer = 0;
    switch (c.state) {
      case 'toWork': {
        const job = currentJob(s, c);
        if (job !== c.activeJob || jobBlocked(s, c, job)) return decide(s, c);
        c.state = 'working';
        c.workTimer = cycleLength(s, c, job);
        if (isHomeJob(job)) {
          const station = homeObjects(s, c, job).find((o) => touching(c, o));
          c.useObj = station?.id ?? -1;
          if (station) faceObject(c, station);
        } else if (c.layer === 0) faceNearbyFixture(c);
        setThought(c, JOB[job].name);
        return;
      }
      case 'ducking':
        c.state = 'idle';
        c.hiding = true;
        c.timer = rand.range(5, 10);
        setThought(c, 'Hiding until the coast is clear');
        return;
      case 'toHome':
      case 'evacuating':
        c.state = 'idle';
        return decide(s, c);
      case 'toBed':
        c.state = 'sleeping';
        setThought(c, c.bedId >= 0 ? 'Sleeping' : 'Sleeping on plywood');
        return;
      case 'toLeisure':
        c.state = 'leisure';
        if (c.useObj >= 0) {
          c.timer = rand.range(40, 90);
          const o = s.objects.find((x) => x.id === c.useObj);
          if (o && !BUILD[o.type].seat) faceObject(c, o);
        } else {
          c.timer = rand.range(12, 35);
          faceNearestPal(s, c);
        }
        return;
      case 'toErrand': {
        const o = s.objects.find((x) => x.id === c.useObj);
        if (!o) return sendCrewHome(s, c, 'Errand cancelled. Heading home');
        c.state = 'errand';
        c.timer = ERRAND_MINUTES;
        setThought(c, `Setting up the ${BUILD[o.type].name}`);
        return;
      }
    }
    return;
  }

  c.moving = false;
  switch (c.state) {
    case 'working': {
      const job = currentJob(s, c);
      if (job !== c.activeJob) {
        c.useObj = -1;
        return c.layer === 0 && job === 'rest' ? sendCrewHome(s, c, 'Shift over. Heading home') : decide(s, c);
      }
      c.workTimer -= dt;
      if (c.energy <= 0 && c.thought !== 'Overworked') setThought(c, 'Overworked');
      if (isHomeJob(job) && c.useObj >= 0) {
        const station = s.objects.find((o) => o.id === c.useObj);
        if (station) station.usedUntil = s.time + 2;
      }
      if (c.workTimer <= 0) {
        const before = { ...c.carrying };
        const more = doCycle(s, c, job);
        haulBubble(s, c, before);
        if (!more || planJob(s, c) !== job) {
          c.useObj = -1;
          return decide(s, c);
        }
        c.workTimer = cycleLength(s, c, job);
      }
      return;
    }
    case 'errand': {
      c.timer -= dt;
      if (c.timer <= 0) finishErrand(s, c);
      return;
    }
    case 'eating': {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'idle';
        decide(s, c);
      }
      return;
    }
    case 'sleeping': {
      const wantWork = planJob(s, c) !== 'rest' && c.energy > 45;
      if (c.energy >= 99 || wantWork) {
        c.state = 'idle';
        decide(s, c);
      }
      return;
    }
    case 'leisure': {
      c.timer -= dt;
      if (c.useObj >= 0) {
        const o = s.objects.find((x) => x.id === c.useObj);
        if (o) o.usedUntil = s.time + 2;
      }
      addSharedMood(s, (c.useObj >= 0 ? 0.05 : 0.01) * dt);
      if (c.timer <= 0 || (planJob(s, c) !== 'rest' && c.energy > 20) || c.energy < 30) {
        c.useObj = -1;
        c.state = 'idle';
        decide(s, c);
      }
      return;
    }
    case 'idle':
    default: {
      c.timer -= dt;
      if (c.timer > 0 || (c.hiding && c.timer > -MAX_COVER_WAIT && watcherWithin(s, c, COVER_GAP + 2))) return;
      c.hiding = false;
      decide(s, c);
    }
  }
}

function watcherNear(s: GameState, x: number, y: number): string | null {
  for (const n of s.npcs) {
    if (n.kind !== 'guard' && n.kind !== 'janitor' && n.kind !== 'inspector') continue;
    if (n.state === 'asleep' || n.state === 'gone') continue;
    const d = Math.hypot(n.x - (x + 0.5), n.y - (y + 0.5));
    if (d < (n.kind === 'guard' ? 10 : 6.5) && lineOfSight(n.x, n.y, x + 0.5, y + 0.5)) return n.kind === 'janitor' ? 'the janitor' : n.name;
  }
  return null;
}

export function callOff(s: GameState, c: Crew) {
  c.calledOff = shiftKey(s);
  if (c.state === 'away' || c.state === 'fleeing') return;
  c.useObj = -1;
  if (c.layer === 0) sendCrewHome(s, c, 'Called home. Heading back');
  else if (c.state === 'working' || c.state === 'toWork') {
    c.state = 'idle';
    c.timer = 0;
    setThought(c, 'Off this shift');
  }
}

const outInTheMall = (c: Crew) => c.state !== 'away' && c.state !== 'fleeing' && (c.layer === 0 || (c.state === 'toWork' && c.goal >= 0 && c.goal < N));

export function callAllHome(s: GameState): number {
  const out = s.crew.filter(outInTheMall);
  for (const c of out) callOff(s, c);
  if (out.length) log(s, `You called everyone home. ${out.map((c) => c.name).join(', ')} dropped what they were doing.`, 'info');
  return out.length;
}

export function startFlee(s: GameState, c: Crew) {
  c.state = 'fleeing';
  setThought(c, 'RUN!');
  c.bubble = { text: '!!', until: s.time + 20, tone: 'alert' };
  zoneState = s;
  if (!goTo(s, c, escapeGoals) && !goTo(s, c, (n: number) => n >= N)) c.path = [];
}

function escaped(s: GameState, c: Crew) {
  c.state = 'idle';
  c.detect = 0;
  s.stats.spotted++;
  deposit(s, c);
  log(s, `${c.name} made it back up. That was close.`, 'warn', { x: Math.floor(c.x), y: Math.floor(c.y), layer: 1 });
  sfx('escape');
  for (const n of s.npcs) if (n.chaseId === c.id) n.state = 'search';
}

export const BAIL_HOURS = 8;
const REPLAN_MINUTES = 3;
const LOOKAHEAD = 5;
const GUARD_WAIT_DANGER = 8;
const MAX_WAIT = 25;

export function crewCaught(s: GameState, c: Crew, byName: string, story = `${byName} caught ${c.name} red-handed in the mall after hours. The police were called.`) {
  c.state = 'away';
  c.awayUntil = Infinity;
  c.path = [];
  c.carrying = { cash: 0, food: 0, parts: 0, goods: 0 };
  c.detect = 0;
  c.bedId = -1;
  c.heat = HEAT_AFTER_ARREST;
  s.stats.caught++;
  s.spottedTonight = true;
  raiseSuspicion(s, 8, `${c.name} was caught by ${byName}`);
  sfx('caught');
  const bail = 60 + s.crew.length * 15;
  s.modals.push({
    id: s.nextId++,
    title: `${c.name} got caught`,
    art: 'caught',
    body: `${story} ${c.name} didn't say a word about the ceiling.\n\nPost bail and they're out today, back in the ceiling in ${BAIL_HOURS} hours. Or let them sit it out in county for five days.`,
    choices: [
      { label: `Post bail ($${bail})`, action: `bail:${c.id}:${bail}`, disabled: s.cash < bail ? 'Not enough cash' : undefined },
      { label: 'Let them sit it out (5 days)', action: `wait:${c.id}` },
      ...(s.crew.length > 1 ? [{ label: 'Cut them loose', action: `cut:${c.id}` }] : []),
    ],
  });
}

export function crewLeaves(s: GameState, c: Crew, reason: string) {
  s.crew = s.crew.filter((x) => x !== c);
  log(s, `${c.name} left the crew. ${reason}`, 'bad');
  sfx('bad');
}

export const HEAT_FADE_PER_DAY = 15;
const SPOTTED_HEAT = 15;
const HEAT_AFTER_ARREST = 40;
export const HEAT_WARNING = 75;

function heatGainMult(s: GameState, c: Crew): number {
  const invisible = (has(c, 'invisible') ? 0.1 : 1) * (costumeOf(c)?.dayHeat ?? 1);
  const crackdown = (s.flags.crackdownUntil ?? 0) > s.time ? 2 : 1;
  const halloween = s.flags.costumeDay === dayOf(s.time) ? 0 : 1;
  const [m, d] = md(dayOf(s.time));
  const blackFridayCrowd = m === 11 && d === 26 ? 0.5 : 1;
  const noticed = 0.35 + 0.65 * pressure(s, 3, 6);
  return invisible * crackdown * halloween * blackFridayCrowd * noticed;
}

export function heatTick(s: GameState, c: Crew, rate: number, dt: number) {
  const before = c.heat;
  addHeat(c, rate * (rate > 0 ? heatGainMult(s, c) : 1) * dt);
  if (before < HEAT_WARNING && c.heat >= HEAT_WARNING)
    log(s, `Officer Dana is watching ${c.name} closely. Rest them by day to cool off before she makes a call.`, 'bad', { x: Math.floor(c.x), y: Math.floor(c.y), layer: 0 });
  if (c.heat >= 100 && c.state !== 'away') crewArrestedByDay(s, c);
}

export function addHeat(c: Crew, amount: number) {
  c.heat = Math.min(100, Math.max(0, c.heat + amount));
}

export function coolHeat(c: Crew, dt: number) {
  const lyingLow = c.dayJob === 'rest' || isHomeJob(c.dayJob) ? 2 : 1;
  addHeat(c, (-HEAT_FADE_PER_DAY * lyingLow * dt) / 1440);
}

export function spottedHeat(c: Crew) {
  addHeat(c, SPOTTED_HEAT);
}

export const heatDetectMult = (c: Crew) => 1 + c.heat / 200;

function crewArrestedByDay(s: GameState, c: Crew) {
  crewCaught(s, c, 'Officer Dana', `Officer Dana has seen ${c.name} in the mall every day for weeks. Today she ran their name, found nothing, and called the police anyway.`);
}

export function idleBubble(s: GameState, c: Crew) {
  if (c.layer !== 1 || (c.bubble && c.bubble.until > s.time)) return;
  if (c.state === 'sleeping' && has(c, 'snorer')) c.bubble = { text: 'ZZZ', until: s.time + 6 };
  else if (c.state === 'sleeping' && rand.chance(0.05)) c.bubble = { text: 'z', until: s.time + 5 };
}

export function noiseFromCrew(s: GameState, field: Float32Array, spread: (f: Float32Array, x: number, y: number, n: number) => void) {
  for (const c of s.crew) {
    if (c.layer !== 1 || c.state === 'away') continue;
    const x = Math.floor(c.x);
    const y = Math.floor(c.y);
    if (c.moving) spread(field, x, y, has(c, 'loud') ? 0.7 : 0.28);
    if (c.state === 'sleeping' && has(c, 'snorer')) spread(field, x, y, 2.2);
  }
}

export function crewAt(s: GameState, layer: 0 | 1, x: number, y: number): Crew | undefined {
  return s.crew.find((c) => c.state !== 'away' && c.layer === layer && Math.floor(c.x) === x && Math.floor(c.y) === y);
}
