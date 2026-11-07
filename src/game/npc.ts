import { BUILD, JOB } from './defs';
import { stat } from './needs';
import { agentNode, costumeOf, crewCaught, currentJob, goTo, has, heatDetectMult, heatTick, makeLook, moveAgent, spottedHeat, startFlee } from './crew';
import { E_STAFF, H, LAYOUT, N, W, edgeBetween, idx, inBounds, type Waypoint } from './layout';
import { suspicionLevel, log, notify, rand, raiseSuspicion, sfx } from './ops';
import type { Crew, GameState, Npc, NpcKind, Placed } from './state';
import { dayOf, phaseAt } from './time';
import {
  ACCESS_SHOPPER,
  ACCESS_STAFF,
  CAMERA_FOV,
  CAMERA_RANGE,
  cameraAngle,
  cameraLive,
  coneSees,
  crewDanger,
  getDerived,
  lineOfSight,
  mallWalkable,
  markDirty,
  nearestWalkableInRoom,
  nodeOf,
  roomTiles,
} from './world';
import { revealInspection } from './inspect';

export function spawnNpc(s: GameState, kind: NpcKind, x: number, y: number, extra: Partial<Npc> = {}): Npc {
  const look = makeLook(null);
  if (kind === 'guard' || kind === 'dayguard') {
    look.top = '#22304a';
    look.bottom = '#1a2236';
    look.hat = 'cap';
    look.hatColor = '#1a2236';
  }
  if (kind === 'janitor') {
    look.top = '#6a7a6a';
    look.bottom = '#6a7a6a';
    look.hat = undefined;
  }
  if (kind === 'inspector') {
    look.top = '#ff7a1a';
    look.bottom = '#3a4a6a';
    look.hat = 'hardhat';
    look.hatColor = '#ffd000';
  }
  const n: Npc = {
    id: s.nextId++,
    x: x + 0.5,
    y: y + 0.5,
    layer: 0,
    path: [],
    pathI: 0,
    goal: -1,
    facing: Math.PI / 2,
    look,
    moving: false,
    climb: 0,
    kind,
    name: '',
    state: 'idle',
    timer: 0,
    route: 0,
    routeI: 0,
    speed: kind === 'dayguard' ? 0.45 : kind === 'guard' ? 0.3 : 0.28,
    dests: [],
    chaseId: -1,
    lastSeen: { x: 0, y: 0, t: 0 },
    dog: false,
    inspectionId: -1,
    isGary: false,
    hearCooldown: 0,
    ...extra,
  };
  s.npcs.push(n);
  return n;
}

function randomStoreTile(s: GameState): number | null {
  const opts: { ri: number; w: number }[] = [];
  LAYOUT.rooms.forEach((r, ri) => {
    if (r.traffic <= 0) return;
    const rs = s.rooms[ri];
    if ((rs.vacant && !rs.popup) || r.kind === 'food') return;
    opts.push({ ri, w: r.traffic * (rs.popup ? 1.6 : 1) });
  });
  const total = opts.reduce((a, o) => a + o.w, 0);
  let roll = rand.next() * total;
  for (const o of opts) {
    roll -= o.w;
    if (roll <= 0) {
      const tiles = roomTiles(o.ri).filter(mallWalkable);
      return tiles.length ? rand.pick(tiles) : null;
    }
  }
  return null;
}

export function spawnShopper(s: GameState) {
  const fromAnchor = rand.chance(0.3);
  const spot = fromAnchor
    ? rand.pick([
        { x: 2, y: 13 },
        { x: 45, y: 13 },
      ])
    : rand.pick(LAYOUT.shopperEntrances);
  const n = spawnNpc(s, 'shopper', spot.x, spot.y, { speed: rand.range(0.22, 0.32) });
  const count = rand.int(1, 3);
  for (let i = 0; i < count; i++) {
    const t = randomStoreTile(s);
    if (t !== null) n.dests.push(t);
  }
  n.state = 'walk';
  nextShopperDest(s, n);
}

