import { BUILD, NOOKS, NOOK_RADIUS, type BuildId, type NookDef, type NookId } from './defs';
import { C_OPEN, E_GATE, E_GLASS, E_OPEN, E_PUBLIC, E_STAFF, H, LAYOUT, N, W, edgeBetween, idx, inBounds } from './layout';
import type { GameState, Placed } from './state';
import { dayOf, isCold, mallHours, minuteOfDay, phaseAt } from './time';

export interface Derived {
  objAt: Map<number, Placed>;
  floorAt: Map<number, Placed>;
  drops: Set<number>;
  insulation: Float32Array;
  fanAt: Float32Array;
  periscopeAt: Uint8Array;
  beds: { obj: Placed; slots: number }[];
  foodCap: number;
  partsCap: number;
  goodsCap: number;
  comfort: number;
  hotPlates: Placed[];
  workbenches: Placed[];
  leisure: Placed[];
  pc: Placed | null;
  pcSignal: number;
  scanner: boolean;
  fridge: boolean;
  signs: Placed[];
  nooks: Nook[];
  nookOf: Map<number, NookId>;
  version: number;
}

export interface Nook {
  def: NookDef;
  members: Placed[];
}

let derived: Derived | null = null;
let derivedFor: GameState | null = null;
let dirty = true;
let version = 0;

export function markDirty() {
  dirty = true;
}

export function getDerived(s: GameState): Derived {
  if (!dirty && derived && derivedFor === s) return derived;
  derived = computeDerived(s);
  derivedFor = s;
  dirty = false;
  return derived;
}

export function boundariesSignal(x: number, y: number): number {
  const r = LAYOUT.rooms[LAYOUT.roomIndex['boundaries']];
  const cx = Math.max(r.x0, Math.min(r.x1, x));
  const cy = Math.max(r.y0, Math.min(r.y1, y));
  const d = Math.hypot(cx - x, cy - y);
  return Math.max(0, 1 - d / 10);
}

export function storeHasPower(s: GameState, roomIdx: number): boolean {
  const rs = s.rooms[roomIdx];
  return !rs.vacant || rs.popup;
}

export const wifiAt = (s: GameState, x: number, y: number) => (storeHasPower(s, LAYOUT.roomIndex['boundaries']) ? boundariesSignal(x, y) : 0);

