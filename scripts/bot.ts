import { newGame } from '../src/game/create';
import { recruitBlocked, resolveModal, showVisitor } from '../src/game/events';
import { jobBlocked } from '../src/game/crew';
import { forecastInspection } from '../src/game/inspect';
import { LAYOUT } from '../src/game/layout';
import { auctionBid, levelOf } from '../src/game/ops';
import { buyFood, demolishAt, leaseKiosk, openPopup, placeObject, tick } from '../src/game/sim';
import { dayOf, formatDate, minuteOfDay } from '../src/game/time';
import { getDerived } from '../src/game/world';
import { BUILD, KIOSK_LEVEL, POPUP_LEVEL, type BuildId, type JobId } from '../src/game/defs';
import type { Difficulty } from '../src/game/state';

const difficulty = (process.argv[2] ?? 'normal') as Difficulty;
const seed = Number(process.argv[3] ?? 7);
const verbose = process.argv.includes('-v');
const s = newGame({ name: 'Jace' }, difficulty, seed);

const deckPlan: [number, number][] = [];
for (let x = 8; x <= 40; x++) deckPlan.push([x, 2], [x, 3]);
for (let y = 4; y <= 10; y++) deckPlan.push([12, y], [11, y]);
for (const [x, y] of [
  [18, 4],
  [19, 4],
  [19, 5],
  [20, 5],
  [21, 5],
  [22, 5],
  [23, 5],
  [24, 5],
  [25, 5],
  [26, 5],
  [27, 5],
])
  deckPlan.push([x, y]);
for (let y = 4; y <= 9; y++) for (const x of [32, 33, 35, 36]) deckPlan.push([x, y]);
for (const [x, y] of [
  [15, 4],
  [15, 5],
  [15, 6],
  [18, 5],
  [18, 6],
  [18, 7],
  [18, 8],
  [18, 9],
  [18, 10],
  [18, 11],
  [19, 11],
  [19, 12],
])
  deckPlan.push([x, y]);

const objPlan: { type: BuildId; x: number; y: number; minCash: number }[] = [
  ...[10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40].map((x) => ({ type: 'foam' as BuildId, x, y: 3, minCash: 40 })),
  { type: 'sleeping_bag', x: 10, y: 2, minCash: 0 },
  { type: 'splice', x: 12, y: 2, minCash: 0 },
  { type: 'lamp', x: 11, y: 2, minCash: 0 },
  { type: 'cooler', x: 13, y: 2, minCash: 30 },
  { type: 'sleeping_bag', x: 14, y: 2, minCash: 30 },
  { type: 'crate', x: 15, y: 2, minCash: 30 },
  { type: 'hot_plate', x: 26, y: 5, minCash: 60 },
  { type: 'splice', x: 25, y: 5, minCash: 60 },
  { type: 'sleeping_bag', x: 16, y: 2, minCash: 40 },
  { type: 'splice', x: 35, y: 6, minCash: 100 },
  { type: 'tv', x: 33, y: 6, minCash: 150 },
  { type: 'fridge', x: 17, y: 2, minCash: 150 },
  { type: 'futon', x: 18, y: 2, minCash: 150 },
  { type: 'lava_lamp', x: 32, y: 6, minCash: 100 },
  { type: 'futon', x: 19, y: 2, minCash: 200 },
  { type: 'crate', x: 20, y: 2, minCash: 60 },
  { type: 'rope', x: 15, y: 6, minCash: 80 },
  { type: 'rope', x: 19, y: 12, minCash: 80 },
  { type: 'rope', x: 35, y: 8, minCash: 80 },
  { type: 'workbench', x: 36, y: 8, minCash: 250 },
  { type: 'futon', x: 32, y: 7, minCash: 150 },
  { type: 'crate', x: 35, y: 7, minCash: 60 },
  { type: 'lamp', x: 36, y: 7, minCash: 60 },
  { type: 'splice', x: 12, y: 9, minCash: 200 },
  { type: 'pc', x: 12, y: 10, minCash: 400 },
  { type: 'raccoon', x: 33, y: 8, minCash: 300 },
  { type: 'bunk', x: 21, y: 2, minCash: 300 },
  { type: 'crate', x: 22, y: 2, minCash: 60 },
  { type: 'crate', x: 23, y: 2, minCash: 60 },
  { type: 'bunk', x: 24, y: 2, minCash: 400 },
  { type: 'xmas', x: 25, y: 2, minCash: 100 },
  { type: 'heater', x: 26, y: 2, minCash: 200 },
  { type: 'battery', x: 30, y: 2, minCash: 800 },
  { type: 'heater', x: 29, y: 2, minCash: 200 },
  { type: 'workbench', x: 32, y: 8, minCash: 500 },
  { type: 'crate', x: 31, y: 2, minCash: 60 },
  { type: 'crate', x: 31, y: 3, minCash: 60 },
];

const nightJobs: JobId[] = ['fountain', 'radiohut', 'arcade', 'pallets', 'stockroom', 'dumpster', 'lostfound', 'gary'];
const dayJobs: JobId[] = ['busk', 'tinker', 'kiosk', 'popup', 'samples', 'busk', 'tinker', 'returns'];

