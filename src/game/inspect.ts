import { BUILD } from './defs';
import { LAYOUT, N, W, idx, inBounds } from './layout';
import { log, notify, pa, pressure, rand, raiseSuspicion, sfx, unlock } from './ops';
import type { GameState, Inspection, InspectionKind, Placed } from './state';
import { dayOf, minuteOfDay, morningOf, weekOf } from './time';
import { getDerived, markDirty, roomTiles } from './world';

const RADIUS: Record<InspectionKind, number> = { complaint: 3, power: 2, pest: 3, fire: 4, sweep: 5 };

export const INSPECTORS: Record<InspectionKind, { npc: string; who: string; label: string }> = {
  complaint: { npc: 'Dale (Maintenance)', who: 'Dale', label: 'Maintenance' },
  power: { npc: 'Electrician', who: 'The electrician', label: 'Electrician' },
  pest: { npc: 'Pest Control', who: 'Pest control', label: 'Pest control' },
  fire: { npc: 'Fire Marshal', who: 'The Fire Marshal', label: 'Fire marshal' },
  sweep: { npc: 'Police', who: 'The police', label: 'Police sweep' },
};

export const DECOY_PRICES = [25, 40, 60, 90];

export const decoyPrice = (s: GameState, room: number) => DECOY_PRICES[Math.min(DECOY_PRICES.length - 1, room >= 0 ? s.rooms[room].decoys : 0)];

export function nextMorning(s: GameState, hour = 7): number {
  const day = dayOf(s.time);
  const today = day * 1440 + hour * 60;
  return minuteOfDay(s.time) < hour * 60 - 30 ? today : today + 1440;
}

function firstFreeMorning(s: GameState): number {
  let at = nextMorning(s);
  while (s.inspections.some((i) => i.state !== 'done' && dayOf(i.at) === dayOf(at))) at += 1440;
  return at;
}

export function scheduleInspection(s: GameState, room: number, kind: InspectionKind, reason: string, at?: { x: number; y: number }): Inspection | null {
  if (s.inspections.some((i) => i.room === room && i.state !== 'done' && i.kind === kind)) return null;
  const r = LAYOUT.rooms[room];
  const rs = s.rooms[room];
  let x = at?.x ?? (rs.hotW > 0 ? rs.hotX : rand.int(r.x0, r.x1));
  let y = at?.y ?? (rs.hotW > 0 ? rs.hotY : rand.int(r.y0, r.y1));
  x = Math.max(r.x0, Math.min(r.x1, x));
  y = Math.max(r.y0, Math.min(r.y1, y));
  const ins: Inspection = {
    id: s.nextId++,
    room,
    x,
    y,
    radius: RADIUS[kind],
    kind,
    at: firstFreeMorning(s),
    state: 'scheduled',
    npcId: -1,
    reason,
  };
  s.inspections.push(ins);
  const when = morningOf(dayOf(s.time), dayOf(ins.at));
  pa(s, `${INSPECTORS[kind].who} will check the ceiling above ${r.name} ${when}. ${reason}`);
  notify(`Inspection ${when} above ${r.name}.`, { x, y, layer: 1 }, true);
  sfx('alert');
  return ins;
}

const MAX_PENDING_COMPLAINTS = 2;
const ROUTINE_CHECK_SUSPICION = 20;

export const inspectionChancePerDay = (s: GameState) => (0.15 + s.suspicion * 0.015) * pressure(s, 4, 6);

export function rollInspection(s: GameState) {
  if (s.inspections.filter((i) => i.kind === 'complaint' && i.state !== 'done').length >= MAX_PENDING_COMPLAINTS) return;
  if (!rand.chance(inspectionChancePerDay(s) / 24)) return;
  const rooms = LAYOUT.rooms.map((r, ri) => (r.ceiling && !s.rooms[ri].vacant ? s.rooms[ri].complaint : 0));
  const total = rooms.reduce((a, w) => a + w, 0);
  if (total < 10) {
    if (s.suspicion >= ROUTINE_CHECK_SUSPICION) scheduleNear(s, 'complaint', 'Routine ceiling check.', 1);
    return;
  }
  let roll = rand.next() * total;
  const ri = rooms.findIndex((w) => (roll -= w) <= 0);
  const r = LAYOUT.rooms[ri];
  scheduleInspection(s, ri, 'complaint', `Complaints about ${r.kind === 'service' || r.kind === 'concourse' ? 'creaking' : 'noises and smells'} overhead.`);
}

export function scheduleNear(s: GameState, kind: InspectionKind, reason: string, count: number) {
  const decks: number[] = [];
  for (let i = 0; i < N; i++) if (s.deck[i]) decks.push(i);
  for (let k = 0; k < count; k++) {
    let x: number;
    let y: number;
    if (decks.length) {
      const t = rand.pick(decks);
      x = (t % W) + rand.int(-3, 3);
      y = Math.floor(t / W) + rand.int(-3, 3);
    } else {
      x = rand.int(8, 40);
      y = rand.int(4, 21);
    }
    if (!inBounds(x, y)) continue;
    const room = LAYOUT.roomAt[idx(x, y)];
    if (room < 0 || !LAYOUT.rooms[room].ceiling || LAYOUT.rooms[room].kind === 'court') continue;
    scheduleInspection(s, room, kind, reason, { x, y });
  }
}

