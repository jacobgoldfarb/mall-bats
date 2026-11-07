import type { CostumeId } from './defs';
import { LAYOUT, N, W } from './layout';
import { addMood, stat } from './needs';
import { earn, log, pa, pushModal, rand, raiseSuspicion, sfx } from './ops';
import type { Crew, GameState } from './state';
import { dayOf, mallHours } from './time';
import { addObject, canPlace, getDerived } from './world';

type Stat = 'stealth' | 'charm' | 'handy';

interface HijinxChoice {
  label: (c: Crew) => string;
  disabled?: (s: GameState) => string | undefined;
  run: (s: GameState, c: Crew) => void;
}

interface Hijinx {
  key: string;
  art: string;
  title: string;
  hours?: [number, number];
  when?: (s: GameState) => boolean;
  body: (s: GameState, c: Crew) => string;
  choices: HijinxChoice[];
}

const passes = (s: GameState, c: Crew, k: Stat) => rand.chance(0.2 + stat(s, c, k) * 0.13);

function gain(s: GameState, k: { food?: number; parts?: number; goods?: number }) {
  const d = getDerived(s);
  s.food = Math.max(0, Math.min(d.foodCap, s.food + (k.food ?? 0)));
  s.parts = Math.max(0, Math.min(d.partsCap, s.parts + (k.parts ?? 0)));
  s.goods = Math.max(0, Math.min(d.goodsCap, s.goods + (k.goods ?? 0)));
}

function complain(s: GameState, roomId: string, amount: number) {
  const rs = s.rooms[LAYOUT.roomIndex[roomId]];
  rs.complaint = Math.max(0, rs.complaint + amount);
}

type Focus = { x: number; y: number; layer: 0 | 1 };

const good = (s: GameState, text: string, focus?: Focus) => (log(s, text, 'good', focus), sfx('good'));
const bad = (s: GameState, text: string) => log(s, text, 'warn');

const WALLET_GOODWILL = 8;
const MALLWALKER_DAYS = 7;
const HOTDOG_DAYS = 3;
const OFFERING_FOOD = 2;
const OFFERING_DAYS = 5;

function wear(s: GameState, c: Crew, id: CostumeId, days: number) {
  c.costume = { id, until: s.time + days * 1440 };
}

function hotdogSpot(s: GameState): { x: number; y: number } | null {
  const anchor = getDerived(s).beds[0]?.obj ?? LAYOUT.hatch;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let i = 0; i < N; i++) {
    if (!s.deck[i]) continue;
    const x = i % W;
    const y = Math.floor(i / W);
    const d = Math.hypot(x - anchor.x, y - anchor.y);
    if (d < bestD && !canPlace(s, 'hotdog', x, y)) {
      best = { x, y };
      bestD = d;
    }
  }
  return best;
}

function hangHotdog(s: GameState): Focus | null {
  const spot = hotdogSpot(s);
  if (!spot) return null;
  addObject(s, 'hotdog', spot.x, spot.y);
  return { ...spot, layer: 1 };
}

export function costumesWearOff(s: GameState) {
  for (const c of s.crew) {
    if (!c.costume || c.costume.until > s.time) continue;
    const { id } = c.costume;
    delete c.costume;
    if (id === 'mallwalker') {
      log(s, `${c.name}'s Mallwalkers membership lapsed. Doris took back the visor.`, 'info');
      continue;
    }
    const hung = hangHotdog(s);
    if (hung) good(s, `${c.name}'s hot dog suit finally split down the seam. The crew hung it from the rafters.`, hung);
    else log(s, `${c.name}'s hot dog suit finally split down the seam. ${c.name} is a person again.`, 'info');
  }
}

export function ventOfferings(s: GameState) {
  const until = s.flags.ventOfferingsUntil;
  if (until === undefined) return;
  if (dayOf(s.time) > until) {
    delete s.flags.ventOfferingsUntil;
    log(s, 'No Bagel Bites under the EB Games vent this morning. The kids have moved on to a new god.', 'info');
    return;
  }
  gain(s, { food: OFFERING_FOOD });
  log(s, `Fresh Bagel Bites under the EB Games vent, left for the Voice of the Ceiling. +${OFFERING_FOOD} food.`, 'good');
}