function computeDerived(s: GameState): Derived {
  const objAt = new Map<number, Placed>();
  const drops = new Set<number>();
  const insulation = new Float32Array(N).fill(1);
  const fanAt = new Float32Array(N);
  const periscopeAt = new Uint8Array(N);
  const d: Derived = {
    objAt,
    floorAt: new Map(),
    drops,
    insulation,
    fanAt,
    periscopeAt,
    beds: [],
    foodCap: 12,
    partsCap: 50,
    goodsCap: 30,
    comfort: 0,
    hotPlates: [],
    workbenches: [],
    leisure: [],
    pc: null,
    pcSignal: 0,
    scanner: false,
    fridge: false,
    signs: [],
    nooks: [],
    nookOf: new Map(),
    version: ++version,
  };

  for (const o of s.objects) (BUILD[o.type].floor ? d.floorAt : objAt).set(idx(o.x, o.y), o);
  markFloorAvoid(s);

  const sources = s.objects.filter((o) => BUILD[o.type].supply);
  const remaining = new Map<number, number>();
  for (const src of sources) {
    src.supplyLoad = 0;
    const room = LAYOUT.roomAt[idx(src.x, src.y)];
    const live = BUILD[src.type].offGrid || storeHasPower(s, room);
    src.powered = live;
    src.tapRoom = BUILD[src.type].offGrid ? -1 : room;
    remaining.set(src.id, live ? BUILD[src.type].supply! : 0);
  }
  const consumers = s.objects.filter((o) => BUILD[o.type].power);
  consumers.sort((a, b) => BUILD[b.type].power! - BUILD[a.type].power!);
  for (const o of consumers) {
    const need = BUILD[o.type].power!;
    let best: Placed | null = null;
    let bestD = Infinity;
    for (const src of sources) {
      const def = BUILD[src.type];
      const dist = Math.hypot(src.x - o.x, src.y - o.y);
      if (dist <= def.radius! + 0.01 && (remaining.get(src.id) ?? 0) >= need && dist < bestD) {
        best = src;
        bestD = dist;
      }
    }
    if (best) {
      remaining.set(best.id, remaining.get(best.id)! - need);
      best.supplyLoad += need;
      o.powered = true;
      o.tapRoom = best.tapRoom;
    } else {
      o.powered = false;
      o.tapRoom = -1;
    }
  }
  for (const o of s.objects) {
    const def = BUILD[o.type];
    if (!def.power && !def.supply) o.powered = true;
  }

  const cold = isCold(dayOf(s.time));
  for (const o of s.objects) {
    const def = BUILD[o.type];
    if (def.drop) drops.add(idx(o.x, o.y));
    if (def.beds) d.beds.push({ obj: o, slots: def.beds });
    if (def.foodCap && o.powered) d.foodCap += def.foodCap;
    if (def.partsCap) d.partsCap += def.partsCap;
    if (def.goodsCap) d.goodsCap += def.goodsCap;
    if (def.comfort && o.powered && (!def.seasonalComfort || cold)) d.comfort += def.comfort;
    if (o.type === 'hot_plate' && o.powered) d.hotPlates.push(o);
    if (o.type === 'workbench' && o.powered) d.workbenches.push(o);
    if (def.hangout && o.powered) d.leisure.push(o);
    if (o.type === 'pc' && o.powered) {
      d.pc = o;
      d.pcSignal = wifiAt(s, o.x, o.y);
    }
    if (o.type === 'scanner' && o.powered) d.scanner = true;
    if (o.type === 'fridge' && o.powered) d.fridge = true;
    if (def.insulation) {
      const r = def.insulationRadius!;
      for (let y = o.y - r; y <= o.y + r; y++) for (let x = o.x - r; x <= o.x + r; x++) if (inBounds(x, y)) insulation[idx(x, y)] = Math.min(insulation[idx(x, y)], 1 - def.insulation);
    }
    if (def.fanRadius && o.powered) {
      const r = def.fanRadius;
      for (let y = o.y - r; y <= o.y + r; y++) for (let x = o.x - r; x <= o.x + r; x++) if (inBounds(x, y)) fanAt[idx(x, y)] += 1;
    }
    if (def.periscope) {
      for (let y = o.y - 6; y <= o.y + 6; y++) for (let x = o.x - 6; x <= o.x + 6; x++) if (inBounds(x, y) && Math.hypot(x - o.x, y - o.y) <= 6) periscopeAt[idx(x, y)] = 1;
    }
    if (def.deterRadius && (!def.floor || o.delivered)) d.signs.push(o);
  }
  findNooks(s, d);
  for (const n of d.nooks) d.comfort += n.def.comfort;
  return d;
}

function markFloorAvoid(s: GameState) {
  floorAvoid.fill(0);
  for (const o of s.objects) {
    if (o.type !== 'wet_floor' || !o.delivered) continue;
    for (let y = o.y - 1; y <= o.y + 1; y++) for (let x = o.x - 1; x <= o.x + 1; x++) if (inBounds(x, y)) floorAvoid[idx(x, y)] += WET_FLOOR_AVOID;
  }
}

export const cameraBagged = (s: GameState, cam: { x: number; y: number }) =>
  s.objects.some((o) => o.type === 'out_of_order' && o.delivered && Math.hypot(o.x + 0.5 - cam.x, o.y + 0.5 - cam.y) <= OUT_OF_ORDER_REACH + 0.75);

export const cameraLive = (s: GameState, cam: { x: number; y: number; active: boolean }) => cam.active && !cameraBagged(s, cam);

export const OUT_OF_ORDER_REACH = 1;

function canPlaceFloor(s: GameState, type: BuildId, x: number, y: number): string | null {
  const i = idx(x, y);
  if (!mallWalkable(i) || LAYOUT.rooms[LAYOUT.roomAt[i]].kind === 'outside') return 'Needs open mall floor';
  if (getDerived(s).floorAt.has(i)) return 'Something is already set up here';
  if (type === 'out_of_order' && !s.cameras.some((c) => c.active && Math.hypot(c.x - x - 0.5, c.y - y - 0.5) <= OUT_OF_ORDER_REACH + 0.75)) return 'Must be right next to a camera';
  return null;
}