function nextShopperDest(s: GameState, n: Npc) {
  const next = n.dests.shift();
  if (next === undefined) {
    n.state = 'leaving';
    const exits = [...LAYOUT.shopperEntrances.map((e) => idx(e.x, e.y)), idx(2, 13), idx(45, 13)];
    if (!goTo(s, n, exits, ACCESS_SHOPPER)) n.state = 'gone';
    return;
  }
  if (!goTo(s, n, [next], ACCESS_SHOPPER)) return nextShopperDest(s, n);
  n.state = 'walk';
}

function updateShopper(s: GameState, n: Npc, dt: number) {
  const open = phaseAt(s.time) === 'open';
  if (!open && n.state !== 'leaving') {
    n.dests = [];
    nextShopperDest(s, n);
  }
  if (n.state === 'browse') {
    n.timer -= dt;
    if (rand.chance(0.02 * dt)) n.facing = rand.range(-Math.PI, Math.PI);
    if (n.timer <= 0) nextShopperDest(s, n);
    return;
  }
  const arrived = moveAgent(n, n.speed, dt);
  if (arrived) {
    if (n.state === 'leaving') n.state = 'gone';
    else {
      n.state = 'browse';
      n.timer = rand.range(15, 50);
    }
  }
}

function routeOf(n: Npc): Waypoint[] {
  if (n.kind === 'dayguard') return LAYOUT.dayRoute;
  if (n.kind === 'janitor') return LAYOUT.janitorRoutes[n.route];
  return LAYOUT.nightRoutes[n.route];
}

function patrolStep(s: GameState, n: Npc, dt: number) {
  const route = routeOf(n);
  if (n.state === 'wait') {
    n.timer -= dt;
    n.facing += Math.sin(s.time * 0.08 + n.id) * 0.04 * dt;
    if (n.timer <= 0) {
      n.routeI = (n.routeI + 1) % route.length;
      n.state = 'patrol';
      n.path = [];
    }
    return;
  }
  if (n.pathI >= n.path.length) {
    const wp = route[n.routeI];
    if (Math.floor(n.x) === wp.x && Math.floor(n.y) === wp.y) {
      if (wp.wait > 0) {
        n.state = 'wait';
        n.timer = wp.wait;
      } else n.routeI = (n.routeI + 1) % route.length;
      return;
    }
    if (!goTo(s, n, [nodeOf(0, wp.x, wp.y)], ACCESS_STAFF)) {
      n.routeI = (n.routeI + 1) % route.length;
      return;
    }
  }
  moveAgent(n, n.speed, dt);
}

function guardHear(s: GameState, n: Npc, noise: Float32Array) {
  if (n.hearCooldown > s.time) return;
  const i = idx(Math.floor(n.x), Math.floor(n.y));
  const level = noise[i];
  if (level < 1.1) return;
  if (!rand.chance(Math.min(0.5, level * 0.06))) return;
  n.hearCooldown = s.time + 45;
  n.state = 'listen';
  n.timer = 8;
  n.bubble = { text: '?', until: s.time + 10, tone: 'info' };
  sfx('huh');
  const ri = LAYOUT.roomAt[i];
  if (ri >= 0) s.rooms[ri].complaint += 12;
  log(s, `${n.name} stopped under ${LAYOUT.rooms[ri]?.name ?? 'the ceiling'}: "...did that ceiling just creak?"`, 'warn', { x: Math.floor(n.x), y: Math.floor(n.y), layer: 0 });
}

const SECURITY_DESK = { x: 33, y: 1 };
const NAP_HURRY = 1.5;

const garyNapping = (s: GameState) => (s.flags.garyNapFrom ?? 0) <= s.time && s.time < (s.flags.garyAsleepUntil ?? 0);

