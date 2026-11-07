import type { SpotId } from './layout';

export type BuildId =
  | 'deck'
  | 'sleeping_bag'
  | 'crate'
  | 'cooler'
  | 'splice'
  | 'lamp'
  | 'hot_plate'
  | 'futon'
  | 'fridge'
  | 'foam'
  | 'fan'
  | 'tv'
  | 'rope'
  | 'lava_lamp'
  | 'workbench'
  | 'pc'
  | 'raccoon'
  | 'periscope'
  | 'bunk'
  | 'xmas'
  | 'heater'
  | 'scanner'
  | 'battery'
  | 'pod'
  | 'hammock'
  | 'arcade'
  | 'throne'
  | 'hot_tub'
  | 'asbestos'
  | 'siphon'
  | 'bean_bag'
  | 'card_table'
  | 'dartboard'
  | 'disco_ball'
  | 'ball_pit'
  | 'wet_floor'
  | 'out_of_order'
  | 'tamagotchi'
  | 'hotdog';

export type BuildCategory = 'structure' | 'living' | 'food' | 'stealth' | 'work';

export interface BuildDef {
  id: BuildId;
  name: string;
  category: BuildCategory;
  cost: number;
  parts?: number;
  level: number;
  desc: string;
  flavor: string;
  power?: number;
  supply?: number;
  radius?: number;
  offGrid?: boolean;
  noise?: number;
  noiseWhen?: 'always' | 'use';
  smell?: number;
  comfort?: number;
  seasonalComfort?: boolean;
  beds?: number;
  foodCap?: number;
  partsCap?: number;
  goodsCap?: number;
  insulation?: number;
  insulationRadius?: number;
  fanRadius?: number;
  light?: number;
  lightColor?: string;
  unique?: boolean;
  decoy?: boolean;
  drop?: boolean;
  periscope?: boolean;
  portable?: boolean;
  floor?: boolean;
  walkable?: boolean;
  seat?: boolean;
  lastsDays?: number;
  deterRadius?: number;
  deterUses?: number;
  hangout?: string;
  racket?: boolean;
  gift?: boolean;
}