function findNooks(s: GameState, d: Derived) {
  for (const def of NOOKS) {
    const [anchorType, ...rest] = def.items;
    for (const anchor of s.objects) {
      if (anchor.type !== anchorType || d.nookOf.has(anchor.id)) continue;
      const members = [anchor];
      for (const type of rest) {
        const pick = s.objects.find((o) => o.type === type && !members.includes(o) && !d.nookOf.has(o.id) && Math.max(Math.abs(o.x - anchor.x), Math.abs(o.y - anchor.y)) <= NOOK_RADIUS);
        if (!pick) break;
        members.push(pick);
      }
      if (members.length < def.items.length) continue;
      d.nooks.push({ def, members });
      for (const m of members) d.nookOf.set(m.id, def.id);
    }
  }
}

export const SKIMMABLE = ['store', 'food', 'foodcourt'];

export function canPlace(s: GameState, type: BuildId, x: number, y: number, moving?: Placed): string | null {
  if (!inBounds(x, y)) return 'Out of bounds';
  if (BUILD[type].floor) return canPlaceFloor(s, type, x, y);
  const i = idx(x, y);
  const def = BUILD[type];
  const ck = LAYOUT.ceilingKind[i];
  if (ck !== C_OPEN) {
    return ck === 1 ? 'HVAC duct in the way' : ck === 2 ? 'Skylight: everyone below would see you' : ck === 4 ? 'Rooftop AC unit' : 'No ceiling access here';
  }
  const hatch = idx(LAYOUT.hatch.x, LAYOUT.hatch.y);
  if (i === hatch) return 'Keep the hatch clear';
  if (type === 'deck') {
    if (s.deck[i]) return 'Already decked';
    const adj = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].some(([nx, ny]) => inBounds(nx, ny) && (s.deck[idx(nx, ny)] || idx(nx, ny) === hatch));
    if (!adj) return 'Must connect to your territory';
    return null;
  }
  if (!s.deck[i]) return 'Needs a plywood deck';
  const here = getDerived(s).objAt.get(i);
  if (here && here !== moving) return 'Something is already here';
  if (def.unique && s.objects.some((o) => o.type === type && o !== moving)) return 'You can only have one';
  if (type === 'pc' && wifiAt(s, x, y) <= 0) return storeHasPower(s, LAYOUT.roomIndex['boundaries']) ? 'No Wi-Fi here. Get closer to Coles' : 'Coles closed. The Wi-Fi went with it.';
  if (type === 'splice') {
    const ri = LAYOUT.roomAt[i];
    if (!storeHasPower(s, ri)) return 'This store is vacant. The power is cut.';
  }
  if (def.racket) {
    const ri = LAYOUT.roomAt[i];
    if (!SKIMMABLE.includes(LAYOUT.rooms[ri].kind) || s.rooms[ri].vacant || s.rooms[ri].popup) return 'Needs an open store or restaurant below';
    if (s.objects.some((o) => o.type === type && o !== moving && LAYOUT.roomAt[idx(o.x, o.y)] === ri)) return 'This store already has a siphon';
  }
  if (type === 'rope') {
    const fi = LAYOUT.fixtureAt[i];
    if (fi >= 0 && LAYOUT.fixtures[fi].blocks) return 'Something is in the way below';
  }
  return null;
}

export function mallWalkable(i: number): boolean {
  if (LAYOUT.roomAt[i] < 0) return false;
  const fi = LAYOUT.fixtureAt[i];
  return fi < 0 || !LAYOUT.fixtures[fi].blocks;
}

export interface Access {
  staff: boolean;
  ceiling: boolean;
  public: boolean;
  keys: boolean;
}

export const ACCESS_CREW: Access = { staff: true, ceiling: true, public: false, keys: false };
export const ACCESS_STAFF: Access = { staff: true, ceiling: false, public: false, keys: true };
export const ACCESS_SHOPPER: Access = { staff: false, ceiling: false, public: true, keys: false };

interface PathCtx {
  s: GameState;
  gatesOpen: boolean;
  doorsOpen: boolean;
  d: Derived;
}