function updateGuard(s: GameState, n: Npc, dt: number, noise: Float32Array) {
  const phase = phaseAt(s.time);
  if (n.kind === 'guard' && (phase === 'morning' || phase === 'open') && n.state !== 'offduty') {
    n.state = 'offduty';
    goTo(s, n, [nodeOf(0, 33, 1)], ACCESS_STAFF);
  }
  if (n.kind === 'dayguard' && phase !== 'open' && n.state !== 'offduty') {
    n.state = 'offduty';
    goTo(s, n, [nodeOf(0, 33, 1)], ACCESS_STAFF);
  }
  if (n.isGary && garyNapping(s) && (n.state === 'patrol' || n.state === 'wait')) {
    n.state = 'toNap';
    goTo(s, n, [nodeOf(0, SECURITY_DESK.x, SECURITY_DESK.y)], ACCESS_STAFF);
  }
  switch (n.state) {
    case 'offduty':
      if (moveAgent(n, n.speed, dt)) n.state = 'gone';
      return;
    case 'toNap':
      if (moveAgent(n, n.speed * NAP_HURRY, dt)) n.state = 'asleep';
      return;
    case 'asleep':
      n.bubble = { text: 'z z z', until: s.time + 3 };
      if ((s.flags.garyAsleepUntil ?? 0) <= s.time) n.state = 'patrol';
      return;
    case 'listen':
      n.timer -= dt;
      n.facing += 0.15 * dt;
      if (n.timer <= 0) n.state = 'patrol';
      return;
    case 'investigate':
      if (moveAgent(n, n.speed * 1.4, dt)) {
        n.state = 'search';
        n.timer = 25;
      }
      return;
    case 'search':
      n.timer -= dt;
      if (n.pathI >= n.path.length) {
        const tx = Math.floor(n.lastSeen.x + rand.range(-4, 4));
        const ty = Math.floor(n.lastSeen.y + rand.range(-4, 4));
        if (tx >= 0 && ty >= 0 && tx < W && mallWalkable(idx(tx, ty))) goTo(s, n, [nodeOf(0, tx, ty)], ACCESS_STAFF);
        else n.facing += 0.5;
      }
      moveAgent(n, n.speed, dt);
      if (n.timer <= 0) {
        n.state = 'patrol';
        n.path = [];
      }
      return;
    case 'chase': {
      const target = s.crew.find((c) => c.id === n.chaseId);
      if (!target || target.layer !== 0 || target.state === 'away') {
        n.state = 'search';
        n.timer = 20;
        n.chaseId = -1;
        return;
      }
      const d = Math.hypot(target.x - n.x, target.y - n.y);
      if (d < 0.7 && (n.grabUntil ?? 0) <= s.time) {
        n.grabUntil = s.time + 20;
        spottedHeat(target);
        if (target.heat >= 100) {
          n.state = 'search';
          n.timer = 10;
          n.chaseId = -1;
          n.bubble = { text: 'GOTCHA', until: s.time + 15, tone: 'alert' };
          crewCaught(s, target, n.name);
          return;
        }
        target.bubble = { text: '!!', until: s.time + 8, tone: 'alert' };
      }
      const sees = d < 9 && lineOfSight(n.x, n.y, target.x, target.y);
      if (sees) n.lastSeen = { x: target.x, y: target.y, t: s.time };
      if (s.time - n.lastSeen.t > 6) {
        n.state = 'search';
        n.timer = 30;
        n.chaseId = -1;
        n.bubble = { text: 'Where...?', until: s.time + 12, tone: 'info' };
        return;
      }
      n.timer -= dt;
      if (n.timer <= 0 || n.pathI >= n.path.length) {
        n.timer = 1;
        goTo(s, n, [nodeOf(0, Math.floor(n.lastSeen.x), Math.floor(n.lastSeen.y))], ACCESS_STAFF);
      }
      moveAgent(n, (n.dog ? 0.56 : 0.5) * (n.isGary && s.gary.affinity > 50 ? 0.85 : 1), dt);
      return;
    }
    default:
      if (n.state !== 'patrol' && n.state !== 'wait') n.state = 'patrol';
      patrolStep(s, n, dt);
      if (n.kind === 'guard') guardHear(s, n, noise);
  }
}

function updateJanitor(s: GameState, n: Npc, dt: number) {
  if (phaseAt(s.time) !== 'closing' && n.state !== 'offduty') {
    n.state = 'offduty';
    goTo(s, n, [nodeOf(0, 7, 1)], ACCESS_STAFF);
  }
  if (n.state === 'offduty') {
    if (moveAgent(n, n.speed, dt)) n.state = 'gone';
    return;
  }
  patrolStep(s, n, dt);
}