const BUILDS_AS_WRITTEN: BuildDef[] = [
  { id: 'deck', name: 'Plywood Deck', category: 'structure', cost: 6, level: 1, desc: 'Everything sits on plywood. Drag out from the hatch.', flavor: 'Ceiling tiles hold four pounds. Plywood holds you.' },
  { id: 'sleeping_bag', name: 'Sleeping Bag', category: 'living', cost: 15, level: 1, portable: true, beds: 1, comfort: 1, desc: '1 bed. Better than the floor.', flavor: 'Smells like a sleepover from 1997.' },
  { id: 'crate', name: 'Milk Crate Stash', category: 'living', cost: 12, level: 1, portable: true, partsCap: 75, goodsCap: 40, desc: '+75 parts, +40 goods storage.', flavor: 'Property of Northgate Dairy. Allegedly.' },
  { id: 'cooler', name: 'Igloo Cooler', category: 'food', cost: 18, level: 2, portable: true, foodCap: 20, desc: '+20 food storage. Food still spoils.', flavor: 'Refilled nightly with food court ice.' },
  { id: 'splice', name: 'Power Splice', category: 'structure', cost: 25, parts: 5, level: 1, walkable: true, supply: 120, radius: 5, desc: 'Steals 120W from the store below. They pay the bill, and they read it.', flavor: 'A wire nut and a prayer.' },
  { id: 'lamp', name: 'Clip Lamp', category: 'living', cost: 10, level: 1, portable: true, power: 5, comfort: 1, light: 3.2, lightColor: '255,214,150', desc: '+1 comfort.', flavor: 'Clamped to a sprinkler pipe. Probably fine.' },
  { id: 'hot_plate', name: 'Hot Plate', category: 'food', cost: 35, parts: 5, level: 3, portable: true, power: 40, smell: 5, noiseWhen: 'use', desc: "Hot meals lift mood. Cooking smells, so mind what's below.", flavor: 'Ramen tonight. Ramen every night.' },

  { id: 'futon', name: 'Futon', category: 'living', cost: 70, level: 3, beds: 1, comfort: 3, desc: '1 bed, +3 comfort.', flavor: 'Liberated from a dorm room clearance.' },
  { id: 'fridge', name: 'Mini-Fridge', category: 'food', cost: 85, parts: 15, level: 3, power: 20, foodCap: 60, desc: '+60 food storage. Nothing spoils.', flavor: 'Still has a Dave Matthews Band sticker.' },
  { id: 'foam', name: 'Egg-Crate Foam', category: 'stealth', cost: 16, level: 3, portable: true, walkable: true, insulation: 0.5, insulationRadius: 1, desc: 'Muffles noise on this tile and around it.', flavor: 'The secret to every garage band and every squatter.' },
  { id: 'fan', name: 'Box Fan', category: 'stealth', cost: 22, parts: 10, level: 3, portable: true, power: 8, noise: 0.4, noiseWhen: 'always', fanRadius: 2, desc: 'Clears smell nearby. Hums a little.', flavor: 'Blows the evidence toward NY Fries.' },
  { id: 'tv', name: 'CRT TV + PS2', category: 'living', cost: 120, parts: 15, level: 3, power: 35, comfort: 6, noise: 2.6, noiseWhen: 'use', light: 2.4, lightColor: '120,170,255', hangout: 'Playing Vice City', desc: '+6 comfort. Loud, so park it over a loud store.', flavor: 'Vice City, volume down. Mostly.' },
  { id: 'rope', name: 'Rope Drop', category: 'structure', cost: 30, level: 2, drop: true, desc: 'A shortcut down into the store below. The loose tile gets noticed.', flavor: 'Mind the gap.' },
  { id: 'lava_lamp', name: 'Lava Lamp', category: 'living', cost: 30, parts: 5, level: 3, portable: true, power: 4, comfort: 2, light: 2.2, lightColor: '255,90,200', hangout: 'Staring at the lava lamp', desc: '+2 comfort.', flavor: "Spencer's floor model. It wasn't going to buy itself." },

  { id: 'workbench', name: 'Workbench', category: 'work', cost: 150, parts: 20, level: 4, power: 30, noise: 3.4, noiseWhen: 'use', light: 2, lightColor: '255,240,200', desc: 'Turns parts into goods. One Bat at a time, and loud.', flavor: 'Refurbished means it worked once.' },
  { id: 'siphon', name: 'Coin Siphon', category: 'work', cost: 180, parts: 25, level: 7, power: 10, racket: true, desc: 'Skims the registers below while the mall is open. Jams sometimes.', flavor: 'Every till in Northgate comes up a little short. Nobody can prove why.' },
  { id: 'pc', name: 'Beige Box PC', category: 'work', cost: 260, parts: 30, level: 7, power: 50, unique: true, light: 1.6, lightColor: '140,255,190', desc: 'Sells goods on eBay while you sleep.', flavor: 'The fan sounds like a dial-up handshake.' },
  { id: 'raccoon', name: 'Decoy Raccoon', category: 'stealth', cost: 25, level: 5, decoy: true, desc: 'Inspectors blame the raccoon and leave. Single use.', flavor: '"It was raccoons." The oldest excuse in the book.' },
  { id: 'asbestos', name: 'Asbestos Warning Sign', category: 'stealth', cost: 40, level: 5, floor: true, deterRadius: 3, deterUses: 2, desc: 'Inspectors take one look and turn around. Good for two.', flavor: "DANGER. ASBESTOS. AUTHORIZED PERSONNEL ONLY. Laminated at Kinko's." },
  { id: 'wet_floor', name: 'Wet Floor Sign', category: 'stealth', cost: 15, level: 5, floor: true, lastsDays: 3, desc: 'Guards and the janitor walk around it.', flavor: 'CUIDADO. PISO MOJADO. Nobody questions the yellow sign.' },
  { id: 'out_of_order', name: 'Out of Order Bag', category: 'stealth', cost: 20, level: 7, floor: true, desc: 'Blinds a camera. Eventually someone looks up.', flavor: 'OUT OF ORDER. SORRY FOR THE INCONVENIENCE. — Management' },
  { id: 'tamagotchi', name: 'Beeping Tamagotchi', category: 'stealth', cost: 30, level: 6, floor: true, desc: 'Feed it at night and it beeps until a guard comes looking.', flavor: 'It needs feeding. It always needs feeding.' },
  { id: 'periscope', name: 'Periscope', category: 'stealth', cost: 90, parts: 15, level: 5, portable: true, periscope: true, desc: 'Bats below are harder to spot at night.', flavor: 'Two mirrors and a paper towel tube.' },
  { id: 'bunk', name: 'Bunk Bed', category: 'living', cost: 140, parts: 10, level: 6, beds: 2, comfort: 2, desc: '2 beds, +2 comfort.', flavor: 'Top bunk is a privilege.' },
  { id: 'xmas', name: 'String Lights', category: 'living', cost: 25, parts: 5, level: 6, portable: true, power: 6, comfort: 2, light: 2.8, lightColor: '255,120,120', desc: '+2 comfort.', flavor: 'Ceiling-core.' },

  { id: 'heater', name: 'Space Heater', category: 'living', cost: 50, parts: 10, level: 8, portable: true, power: 45, comfort: 5, seasonalComfort: true, light: 1.6, lightColor: '255,110,40', desc: '+5 comfort once it gets cold.', flavor: 'The ducts get cold in winter.' },
  { id: 'scanner', name: 'Police Scanner', category: 'stealth', cost: 220, parts: 25, level: 8, portable: true, power: 10, unique: true, desc: 'Every Suspicion hit lands a little softer.', flavor: '"Unit 4, check the ceiling in West 49." Copy that, Unit 4.' },
  { id: 'battery', name: 'Car Battery Bank', category: 'structure', cost: 320, parts: 40, level: 8, supply: 200, radius: 6, offGrid: true, desc: 'Powers 200W. No store gets the bill.', flavor: 'Six Die-Hards and an inverter from The Source.' },
  { id: 'pod', name: 'Soundproof Pod', category: 'stealth', cost: 340, parts: 20, level: 8, insulation: 0.85, insulationRadius: 2, desc: 'Swallows nearly all the noise around it.', flavor: 'Moving blankets. Lots of moving blankets.' },

  { id: 'hammock', name: 'Duct Hammock', category: 'living', cost: 95, level: 9, beds: 1, comfort: 4, desc: '1 bed, +4 comfort.', flavor: 'Strung between two ducts like a king.' },
  { id: 'arcade', name: 'Arcade Cabinet', category: 'living', cost: 450, parts: 40, level: 10, power: 60, comfort: 9, noise: 3, noiseWhen: 'use', light: 2.6, lightColor: '255,60,220', hangout: 'Going for the Galaga high score', desc: '+9 comfort. Loud.', flavor: 'Galaxy "lost" a Galaga.' },
  { id: 'bean_bag', name: 'Bean Bag', category: 'living', cost: 25, level: 3, seat: true, portable: true, comfort: 2, hangout: 'Sinking into the bean bag', desc: '+2 comfort.', flavor: 'Filled with mystery beads. Some of them are Skittles.' },
  { id: 'card_table', name: 'Card Table', category: 'living', cost: 20, level: 3, portable: true, comfort: 1, hangout: 'Playing Egyptian Ratscrew', desc: '+1 comfort.', flavor: 'One leg is a stack of Yellow Pages.' },
  { id: 'dartboard', name: 'Dartboard', category: 'living', cost: 35, level: 4, comfort: 2, noise: 1.2, noiseWhen: 'use', hangout: "Throwing darts at the developer's headshot", desc: '+2 comfort. Thuddy.', flavor: "The developer's face is pinned to the bullseye." },
  { id: 'disco_ball', name: 'Disco Ball', category: 'living', cost: 90, parts: 10, level: 6, power: 10, comfort: 4, light: 3, lightColor: '210,225,255', hangout: 'Practicing the Cha-Cha Slide', desc: '+4 comfort.', flavor: "Rescued from the Spencer's clearance bin. Still spins." },
  { id: 'ball_pit', name: 'Ball Pit', category: 'living', cost: 300, parts: 10, level: 9, seat: true, comfort: 7, noise: 1.5, noiseWhen: 'use', hangout: 'Swimming in the ball pit', desc: '+7 comfort. Rustles.', flavor: 'Galaxy condemned it. Galaxy was right.' },
  { id: 'throne', name: 'The Throne', category: 'living', cost: 1200, parts: 30, level: 10, seat: true, power: 30, comfort: 16, unique: true, light: 3, lightColor: '255,215,90', hangout: 'Sitting on the throne', desc: '+16 comfort. Every kingdom needs one.', flavor: 'A Sharper Idea massage chair. It hums.' },
  { id: 'hot_tub', name: 'Hot Tub', category: 'living', cost: 650, parts: 35, level: 10, seat: true, power: 80, comfort: 10, noise: 1.2, noiseWhen: 'use', light: 2.4, lightColor: '43,255,240', hangout: 'Soaking in the hot tub', desc: '+10 comfort. Bubbles.', flavor: "Spa Depot's floor model. Filled one bucket at a time from the janitor's sink." },

  { id: 'hotdog', name: 'The Hot Dog', category: 'living', cost: 0, level: 1, gift: true, unique: true, comfort: 3, desc: '+3 comfort. The crew salutes it before bed.', flavor: 'Six feet of foam from the Food Court dumpster. It watches over us.' },
];

