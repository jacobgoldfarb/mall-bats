import type { BuildId, CostumeId, JobId, TraitId } from './defs';

export interface Look {
  skin: string;
  hair: string;
  hairStyle: number;
  top: string;
  bottom: string;
  shoes: string;
  hat?: string;
  hatColor?: string;
  build: number;
}

export interface Agent {
  id: number;
  x: number;
  y: number;
  layer: 0 | 1;
  path: number[];
  pathI: number;
  goal: number;
  facing: number;
  look: Look;
  moving: boolean;
  climb: number;
  bubble?: { text: string; until: number; tone?: 'alert' | 'info' | 'happy' };
}

export type CrewState = 'idle' | 'toWork' | 'working' | 'toHome' | 'sleeping' | 'eating' | 'leisure' | 'toLeisure' | 'toBed' | 'fleeing' | 'evacuating' | 'ducking' | 'toErrand' | 'errand' | 'away';

export interface Carry {
  cash: number;
  food: number;
  parts: number;
  goods: number;
}

export interface Crew extends Agent {
  name: string;
  archetype: string;
  sprite?: string;
  costume?: { id: CostumeId; until: number };
  title: string;
  bio: string;
  stealth: number;
  charm: number;
  handy: number;
  traits: TraitId[];
  energy: number;
  heat: number;
  dayJob: JobId;
  nightJob: JobId;
  activeJob: JobId;
  jobCooldown: Partial<Record<JobId, number>>;
  state: CrewState;
  timer: number;
  workTimer: number;
  useObj: number;
  carrying: Carry;
  detect: number;
  bedId: number;
  awayUntil: number;
  joinedDay: number;
  earned: number;
  thought: string;
  spottedBy: number;
  waitUntil: number;
  calledOff: string;
  hiding: boolean;
  camWait: number;
  replanAt: number;
}

export type NpcKind = 'shopper' | 'guard' | 'dayguard' | 'janitor' | 'inspector';

export interface Npc extends Agent {
  kind: NpcKind;
  name: string;
  state: string;
  timer: number;
  route: number;
  routeI: number;
  speed: number;
  dests: number[];
  chaseId: number;
  lastSeen: { x: number; y: number; t: number };
  dog: boolean;
  inspectionId: number;
  isGary: boolean;
  hearCooldown: number;
  grabUntil?: number;
}

export interface Placed {
  id: number;
  type: BuildId;
  x: number;
  y: number;
  powered: boolean;
  tapRoom: number;
  usedUntil: number;
  supplyLoad: number;
  flipped?: boolean;
  jammed?: boolean;
  delivered?: boolean;
  expires?: number;
  luredBy?: number;
  beeping?: boolean;
  deterred?: number;
}

export type InspectionKind = 'complaint' | 'power' | 'pest' | 'fire' | 'sweep';

export interface Inspection {
  id: number;
  room: number;
  x: number;
  y: number;
  radius: number;
  kind: InspectionKind;
  at: number;
  state: 'scheduled' | 'walking' | 'climbing' | 'done';
  npcId: number;
  reason: string;
}

export interface RoomState {
  complaint: number;
  power: number;
  vacant: boolean;
  popup: boolean;
  hotX: number;
  hotY: number;
  hotW: number;
  lastWarn: number;
  strain: number;
  decoys: number;
}

export type LogKind = 'pa' | 'info' | 'good' | 'bad' | 'warn' | 'phone';

export interface LogEntry {
  id: number;
  t: number;
  text: string;
  kind: LogKind;
  from?: string;
  focus?: { x: number; y: number; layer: 0 | 1 };
}

export interface Choice {
  label: string;
  action: string;
  hint?: string;
  disabled?: string;
}

export interface Modal {
  id: number;
  title: string;
  body: string;
  art?: string;
  choices: Choice[];
  data?: Record<string, unknown>;
}

export interface Candidate {
  name: string;
  archetype: string;
  stealth: number;
  charm: number;
  handy: number;
  traits: TraitId[];
  bio: string;
  look: Look;
  sprite?: string;
}

export type Mover = Omit<Agent, 'id' | 'look' | 'bubble'>;

export interface Pet extends Mover {
  name: string;
  napping: boolean;
  timer: number;
}

export interface Visitor {
  id: number;
  candidate: Candidate;
  intro: string;
  until: number;
}

export interface Camera {
  x: number;
  y: number;
  angle: number;
  sweep: number;
  phase: number;
  active: boolean;
}

export interface Tally {
  suspicion: Record<string, { amount: number; count: number }>;
}

export interface GameStats {
  caught: number;
  spotted: number;
  inspections: number;
  inspectionsFoundNothing: number;
  raccoons: number;
  ebaySold: number;
  fountainCash: number;
  goodsCrafted: number;
  nightsClean: number;
  bestNightStreak: number;
  peakCrew: number;
  storesClosed: number;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  time: number;
  difficulty: Difficulty;
  playerName: string;
  cash: number;
  food: number;
  parts: number;
  goods: number;
  mood: number;
  missedMeals: number;
  miserable: number;
  totalEarned: number;
  level: number;
  suspicion: number;
  mallHealth: number;
  deck: number[];
  objects: Placed[];
  crew: Crew[];
  pet?: Pet;
  npcs: Npc[];
  cameras: Camera[];
  inspections: Inspection[];
  rooms: RoomState[];
  pools: Record<string, number>;
  smell: number[];
  log: LogEntry[];
  modals: Modal[];
  flags: Record<string, number>;
  gary: { affinity: number; recruited: boolean; insider: boolean; replaced: boolean; coverWeek: number };
  business: { kiosk: boolean; popupRoom: number };
  objective: number;
  stats: GameStats;
  achievements: string[];
  nextId: number;
  ladder: Visitor[];
  agenda: { key: string; hour: number }[];
  tally: Tally;
  bidPremium: number;
  ebayTimer: number;
  lastDay: number;
  dailyIncome: number[];
  todayIncome: number;
  spottedTonight: boolean;
  over: { won: boolean; title: string; text: string; margin?: number } | null;
}
