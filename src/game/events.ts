import { ARCHETYPES, TRAITS } from './defs';
import { BAIL_HOURS, addCrew, bedCapacity, goTo, makeCandidate } from './crew';
import { HIJINX_HOURS, resolveHijinx, startHijinx } from './hijinx';
import { scheduleNear } from './inspect';
import { LAYOUT } from './layout';
import { FOOD_PRICE, addMood } from './needs';
import { auctionBid, earn, levelOf, log, pa, phone, pushModal, rand, sfx, unlock } from './ops';
import type { Candidate, GameState, Visitor } from './state';
import { AUCTION_DAY, dayOf, formatClock, formatDate } from './time';
import { ACCESS_STAFF, markDirty, nodeOf } from './world';

const LADDER_DAYS = 3;

export function recruitBlocked(s: GameState): string | null {
  if (s.crew.length >= bedCapacity(s) + 1) return 'Build another bed first';
  if (s.cash < Math.max(0, 3 - s.food) * FOOD_PRICE) return 'Needs 3 food';
  return null;
}

export function showVisitor(s: GameState, v: Visitor) {
  const c = v.candidate;
  const arch = ARCHETYPES.find((a) => a.id === c.archetype)!;
  const traits = c.traits.map((t) => `${TRAITS[t].name}: ${TRAITS[t].desc}`).join('\n');
  const short = Math.max(0, 3 - s.food);
  const foodLabel = short ? `3 food: buy ${short} for $${short * FOOD_PRICE}` : '3 food';
  const waits = `${c.name} will wait at the ladder until ${formatDate(dayOf(v.until))}.`;
  pushModal(s, {
    title: `${c.name}, ${arch.title}`,
    art: 'recruit',
    body: `${v.intro}\n\n"${c.bio}"\n\nStealth ${'●'.repeat(c.stealth)}${'○'.repeat(5 - c.stealth)}   Charm ${'●'.repeat(c.charm)}${'○'.repeat(5 - c.charm)}   Handy ${'●'.repeat(c.handy)}${'○'.repeat(5 - c.handy)}${traits ? `\n\n${traits}` : ''}\n\n${waits}`,
    data: { visitor: v.id },
    choices: [
      { label: `Welcome to the ceiling (${foodLabel})`, action: `recruit:${v.id}`, disabled: recruitBlocked(s) ?? undefined },
      { label: 'Not yet', action: 'ok' },
      { label: 'Send them away', action: `decline:${v.id}` },
    ],
  });
  sfx('phone');
}

export function offerCandidate(s: GameState, c: Candidate, intro: string) {
  const v: Visitor = { id: s.nextId++, candidate: c, intro, until: s.time + LADDER_DAYS * 1440 };
  s.ladder.push(v);
  showVisitor(s, v);
}

export function visitorsLeave(s: GameState) {
  for (const v of s.ladder.filter((x) => x.until <= s.time)) log(s, `${v.candidate.name} stopped waiting at the ladder.`, 'info');
  s.ladder = s.ladder.filter((x) => x.until > s.time);
}

const RECRUIT_INTROS = [
  'You spot someone sleeping in the photo booth by Galaxy. Again.',
  'A kid keeps "losing" their ride home at closing time. Every night this week.',
  'Someone left a note taped to your ladder: "I know you\'re up there. Can I come up too?"',
  'Earl the janitor mentions a nephew who "needs a place to be for a while, no questions."',
  'You find someone hiding in the Sears dressing rooms at closing. They look at you. You look at them.',
];