export const BUILDS: BuildDef[] = [...BUILDS_AS_WRITTEN].sort((a, b) => a.level - b.level);

export const BUILD: Record<BuildId, BuildDef> = Object.fromEntries(BUILDS.map((b) => [b.id, b])) as Record<BuildId, BuildDef>;

export const canRotate = (type: BuildId) => BUILD[type].category !== 'structure';

export type JobId =
  | 'rest'
  | 'busk'
  | 'samples'
  | 'returns'
  | 'kiosk'
  | 'popup'
  | 'boundaries'
  | 'fountain'
  | 'dumpster'
  | 'vending'
  | 'arcade'
  | 'radiohut'
  | 'pallets'
  | 'lostfound'
  | 'gary'
  | 'stockroom'
  | 'tinker'
  | 'listings'
  | 'scrap'
  | 'rig'
  | 'zalez'
  | 'doorbuster';

export type Stat = 'stealth' | 'charm' | 'handy';

export interface JobDef {
  id: JobId;
  name: string;
  shift: 'day' | 'night' | 'both';
  spot?: SpotId;
  home?: BuildId[];
  only?: [month: number, day: number];
  level: number;
  stat: Stat;
  cycle: number;
  sketch: number;
  desc: string;
  yields: string;
  risk: 'none' | 'low' | 'medium' | 'high';
}