function updateInspector(s: GameState, n: Npc, dt: number) {
  const ins = s.inspections.find((i) => i.id === n.inspectionId);
  if (!ins) {
    n.state = 'gone';
    return;
  }
  if (n.state === 'walk') {
    if (moveAgent(n, n.speed, dt)) {
      n.state = 'climb';
      n.timer = 25;
      ins.state = 'climbing';
      n.bubble = { text: 'Hmm...', until: s.time + 25, tone: 'info' };
    }
  } else if (n.state === 'climb') {
    n.timer -= dt;
    if (n.timer <= 0) {
      revealInspection(s, ins);
      n.state = 'leave';
      goTo(s, n, [nodeOf(0, 10, 1)], ACCESS_STAFF);
    }
  } else if (n.state === 'leave') {
    if (moveAgent(n, n.speed, dt)) n.state = 'gone';
  }
}

export function startInspector(s: GameState, insId: number) {
  const ins = s.inspections.find((i) => i.id === insId)!;
  const n = spawnNpc(s, 'inspector', 10, 1, {
    name: ins.kind === 'fire' ? 'Fire Marshal' : ins.kind === 'pest' ? 'Pest Control' : ins.kind === 'sweep' ? 'Police' : 'Dale (Maintenance)',
    inspectionId: ins.id,
    speed: 0.32,
  });
  const spot = nearestWalkableInRoom(ins.room, ins.x, ins.y);
  if (goTo(s, n, [nodeOf(0, spot.x, spot.y)], ACCESS_STAFF)) {
    n.state = 'walk';
    ins.state = 'walking';
    ins.npcId = n.id;
  } else {
    n.state = 'climb';
    n.timer = 25;
    ins.state = 'climbing';
  }
}

export function updateNpcs(s: GameState, dt: number, noise: Float32Array) {
  for (const n of s.npcs) {
    switch (n.kind) {
      case 'shopper':
        updateShopper(s, n, dt);
        break;
      case 'guard':
      case 'dayguard':
        updateGuard(s, n, dt, noise);
        break;
      case 'janitor':
        updateJanitor(s, n, dt);
        break;
      case 'inspector':
        updateInspector(s, n, dt);
        break;
    }
  }
  s.npcs = s.npcs.filter((n) => n.state !== 'gone');
}

const DIFF_DETECT = { easy: 0.75, normal: 1, hard: 1.3 };

function seesCrew(nx: number, ny: number, facing: number, fov: number, range: number, c: Crew): number {
  return coneSees(nx, ny, facing, fov, range, c.x, c.y);
}

export function guardCone(n: Npc, s: GameState): { fov: number; range: number } {
  if (n.kind === 'dayguard') return { fov: 1.5, range: 6.5 };
  if (n.kind === 'janitor') return { fov: 1.6, range: 4 };
  const lvl = suspicionLevel(s.suspicion);
  return { fov: 1.05, range: 6 + (n.dog ? 1.5 : 0) + (lvl >= 3 ? 0.8 : 0) };
}

const GUARD_SIGHT_DANGER = 10;
const GUARD_NEAR_DANGER = 10;
const GUARD_AHEAD_DANGER = 5;
const CAMERA_DANGER = 3;

function markDanger(cx: number, cy: number, r: number, weight: (x: number, y: number) => number) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) crewDanger[idx(x, y)] += weight(x + 0.5, y + 0.5);
}

export function updateCrewDanger(s: GameState) {
  crewDanger.fill(0);
  if (phaseAt(s.time) === 'open') return;
  for (const n of s.npcs) {
    if ((n.kind !== 'guard' && n.kind !== 'janitor') || n.state === 'asleep' || n.state === 'offduty') continue;
    const cone = guardCone(n, s);
    markDanger(n.x, n.y, cone.range + 1, (x, y) => GUARD_SIGHT_DANGER * coneSees(n.x, n.y, n.facing, cone.fov, cone.range + 1, x, y) + (Math.hypot(x - n.x, y - n.y) < 2.5 ? GUARD_NEAR_DANGER : 0));
    for (const node of n.path.slice(n.pathI, n.pathI + 6)) {
      if (node >= N) continue;
      const px = node % W;
      const py = Math.floor(node / W);
      markDanger(px + 0.5, py + 0.5, 1.5, (x, y) => (inBounds(Math.floor(x), Math.floor(y)) && Math.hypot(x - px - 0.5, y - py - 0.5) <= 1.5 ? GUARD_AHEAD_DANGER : 0));
    }
  }
  if ((s.flags.blackoutUntil ?? 0) > s.time) return;
  for (const cam of s.cameras) {
    if (!cameraLive(s, cam)) continue;
    markDanger(cam.x, cam.y, CAMERA_RANGE, (x, y) => (coneSees(cam.x, cam.y, cam.angle, CAMERA_FOV + cam.sweep * 2, CAMERA_RANGE, x, y, 0) > 0 ? CAMERA_DANGER : 0));
  }
}