export function closeStore(s: GameState, id: string, brokeLease = false) {
  const ri = LAYOUT.roomIndex[id];
  const rs = s.rooms[ri];
  if (rs.vacant) return;
  rs.vacant = true;
  rs.complaint = 0;
  rs.strain = 0;
  s.mallHealth = Math.max(0.1, s.mallHealth - 0.045);
  s.stats.storesClosed++;
  markDirty();
  const r = LAYOUT.rooms[ri];
  pa(s, brokeLease ? `${r.name} has closed its doors. Management thanks them for their years at Northgate.` : (r.closingLine ?? `${r.name} has closed its doors.`));
  const why = brokeLease ? `${r.name} broke its lease. The manager blamed "the building."` : `${r.name} closed for good.`;
  log(s, `${why} Nobody below to hear you, and no power to steal. The developer's bid drops to $${auctionBid(s).toLocaleString()}.`, 'warn', {
    x: Math.floor((r.x0 + r.x1) / 2),
    y: Math.floor((r.y0 + r.y1) / 2),
    layer: 1,
  });
}

interface Scripted {
  day: number;
  hour: number;
  key: string;
  run: (s: GameState) => void;
}

const SCRIPT: Scripted[] = [
  { day: 1, hour: 10, key: 'welcome', run: (s) => pa(s, 'Good morning, shoppers! Welcome to Northgate Mall, where the fun never ends.') },
  {
    day: 2,
    hour: 11,
    key: 'firstRecruit',
    run: (s) => {
      phone(s, '555-0142', 'heard ur living in the mall lol. my friend needs a place to crash. theyre cool i swear');
      offerCandidate(s, makeCandidate(s, 'mallrat'), 'A text from an unknown number. Then, at the food court, someone in a trucker hat waves at you.');
    },
  },
  {
    day: 4,
    hour: 9,
    key: 'auction',
    run: (s) => {
      s.flags.auctionKnown = 1;
      pushModal(s, {
        title: 'NORTHGATE MALL IN FORECLOSURE',
        art: 'news',
        body: `The Daily Ledger, page B4:\n\n"The owners of Northgate Mall have defaulted on the mortgage. The property goes to public auction on Friday, December 31. Prestige Lifestyle Developers is expected to bid around $${auctionBid(s).toLocaleString()}. They plan to bulldoze it for luxury condos."\n\nYou read it twice. You look up at the ceiling.\n\nIf you have more cash than the developer on New Year's Eve, the mall is yours. Every store that closes before then drops their bid.`,
        choices: [{ label: "Then I'm buying a mall.", action: 'ok' }],
      });
    },
  },
  {
    day: 6,
    hour: 23,
    key: 'garyIntro',
    run: (s) =>
      log(s, 'Tip: the night guard eats dinner alone in the Security Office. His name tag says GARY. He looks like a man who could use some fries.', 'info'),
  },
  { day: 9, hour: 15, key: 'recruit2', run: (s) => offerCandidate(s, makeCandidate(s), rand.pick(RECRUIT_INTROS)) },
  { day: 12, hour: 9, key: 'closeSam', run: (s) => closeStore(s, 'samgroovy') },
  { day: 16, hour: 20, key: 'recruit3', run: (s) => offerCandidate(s, makeCandidate(s), rand.pick(RECRUIT_INTROS)) },
  {
    day: 21,
    hour: 7,
    key: 'grandma',
    run: (s) =>
      offerCandidate(
        s,
        makeCandidate(s, 'grandma'),
        'The Northgate Mallwalkers Club laps the concourse at 7 AM. One of them catches your eye, winks, and keeps walking. Later, she knocks on your ladder.',
      ),
  },
  {
    day: 30,
    hour: 9,
    key: 'halloween',
    run: (s) => {
      s.flags.costumeDay = 30;
      s.crew.forEach((c) => (c.heat = 0));
      s.food += 12;
      pa(s, 'Happy Halloween, Northgate Mall! Costumes welcome all day. Trick-or-treating at participating stores 4 to 7 PM!');
      log(s, 'Halloween: everyone is in costume. Nobody recognizes anybody today. Your crew grabbed 12 food in candy.', 'good');
    },
  },
  { day: 34, hour: 13, key: 'recruit4', run: (s) => offerCandidate(s, makeCandidate(s), rand.pick(RECRUIT_INTROS)) },
  { day: 38, hour: 9, key: 'closeBlock', run: (s) => closeStore(s, 'blockbusted') },
  {
    day: 40,
    hour: 21,
    key: 'trainee',
    run: (s) => {
      s.flags.traineeNight = 40;
      pa(s, 'Security note: Trainee Kyle shadows the night shift tonight. Welcome aboard, Kyle!');
    },
  },
  { day: 47, hour: 15, key: 'fire', run: (s) => { if (levelOf(s) >= 7) scheduleNear(s, 'fire', 'Annual fire code inspection.', 2); } },
  { day: 50, hour: 8, key: 'cold', run: (s) => log(s, 'The ducts freeze at night now. The crew wants a Space Heater.', 'warn') },
  {
    day: 48,
    hour: 12,
    key: 'santa',
    run: (s) =>
      offerCandidate(
        s,
        makeCandidate(s, 'santa'),
        'The new Mall Santa started today. The OLD Mall Santa is sitting in the food court, still in the suit, eating a pretzel and staring into the middle distance.',
      ),
  },
  { day: 52, hour: 18, key: 'recruit5', run: (s) => offerCandidate(s, makeCandidate(s), rand.pick(RECRUIT_INTROS)) },
  {
    day: 55,
    hour: 12,
    key: 'thanksgiving',
    run: (s) =>
      pushModal(s, {
        title: 'Thanksgiving in the Ceiling',
        art: 'feast',
        body: "The mall is closed for Thanksgiving. The building is silent, except for Gary's radio playing the Lions game.\n\nThe crew is talking about family. Some have one. Some don't.",
        choices: [
          { label: 'Throw a feast (10 food)', action: 'feast', disabled: s.food < 10 ? 'Needs 10 food' : undefined },
          { label: 'Ramen as usual', action: 'ok' },
        ],
      }),
  },
  {
    day: 56,
    hour: 5,
    key: 'blackfriday',
    run: (s) => {
      pa(s, 'BLACK FRIDAY! Doors are OPEN! Doorbusters at Sears and Future Shop! Please do not trample your fellow shoppers!');
      log(s, 'Black Friday. The mall is deafening. Nobody will hear a thing upstairs, and Future Shop shoppers will pay cash to skip the line.', 'good');
    },
  },
  { day: 60, hour: 9, key: 'closeClaire', run: (s) => closeStore(s, 'claire') },
  { day: 64, hour: 14, key: 'recruit6', run: (s) => offerCandidate(s, makeCandidate(s), rand.pick(RECRUIT_INTROS)) },
  {
    day: 70,
    hour: 9,
    key: 'closeKB',
    run: (s) => {
      closeStore(s, 'kbtoyz');
      if (levelOf(s) >= 6) scheduleNear(s, 'pest', 'Holiday pest control sweep.', 3);
    },
  },
  {
    day: 75,
    hour: 22,
    key: 'blackout',
    run: (s) => {
      s.flags.blackoutUntil = s.time + 8 * 60;
      pa(s, 'Attention: rolling blackout. Emergency lighting only. Cameras are offline until morning.');
      log(s, "Blackout. The cameras are down tonight, nobody's meter is running, and Charm Diamond Centres' motion sensors are on the same grid.", 'good');
    },
  },
  { day: 80, hour: 9, key: 'closeRadio', run: (s) => closeStore(s, 'radiohut') },
  { day: 84, hour: 9, key: 'xmasEve', run: (s) => pa(s, 'Merry Christmas Eve from Northgate Mall! We close at 6 PM. Get home safe, everyone.') },
  {
    day: 85,
    hour: 19,
    key: 'xmasGary',
    run: (s) => {
      if (s.gary.recruited || s.gary.replaced) return;
      pushModal(s, {
        title: 'Gary, Alone on Christmas',
        art: 'gary',
        body: 'The mall is closed for Christmas. Through a loose ceiling tile you can see Gary in the Security Office, eating a microwave turkey dinner and watching A Christmas Story on a 9-inch TV.\n\nHe raises his fork to nobody. "Merry Christmas."',
        choices: [
          { label: 'Leave him a real Christmas dinner (5 food)', action: 'xmasgary', disabled: s.food < 5 ? 'Needs 5 food' : undefined },
          { label: 'Leave him be', action: 'ok' },
        ],
      });
    },
  },
  { day: 86, hour: 8, key: 'boxing', run: (s) => pa(s, 'Happy Boxing Day! Our Returns & Exchanges desks are open early!') },
  {
    day: 88,
    hour: 9,
    key: 'final',
    run: (s) => log(s, `Three days until the auction. Developer bid: $${auctionBid(s).toLocaleString()}. Your cash: $${Math.floor(s.cash).toLocaleString()}.`, 'warn'),
  },
  { day: AUCTION_DAY, hour: 12, key: 'auctionDay', run: (s) => resolveAuction(s) },
];