function gatePass(ctx: PathCtx, ax: number, ay: number, bx: number, by: number, access: Access) {
  if (access.keys) return true;
  const popup = ctx.s.business.popupRoom;
  if (popup >= 0 && access.ceiling && (LAYOUT.roomAt[idx(ax, ay)] === popup || LAYOUT.roomAt[idx(bx, by)] === popup)) return true;
  if (!ctx.gatesOpen) return false;
  for (const [x, y] of [
    [ax, ay],
    [bx, by],
  ]) {
    const ri = LAYOUT.roomAt[idx(x, y)];
    if (ri < 0) continue;
    const kind = LAYOUT.rooms[ri].kind;
    if ((kind === 'store' || kind === 'food') && ctx.s.rooms[ri].vacant && !ctx.s.rooms[ri].popup) return false;
  }
  return true;
}

export function edgePassable(ctx: PathCtx, ax: number, ay: number, bx: number, by: number, access: Access): boolean {
  const e = edgeBetween(LAYOUT, ax, ay, bx, by);
  if (e === E_OPEN) return true;
  if (e === E_STAFF) return access.staff;
  if (e === E_GATE) return gatePass(ctx, ax, ay, bx, by, access);
  if (e === E_PUBLIC) return access.public && ctx.doorsOpen;
  return false;
}

export function makeCtx(s: GameState): PathCtx {
  const p = phaseAt(s.time);
  const hours = mallHours(dayOf(s.time));
  const straggling = p === 'closing' && !!hours && minuteOfDay(s.time) < hours.close + 20;
  return { s, gatesOpen: p === 'open' || straggling, doorsOpen: p === 'open' || p === 'closing', d: getDerived(s) };
}

export const nodeOf = (layer: number, x: number, y: number) => layer * N + idx(x, y);

export const crewDanger = new Float32Array(N);
export const floorAvoid = new Float32Array(N);
const WET_FLOOR_AVOID = 8;

export function nodeWalkable(ctx: PathCtx, node: number, access: Access): boolean {
  if (node >= N) {
    const i = node - N;
    return access.ceiling && (ctx.s.deck[i] === 1 || i === idx(LAYOUT.hatch.x, LAYOUT.hatch.y));
  }
  return mallWalkable(node);
}