export const JOBS: JobDef[] = [
  { id: 'rest', name: 'Rest', shift: 'both', level: 1, stat: 'stealth', cycle: 60, sketch: 0, desc: 'Sleep, eat, hang out.', yields: 'Energy', risk: 'none' },
  { id: 'busk', name: 'Busk at Center Court', shift: 'day', spot: 'busk', level: 1, stat: 'charm', cycle: 30, sketch: 0.15, desc: 'Acoustic covers of "Hey There Delilah"... no wait, that comes out in 2006. Yellowcard, then.', yields: '$ (scales with crowd)', risk: 'low' },
  { id: 'samples', name: 'Sample Hunter', shift: 'day', spot: 'samples', level: 1, stat: 'charm', cycle: 30, sketch: 0.3, desc: 'Tan Tan Wok hands out chicken on toothpicks. Take one. Take forty.', yields: 'Food', risk: 'low' },
  { id: 'boundaries', name: 'Read at Coles', shift: 'day', spot: 'boundaries', level: 3, stat: 'charm', cycle: 60, sketch: 0.15, desc: 'Sit on the floor and read a whole novel. Nobody minds.', yields: 'Mood', risk: 'none' },
  { id: 'returns', name: 'Sears Returns', shift: 'day', spot: 'returns', level: 3, stat: 'charm', cycle: 60, sketch: 1.2, desc: '"I lost the receipt." Goods into cash. Best price, most Heat.', yields: 'Goods → $$', risk: 'medium' },
  { id: 'kiosk', name: 'Work the Kiosk', shift: 'day', spot: 'kiosk', level: 6, stat: 'charm', cycle: 45, sketch: -0.6, desc: 'Sell goods from your cart. A name tag cools Heat.', yields: 'Goods → $', risk: 'none' },
  { id: 'popup', name: 'Staff the Pop-Up', shift: 'day', level: 9, stat: 'charm', cycle: 40, sketch: -0.8, desc: 'Sell goods at holiday markups.', yields: 'Goods → $$', risk: 'none' },
  { id: 'fountain', name: 'Fountain Fishing', shift: 'night', spot: 'fountain', level: 1, stat: 'handy', cycle: 15, sketch: 0, desc: 'A magnet on a shoelace. Every wish has a price, and the price is about 11 cents.', yields: '$', risk: 'low' },
  { id: 'dumpster', name: 'Dumpster Dive', shift: 'night', spot: 'dumpster', level: 1, stat: 'handy', cycle: 20, sketch: 0, desc: 'Food court leftovers hit the dock dumpsters after close.', yields: 'Food, sometimes parts', risk: 'low' },
  { id: 'vending', name: 'Vending Jiggle', shift: 'night', spot: 'vending', level: 2, stat: 'handy', cycle: 30, sketch: 0, desc: 'The machine in the restroom hall gives up if you rock it right.', yields: 'Food, $', risk: 'low' },
  { id: 'gary', name: 'Leave Gary NY Fries', shift: 'night', spot: 'gary', level: 2, stat: 'charm', cycle: 30, sketch: 0, desc: 'Gary the night guard is lonely. Leave him a sleeve of fries (2 food).', yields: "Gary's goodwill", risk: 'medium' },
  { id: 'arcade', name: 'Token Shake', shift: 'night', spot: 'arcade', level: 2, stat: 'handy', cycle: 20, sketch: 0, desc: "Galaxy's token machine has a loose panel. Galaxy counts its tokens.", yields: '$$', risk: 'medium' },
  { id: 'radiohut', name: 'The Source Salvage', shift: 'night', spot: 'radiohut', level: 4, stat: 'handy', cycle: 30, sketch: 0, desc: 'The back room is full of returns marked DEFECTIVE. The Source counts its stock.', yields: 'Parts', risk: 'medium' },
  { id: 'stockroom', name: 'Stockroom Pilfer', shift: 'night', spot: 'stockroom', level: 2, stat: 'stealth', cycle: 25, sketch: 0, desc: 'Back-of-house overflow boxes. Busted electronics nobody will miss... much.', yields: 'Parts, sometimes goods', risk: 'low' },
  { id: 'pallets', name: 'Dock Pallets', shift: 'night', spot: 'pallets', level: 4, stat: 'handy', cycle: 25, sketch: 0, desc: 'Return-to-vendor pallets from Zellers. Nobody inventories broken stuff.', yields: 'Parts', risk: 'low' },
  { id: 'lostfound', name: 'Lost & Found Raid', shift: 'night', spot: 'lostfound', level: 7, stat: 'stealth', cycle: 45, sketch: 0, desc: 'Inside the Security Office. While Gary is out on patrol.', yields: 'Goods, $, parts', risk: 'high' },
  { id: 'zalez', name: 'The Charm Job', shift: 'night', spot: 'zalez', level: 9, stat: 'stealth', cycle: 60, sketch: 0, desc: 'Rope down into Charm Diamond Centres and empty one display case.', yields: '$$$$, once', risk: 'high' },
  { id: 'doorbuster', name: 'Hold a Spot in Line', shift: 'day', spot: 'doorbuster', only: [11, 26], level: 1, stat: 'charm', cycle: 20, sketch: 0, desc: 'Shoppers pay cash to skip the Zellers doorbuster line.', yields: '$$', risk: 'low' },
  { id: 'tinker', name: 'Tinker at Workbench', shift: 'both', home: ['workbench'], level: 4, stat: 'handy', cycle: 75, sketch: 0, desc: 'Parts in, goods out. Loud.', yields: 'Parts → Goods', risk: 'none' },
  { id: 'scrap', name: 'Sort the Haul', shift: 'both', home: ['crate'], level: 3, stat: 'handy', cycle: 30, sketch: 0, desc: 'Strip junk parts for copper. Earl buys it for his brother-in-law.', yields: 'Parts → $', risk: 'none' },
  { id: 'rig', name: 'Rig the Meters', shift: 'both', home: ['splice'], level: 4, stat: 'handy', cycle: 45, sketch: 0, desc: 'Fiddle with a splice so the meter downstairs reads low.', yields: 'Smaller power bill', risk: 'none' },
  { id: 'listings', name: 'Sell on eBay', shift: 'both', home: ['pc'], level: 7, stat: 'charm', cycle: 45, sketch: 0, desc: 'Post the lot. The PayPal email does the rest.', yields: 'Goods → $', risk: 'none' },
];