export function runScript(s: GameState, day: number, hour: number) {
  for (const e of SCRIPT) {
    if (e.day !== day || e.hour !== hour) continue;
    const key = `ev_${e.key}`;
    if (s.flags[key]) continue;
    s.flags[key] = 1;
    e.run(s);
  }
}

export function resolveAuction(s: GameState) {
  const bid = auctionBid(s);
  if (s.cash > bid) {
    unlock(s, 'KING');
    s.over = {
      won: true,
      margin: (s.cash - bid) / bid,
      title: 'KING OF NORTHGATE',
      text: `The auctioneer squints at the shoebox full of fountain quarters, NY Fries receipts, and eBay PayPal printouts.\n\n"Sold, for $${Math.floor(s.cash).toLocaleString()}, to... the ceiling people?"\n\nPrestige Lifestyle Developers bid $${bid.toLocaleString()}. You beat them by $${Math.floor(s.cash - bid).toLocaleString()}.\n\nNorthgate Mall is yours. Your crew climbs down the ladder for the last time, and walks out the front doors in broad daylight.`,
    };
  } else {
    s.over = {
      won: false,
      title: 'SOLD TO THE DEVELOPER',
      text: `Prestige Lifestyle Developers bought Northgate Mall for $${bid.toLocaleString()}. You had $${Math.floor(s.cash).toLocaleString()}.\n\nThe bulldozers come in March. On the last night, your crew sits on the plywood, listening to the muzak one more time. It sounds slower than it used to.`,
    };
  }
}