const BAG_SPOT_RANGE = 2.5;
const BAG_SUSPICION = 4;
const BAG_FEED_NOTICED_PER_HOUR = 0.04;
const DECOY_REACH = 1.2;

export function updateMallItems(s: GameState) {
  const night = phaseAt(s.time) === 'night';
  for (const o of [...s.objects]) {
    if (!o.delivered) continue;
    if (o.expires !== undefined && o.expires <= s.time) {
      removeFloorItem(s, o, `The janitor folded up your ${BUILD[o.type].name}.`);
      continue;
    }
    if (o.type === 'out_of_order') {
      const guard = s.npcs.find((n) => (n.kind === 'guard' || n.kind === 'dayguard') && n.state !== 'asleep' && n.state !== 'offduty' && Math.hypot(n.x - o.x - 0.5, n.y - o.y - 0.5) < BAG_SPOT_RANGE);
      if (guard) {
        removeFloorItem(s, o, `${guard.name} tore the bag off a camera.`, 'warn');
        raiseSuspicion(s, BAG_SUSPICION, `${guard.name} found a bagged camera`);
      } else if (night && rand.chance(BAG_FEED_NOTICED_PER_HOUR / 60)) {
        removeFloorItem(s, o, 'Someone noticed a dead camera feed. The bag is gone.', 'warn');
        raiseSuspicion(s, BAG_SUSPICION, 'A camera feed went dark');
      }
    }
    if (o.type === 'tamagotchi' && night) lureGuard(s, o);
  }
}

function lureGuard(s: GameState, o: Placed) {
  const lured = s.npcs.find((n) => n.id === o.luredBy);
  if (lured && (lured.state === 'investigate' || lured.state === 'search')) {
    if (Math.hypot(lured.x - o.x - 0.5, lured.y - o.y - 0.5) < DECOY_REACH)
      removeFloorItem(s, o, `${lured.name} found the Tamagotchi and pocketed it. He's going to raise it.`, 'good');
    return;
  }
  const guards = s.npcs.filter((n) => n.kind === 'guard' && (n.state === 'patrol' || n.state === 'wait'));
  const nearest = guards.sort((a, b) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y))[0];
  if (!nearest || !goTo(s, nearest, [nodeOf(0, o.x, o.y)], ACCESS_STAFF)) return;
  o.luredBy = nearest.id;
  nearest.state = 'investigate';
  nearest.lastSeen = { x: o.x + 0.5, y: o.y + 0.5, t: s.time };
  nearest.bubble = { text: 'beep?', until: s.time + 10, tone: 'info' };
  log(s, `${nearest.name} heard beeping and went to look.`, 'good', { x: o.x, y: o.y, layer: 0 });
}

function removeFloorItem(s: GameState, o: Placed, text: string, kind: 'info' | 'warn' | 'good' = 'info') {
  s.objects = s.objects.filter((x) => x !== o);
  markDirty();
  log(s, text, kind, { x: o.x, y: o.y, layer: 0 });
}