export const isHomeJob = (job: JobId) => !!JOB[job].home;

export const JOB: Record<JobId, JobDef> = Object.fromEntries(JOBS.map((j) => [j.id, j])) as Record<JobId, JobDef>;

export type TraitId =
  | 'quick'
  | 'loud'
  | 'nightowl'
  | 'earlybird'
  | 'returnspro'
  | 'gearhead'
  | 'performer'
  | 'salesman'
  | 'invisible'
  | 'snorer'
  | 'jolly'
  | 'routes'
  | 'lightsleeper'
  | 'glutton'
  | 'neat';

export const TRAITS: Record<TraitId, { name: string; desc: string; good: boolean }> = {
  quick: { name: 'Quick', desc: 'Moves 25% faster.', good: true },
  loud: { name: 'Loud', desc: 'Footsteps make double noise.', good: false },
  nightowl: { name: 'Night Owl', desc: 'Tires 40% slower at night.', good: true },
  earlybird: { name: 'Early Bird', desc: 'Tires 40% slower by day.', good: true },
  returnspro: { name: 'Returns Pro', desc: '+40% from returns, half the Heat.', good: true },
  gearhead: { name: 'Gearhead', desc: 'Tinkers 50% faster.', good: true },
  performer: { name: 'Performer', desc: 'Busking earns 60% more.', good: true },
  salesman: { name: 'Salesman', desc: 'Kiosk and pop-up sales +50%.', good: true },
  invisible: { name: 'Invisible by Day', desc: 'Nobody suspects a mall walker. Day jobs barely build Heat.', good: true },
  snorer: { name: 'Snorer', desc: 'Makes noise while sleeping.', good: false },
  jolly: { name: 'Jolly', desc: '+6 mood for the whole crew.', good: true },
  routes: { name: 'Knows the Routes', desc: 'Whole crew is 15% harder to spot.', good: true },
  lightsleeper: { name: 'Light Sleeper', desc: 'Recovers energy 30% faster.', good: true },
  glutton: { name: 'Glutton', desc: 'Eats 1.5 portions at every meal.', good: false },
  neat: { name: 'Neat Freak', desc: 'Cooking makes half the smell.', good: true },
};