interface RandomEvent {
  key: string;
  weight: number;
  hours?: [from: number, to: number];
  when: (s: GameState) => boolean;
  run: (s: GameState, hour: number) => void;
}

const GARY_NAP_HOURS = 6;

const RANDOM_EVENTS: RandomEvent[] = [
  {
    key: 'hijinx',
    weight: 2.5,
    hours: HIJINX_HOURS,
    when: (s) => s.crew.length > 0,
    run: (s, hour) => startHijinx(s, hour),
  },
  {
    key: 'raccoon',
    weight: 1,
    when: () => true,
    run: (s) => {
      s.rooms.forEach((r) => (r.complaint = Math.max(0, r.complaint - 25)));
      pa(s, 'Good news, staff: Pest Control caught a REAL raccoon in the Food Court ceiling. Mystery solved!');
      log(s, 'An actual raccoon took the blame. The stores below calm down.', 'good');
    },
  },
  {
    key: 'garynap',
    weight: 1,
    hours: [22, 23],
    when: (s) => !s.gary.replaced,
    run: (s) => {
      s.flags.garyAsleepUntil = s.time + GARY_NAP_HOURS * 60;
      log(s, "Gary brought a pillow tonight. He's headed for the Security Office couch, and he won't be back out until 4.", 'good');
      for (const n of s.npcs) {
        if (!n.isGary) continue;
        n.state = 'asleep';
        goTo(s, n, [nodeOf(0, 33, 1)], ACCESS_STAFF);
      }
    },
  },
  {
    key: 'crackdown',
    weight: 0.5,
    hours: [10, 11],
    when: (s) => s.crew.length > 1,
    run: (s) => {
      s.flags.crackdownUntil = s.time + 3 * 1440;
      pa(s, 'Mall Management reminds guests: our Parental Escort Policy is now in effect. Loitering is prohibited.');
      log(s, 'Mall Management is cracking down on loiterers. Day jobs run hot for three days.', 'warn');
    },
  },
  {
    key: 'clearance',
    weight: 1,
    hours: [20, 21],
    when: () => true,
    run: (s) => {
      s.pools.pallets = (s.pools.pallets ?? 0) + 50;
      log(s, 'Future Shop dumped a truckload of returns on the dock. Dock Pallets is stacked tonight.', 'good');
    },
  },
  {
    key: 'looseTile',
    weight: 0.8,
    hours: [10, 20],
    when: (s) => s.objects.some((o) => o.type === 'rope'),
    run: (s) => {
      const r = rand.pick(s.objects.filter((o) => o.type === 'rope'));
      const ri = LAYOUT.roomAt[r.y * 48 + r.x];
      s.rooms[ri].complaint += 30;
      log(s, `A kid in ${LAYOUT.rooms[ri].name} pointed at your loose ceiling tile: "Mommy, there's a hole!" The manager looked up.`, 'warn', { x: r.x, y: r.y, layer: 1 });
    },
  },
  {
    key: 'pestRandom',
    weight: 0.3,
    when: (s) => levelOf(s) >= 6,
    run: (s) => scheduleNear(s, 'pest', 'Routine pest inspection.', 1),
  },
  {
    key: 'tip',
    weight: 1,
    when: (s) => s.crew.length > 0,
    run: (s) => {
      const amt = rand.int(15, 45);
      earn(s, amt);
      log(s, `A tourist at the fountain tossed in a $${amt} wish. You fished it out before the janitor did.`, 'good');
    },
  },
];