const HIJINX: Hijinx[] = [
  {
    key: 'wallet',
    art: 'wallet',
    title: 'A Wallet Under the Bench',
    body: (_s, c) => `${c.name} found a velcro wallet under a bench. Inside: $40, a Blockbuster card, and a Polaroid of somebody's dog.`,
    choices: [
      { label: () => 'Keep the $40', run: (s) => (earn(s, 40), sfx('cash')) },
      {
        label: () => 'Turn it in to Lost & Found',
        run: (s) => {
          raiseSuspicion(s, -3, 'good deed');
          addMood(s, 4);
          if (s.gary.replaced) good(s, 'Turned in the wallet. Things feel a bit lighter.');
          else {
            s.gary.affinity = Math.min(100, s.gary.affinity + WALLET_GOODWILL);
            good(s, `Turned in the wallet. Gary was touched. Gary's goodwill: ${s.gary.affinity.toFixed(0)}/100.`);
          }
        },
      },
    ],
  },
  {
    key: 'mannequin',
    art: 'mannequin',
    title: 'Window Dressing',
    hours: [10, 20],
    body: (_s, c) =>
      `${c.name} dozed off behind the American Eagle window display. The visual merchandiser didn't notice. ${c.name} is now wearing cargo shorts, a puka shell necklace, and a SALE sign.\n\nA crowd is gathering.`,
    choices: [
      {
        label: () => 'Hold the pose until closing',
        run: (s, c) => {
          if (passes(s, c, 'stealth')) {
            gain(s, { goods: 5 });
            addMood(s, 3);
            good(s, `${c.name} held perfectly still for six hours. A teen took their picture for LiveJournal. They walked out at closing still wearing the $60 hoodie.`);
          } else {
            raiseSuspicion(s, 8, 'mannequin sneezed');
            complain(s, 'abercromp', 25);
            bad(s, `${c.name} sneezed. A woman screamed. ${c.name} ran out through the stockroom, still holding the SALE sign.`);
          }
        },
      },
      {
        label: () => 'Do the robot',
        run: (s, c) => {
          if (passes(s, c, 'charm')) {
            const tips = rand.int(25, 55);
            earn(s, tips);
            c.heat = Math.min(100, c.heat + 15);
            good(s, `${c.name} did the robot to "Hey Ya!" for forty minutes. The crowd threw $${tips} into a cargo pocket.`);
          } else {
            raiseSuspicion(s, 5, 'unlicensed robot');
            bad(s, `${c.name}'s robot drew a crowd, then a manager, then a mall cop asking about a "performance permit."`);
          }
        },
      },
    ],
  },
  {
    key: 'pretzel',
    art: 'pretzel',
    title: 'Runaway Pretzel Cart',
    hours: [10, 20],
    body: () => `The Pretzel Pals cart lost a wheel at the top of the Center Court ramp. It is rolling toward the fountain at alarming speed. The vendor is chasing it, yelling "MY SALT!"`,
    choices: [
      {
        label: (c) => `${c.name} dives in front of it`,
        run: (s, c) => {
          c.heat = Math.min(100, c.heat + 10);
          if (passes(s, c, 'handy')) {
            gain(s, { food: 8 });
            good(s, `${c.name} caught the cart by the axle, one-handed. The vendor wept and paid them in pretzels.`);
          } else {
            const coins = rand.int(8, 20);
            earn(s, coins);
            c.energy = Math.max(0, c.energy - 30);
            bad(s, `${c.name} and the cart both went into the fountain. The crowd applauded. ${c.name} climbed out with $${coins} in quarters stuck to them.`);
          }
        },
      },
      {
        label: () => 'Loot the wreckage',
        run: (s) => {
          gain(s, { food: 5 });
          pa(s, 'Will the owner of a pretzel cart please come to the fountain. Your cart is in the fountain.');
          good(s, 'The crew ate pretzels out of a fountain. They were only a little wet.');
        },
      },
    ],
  },
  {
    key: 'ferret',
    art: 'ferret',
    title: 'A Ferret in the Ducts',
    when: (s) => !s.flags.ferret,
    body: (_s, c) => `A ferret escaped from Pet Palace and moved into your ceiling. So far he has stolen a spork, two AA batteries, and ${c.name}'s left sock. He is staring at you. He is vibrating.`,
    choices: [
      {
        label: () => 'Keep him. His name is Bandit.',
        run: (s) => {
          s.flags.ferret = 1;
          gain(s, { parts: -5 });
          addMood(s, 6);
          good(s, 'Bandit lives here now. He sleeps in a Pringles can. Every morning he drags a snack back from the vents.');
        },
      },
      {
        label: () => 'Return him for the reward',
        run: (s) => {
          earn(s, 25);
          raiseSuspicion(s, 3, 'suspiciously good at ferrets');
          bad(s, 'Pet Palace paid the $25 reward, then asked where exactly you found him. You said "around."');
        },
      },
    ],
  },
  {
    key: 'psychic',
    art: 'psychic',
    title: 'Madame Zelda Senses Something',
    hours: [10, 20],
    body: (_s, c) => `The psychic at the Center Court kiosk grabs ${c.name}'s wrist as they walk by.\n\n"You... live... ABOVE."\n\nShe has a two-for-one tarot special going.`,
    choices: [
      {
        label: () => 'Pay $20 for a reading',
        disabled: (s) => (s.cash < 20 ? 'Needs $20' : undefined),
        run: (s) => {
          s.cash -= 20;
          const card = rand.int(0, 2);
          if (card === 0) {
            raiseSuspicion(s, -6, 'the spirits are calm');
            good(s, 'The Moon card. "The eyes that watch will grow tired." Mall security seems strangely relaxed today.');
          } else if (card === 1) {
            s.pools.fountain = (s.pools.fountain ?? 0) + 30;
            good(s, 'The Ace of Cups. "Wealth... from water." There is $30 more than usual in the fountain tonight.');
          } else {
            s.cash += 20;
            addMood(s, -2);
            bad(s, 'The Tower card. Madame Zelda refunds you out of pity and gives you a crystal "for the road."');
          }
        },
      },
      {
        label: () => 'Call her a fraud',
        run: (s, c) => {
          if (passes(s, c, 'charm')) {
            s.rooms.forEach((r) => (r.complaint = Math.max(0, r.complaint - 20)));
            good(s, `Madame Zelda, insulted, tells every store manager the mall is haunted. Now every thump in the ceiling is "probably just the ghost."`);
          } else {
            c.energy = Math.max(0, c.energy - 25);
            addMood(s, -5);
            bad(s, `Madame Zelda cursed ${c.name}. ${c.name} stubbed a toe, lost a shoe, and got gum in their hair, all within the hour.`);
          }
        },
      },
    ],
  },
  {
    key: 'mallwalkers',
    art: 'mallwalkers',
    title: 'Mallwalker Turf War',
    hours: [7, 11],
    body: (_s, c) =>
      `The Northgate Mallwalkers Club says ${c.name} has been cutting corners on their laps. Their captain, Doris, 81, in a matching teal tracksuit, demands satisfaction.\n\nThree laps. Loser buys Dairy Queen.`,
    choices: [
      {
        label: () => 'Race Doris',
        run: (s, c) => {
          if (rand.chance(0.25 + c.energy / 250)) {
            raiseSuspicion(s, -4, 'mallwalker approved');
            good(s, `${c.name} edged out Doris by a visor. The Mallwalkers now walk in formation around ${c.name} every morning, like a tiny teal Secret Service.`);
          } else {
            c.energy = Math.max(0, c.energy - 40);
            s.cash = Math.max(0, s.cash - 8);
            bad(s, `Doris lapped ${c.name} twice and didn't break a sweat. ${c.name} bought her a Julius. She ordered a large.`);
          }
        },
      },
      {
        label: () => 'Join the club ($10 dues)',
        disabled: (s) => (s.cash < 10 ? 'Needs $10' : undefined),
        run: (s, c) => {
          s.cash -= 10;
          c.heat = Math.max(0, c.heat - 40);
          wear(s, c, 'mallwalker', MALLWALKER_DAYS);
          good(s, `${c.name} got a visor, a pedometer, and a laminated membership card. Nobody looks twice at a mallwalker.`);
        },
      },
    ],
  },
  {
    key: 'vent',
    art: 'vent',
    title: 'The Ceiling Speaks',
    hours: [10, 20],
    body: (_s, c) => `The vent over EB Games carries ${c.name}'s voice straight down. A kid playing the Halo 2 demo just asked the ceiling if it was God.`,
    choices: [
      {
        label: () => 'Speak as the Voice of the Ceiling',
        run: (s, c) => {
          if (passes(s, c, 'charm')) {
            gain(s, { food: OFFERING_FOOD });
            s.flags.ventOfferingsUntil = dayOf(s.time) + OFFERING_DAYS;
            good(s, 'The kids of EB Games now leave offerings of Bagel Bites under the vent. The Voice of the Ceiling is pleased.');
          } else {
            complain(s, 'ebgamez', 35);
            raiseSuspicion(s, 3, 'the ceiling swore');
            bad(s, 'A kid told his mom the ceiling said a bad word. His mom told the manager. The manager is staring at the vent.');
          }
        },
      },
      {
        label: () => 'Whisper him the cheat codes',
        run: (s) => {
          addMood(s, 3);
          good(s, "The kid beat the level. He looked up, nodded once, and told nobody. That's a good kid.");
        },
      },
    ],
  },
  {
    key: 'hotdog',
    art: 'hotdog',
    title: 'The Hot Dog Suit',
    body: (_s, c) => `Someone threw a six-foot foam hot dog costume into the dumpster behind the Food Court. ${c.name} is already wearing it. You did not see them put it on.`,
    choices: [
      {
        label: () => 'Wear it around the mall',
        run: (s, c) => {
          const tips = rand.int(10, 30);
          c.heat = 0;
          earn(s, tips);
          wear(s, c, 'hotdog', HOTDOG_DAYS);
          good(s, `Nobody recognizes a hot dog. ${c.name} posed for photos with toddlers all afternoon and made $${tips}. The suit is staying on.`);
        },
      },
      {
        label: () => 'Sell it on eBay',
        run: (s) => {
          gain(s, { goods: 10 });
          good(s, 'Listed as "VINTAGE MASCOT SUIT RARE L@@K." Worth about ten goods to the right weirdo.');
        },
      },
      {
        label: () => 'Hang it in the ceiling',
        disabled: (s) => (s.objects.some((o) => o.type === 'hotdog') ? 'One hot dog is enough' : !hotdogSpot(s) ? 'No free plywood' : undefined),
        run: (s) => {
          const at = hangHotdog(s)!;
          good(s, 'The hot dog hangs from the rafters now. It watches over the crew. They salute it before bed.', at);
        },
      },
    ],
  },
  {
    key: 'furby',
    art: 'furby',
    title: 'The Furby Knows',
    body: (_s, c) => `A Furby fell through a KB Toys vent and landed in your ceiling. It will not stop talking. It is learning words. It has learned "${c.name}."`,
    choices: [
      {
        label: () => 'Teach it to say "ceiling empty"',
        run: (s, c) => {
          if (passes(s, c, 'charm')) {
            raiseSuspicion(s, -5, 'the Furby vouched for you');
            good(s, 'A clerk found the Furby in the morning. It said "CEILING EMPTY" and everyone laughed. Rumors of ceiling people sound sillier now.');
          } else {
            raiseSuspicion(s, 6, 'snitch Furby');
            bad(s, `A clerk found the Furby in the morning. It said "HI ${c.name.toUpperCase()}! ${c.name.toUpperCase()} UP THERE!" The clerk looked up for a long time.`);
          }
        },
      },
      {
        label: () => 'Take out the batteries',
        run: (s) => {
          gain(s, { parts: 5 });
          log(s, 'One last, slow "me... love... you..." and then silence. +5 parts.', 'info');
        },
      },
    ],
  },
  {
    key: 'glamour',
    art: 'glamour',
    title: 'Glamour Shots',
    hours: [10, 20],
    body: (_s, c) =>
      `${c.name} wandered into the free makeover promo at the Glamour Shots booth. They now have frosted tips, a denim-on-denim outfit, and a feather boa. A photographer is fogging the backdrop.`,
    choices: [
      {
        label: () => 'Buy the photo package ($15)',
        disabled: (s) => (s.cash < 15 ? 'Needs $15' : undefined),
        run: (s, c) => {
          s.cash -= 15;
          c.heat = Math.max(0, c.heat - 40);
          addMood(s, 5);
          good(s, `The crew framed ${c.name}'s soft-focus portrait over the futon. ${c.name} keeps the frosted tips. The mall cops don't recognize them at all.`);
        },
      },
      {
        label: () => 'Walk out with the fog machine',
        run: (s, c) => {
          gain(s, { parts: 15 });
          if (!passes(s, c, 'stealth')) raiseSuspicion(s, 4, 'missing fog machine');
          good(s, `${c.name} walked out of Glamour Shots inside a cloud of fog, carrying the fog machine. Stripped for 15 parts.`);
        },
      },
    ],
  },
];