export interface Archetype {
  id: string;
  title: string;
  stealth: number;
  charm: number;
  handy: number;
  traits: TraitId[];
  bios: string[];
  look: { hat?: string; top: string[]; hair: string[] };
}

export const ARCHETYPES: Archetype[] = [
  { id: 'drifter', title: 'Evicted Drifter', stealth: 3, charm: 3, handy: 3, traits: [], bios: ['Got evicted on a Tuesday. Found the ladder on a Friday.'], look: { hat: 'beanie', top: ['#3a6ac8'], hair: ['#3a2a1a'] } },
  { id: 'mallrat', title: 'Mall Rat', stealth: 4, charm: 3, handy: 1, traits: ['quick'], bios: ['Has spent every Saturday at Northgate Mall since 1999.', 'Knows every bench by name.'], look: { hat: 'trucker', top: ['#ff8fb8', '#8fd0ff', '#b0ff8f'], hair: ['#e8c87a', '#3a2a1a', '#7a4a2a'] } },
  { id: 'goth', title: 'West 49 Dropout', stealth: 5, charm: 1, handy: 2, traits: ['nightowl'], bios: ['Quit West 49 after the manager played Hilary Duff.', 'Wears black. Blends into the dark.'], look: { top: ['#1a1a1a', '#2a0a1a'], hair: ['#111', '#4a0a3a', '#1a1a3a'] } },
  { id: 'searz', title: 'Laid-off Sears Clerk', stealth: 2, charm: 3, handy: 4, traits: ['returnspro'], bios: ['Twenty-two years in Hardware. Downsized by a consultant.', 'Still has the employee discount card.'], look: { top: ['#1c4fa0'], hair: ['#888', '#5a4a3a'] } },
  { id: 'skater', title: 'Skater Punk', stealth: 3, charm: 2, handy: 2, traits: ['quick', 'loud'], bios: ['Banned from the parking lot. Not from the ceiling.', 'Can kickflip. Cannot whisper.'], look: { hat: 'cap', top: ['#c84b3a', '#3a8a5a', '#e8c33a'], hair: ['#3a2a1a', '#e8c87a'] } },
  { id: 'techie', title: 'Ex-Source Tech', stealth: 2, charm: 1, handy: 5, traits: ['gearhead'], bios: ['The back room was all returns marked DEFECTIVE.', 'Can fix anything with a soldering iron and spite.'], look: { top: ['#e8202a', '#555'], hair: ['#3a2a1a', '#111'] } },
  { id: 'theater', title: 'Theater Kid', stealth: 2, charm: 5, handy: 1, traits: ['performer'], bios: ['Was Rizzo in Grease. Never recovered.', 'Will break into song.'], look: { top: ['#a24bff', '#ff5fa8'], hair: ['#b03a1a', '#3a2a1a'] } },
  { id: 'kiosk', title: 'Kiosk Hustler', stealth: 2, charm: 5, handy: 2, traits: ['salesman'], bios: ['"Excuse me miss, can I ask you a question about your nails?"', 'Sold Dead Sea lotion to a man with no hands.'], look: { top: ['#111', '#fff'], hair: ['#111'] } },
  { id: 'grandma', title: 'Mall Walker', stealth: 1, charm: 4, handy: 3, traits: ['invisible', 'earlybird'], bios: ['Laps the concourse at 6 AM. Nobody has ever asked where she lives.', 'Tracksuit. Visor. Walkman. Legend.'], look: { hat: 'visor', top: ['#7a5cff', '#2aa6a0', '#ff4fa3'], hair: ['#ddd', '#bbb'] } },
  { id: 'runaway', title: 'Runaway', stealth: 4, charm: 2, handy: 2, traits: ['lightsleeper'], bios: ['Took the Greyhound as far as $40 would go.', "Doesn't talk about home."], look: { hat: 'hood', top: ['#555', '#3a5a3a', '#5a3a3a'], hair: ['#3a2a1a', '#7a4a2a'] } },
  { id: 'emo', title: 'Emo Kid', stealth: 3, charm: 2, handy: 3, traits: ['nightowl', 'glutton'], bios: ['Side bangs. Dashboard Confessional. Feelings.', 'Writes LiveJournal posts about the ceiling.'], look: { top: ['#1a1a1a', '#2a2a4a'], hair: ['#111'] } },
  { id: 'santa', title: 'Ex-Mall Santa', stealth: 1, charm: 5, handy: 2, traits: ['snorer', 'jolly'], bios: ['Fired for napping on the job. In the chair. During photos.'], look: { top: ['#c8102e'], hair: ['#eee'] } },
  { id: 'gary', title: 'Former Night Guard', stealth: 4, charm: 2, handy: 3, traits: ['routes'], bios: ['Gary knows. Gary has always known. Gary is in.'], look: { hat: 'cap', top: ['#22304a'], hair: ['#5a4a3a'] } },
];