const FIRST_EVENT_DAY = 3;
const DEFAULT_EVENT_HOURS: [number, number] = [8, 23];

export function planDay(s: GameState) {
  s.agenda = [];
  if (dayOf(s.time) < FIRST_EVENT_DAY) return;
  const options = RANDOM_EVENTS.filter((e) => e.when(s));
  let roll = rand.next() * options.reduce((a, e) => a + e.weight, 0);
  const e = options.find((o) => (roll -= o.weight) <= 0);
  if (!e) return;
  const [from, to] = e.hours ?? DEFAULT_EVENT_HOURS;
  s.agenda.push({ key: e.key, hour: rand.int(from, to - 1) });
}

export function randomHourly(s: GameState, hour: number) {
  const due = s.agenda.filter((a) => a.hour === hour);
  s.agenda = s.agenda.filter((a) => a.hour !== hour);
  for (const a of due) {
    const e = RANDOM_EVENTS.find((x) => x.key === a.key)!;
    if (e.when(s)) e.run(s, hour);
  }
}

export function dailyCandidates(s: GameState) {
  if (s.gary.affinity >= 100 && !s.flags.garyOffer && !s.gary.recruited) {
    s.flags.garyOffer = 1;
    unlock(s, 'GARY');
    pushModal(s, {
      title: 'Gary Knows',
      art: 'gary',
      body: `This morning there was a note taped to your ladder, in careful block capitals:\n\n"I KNOW YOU'RE UP THERE. I'VE KNOWN FOR A WHILE. THANKS FOR THE FRIES. I HATE THIS JOB. CAN I COME UP? — GARY"\n\nIf Gary quits, he brings every patrol route with him. His replacement has never had NY Fries.\n\nIf he stays, he goes easy on you, lets you see his route, and makes one inspection a week go away.`,
      choices: [
        { label: 'Gary joins the crew', action: 'gary_join' },
        { label: 'Gary stays on the inside', action: 'gary_insider' },
      ],
    });
  }
}