class Heap {
  items: number[] = [];
  pri: number[] = [];
  push(item: number, p: number) {
    const a = this.items;
    const pr = this.pri;
    a.push(item);
    pr.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [pr[i], pr[parent]] = [pr[parent], pr[i]];
      i = parent;
    }
  }
  pop(): number {
    const a = this.items;
    const pr = this.pri;
    const top = a[0];
    const last = a.pop()!;
    const lp = pr.pop()!;
    if (a.length) {
      a[0] = last;
      pr[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && pr[l] < pr[m]) m = l;
        if (r < a.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [pr[i], pr[m]] = [pr[m], pr[i]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

const gScore = new Float32Array(N * 2);
const cameFrom = new Int32Array(N * 2);
const visitStamp = new Uint32Array(N * 2);
let stamp = 1;

export function findPath(s: GameState, from: number, goals: number[] | ((n: number) => boolean), access: Access, ctxIn?: PathCtx): number[] | null {
  const ctx = ctxIn ?? makeCtx(s);
  const goalSet = Array.isArray(goals) ? new Set(goals) : null;
  const isGoal = Array.isArray(goals) ? (n: number) => goalSet!.has(n) : goals;
  const single = Array.isArray(goals) && goals.length === 1 ? goals[0] : -1;
  const hatchI = idx(LAYOUT.hatch.x, LAYOUT.hatch.y);
  const hx = (n: number) => {
    if (single < 0) return 0;
    const a = n % N;
    const b = single % N;
    const layerCost = Math.floor(n / N) !== Math.floor(single / N) ? 3 : 0;
    return Math.abs((a % W) - (b % W)) + Math.abs(Math.floor(a / W) - Math.floor(b / W)) + layerCost;
  };
  stamp++;
  const heap = new Heap();
  gScore[from] = 0;
  cameFrom[from] = -1;
  visitStamp[from] = stamp;
  heap.push(from, hx(from));
  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (isGoal(cur)) {
      const path: number[] = [];
      let c = cur;
      while (c !== -1) {
        path.push(c);
        c = cameFrom[c];
      }
      return path.reverse();
    }
    if (++expanded > 6000) return null;
    const layer = cur >= N ? 1 : 0;
    const i = cur % N;
    const x = i % W;
    const y = Math.floor(i / W);
    const g = gScore[cur];
    const tryNode = (nn: number, cost: number) => {
      const ng = g + cost;
      if (visitStamp[nn] === stamp && gScore[nn] <= ng) return;
      visitStamp[nn] = stamp;
      gScore[nn] = ng;
      cameFrom[nn] = cur;
      heap.push(nn, ng + hx(nn));
    };
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nn = layer * N + idx(nx, ny);
      if (!nodeWalkable(ctx, nn, access)) continue;
      if (layer === 0 && !edgePassable(ctx, x, y, nx, ny, access)) continue;
      tryNode(nn, layer === 0 ? 1 + (access === ACCESS_CREW ? crewDanger[nn] : floorAvoid[nn]) : ceilingObstacle(ctx.d, nn - N) && !isGoal(nn) ? 1 + OBSTACLE_COST : 1);
    }
    if (access.ceiling) {
      if (i === hatchI || ctx.d.drops.has(i)) {
        const other = layer === 0 ? N + i : i;
        if (nodeWalkable(ctx, other, access)) tryNode(other, 3);
      }
    }
  }
  return null;
}

export const blocksWalking = (o: Placed) => !BUILD[o.type].walkable && !BUILD[o.type].drop && !BUILD[o.type].floor;
const OBSTACLE_COST = 12;

const ceilingObstacle = (d: Derived, i: number) => {
  const o = d.objAt.get(i);
  return !!o && blocksWalking(o);
};

export function besideTiles(s: GameState, o: Placed): number[] {
  const d = getDerived(s);
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const x = o.x + dx;
    const y = o.y + dy;
    if (inBounds(x, y) && s.deck[idx(x, y)] && !ceilingObstacle(d, idx(x, y))) out.push(nodeOf(1, x, y));
  }
  return out;
}

const ceilingWalkable = (s: GameState, x: number, y: number) => s.deck[idx(x, y)] === 1 || (x === LAYOUT.hatch.x && y === LAYOUT.hatch.y);
const EDGE_MARGIN = 0.3;
const MARGIN_OFFSETS = [
  [-EDGE_MARGIN, -EDGE_MARGIN],
  [EDGE_MARGIN, -EDGE_MARGIN],
  [-EDGE_MARGIN, EDGE_MARGIN],
  [EDGE_MARGIN, EDGE_MARGIN],
];

function clearCeilingLine(s: GameState, a: number, b: number): boolean {
  const ax = (a % W) + 0.5;
  const ay = Math.floor(a / W) + 0.5;
  const bx = (b % W) + 0.5;
  const by = Math.floor(b / W) + 0.5;
  const d = getDerived(s);
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.2);
  for (let k = 1; k < steps; k++) {
    const x = ax + ((bx - ax) * k) / steps;
    const y = ay + ((by - ay) * k) / steps;
    for (const [ox, oy] of MARGIN_OFFSETS) {
      const tx = Math.floor(x + ox);
      const ty = Math.floor(y + oy);
      if (!ceilingWalkable(s, tx, ty)) return false;
      const t = idx(tx, ty);
      if (t !== a && t !== b && ceilingObstacle(d, t)) return false;
    }
  }
  return true;
}

export function smoothCeilingPath(s: GameState, path: number[]): number[] {
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = i + 1;
    if (path[i] >= N && path[j] >= N) while (j + 1 < path.length && path[j + 1] >= N && clearCeilingLine(s, path[i] - N, path[j + 1] - N)) j++;
    out.push(path[j]);
    i = j;
  }
  return out;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function sightEdge(ax: number, ay: number, bx: number, by: number): boolean {
  const e = edgeBetween(LAYOUT, ax, ay, bx, by);
  return e === E_OPEN || e === E_GATE || e === E_GLASS || e === E_PUBLIC;
}

function blocksSight(x: number, y: number): boolean {
  const fi = LAYOUT.fixtureAt[idx(x, y)];
  return fi >= 0 && TALL.has(LAYOUT.fixtures[fi].kind);
}