const HIJINX_BY_KEY = Object.fromEntries(HIJINX.map((h) => [h.key, h]));

const inHours = (s: GameState, h: Hijinx, hour: number) => !h.hours || (!!mallHours(dayOf(s.time)) && hour >= h.hours[0] && hour < h.hours[1]);

export function startHijinx(s: GameState, hour: number) {
  const crew = s.crew.filter((c) => c.awayUntil <= s.time);
  if (!crew.length) return;
  const eligible = HIJINX.filter((h) => inHours(s, h, hour) && (!h.when || h.when(s)));
  if (!eligible.length) return;
  const lastSeen = (h: Hijinx) => s.flags[`hjx_${h.key}`] ?? -99;
  const stalest = Math.min(...eligible.map(lastSeen));
  const h = rand.pick(eligible.filter((e) => lastSeen(e) <= stalest + 7));
  const c = rand.pick(crew);
  s.flags[`hjx_${h.key}`] = dayOf(s.time);
  pushModal(s, {
    title: h.title,
    art: h.art,
    body: h.body(s, c),
    choices: h.choices.map((ch, i) => ({ label: ch.label(c), action: `hijinx:${h.key}:${i}:${c.id}`, disabled: ch.disabled?.(s) })),
  });
}

export function resolveHijinx(s: GameState, key: string, choice: number, crewId: number) {
  const c = s.crew.find((x) => x.id === crewId);
  if (c) HIJINX_BY_KEY[key].choices[choice].run(s, c);
}

