import { newGame, loadGame, saveGame, hasSave, clearSave, SAVE_VERSION } from '../src/game/create';
import { callOff, jobBlocked, planJob } from '../src/game/crew';
import { resolveHijinx } from '../src/game/hijinx';
import { forecastInspection, scheduleInspection } from '../src/game/inspect';
import { LAYOUT, idx } from '../src/game/layout';
import { suspicionDecay } from '../src/game/ops';
import { buildCost, demolishAt, moveObject, placeObject, tick } from '../src/game/sim';
import type { GameState, Inspection } from '../src/game/state';
import { dayOf } from '../src/game/time';

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  },
});

let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`ok  ${name}`);
    return;
  }
  failed++;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function near(name: string, got: number, expected: number) {
  check(name, Math.abs(got - expected) < 1e-9, `got ${got}, expected ${expected}`);
}

function game(seed = 1): GameState {
  const s = newGame({ name: 'Ada' }, 'normal', seed);
  s.modals = [];
  return s;
}

function placement() {
  const s = game();
  const start = s.cash;
  check('deck must touch territory', placeObject(s, 'deck', 12, 3) === 'Must connect to your territory');
  check('bag needs a deck', placeObject(s, 'sleeping_bag', 10, 3) === 'Needs a plywood deck');
  check('deck beside the hatch', placeObject(s, 'deck', 10, 3) === null);
  check('bag on that deck', placeObject(s, 'sleeping_bag', 10, 3) === null);
  near('cash after deck and bag', s.cash, start - 6 - 15);

  check('demolish pays 60% of the bag', demolishAt(s, 10, 3) === null && s.cash === start - 6 - 15 + 9 && s.objects.length === 0);

  const bat = s.crew[0];
  bat.x = 10.2;
  bat.y = 3.2;
  bat.layer = 1;
  check('occupied deck stays', demolishAt(s, 10, 3) === 'Someone is standing there' && s.deck[idx(10, 3)] === 1);
  bat.x = 9.5;
  check('empty deck refunds $3', demolishAt(s, 10, 3) === null && s.deck[idx(10, 3)] === 0 && s.cash === start - 6 - 15 + 9 + 3);
  check('bare tile demolishes nothing', demolishAt(s, 10, 3) === 'Nothing to remove');
}

function jobs() {
  const s = game();
  const bat = s.crew[0];
  check('returns is locked at level 1', jobBlocked(s, bat, 'returns') === 'Unlocks at Level 3');
  s.pools.fountain = 0;
  check('an empty pool is picked clean', jobBlocked(s, bat, 'fountain') === 'Picked clean for today');
  check('fountain is open when the pool has coins', (s.pools.fountain = 60) === 60 && jobBlocked(s, bat, 'fountain') === null);
}

function suspicion() {
  const fresh = game();
  fresh.suspicion = 40;
  near('normal clean-night decay', suspicionDecay(fresh, true), 2.6 + 1.5 + 2);
  near('normal spotted-night decay', suspicionDecay(fresh, false), 2.6 + 2);
  fresh.difficulty = 'easy';
  near('easy spotted-night decay', suspicionDecay(fresh, false), 4 + 2);
  fresh.difficulty = 'hard';
  near('hard clean-night decay', suspicionDecay(fresh, true), 1.6 + 1.5 + 2);

  for (const clean of [true, false]) {
    const s = game();
    s.time = 1799.9;
    s.lastDay = 0;
    s.suspicion = 20;
    s.spottedTonight = !clean;
    s.crew[0].state = 'sleeping';
    const expected = 20 - suspicionDecay(s, clean);
    tick(s, 0.2);
    near(`6:00 AM applies ${clean ? 'clean' : 'spotted'} decay`, s.suspicion, expected);
  }
}

function inspectionAt(s: GameState, kind: Inspection['kind']): Inspection {
  return { id: 1, room: 0, x: 10, y: 3, radius: 0, kind, at: 0, state: 'scheduled', npcId: -1, reason: 'check' };
}