export const PLAYER_BODIES = [
  { id: 'he', name: 'Jace', sprite: 'char.crew.drifter' },
  { id: 'she', name: 'Jess', sprite: 'char.crew.drifter.f' },
] as const;

export type CostumeId = 'hotdog' | 'mallwalker';

export interface CostumeDef {
  name: string;
  desc: string;
  sprite?: string;
  dayHeat: number;
  nightDetect: number;
  busk: number;
}

export const COSTUMES: Record<CostumeId, CostumeDef> = {
  hotdog: {
    name: 'Hot Dog Suit',
    desc: 'Day jobs build no Heat and busking pays more. Hard to miss at night.',
    sprite: 'char.costume.hotdog',
    dayHeat: 0,
    nightDetect: 1.25,
    busk: 1.5,
  },
  mallwalker: {
    name: 'Mallwalker',
    desc: 'Day jobs build half the Heat.',
    dayHeat: 0.5,
    nightDetect: 1,
    busk: 1,
  },
};

export type NookId = 'movie' | 'kitchen' | 'workshop' | 'bunkroom' | 'rumpus' | 'spa';

export interface NookDef {
  id: NookId;
  name: string;
  items: BuildId[];
  comfort: number;
  bonus: string;
}

export const NOOK_RADIUS = 2;