function reactToInspections() {
  const d = getDerived(s);
  for (const ins of s.inspections) {
    if (ins.state !== 'scheduled') continue;
    const inZone = (x: number, y: number) => Math.max(Math.abs(x - ins.x), Math.abs(y - ins.y)) <= ins.radius;
    if (!forecastInspection(s, ins).confiscated.length) continue;
    if (levelOf(s) >= 5 && s.cash >= 45 && !s.objects.some((o) => o.type === 'raccoon' && inZone(o.x, o.y))) {
      for (let y = ins.y - 1; y <= ins.y + 1; y++)
        for (let x = ins.x - 1; x <= ins.x + 1; x++)
          if (!s.objects.some((o) => o.type === 'raccoon' && inZone(o.x, o.y)) && s.deck[y * 48 + x] && !d.objAt.has(y * 48 + x)) placeObject(s, 'raccoon', x, y);
    }
    const f = forecastInspection(s, ins);
    for (const o of f.confiscated) demolishAt(s, o.x, o.y);
  }
}

function manage() {
  const r = levelOf(s);
  reactToInspections();
  if (s.food < 8) buyFood(s, 10);
  const reserve = s.crew.length < 3 ? 60 : 20;
  for (const [x, y] of deckPlan) if (s.cash > reserve) placeObject(s, 'deck', x, y);
  const planned = new Set(s.inspections.filter((i) => i.state === 'scheduled').flatMap((i) => objPlan.filter((o) => Math.max(Math.abs(o.x - i.x), Math.abs(o.y - i.y)) <= i.radius)));
  for (const o of objPlan) {
    if (planned.has(o)) continue;
    if (r < BUILD[o.type].level || s.cash < o.minCash + reserve) continue;
    if (s.objects.some((p) => p.x === o.x && p.y === o.y)) continue;
    placeObject(s, o.type, o.x, o.y);
  }
  if (r >= KIOSK_LEVEL && s.cash > 1500 && !s.business.kiosk) leaseKiosk(s);
  if (r >= POPUP_LEVEL && s.cash > 4000 && s.business.popupRoom < 0) {
    const vacant = s.rooms.findIndex((x) => x.vacant && !x.popup);
    if (vacant >= 0) openPopup(s, vacant);
  }
  const rotation = Math.floor(dayOf(s.time) / 4);
  s.crew.forEach((c, i) => {
    const open = (jobs: JobId[]) => jobs.filter((j) => !jobBlocked(s, c, j));
    const nights = open(nightJobs);
    const days = open(dayJobs);
    const night = nights[(i + rotation) % nights.length] ?? 'rest';
    const day = days[(i + rotation) % days.length] ?? 'rest';
    const lyingLow = s.suspicion > 45 && i >= 2;
    c.nightJob = lyingLow || (c.energy < 25 && minuteOfDay(s.time) < 20 * 60 && minuteOfDay(s.time) > 8 * 60) ? 'rest' : night;
    c.dayJob = c.energy < 35 || c.heat > 70 ? 'rest' : day;
  });
  for (const v of [...s.ladder]) if (!recruitBlocked(s)) showVisitor(s, v);
}

let lastDay = -1;
let logSeen = 0; // LOGALL
while (!s.over) {
  while (s.modals.length) {
    const m = s.modals[0];
    const c = m.choices.find((x) => !x.disabled && x.action !== 'gary_insider') ?? m.choices.find((x) => !x.disabled)!;
    if (verbose) console.log(`  [modal] ${m.title} -> ${c.label}`);
    resolveModal(s, m.id, c.action);
  }
  if (minuteOfDay(s.time) % 60 < 5) manage();
  tick(s, 5);
  if (process.argv.includes('-l')) {
    for (const l of s.log)
      if (l.id > logSeen && (l.kind === 'bad' || l.kind === 'warn'))
        console.log(`    ${formatDate(dayOf(l.t))} ${Math.floor((l.t % 1440) / 60)}:${String(Math.floor(l.t % 60)).padStart(2, '0')} ${l.text} ${l.focus ? `@${l.focus.x},${l.focus.y}` : ''}`);
    logSeen = s.log.at(-1)?.id ?? logSeen;
  }
  const d = dayOf(s.time);
  if (d !== lastDay) {
    lastDay = d;
    if (verbose || d % 7 === 0)
      console.log(
        `${formatDate(d).padEnd(18)} cash=$${s.cash.toFixed(0).padStart(6)} earned=$${s.totalEarned.toFixed(0).padStart(6)} yday=$${(s.dailyIncome.at(-1) ?? 0).toString().padStart(5)} lv=${levelOf(s)} food=${String(s.food).padStart(3)} parts=${s.parts} goods=${s.goods} sus=${s.suspicion.toFixed(1).padStart(5)} crew=${s.crew.length} bid=$${auctionBid(s)} caught=${s.stats.caught} spotted=${s.stats.spotted} insp=${s.stats.inspections}`,
      );
  }
}
console.log('OVER:', s.over.title, `cash=$${s.cash.toFixed(0)} bid=$${auctionBid(s)} day=${dayOf(s.time)}`);
console.log('stats', s.stats);
console.log(
  'complaints',
  s.rooms.map((r, i) => [LAYOUT.rooms[i].id, Math.round(r.complaint)]).filter((x) => (x[1] as number) > 5),
);
console.log('mood', s.mood.toFixed(0), 'missedMeals', s.missedMeals, s.crew.map((c) => `${c.name}: fam${c.heat.toFixed(0)}`).join(' '));
if (verbose) for (const l of s.log.slice(-60)) console.log(`  [${l.kind}] ${l.text}`);