export function detection(s: GameState, dt: number) {
  const phase = phaseAt(s.time);
  const d = getDerived(s);
  const diff = DIFF_DETECT[s.difficulty];
  const teamRoutes = s.crew.some((c) => has(c, 'routes') && c.state !== 'away') ? 0.85 : 1;
  const blackout = (s.flags.blackoutUntil ?? 0) > s.time;
  const lvl = suspicionLevel(s.suspicion);

  for (const c of s.crew) {
    if (c.layer !== 0 || c.state === 'away' || c.climb > 0) {
      c.detect = Math.max(0, c.detect - 0.2 * dt);
      continue;
    }
    if (phase === 'open' || phase === 'morning') {
      if (c.state === 'working') {
        const sketch = JOB[currentJob(s, c)].sketch;
        if (sketch !== 0) heatTick(s, c, sketch / 60, dt);
      }
      for (const n of s.npcs) {
        if (n.kind !== 'dayguard') continue;
        const cone = guardCone(n, s);
        if (!seesCrew(n.x, n.y, n.facing, cone.fov, cone.range, c)) continue;
        const ri = LAYOUT.roomAt[idx(Math.floor(c.x), Math.floor(c.y))];
        const kind = ri >= 0 ? LAYOUT.rooms[ri].kind : 'concourse';
        const backstage = ['service', 'maint', 'security', 'office', 'dock'].includes(kind);
        const rate = backstage ? 1 : c.state === 'working' ? 0 : 0.06;
        if (rate !== 0) heatTick(s, c, rate, dt);
        if (backstage && (c.bubble?.until ?? 0) < s.time) {
          c.bubble = { text: '...', until: s.time + 6 };
          n.bubble = { text: 'Hey!', until: s.time + 6, tone: 'alert' };
        }
      }
      c.detect = Math.max(0, c.detect - 0.2 * dt);
      continue;
    }

    let rate = 0;
    let bestSource: Npc | null = null;
    let bestRate = 0;
    let cameraHit = -1;
    const stealthMod =
      (1.3 - stat(s, c, 'stealth') * 0.15) *
      (c.hiding ? 0.3 + stat(s, c, 'stealth') * 0.03 : c.state === 'working' ? 1.15 : 1) *
      (d.periscopeAt[idx(Math.floor(c.x), Math.floor(c.y))] ? 0.7 : 1) *
      teamRoutes *
      diff *
      heatDetectMult(c) *
      (costumeOf(c)?.nightDetect ?? 1);
    for (const n of s.npcs) {
      if (n.kind !== 'guard' && n.kind !== 'janitor') continue;
      if (n.state === 'asleep' || n.state === 'offduty') continue;
      const cone = guardCone(n, s);
      let vis = seesCrew(n.x, n.y, n.facing, cone.fov, cone.range, c);
      if (n.dog && Math.hypot(c.x - n.x, c.y - n.y) < 3) vis = Math.max(vis, 0.8);
      if (!vis) continue;
      let base = n.kind === 'janitor' ? 0.5 : n.dog ? 1.3 : 0.95;
      if (lvl >= 3 && n.kind === 'guard') base *= 1.2;
      if (n.isGary) base *= s.gary.insider ? 0.3 : 1 - s.gary.affinity / 160;
      const r = base * vis * stealthMod;
      rate += r;
      if (r > bestRate) {
        bestRate = r;
        bestSource = n;
      }
    }
    if (!blackout) {
      s.cameras.forEach((cam, ci) => {
        if (!cameraLive(s, cam)) return;
        const vis = coneSees(cam.x, cam.y, cameraAngle(cam, s.time), CAMERA_FOV, CAMERA_RANGE, c.x, c.y, 0);
        if (vis) {
          rate += 0.55 * vis * stealthMod;
          cameraHit = ci;
        }
      });
    }
    if (lvl >= 4 && c.moving) {
      const ri = LAYOUT.roomAt[idx(Math.floor(c.x), Math.floor(c.y))];
      if (ri >= 0 && (LAYOUT.rooms[ri].kind === 'concourse' || LAYOUT.rooms[ri].kind === 'court')) rate += 0.25 * diff;
    }

    if (phase === 'closing') rate *= 0.4;
    c.spottedBy = bestSource ? bestSource.id : cameraHit >= 0 ? -2 : -1;
    if (rate > 0) c.detect += rate * dt * 0.2;
    else c.detect = Math.max(0, c.detect - 0.12 * dt);

    if (c.detect >= 1 && c.state !== 'fleeing') {
      c.detect = 1;
      spottedHeat(c);
      const tile = { x: Math.floor(c.x), y: Math.floor(c.y), layer: 0 as const };
      sfx('spotted');
      if (bestSource && bestSource.kind === 'guard') {
        bestSource.state = 'chase';
        bestSource.chaseId = c.id;
        bestSource.timer = 0;
        bestSource.lastSeen = { x: c.x, y: c.y, t: s.time };
        bestSource.bubble = { text: '!', until: s.time + 15, tone: 'alert' };
        log(s, `${bestSource.name} spotted ${c.name}! "HEY! STOP RIGHT THERE!"`, 'bad', tile);
      } else {
        const reporter = bestSource ? 'A janitor' : `Camera ${cameraHit + 1}`;
        if (bestSource) bestSource.bubble = { text: '!', until: s.time + 15, tone: 'alert' };
        if (cameraHit >= 0) s.cameras[cameraHit].cooldown = s.time + 30;
        log(s, `${reporter} spotted ${c.name}. Security is on the way.`, 'bad', tile);
        const guard = s.npcs.find((n) => n.kind === 'guard' && n.state !== 'chase' && n.state !== 'asleep' && n.state !== 'offduty');
        if (guard) {
          guard.state = 'investigate';
          guard.lastSeen = { x: c.x, y: c.y, t: s.time };
          goTo(s, guard, [nodeOf(0, tile.x, tile.y)], ACCESS_STAFF);
          guard.bubble = { text: '!?', until: s.time + 12, tone: 'alert' };
        }
      }
      notify(`🚨 ${c.name} was spotted! Running for the ceiling...`, tile);
      startFlee(s, c);
    }
  }
}