export function resolveModal(s: GameState, modalId: number, action: string) {
  s.modals = s.modals.filter((m) => m.id !== modalId);
  const [verb, a, b] = action.split(':');
  switch (verb) {
    case 'recruit': {
      const v = s.ladder.find((x) => x.id === Number(a));
      if (!v || recruitBlocked(s)) return;
      const short = Math.max(0, 3 - s.food);
      s.cash -= short * FOOD_PRICE;
      s.food = Math.max(0, s.food - 3);
      s.ladder = s.ladder.filter((x) => x !== v);
      const c = addCrew(s, v.candidate);
      log(s, `${c.name} climbed the ladder and joined the crew.`, 'good', { x: Math.floor(c.x), y: Math.floor(c.y), layer: 1 });
      sfx('good');
      return;
    }
    case 'decline': {
      const v = s.ladder.find((x) => x.id === Number(a));
      s.ladder = s.ladder.filter((x) => x !== v);
      if (v) log(s, `${v.candidate.name} shrugged and went back down the ladder.`, 'info');
      return;
    }
    case 'laststand':
      s.miserable = 0;
      addMood(s, 15);
      log(s, `${s.crew[0]?.name ?? 'You'} unpacked the bag. One more week.`, 'info');
      return;
    case 'bail': {
      const c = s.crew.find((x) => x.id === Number(a));
      if (!c) return;
      s.cash -= Number(b);
      c.awayUntil = s.time + BAIL_HOURS * 60;
      log(s, `You posted bail for ${c.name}. They're released and will sneak back up the ladder around ${formatClock(c.awayUntil)}.`, 'info');
      return;
    }
    case 'wait': {
      const c = s.crew.find((x) => x.id === Number(a));
      if (!c) return;
      c.awayUntil = s.time + 5 * 1440;
      log(s, `${c.name} will sit it out in county. Five days.`, 'info');
      return;
    }
    case 'cut': {
      const c = s.crew.find((x) => x.id === Number(a));
      if (!c) return;
      s.crew = s.crew.filter((x) => x !== c);
      log(s, `${c.name} is gone. Nobody mentions them again.`, 'bad');
      return;
    }
    case 'feast':
      s.food -= 10;
      addMood(s, 25);
      log(s, 'A Thanksgiving feast of food court leftovers, served on a plywood table. Best night in the ceiling yet.', 'good');
      sfx('good');
      return;
    case 'hijinx':
      resolveHijinx(s, a, Number(b), Number(action.split(':')[3]));
      return;
    case 'xmasgary':
      s.food -= 5;
      s.gary.affinity = Math.min(100, s.gary.affinity + 40);
      log(s, 'Gary found a Christmas dinner outside his door. He stood there for a long time. Gary goodwill +40.', 'good');
      sfx('good');
      return;
    case 'gary_join': {
      s.gary.recruited = true;
      s.gary.replaced = true;
      const g = addCrew(s, makeCandidate(s, 'gary'));
      for (const n of s.npcs) if (n.isGary) n.state = 'offduty';
      log(s, `${g.name} turned in his badge and climbed the ladder. "So THIS is where the extension cords went."`, 'good');
      pa(s, 'Please welcome Officer Kowalski to the Northgate Mall night security team.');
      return;
    }
    case 'gary_insider':
      s.gary.insider = true;
      log(s, 'Gary stays on the job. From now on he takes the long way around, and whistles before corners.', 'good');
      return;
  }
}

export function auctionSummary(s: GameState) {
  return `${formatDate(AUCTION_DAY)} · Developer bid $${auctionBid(s).toLocaleString()}`;
}