export const NOOKS: NookDef[] = [
  { id: 'movie', name: 'Movie Night', items: ['tv', 'futon', 'lava_lamp'], comfort: 5, bonus: '+5 comfort' },
  { id: 'kitchen', name: 'Kitchenette', items: ['hot_plate', 'fridge', 'card_table'], comfort: 2, bonus: '+2 comfort, less cooking smell' },
  { id: 'workshop', name: 'Tool Corner', items: ['workbench', 'crate', 'lamp'], comfort: 0, bonus: 'Faster tinkering' },
  { id: 'bunkroom', name: 'Bunk Room', items: ['bunk', 'sleeping_bag', 'foam'], comfort: 0, bonus: 'Deeper sleep' },
  { id: 'rumpus', name: 'Rumpus Room', items: ['arcade', 'ball_pit', 'disco_ball'], comfort: 8, bonus: '+8 comfort' },
  { id: 'spa', name: 'Spa Night', items: ['hot_tub', 'xmas', 'hammock'], comfort: 6, bonus: '+6 comfort' },
];

export const nooksUsing = (type: BuildId) => NOOKS.filter((n) => n.items.includes(type));

export const NOOK_TINKER_SPEED = 1.3;
export const NOOK_SLEEP_SPEED = 1.3;
export const NOOK_SMELL = 0.5;

export const FIRST_NAMES = [
  'Tyler',
  'Brittany',
  'Kayla',
  'Josh',
  'Ashley',
  'Jordan',
  'Brandon',
  'Amber',
  'Cody',
  'Tiffany',
  'Dustin',
  'Megan',
  'Travis',
  'Courtney',
  'Kyle',
  'Chelsea',
  'Justin',
  'Crystal',
  'Zach',
  'Heather',
  'Derek',
  'Danielle',
  'Shane',
  'Lindsay',
  'Chad',
  'Misty',
  'Trevor',
  'Jenna',
  'Corey',
  'Alyssa',
  'Devon',
  'Raven',
  'Marcus',
  'Destiny',
  'Jared',
  'Kelsey',
];

export const LOT = 5;

export const LEVELS = [
  { title: 'Squatter', theme: 'Moving In', earned: 0 },
  { title: 'Mall Rat', theme: 'Night Moves', earned: 200 },
  { title: 'Mall Bat', theme: 'Settling In', earned: 500 },
  { title: 'Grease Monkey', theme: 'Workshop', earned: 1100 },
  { title: 'Ghost', theme: 'Cover Story', earned: 1800 },
  { title: 'Ceiling Baron', theme: 'Storefront', earned: 2600 },
  { title: 'Racketeer', theme: 'Rackets', earned: 3800 },
  { title: 'Duct Duke', theme: 'Off the Grid', earned: 7000 },
  { title: 'Mall Mogul', theme: 'Holiday Rush', earned: 11000 },
  { title: 'Plenum Prince', theme: 'Penthouse', earned: 18000 },
];

export const MAX_LEVEL = LEVELS.length;
export const KIOSK_LEVEL = 6;
export const POPUP_LEVEL = 9;
export const levelInfo = (level: number) => LEVELS[level - 1];

export function unlocksAt(level: number): string[] {
  return [
    ...BUILDS.filter((b) => b.level === level && !b.gift).map((b) => b.name),
    ...(level === KIOSK_LEVEL ? ['Kiosk lease'] : []),
    ...(level === POPUP_LEVEL ? ['Pop-up lease'] : []),
    ...JOBS.filter((j) => j.level === level && j.id !== 'rest' && !j.only).map((j) => `${j.name} job`),
  ];
}

export const SUSPICION_LEVELS = [
  { at: 0, name: 'Calm', desc: 'One night guard. Two cameras.' },
  { at: 20, name: 'Watchful', desc: 'Extra cameras installed.' },
  { at: 40, name: 'Concerned', desc: 'A second night guard sweeps the stores.' },
  { at: 60, name: 'Alarmed', desc: 'K-9 unit. Guards spot you faster.' },
  { at: 80, name: 'Lockdown', desc: 'Motion sensors in the concourse. One more store complaint and the police sweep the ceiling.' },
];