function inspections() {
  const home = game();
  placeObject(home, 'deck', 10, 3);
  placeObject(home, 'sleeping_bag', 10, 3);
  const stashed = forecastInspection(home, inspectionAt(home, 'complaint'));
  check('a Bat at home stashes a portable', stashed.verdict === 'search' && stashed.crewHome && stashed.stashed.length === 1 && stashed.confiscated.length === 0 && stashed.deckTiles.length === 0 && stashed.value === 0);

  const carry = game();
  carry.cash = 1000;
  placeObject(carry, 'deck', 10, 3);
  placeObject(carry, 'deck', 11, 3);
  placeObject(carry, 'futon', 10, 3);
  placeObject(carry, 'tv', 11, 3);
  const carried = forecastInspection(carry, { ...inspectionAt(carry, 'complaint'), radius: 2 });
  check('one Bat at home carries the priciest big item out', carried.stashed.map((o) => o.type).join() === 'tv' && carried.confiscated.map((o) => o.type).join() === 'futon');

  home.crew[0].layer = 0;
  const caught = forecastInspection(home, inspectionAt(home, 'complaint'));
  check('nobody home means the bag and the deck are found', !caught.crewHome && caught.confiscated.length === 1 && caught.deckTiles.length === 1 && caught.value === 15 + 6);

  const decoy = game();
  placeObject(decoy, 'deck', 10, 3);
  placeObject(decoy, 'raccoon', 10, 3);
  check('a complaint blames the raccoon', forecastInspection(decoy, inspectionAt(decoy, 'complaint')).verdict === 'raccoon');
  check('the fire marshal ignores the raccoon', forecastInspection(decoy, inspectionAt(decoy, 'fire')).verdict === 'search');
}

function decoys() {
  const s = game();
  const room = LAYOUT.roomAt[idx(10, 3)];
  near('a first raccoon costs $25', buildCost(s, 'raccoon', 10, 3), 25);
  s.rooms[room].decoys = 1;
  near('a second raccoon above the same store costs $40', buildCost(s, 'raccoon', 10, 3), 40);
  near('other stores still pay $25', buildCost(s, 'raccoon', 30, 6), 25);
}

function queue() {
  const s = game();
  s.time = 2 * 1440 + 12 * 60;
  const a = scheduleInspection(s, LAYOUT.roomIndex['corridor'], 'complaint', 'a');
  const b = scheduleInspection(s, LAYOUT.roomIndex['hotspot'], 'power', 'b');
  check('two inspections land on different mornings', !!a && !!b && dayOf(b.at) === dayOf(a.at) + 1);
}

function shifts() {
  const s = game();
  s.time = 23 * 60;
  const bat = s.crew[0];
  bat.nightJob = 'fountain';
  s.pools.fountain = 0;
  check('a picked-clean job means rest', planJob(s, bat) === 'rest');
  s.pools.fountain = 60;
  check('the main job wins when it has coins', planJob(s, bat) === 'fountain');
  callOff(s, bat);
  check('calling a Bat off rests them for the shift', planJob(s, bat) === 'rest' && bat.nightJob === 'fountain');
  s.time += 1440;
  check('the call-off ends with the shift', planJob(s, bat) === 'fountain');
  bat.energy = 5;
  check('an exhausted Bat refuses work', planJob(s, bat) === 'rest');
}

function reportAt(s: GameState, room: number) {
  s.rooms[room].complaint = 101;
  tick(s, 1);
}

function stores() {
  const s = game();
  s.time = 3 * 1440 + 12 * 60;
  s.lastDay = dayOf(s.time - 360);
  const room = LAYOUT.roomIndex['hotspot'];
  const before = s.mallHealth;
  for (let k = 0; k < 3; k++) reportAt(s, room);
  check('three reports leave the store open', !s.rooms[room].vacant && s.rooms[room].strain >= 2.9);
  reportAt(s, room);
  check('a fourth report breaks the lease', s.rooms[room].vacant && s.mallHealth < before);

  const lockdown = game();
  lockdown.time = s.time;
  lockdown.lastDay = s.lastDay;
  lockdown.suspicion = 85;
  reportAt(lockdown, LAYOUT.roomIndex['ebgamez']);
  check('a store report in Lockdown brings a police sweep', lockdown.inspections.some((i) => i.kind === 'sweep'));
}

