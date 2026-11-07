import { addCrew, makeCandidate } from './crew';
import { LAYOUT, N } from './layout';
import { log, pa, pushModal, rand, updateCameras } from './ops';
import type { Difficulty, GameState } from './state';
import { dayOf } from './time';
import { markDirty } from './world';

export const SAVE_VERSION = 5;

export interface PlayerSetup {
  name: string;
  sprite?: string;
}

export function newGame(player: PlayerSetup, difficulty: Difficulty, seed = Math.floor(Math.random() * 1e9)): GameState {
  rand.state = seed;
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: seed,
    time: 21 * 60 + 35,
    difficulty,
    playerName: player.name,
    cash: { easy: 150, normal: 110, hard: 80 }[difficulty],
    food: 6,
    parts: 20,
    goods: 0,
    mood: 60,
    missedMeals: 0,
    miserable: 0,
    totalEarned: 0,
    level: 1,
    suspicion: 0,
    mallHealth: 0.9,
    deck: new Array(N).fill(0),
    objects: [],
    crew: [],
    npcs: [],
    cameras: LAYOUT.cameraSpots.map((c) => ({ ...c, phase: rand.range(0, Math.PI * 2), active: false })),
    inspections: [],
    rooms: LAYOUT.rooms.map(() => ({ complaint: 0, power: 0, vacant: false, popup: false, hotX: 0, hotY: 0, hotW: 0, lastWarn: -1, strain: 0, decoys: 0 })),
    pools: {},
    smell: new Array(N).fill(0),
    log: [],
    modals: [],
    flags: {},
    gary: { affinity: 0, recruited: false, insider: false, replaced: false, coverWeek: -1 },
    business: { kiosk: false, popupRoom: -1 },
    objective: 0,
    stats: {
      caught: 0,
      spotted: 0,
      inspections: 0,
      inspectionsFoundNothing: 0,
      raccoons: 0,
      ebaySold: 0,
      fountainCash: 0,
      goodsCrafted: 0,
      nightsClean: 0,
      bestNightStreak: 0,
      peakCrew: 0,
      storesClosed: 0,
    },
    achievements: [],
    nextId: 1,
    ladder: [],
    agenda: [],
    tally: { suspicion: {} },
    bidPremium: 0,
    ebayTimer: 0,
    lastDay: -1,
    dailyIncome: [],
    todayIncome: 0,
    spottedTonight: false,
    over: null,
  };
  s.lastDay = dayOf(s.time - 360);
  s.pools = { fountain: 60, dumpster: 24, vending: 10, arcade: 0, radiohut: 0, pallets: 0, lostfound: 0, samples: 0, zalez: 1 };
  updateCameras(s);

  const me = makeCandidate(s, 'drifter');
  me.name = player.name;
  me.sprite = player.sprite;
  me.bio = 'Got evicted on a Tuesday. Found the ladder on a Friday.';
  addCrew(s, me).energy = 55;

  pa(s, 'Attention shoppers: Northgate Mall is now closed. Please make your way to the nearest exit.');
  log(s, 'You are in the ceiling above the Service Corridor. Lay some plywood before you put a foot through a tile.', 'info');
  pushModal(s, {
    title: 'Friday, October 1, 2004',
    art: 'intro',
    body: `You got evicted on Tuesday. For three nights you've slept in the Northgate Mall food court bathroom, waking up before the janitors.\n\nTonight, hiding from Earl's mop cart in the Service Corridor, you saw it: a ceiling hatch above a ladder nobody uses.\n\nYou climbed up. It's dark. It's dusty. The muzak comes up through the tiles. Above two dozen stores and a fountain full of wishes, there's room for a kingdom.\n\nSleep while the mall is open. Come out after close. Hang above everyone, like a bat.\n\nJust stay quiet. Keep your power use reasonable. And never, ever let Gary see you.`,
    choices: [{ label: 'Climb up', action: 'ok' }],
  });
  markDirty();
  return s;
}

const SAVE_KEY = 'dropceiling.save.v1';

export function saveGame(s: GameState) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

export function hasSave(): boolean {
  return !!localStorage.getItem(SAVE_KEY);
}

function upgradeFromV4(s: GameState) {
  for (const c of s.crew) c.calledOff ??= '';
  for (const r of s.rooms) {
    r.strain ??= 0;
    r.decoys ??= 0;
  }
  s.gary.coverWeek ??= -1;
  s.ladder ??= [];
  s.agenda ??= [];
  s.tally ??= { suspicion: {} };
  s.bidPremium ??= 0;
  s.pools.zalez ??= 1;
  s.modals = s.modals.filter((m) => m.art !== 'recruit');
  s.version = SAVE_VERSION;
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  const s = JSON.parse(raw) as GameState;
  if (s.version === 4) upgradeFromV4(s);
  if (s.version !== SAVE_VERSION) return null;
  for (const c of s.crew) {
    if (c.awayUntil === null) c.awayUntil = Infinity;
    if ((c.dayJob as string) === 'lookout') c.dayJob = 'rest';
    if ((c.nightJob as string) === 'lookout') c.nightJob = 'rest';
    if ((c.activeJob as string) === 'lookout') c.activeJob = 'rest';
  }
  rand.state = s.rng;
  markDirty();
  return s;
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