export function staffDoorCheck(s: GameState, c: Crew, fromNode: number, toNode: number) {
  if (fromNode >= N || toNode >= N) return;
  const ax = fromNode % W;
  const ay = Math.floor(fromNode / W);
  const bx = toNode % W;
  const by = Math.floor(toNode / W);
  if (edgeBetween(LAYOUT, ax, ay, bx, by) !== E_STAFF) return;
  if (phaseAt(s.time) !== 'open') return;
  for (const n of s.npcs) {
    if (n.kind !== 'dayguard') continue;
    const cone = guardCone(n, s);
    if (seesCrew(n.x, n.y, n.facing, cone.fov, cone.range, c)) {
      heatTick(s, c, 8, 1);
      n.bubble = { text: 'Employees only!', until: s.time + 10, tone: 'alert' };
    }
  }
}

export function ensureStaff(s: GameState) {
  const phase = phaseAt(s.time);
  const lvl = suspicionLevel(s.suspicion);
  const guards = s.npcs.filter((n) => n.kind === 'guard' && n.state !== 'offduty');
  const nightShift = phase === 'night' || phase === 'closing';
  if (nightShift) {
    const garyName = s.gary.replaced ? 'Officer Kowalski' : 'Gary';
    if (!guards.some((g) => g.route === 0)) {
      const g = spawnNpc(s, 'guard', SECURITY_DESK.x, SECURITY_DESK.y, { name: garyName, isGary: !s.gary.replaced, route: 0, routeI: 0, state: 'patrol' });
      g.dog = lvl >= 3;
      if (g.isGary && garyNapping(s)) g.state = 'asleep';
    }
    const wantSecond = lvl >= 2 || (s.flags.traineeNight ?? -1) === dayOf(s.time - 360);
    if (wantSecond && !guards.some((g) => g.route === 1)) spawnNpc(s, 'guard', 33, 1, { name: lvl >= 2 ? 'Officer Reyes' : 'Trainee Kyle', route: 1, routeI: 0, state: 'patrol' });
    for (const g of guards) if (g.route === 0) g.dog = lvl >= 3;
  }
  if (phase === 'open' && !s.npcs.some((n) => n.kind === 'dayguard' && n.state !== 'offduty')) {
    spawnNpc(s, 'dayguard', 33, 1, { name: 'Officer Dana', state: 'patrol', routeI: 0 });
  }
  if (phase === 'closing') {
    const janitors = s.npcs.filter((n) => n.kind === 'janitor' && n.state !== 'offduty');
    for (let r = 0; r < 2; r++) if (!janitors.some((j) => j.route === r)) spawnNpc(s, 'janitor', 7, 1, { name: r ? 'Rosa' : 'Earl', route: r, state: 'patrol', speed: 0.18 });
  }
}

export function trackStaffDoors(s: GameState, c: Crew, prevNode: number) {
  const now = agentNode(c);
  if (now !== prevNode) staffDoorCheck(s, c, prevNode, now);
}