function moving() {
  const s = game();
  placeObject(s, 'deck', 10, 3);
  placeObject(s, 'deck', 11, 3);
  placeObject(s, 'sleeping_bag', 10, 3);
  const bag = s.objects[0];
  const cash = s.cash;
  check('moving a bag is free', moveObject(s, bag, 11, 3) === null && bag.x === 11 && s.cash === cash);
  check('moving onto bare ceiling fails', moveObject(s, bag, 20, 3) === 'Needs a plywood deck');
}

function saves() {
  store.clear();
  const s = newGame({ name: 'Ada' }, 'hard', 42);
  s.modals = [];
  placeObject(s, 'deck', 10, 3);
  placeObject(s, 'sleeping_bag', 10, 3);
  s.cash = 77;
  s.crew[0].awayUntil = Infinity;
  saveGame(s);
  check('a save is there', hasSave());

  const loaded = loadGame();
  check(
    'load keeps cash, seed, deck, bag, and an infinite bail',
    !!loaded && loaded.cash === 77 && loaded.seed === 42 && loaded.difficulty === 'hard' && loaded.version === SAVE_VERSION && loaded.deck[idx(10, 3)] === 1 && loaded.objects.length === 1 && loaded.objects[0].type === 'sleeping_bag' && loaded.crew[0].name === 'Ada' && loaded.crew[0].awayUntil === Infinity,
  );

  const key = [...store.keys()][0];
  const old = JSON.parse(store.get(key)!);
  old.version = 4;
  for (const c of old.crew) delete c.calledOff;
  delete old.ladder;
  store.set(key, JSON.stringify(old));
  const upgraded = loadGame();
  check('a version 4 save upgrades', !!upgraded && upgraded.version === SAVE_VERSION && upgraded.crew[0].calledOff === '' && Array.isArray(upgraded.ladder));

  const broken = JSON.parse(store.get(key)!);
  broken.version = SAVE_VERSION + 1;
  store.set(key, JSON.stringify(broken));
  check('a different save version is refused', loadGame() === null && hasSave());

  clearSave();
  check('clear removes the save', !hasSave() && loadGame() === null);
}

function atSixAM(s: GameState) {
  s.time = 1799.9;
  s.lastDay = 0;
  tick(s, 0.2);
}

function hijinx() {
  const pet = game();
  pet.flags.ferret = 1;
  pet.food = 0;
  tick(pet, 1);
  check('Bandit moves into the ceiling', !!pet.pet && pet.pet.layer === 1);
  atSixAM(pet);
  check('Bandit brings home 1 food in the morning', pet.food === 1, `food ${pet.food}`);

  const hung = game();
  placeObject(hung, 'deck', 10, 3);
  resolveHijinx(hung, 'hotdog', 2, hung.crew[0].id);
  check('hanging the hot dog puts it on the plywood', hung.objects.some((o) => o.type === 'hotdog' && o.x === 10 && o.y === 3));

  const worn = game();
  placeObject(worn, 'deck', 10, 3);
  const bat = worn.crew[0];
  resolveHijinx(worn, 'hotdog', 0, bat.id);
  check('wearing the hot dog suit is a costume', bat.costume?.id === 'hotdog');
  bat.costume!.until = 0;
  atSixAM(worn);
  check('a worn-out suit ends up hanging in the ceiling', !bat.costume && worn.objects.some((o) => o.type === 'hotdog'));
}

function determinism() {
  const play = (seed: number) => {
    const s = game(seed);
    tick(s, 12);
    return JSON.stringify(s);
  };
  const a = play(7);
  check('the same seed plays the same 12 minutes', a === play(7));
  check('a different seed diverges', a !== play(8));
}

placement();
jobs();
suspicion();
inspections();
decoys();
queue();
shifts();
stores();
moving();
saves();
hijinx();
determinism();

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('all checks passed');