export function inZone(ins: Inspection, x: number, y: number): boolean {
  return Math.max(Math.abs(x - ins.x), Math.abs(y - ins.y)) <= ins.radius;
}

export interface InspectionForecast {
  verdict: 'sign' | 'raccoon' | 'search';
  confiscated: Placed[];
  stashed: Placed[];
  decoy: Placed | null;
  sign: Placed | null;
  deckTiles: number[];
  crewHome: boolean;
  value: number;
  splits: boolean;
}

const homeCrew = (s: GameState) => s.crew.filter((c) => c.layer === 1 && c.state !== 'away');

function splitsHome(s: GameState, torn: Set<number>): boolean {
  const hatch = idx(LAYOUT.hatch.x, LAYOUT.hatch.y);
  const seen = new Set([hatch]);
  const queue = [hatch];
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % W;
    const y = Math.floor(i / W);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (!inBounds(nx, ny)) continue;
      const n = idx(nx, ny);
      if (seen.has(n) || !s.deck[n] || torn.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return s.deck.some((v, i) => v && !torn.has(i) && !seen.has(i));
}

export function forecastInspection(s: GameState, ins: Inspection): InspectionForecast {
  const d = getDerived(s);
  const helpers = homeCrew(s).length;
  const crewHome = helpers > 0;
  const base = { confiscated: [], stashed: [], decoy: null, sign: null, deckTiles: [], crewHome, value: 0, splits: false };
  const ignoresDecoy = ins.kind === 'fire' || ins.kind === 'sweep';
  const sign = ignoresDecoy ? undefined : d.signs.find((o) => Math.max(Math.abs(o.x - ins.x), Math.abs(o.y - ins.y)) <= BUILD[o.type].deterRadius!);
  if (sign) return { ...base, verdict: 'sign', sign };
  const decoy = ignoresDecoy ? undefined : s.objects.find((o) => BUILD[o.type].decoy && inZone(ins, o.x, o.y));
  if (decoy) return { ...base, verdict: 'raccoon', decoy };

  const inside = s.objects.filter((o) => !BUILD[o.type].floor && inZone(ins, o.x, o.y));
  const carried = inside
    .filter((o) => !BUILD[o.type].portable && !BUILD[o.type].drop)
    .sort((a, b) => BUILD[b.type].cost - BUILD[a.type].cost)
    .slice(0, helpers);
  const stashed = inside.filter((o) => (crewHome && BUILD[o.type].portable) || carried.includes(o));
  const confiscated = inside.filter((o) => !stashed.includes(o));
  const kept = new Set(stashed.map((o) => idx(o.x, o.y)));
  const hatch = idx(LAYOUT.hatch.x, LAYOUT.hatch.y);
  const deckTiles: number[] = [];
  for (let y = ins.y - ins.radius; y <= ins.y + ins.radius; y++)
    for (let x = ins.x - ins.radius; x <= ins.x + ins.radius; x++) {
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      if (s.deck[i] && i !== hatch && !kept.has(i)) deckTiles.push(i);
    }
  const value = confiscated.reduce((a, o) => a + BUILD[o.type].cost, 0) + deckTiles.length * BUILD.deck.cost;
  return { ...base, verdict: 'search', confiscated, stashed, deckTiles, value, splits: splitsHome(s, new Set(deckTiles)) };
}

export const signUsesLeft = (o: Placed) => (BUILD[o.type].deterUses ?? Infinity) - (o.deterred ?? 0);

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function forecastLabel(f: InspectionForecast): string {
  if (f.verdict === 'sign') return signUsesLeft(f.sign!) === 1 ? "They'll see the sign and leave · it comes down after" : "They'll see the sign and leave";
  if (f.verdict === 'raccoon') return "They'll blame the raccoon";
  const parts: string[] = [];
  if (f.confiscated.length || f.deckTiles.length) parts.push(`Will find ${count(f.confiscated.length, 'item')} + ${count(f.deckTiles.length, 'deck')} ($${f.value})`);
  else parts.push('Nothing to find');
  if (f.stashed.length) parts.push(`${f.stashed.length} stashed`);
  if (f.splits) parts.push('cuts home in two');
  return parts.join(' · ');
}

export const garyCanCover = (s: GameState) => s.gary.insider && !s.gary.replaced && s.gary.coverWeek !== weekOf(dayOf(s.time));

export function coverInspection(s: GameState, ins: Inspection) {
  if (!garyCanCover(s) || ins.state !== 'scheduled') return;
  s.gary.coverWeek = weekOf(dayOf(s.time));
  ins.state = 'done';
  log(s, `Gary told ${INSPECTORS[ins.kind].who === 'Dale' ? 'Dale' : 'the front desk'} the ceiling above ${LAYOUT.rooms[ins.room].name} was already checked. He initialed the form himself.`, 'good', { x: ins.x, y: ins.y, layer: 1 });
  sfx('good');
}

export function revealInspection(s: GameState, ins: Inspection) {
  const forecast = forecastInspection(s, ins);
  ins.state = 'done';
  s.stats.inspections++;
  const room = LAYOUT.rooms[ins.room];
  const rs = s.rooms[ins.room];
  const focus = { x: ins.x, y: ins.y, layer: 1 as const };
  const who = INSPECTORS[ins.kind].who;

  if (forecast.verdict === 'sign') {
    rs.complaint = Math.max(0, rs.complaint - 30);
    s.stats.inspectionsFoundNothing++;
    const sign = forecast.sign!;
    const second = (sign.deterred ?? 0) > 0;
    sign.deterred = (sign.deterred ?? 0) + 1;
    const spent = signUsesLeft(sign) <= 0;
    if (spent) {
      s.objects = s.objects.filter((o) => o !== sign);
      markDirty();
    }
    const aside = spent ? ' On the way out, they peeled the sign off and took it.' : second ? ' They did squint at it longer this time.' : '';
    log(s, `${who} shined a flashlight on the ASBESTOS sign above ${room.name}, said "nope," and wrote it up as checked.${aside}`, 'good', focus);
    sfx('good');
    return;
  }

  if (forecast.verdict === 'raccoon') {
    const again = rs.decoys > 0;
    const nextPrice = DECOY_PRICES[Math.min(DECOY_PRICES.length - 1, rs.decoys + 1)];
    rs.decoys++;
    rs.complaint = 0;
    s.stats.raccoons++;
    s.objects = s.objects.filter((o) => o !== forecast.decoy);
    markDirty();
    raiseSuspicion(s, -3, 'raccoon');
    unlock(s, 'RACCOONS');
    sfx('squeak');
    pa(s, `Maintenance update: the noises in ${room.name} were a RACCOON. Pest control has been notified. Carry on, shoppers.`);
    log(
      s,
      again
        ? `"Another raccoon? Same one?" The decoy above ${room.name} worked. The next one here costs $${nextPrice}.`
        : `"IT WAS RACCOONS." Pest control hauled the decoy out of the ceiling above ${room.name}. Worth every penny.`,
      'good',
      focus,
    );
    return;
  }

  const { confiscated, stashed, deckTiles, value, splits } = forecast;
  const decks = deckTiles.length;
  const lost = new Set(confiscated);
  for (const i of deckTiles) s.deck[i] = 0;
  const caught = homeCrew(s).filter((c) => inZone(ins, Math.floor(c.x), Math.floor(c.y)));
  if (stashed.length) log(s, `The Bats scrambled and carried ${count(stashed.length, 'item')} out of the zone before the ladder went up.`, 'info', focus);
  if (confiscated.length || decks) {
    s.objects = s.objects.filter((o) => !lost.has(o));
    markDirty();
    raiseSuspicion(s, Math.min(13, 4 + confiscated.length * 1.1 + decks * 0.08), `Squatter camp found above ${room.name}`);
    rs.complaint = 0;
    sfx('bad');
    pa(s, `Attention staff: evidence of trespassers found in the ceiling above ${room.name}. Security has been notified.`);
    const names = [...new Set(confiscated.map((o) => BUILD[o.type].name))].slice(0, 4).join(', ');
    log(s, `Discovered! ${who} tore out ${count(decks, 'deck')}${confiscated.length ? ` and confiscated ${count(confiscated.length, 'item')} (${names})` : ''}, worth about $${value}.`, 'bad', focus);
    if (splits) log(s, 'The torn-out plywood cut home in two. Lay a new path back to the hatch.', 'warn', focus);
  } else if (!caught.length) {
    s.stats.inspectionsFoundNothing++;
    rs.complaint = Math.max(0, rs.complaint - 20);
    raiseSuspicion(s, -2, 'nothing found');
    unlock(s, 'NOTHING');
    log(s, `${who} poked a head into the ceiling above ${room.name}. "Nothing up here but dust. Must be the pipes."`, 'good', focus);
    sfx('good');
  }
  if (caught.length) {
    s.stats.spotted += caught.length;
    raiseSuspicion(s, 3 * caught.length, 'a face in the ceiling');
    log(s, `${caught.map((c) => c.name).join(' and ')} scrambled off across the plywood as a flashlight swept the ceiling. ${who} saw someone.`, 'bad', focus);
  }
}

export function inspectionHotspotUpdate(s: GameState, field: Float32Array, smell: number[]) {
  const d = getDerived(s);
  for (let ri = 0; ri < LAYOUT.rooms.length; ri++) {
    const r = LAYOUT.rooms[ri];
    if (!r.ceiling) continue;
    const rs = s.rooms[ri];
    rs.hotW *= 0.995;
    for (const i of roomTiles(ri)) {
      const w = field[i] + smell[i] * 0.05 + (d.drops.has(i) ? 0.5 : 0) + (d.objAt.get(i)?.type === 'siphon' ? 0.7 : 0);
      if (w > rs.hotW) {
        rs.hotW = w;
        rs.hotX = i % W;
        rs.hotY = Math.floor(i / W);
      }
    }
  }
}