export function sightFraction(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  let x = Math.floor(ax);
  let y = Math.floor(ay);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const deltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const deltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let nextX = dx !== 0 ? (dx > 0 ? x + 1 - ax : ax - x) * deltaX : Infinity;
  let nextY = dy !== 0 ? (dy > 0 ? y + 1 - ay : ay - y) * deltaY : Infinity;
  for (let guard = 0; guard < W + H && (x !== ex || y !== ey); guard++) {
    const corner = Math.abs(nextX - nextY) < 1e-9;
    const t = Math.min(nextX, nextY);
    if (t > 1) return 1;
    const nx = corner || nextX < nextY ? x + stepX : x;
    const ny = corner || nextY < nextX ? y + stepY : y;
    if (!inBounds(nx, ny)) return t;
    const open = corner ? (sightEdge(x, y, nx, y) && sightEdge(nx, y, nx, ny)) || (sightEdge(x, y, x, ny) && sightEdge(x, ny, nx, ny)) : sightEdge(x, y, nx, ny);
    if (!open) return t;
    if (nx !== x) nextX += deltaX;
    if (ny !== y) nextY += deltaY;
    x = nx;
    y = ny;
    if (blocksSight(x, y) && (x !== ex || y !== ey)) return t;
  }
  return 1;
}

export function lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
  return sightFraction(ax, ay, bx, by) >= 1;
}

export function sightPolygon(x: number, y: number, facing: number, fov: number, range: number): { x: number; y: number }[] {
  const rays = Math.max(16, Math.ceil(fov * range * 8));
  const points = [{ x, y }];
  for (let k = 0; k <= rays; k++) {
    const a = facing - fov / 2 + (fov * k) / rays;
    const tx = x + Math.cos(a) * range;
    const ty = y + Math.sin(a) * range;
    const f = sightFraction(x, y, tx, ty);
    points.push({ x: x + (tx - x) * f, y: y + (ty - y) * f });
  }
  return points;
}

export function cameraAngle(c: { angle: number; sweep: number; phase: number }, t: number) {
  return c.angle + Math.sin(t * 0.35 + c.phase) * c.sweep;
}

export const GUARD_NEAR_FIELD = 0.9;

export function coneSees(nx: number, ny: number, facing: number, fov: number, range: number, x: number, y: number, nearField = GUARD_NEAR_FIELD): number {
  const dx = x - nx;
  const dy = y - ny;
  const d = Math.hypot(dx, dy);
  if (d > range) return 0;
  if (d > nearField) {
    let diff = Math.atan2(dy, dx) - facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) > fov / 2) return 0;
  }
  if (!lineOfSight(nx, ny, x, y)) return 0;
  return Math.max(0.2, 1.2 - d / range);
}

export const CAMERA_FOV = 0.8;
export const CAMERA_RANGE = 7;

export function cameraWatching(s: GameState, x: number, y: number): boolean {
  if ((s.flags.blackoutUntil ?? 0) > s.time) return false;
  return s.cameras.some((c) => cameraLive(s, c) && coneSees(c.x, c.y, cameraAngle(c, s.time), CAMERA_FOV + 0.15, CAMERA_RANGE + 0.5, x, y, 0) > 0);
}

const TALL = new Set([
  'fountain',
  'palm',
  'shelf',
  'bookshelf',
  'rack',
  'cabinet',
  'vending',
  'boxes',
  'panel',
  'boiler',
  'kiosk',
  'dumpster',
  'prize',
  'ddr',
  'cage',
  'directory',
  'car',
  'oven',
  'lostfound',
]);

export function roomTiles(ri: number): number[] {
  const r = LAYOUT.rooms[ri];
  const out: number[] = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (LAYOUT.roomAt[idx(x, y)] === ri) out.push(idx(x, y));
  return out;
}

export function nearestWalkableInRoom(ri: number, x: number, y: number): { x: number; y: number } {
  let best = { x, y };
  let bd = Infinity;
  for (const i of roomTiles(ri)) {
    if (!mallWalkable(i)) continue;
    const tx = i % W;
    const ty = Math.floor(i / W);
    const dd = Math.hypot(tx - x, ty - y);
    if (dd < bd) {
      bd = dd;
      best = { x: tx, y: ty };
    }
  }
  return best;
}
