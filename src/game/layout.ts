import { Rng } from './rng';

export const W = 48;
export const H = 28;
export const N = W * H;

export const idx = (x: number, y: number) => y * W + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

export type RoomKind =
  | 'concourse'
  | 'court'
  | 'store'
  | 'food'
  | 'foodcourt'
  | 'anchor'
  | 'service'
  | 'hall'
  | 'security'
  | 'office'
  | 'maint'
  | 'dock'
  | 'entrance'
  | 'outside';

export type FloorStyle =
  | 'terrazzo'
  | 'court'
  | 'checker'
  | 'carpet'
  | 'wood'
  | 'tile'
  | 'black'
  | 'arcade'
  | 'concrete'
  | 'asphalt'
  | 'luxe'
  | 'office'
  | 'dock';

export interface RoomDef {
  id: string;
  kind: RoomKind;
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  floor: FloorStyle;
  floorColor: string;
  accent: string;
  noiseMask: number;
  smellMask: number;
  sensitivity: number;
  powerCap: number;
  ceiling: boolean;
  traffic: number;
  blurb: string;
  closable?: boolean;
  closingLine?: string;
}

export const E_OPEN = 0;
export const E_WALL = 1;
export const E_STAFF = 2;
export const E_GATE = 3;
export const E_PUBLIC = 4;
export const E_GLASS = 5;

export type FixtureKind =
  | 'fountain'
  | 'palm'
  | 'bench'
  | 'kiosk'
  | 'table'
  | 'trash'
  | 'cabinet'
  | 'ddr'
  | 'airhockey'
  | 'prize'
  | 'tokens'
  | 'rack'
  | 'shelf'
  | 'counter'
  | 'cdbin'
  | 'bookshelf'
  | 'display'
  | 'case'
  | 'cage'
  | 'toybin'
  | 'desk'
  | 'monitors'
  | 'lostfound'
  | 'dumpster'
  | 'pallet'
  | 'ladder'
  | 'vending'
  | 'payphone'
  | 'car'
  | 'lamppost'
  | 'boxes'
  | 'oven'
  | 'panel'
  | 'boiler'
  | 'directory'
  | 'servicedesk'
  | 'mopsink';

export interface Fixture {
  id: number;
  kind: FixtureKind;
  x: number;
  y: number;
  w: number;
  d: number;
  room: number;
  blocks: boolean;
  color: string;
  color2: string;
  seed: number;
  label?: string;
}

export type CeilingKind = 0 | 1 | 2 | 3 | 4;
export const C_OPEN = 0;
export const C_DUCT = 1;
export const C_SKYLIGHT = 2;
export const C_NONE = 3;
export const C_AC = 4;

export type SpotId =
  | 'fountain'
  | 'busk'
  | 'samples'
  | 'dumpster'
  | 'arcade'
  | 'radiohut'
  | 'vending'
  | 'lostfound'
  | 'returns'
  | 'kiosk'
  | 'boundaries'
  | 'gary'
  | 'pallets'
  | 'stockroom'
  | 'zalez'
  | 'doorbuster';

export interface Waypoint {
  x: number;
  y: number;
  wait: number;
}

export interface Layout {
  rooms: RoomDef[];
  roomAt: Int16Array;
  edgeN: Uint8Array;
  edgeW: Uint8Array;
  fixtures: Fixture[];
  fixtureAt: Int16Array;
  ceilingKind: Uint8Array;
  hatch: { x: number; y: number };
  spots: Record<SpotId, { x: number; y: number }>;
  nightRoutes: Waypoint[][];
  dayRoute: Waypoint[];
  janitorRoutes: Waypoint[][];
  cameraSpots: { x: number; y: number; angle: number; sweep: number }[];
  shopperEntrances: { x: number; y: number }[];
  roomIndex: Record<string, number>;
}

type RoomSpec = Omit<RoomDef, 'ceiling' | 'traffic' | 'powerCap' | 'blurb' | 'floorColor'> &
  Partial<Pick<RoomDef, 'ceiling' | 'traffic' | 'powerCap' | 'blurb' | 'floorColor'>>;

function room(spec: RoomSpec): RoomDef {
  return {
    ceiling: true,
    traffic: 0,
    powerCap: 12,
    blurb: '',
    floorColor: '#d8cfc0',
    ...spec,
  };
}

const ROOM_SPECS: RoomDef[] = [
  room({ id: 'outside', kind: 'outside', name: 'Parking Lot', x0: 0, y0: 23, x1: 47, y1: 27, floor: 'asphalt', floorColor: '#2b2b33', accent: '#555', noiseMask: 0, smellMask: 0, sensitivity: 0, ceiling: false }),
  room({ id: 'janitor', kind: 'maint', name: 'Janitor Closet', x0: 6, y0: 0, x1: 7, y1: 1, floor: 'concrete', floorColor: '#6d6a66', accent: '#7d7a74', noiseMask: 0.3, smellMask: 0.8, sensitivity: 0.3, blurb: 'Smells like bleach. Masks smells nicely.' }),
  room({ id: 'maint', kind: 'maint', name: 'Maintenance', x0: 8, y0: 0, x1: 13, y1: 1, floor: 'concrete', floorColor: '#6d6a66', accent: '#7d7a74', noiseMask: 0.35, smellMask: 0.4, sensitivity: 0.9, blurb: 'Where Dale keeps his ladders. Dale checks ceilings for a living.' }),
  room({ id: 'stock', kind: 'maint', name: 'Stockroom', x0: 14, y0: 0, x1: 21, y1: 1, floor: 'concrete', floorColor: '#706b63', accent: '#7d7a74', noiseMask: 0.3, smellMask: 0.3, sensitivity: 0.35, blurb: 'Overflow inventory nobody counts.' }),
  room({ id: 'mgmt', kind: 'office', name: 'Mall Management', x0: 22, y0: 0, x1: 27, y1: 1, floor: 'office', floorColor: '#5d6b7a', accent: '#3d4b5c', noiseMask: 0.05, smellMask: 0.1, sensitivity: 1.8, blurb: 'Ms. Pruitt, General Manager. She hears everything between 9 and 5.' }),
  room({ id: 'mech', kind: 'maint', name: 'Mechanical', x0: 28, y0: 0, x1: 29, y1: 1, floor: 'concrete', floorColor: '#5f5b57', accent: '#7d7a74', noiseMask: 0.95, smellMask: 0.5, sensitivity: 0.2, blurb: 'The HVAC roars in here. Nobody hears a thing.' }),
  room({ id: 'security', kind: 'security', name: 'Security Office', x0: 30, y0: 0, x1: 35, y1: 1, floor: 'office', floorColor: '#4f5866', accent: '#22304a', noiseMask: 0, smellMask: 0, sensitivity: 2.2, blurb: 'Camera monitors, a Lost & Found bin, and a guard who is always here.' }),
  room({ id: 'electrical', kind: 'maint', name: 'Electrical Room', x0: 36, y0: 0, x1: 41, y1: 1, floor: 'concrete', floorColor: '#66625c', accent: '#7d7a74', noiseMask: 0.5, smellMask: 0.3, sensitivity: 0.3, powerCap: 30, blurb: 'The main panels hum. A generous place to splice.' }),
  room({ id: 'corridor', kind: 'service', name: 'Service Corridor', x0: 6, y0: 2, x1: 41, y1: 3, floor: 'concrete', floorColor: '#77736c', accent: '#8a867e', noiseMask: 0.3, smellMask: 0.35, sensitivity: 0.4, powerCap: 18, blurb: 'The utility hallway. Your ladder is here. Staff pass through all day.' }),
  room({ id: 'dock', kind: 'dock', name: 'Loading Dock', x0: 42, y0: 0, x1: 47, y1: 3, floor: 'dock', floorColor: '#4a4844', accent: '#666', noiseMask: 0, smellMask: 0, sensitivity: 0, ceiling: false }),

  room({ id: 'samgroovy', kind: 'store', name: 'Sunrise Records', x0: 6, y0: 4, x1: 9, y1: 10, floor: 'tile', floorColor: '#e4dccb', accent: '#ff8c1a', noiseMask: 0.5, smellMask: 0.1, sensitivity: 0.8, traffic: 0.8, closable: true, blurb: 'CDs, cassingles, and a clerk who will judge your taste.', closingLine: 'Sunrise Records is closing. Apparently everyone has an iPod now.' }),
  room({ id: 'hotspot', kind: 'store', name: 'West 49', x0: 10, y0: 4, x1: 13, y1: 10, floor: 'black', floorColor: '#1c1a22', accent: '#f5c400', noiseMask: 0.75, smellMask: 0.25, sensitivity: 0.5, traffic: 1.1, blurb: 'Skate videos at volume 11, all day. Excellent noise cover.' }),
  room({ id: 'radiohut', kind: 'store', name: 'The Source', x0: 14, y0: 4, x1: 17, y1: 10, floor: 'tile', floorColor: '#e9e6e0', accent: '#e8202a', noiseMask: 0.15, smellMask: 0.1, sensitivity: 1.1, traffic: 0.5, closable: true, blurb: 'Batteries, cables, and a back room full of "defective" parts.', closingLine: 'The Source is closing. The clerk says nobody needs a 9-volt anymore.' }),
  room({ id: 'hall', kind: 'hall', name: 'Restroom Hall', x0: 18, y0: 4, x1: 19, y1: 10, floor: 'tile', floorColor: '#cfd8d6', accent: '#9fb3b0', noiseMask: 0.35, smellMask: 0.9, sensitivity: 0.3, blurb: 'Payphones, restrooms, and the EMPLOYEES ONLY door.' }),
  room({ id: 'sbarrito', kind: 'food', name: 'A&W', x0: 20, y0: 4, x1: 21, y1: 5, floor: 'tile', floorColor: '#e6d6c0', accent: '#e87722', noiseMask: 0.6, smellMask: 0.92, sensitivity: 0.6, traffic: 0.5, blurb: 'Burgers and onion rings. The grill smell gets into everything.' }),
  room({ id: 'teriyaki', kind: 'food', name: 'Tan Tan Wok', x0: 22, y0: 4, x1: 23, y1: 5, floor: 'tile', floorColor: '#e6d6c0', accent: '#c8102e', noiseMask: 0.6, smellMask: 0.92, sensitivity: 0.6, traffic: 0.5, blurb: 'Free samples on toothpicks. Infinite, if you have the nerve.' }),
  room({ id: 'jubilee', kind: 'food', name: 'Dairy Queen', x0: 24, y0: 4, x1: 25, y1: 5, floor: 'tile', floorColor: '#e6d6c0', accent: '#ff671f', noiseMask: 0.65, smellMask: 0.85, sensitivity: 0.6, traffic: 0.4, blurb: 'The blenders never stop. Neither does the noise.' }),
  room({ id: 'cinnabomb', kind: 'food', name: 'NY Fries', x0: 26, y0: 4, x1: 27, y1: 5, floor: 'tile', floorColor: '#e6d6c0', accent: '#e10600', noiseMask: 0.55, smellMask: 0.98, sensitivity: 0.6, traffic: 0.5, blurb: 'The fryer never stops. Nothing else gets through.' }),
  room({ id: 'foodcourt', kind: 'foodcourt', name: 'Food Court', x0: 20, y0: 6, x1: 27, y1: 10, floor: 'checker', floorColor: '#e8e2d4', accent: '#2aa6a0', noiseMask: 0.65, smellMask: 0.78, sensitivity: 0.55, traffic: 1.2, blurb: 'Loud, greasy, perfect cover.' }),
  room({ id: 'ebgamez', kind: 'store', name: 'EB Games', x0: 28, y0: 4, x1: 31, y1: 10, floor: 'carpet', floorColor: '#2b3a6e', accent: '#1d3f9e', noiseMask: 0.45, smellMask: 0.1, sensitivity: 0.8, traffic: 0.9, blurb: 'Halo 2 preorders and demo kiosks that never shut up.' }),
  room({ id: 'funzone', kind: 'store', name: 'Galaxy', x0: 32, y0: 4, x1: 36, y1: 10, floor: 'arcade', floorColor: '#141433', accent: '#ff2bd6', noiseMask: 0.92, smellMask: 0.3, sensitivity: 0.45, powerCap: 30, traffic: 1.0, blurb: 'DDR, skee-ball, screaming children. The best noise cover in the mall.' }),
  room({ id: 'spenceleys', kind: 'store', name: "Spencer's", x0: 37, y0: 4, x1: 41, y1: 10, floor: 'black', floorColor: '#1e1428', accent: '#a24bff', noiseMask: 0.6, smellMask: 0.6, sensitivity: 0.6, traffic: 0.9, blurb: 'Blacklight posters, lava lamps, and enough incense to hide anything.' }),

  room({ id: 'concourse', kind: 'concourse', name: 'Main Concourse', x0: 6, y0: 11, x1: 41, y1: 15, floor: 'terrazzo', floorColor: '#ded3c2', accent: '#b9ab96', noiseMask: 0.5, smellMask: 0.5, sensitivity: 0.5, powerCap: 25, traffic: 0.6, blurb: 'Shoppers drown out a lot. Mall Management hears the rest.' }),
  room({ id: 'court', kind: 'court', name: 'Center Court', x0: 20, y0: 11, x1: 27, y1: 17, floor: 'court', floorColor: '#d9cdb8', accent: '#2aa6a0', noiseMask: 0.6, smellMask: 0.6, sensitivity: 0.4, traffic: 1.0, blurb: 'The fountain. The skylight. The heart of Northgate.' }),

  room({ id: 'abercromp', kind: 'store', name: 'American Eagle', x0: 6, y0: 16, x1: 10, y1: 22, floor: 'wood', floorColor: '#5a4330', accent: '#1a4b8c', noiseMask: 0.8, smellMask: 0.97, sensitivity: 0.55, traffic: 1.1, blurb: 'Pop radio and a cologne fog so thick you could cook a turkey up there.' }),
  room({ id: 'boundaries', kind: 'store', name: 'Coles', x0: 11, y0: 16, x1: 14, y1: 22, floor: 'carpet', floorColor: '#5b3a3a', accent: '#c8102e', noiseMask: 0.05, smellMask: 0.35, sensitivity: 1.4, traffic: 0.7, blurb: 'Silent as a library.' }),
  room({ id: 'blockbusted', kind: 'store', name: 'Blockbuster', x0: 15, y0: 16, x1: 19, y1: 22, floor: 'carpet', floorColor: '#22306b', accent: '#1747a6', noiseMask: 0.35, smellMask: 0.2, sensitivity: 0.9, traffic: 0.8, closable: true, blurb: 'Be kind, rewind.', closingLine: 'Blockbuster is closing. Something about DVDs in red envelopes.' }),
  room({ id: 'claire', kind: 'store', name: "Claire's", x0: 20, y0: 18, x1: 21, y1: 22, floor: 'tile', floorColor: '#f3d9e6', accent: '#ff5fa8', noiseMask: 0.45, smellMask: 0.3, sensitivity: 0.8, traffic: 0.7, closable: true, blurb: 'Ear piercing guns and the screams that go with them.', closingLine: "Claire's is closing. They did not see it coming." }),
  room({ id: 'entrance', kind: 'entrance', name: 'South Entrance', x0: 22, y0: 18, x1: 25, y1: 23, floor: 'terrazzo', floorColor: '#ded3c2', accent: '#b9ab96', noiseMask: 0.45, smellMask: 0.5, sensitivity: 0.4, blurb: 'Automatic doors and a rack of free apartment guides.' }),
  room({ id: 'petpalace', kind: 'store', name: 'Pet Palace', x0: 26, y0: 18, x1: 27, y1: 22, floor: 'tile', floorColor: '#d8ead8', accent: '#2fae66', noiseMask: 0.55, smellMask: 0.88, sensitivity: 0.7, traffic: 0.6, blurb: 'Parakeets, hamsters, and a very convenient smell. Sells raccoon-shaped things.' }),
  room({ id: 'bbw', kind: 'store', name: 'Bath & Body Works', x0: 28, y0: 16, x1: 31, y1: 22, floor: 'wood', floorColor: '#c9a27a', accent: '#6aa7ff', noiseMask: 0.3, smellMask: 0.98, sensitivity: 0.8, traffic: 0.8, blurb: 'Cucumber Melon. Cucumber Melon everywhere.' }),
  room({ id: 'kbtoyz', kind: 'store', name: 'KB Toys', x0: 32, y0: 16, x1: 36, y1: 22, floor: 'tile', floorColor: '#eae4d0', accent: '#ffb000', noiseMask: 0.6, smellMask: 0.2, sensitivity: 0.75, traffic: 0.8, closable: true, blurb: 'Toys that make noise, demonstrated constantly.', closingLine: 'KB Toys has filed for bankruptcy. The Furbies are 90% off.' }),
  room({ id: 'zalez', kind: 'store', name: 'Charm Diamond Centres', x0: 37, y0: 16, x1: 41, y1: 22, floor: 'luxe', floorColor: '#f1ece0', accent: '#c9a23a', noiseMask: 0.05, smellMask: 0.1, sensitivity: 1.6, traffic: 0.5, blurb: 'Hushed, carpeted, and full of motion sensors. Do not build here.' }),

  room({ id: 'searz', kind: 'anchor', name: 'Sears', x0: 0, y0: 4, x1: 5, y1: 22, floor: 'tile', floorColor: '#d6d8dc', accent: '#1c4fa0', noiseMask: 0, smellMask: 0, sensitivity: 0, ceiling: false, traffic: 1.0, blurb: 'Anchor. Its own firewall. Walmart is through the store, on the other side. Generous return policy.' }),
  room({ id: 'dillmans', kind: 'anchor', name: 'Zellers', x0: 42, y0: 4, x1: 47, y1: 22, floor: 'tile', floorColor: '#d8d4d0', accent: '#c41230', noiseMask: 0, smellMask: 0, sensitivity: 0, ceiling: false, traffic: 1.0, blurb: 'Discount department store. Its own firewall. Returns leave through the dock.' }),
];

function setEdge(layout: Layout, ax: number, ay: number, bx: number, by: number, type: number) {
  if (bx === ax && by === ay - 1) layout.edgeN[idx(ax, ay)] = type;
  else if (bx === ax && by === ay + 1) layout.edgeN[idx(bx, by)] = type;
  else if (bx === ax - 1 && by === ay) layout.edgeW[idx(ax, ay)] = type;
  else if (bx === ax + 1 && by === ay) layout.edgeW[idx(bx, by)] = type;
}

export function edgeBetween(layout: Layout, ax: number, ay: number, bx: number, by: number): number {
  if (!inBounds(bx, by)) return E_WALL;
  if (bx === ax && by === ay - 1) return layout.edgeN[idx(ax, ay)];
  if (bx === ax && by === ay + 1) return layout.edgeN[idx(bx, by)];
  if (bx === ax - 1 && by === ay) return layout.edgeW[idx(ax, ay)];
  if (bx === ax + 1 && by === ay) return layout.edgeW[idx(bx, by)];
  return E_WALL;
}

const FRONT_KINDS: RoomKind[] = ['concourse', 'court', 'foodcourt'];

export function buildLayout(): Layout {
  const rooms = ROOM_SPECS;
  const roomAt = new Int16Array(N).fill(-1);
  const roomIndex: Record<string, number> = {};
  rooms.forEach((r, i) => {
    roomIndex[r.id] = i;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) roomAt[idx(x, y)] = i;
  });

  const layout: Layout = {
    rooms,
    roomAt,
    edgeN: new Uint8Array(N),
    edgeW: new Uint8Array(N),
    fixtures: [],
    fixtureAt: new Int16Array(N).fill(-1),
    ceilingKind: new Uint8Array(N),
    hatch: { x: 9, y: 3 },
    spots: {
      fountain: { x: 22, y: 14 },
      busk: { x: 22, y: 16 },
      samples: { x: 23, y: 6 },
      dumpster: { x: 45, y: 2 },
      arcade: { x: 35, y: 9 },
      radiohut: { x: 15, y: 5 },
      vending: { x: 18, y: 6 },
      lostfound: { x: 34, y: 0 },
      returns: { x: 4, y: 12 },
      kiosk: { x: 11, y: 12 },
      boundaries: { x: 12, y: 18 },
      gary: { x: 33, y: 3 },
      pallets: { x: 45, y: 3 },
      stockroom: { x: 19, y: 1 },
      zalez: { x: 39, y: 19 },
      doorbuster: { x: 41, y: 13 },
    },
    nightRoutes: [],
    dayRoute: [],
    janitorRoutes: [],
    cameraSpots: [],
    shopperEntrances: [
      { x: 22, y: 25 },
      { x: 23, y: 25 },
      { x: 24, y: 25 },
      { x: 25, y: 25 },
    ],
    roomIndex,
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const here = roomAt[idx(x, y)];
      const north = y > 0 ? roomAt[idx(x, y - 1)] : -1;
      const west = x > 0 ? roomAt[idx(x - 1, y)] : -1;
      layout.edgeN[idx(x, y)] = here === north || (here < 0 && north < 0) ? E_OPEN : E_WALL;
      layout.edgeW[idx(x, y)] = here === west || (here < 0 && west < 0) ? E_OPEN : E_WALL;
    }
  }

  const kindAt = (x: number, y: number) => (inBounds(x, y) && roomAt[idx(x, y)] >= 0 ? rooms[roomAt[idx(x, y)]].kind : null);
  const openBetweenKinds = (a: RoomKind, b: RoomKind) => {
    const pair = [a, b].sort().join('|');
    return ['concourse|court', 'court|foodcourt', 'court|entrance'].includes(pair);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = kindAt(x, y);
      if (!k) continue;
      for (const [nx, ny] of [
        [x, y - 1],
        [x - 1, y],
      ]) {
        const nk = kindAt(nx, ny);
        if (nk && openBetweenKinds(k, nk)) setEdge(layout, x, y, nx, ny, E_OPEN);
      }
    }
  }

  rooms.forEach((r, ri) => {
    if (r.kind !== 'store' && r.kind !== 'food' && r.kind !== 'anchor') return;
    const fronts: { x: number; y: number; nx: number; ny: number; dir: string }[] = [];
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        for (const [nx, ny, dir] of [
          [x, y - 1, 'n'],
          [x, y + 1, 's'],
          [x - 1, y, 'w'],
          [x + 1, y, 'e'],
        ] as [number, number, string][]) {
          if (!inBounds(nx, ny) || roomAt[idx(nx, ny)] === ri) continue;
          const nk = kindAt(nx, ny);
          if (nk && FRONT_KINDS.includes(nk)) fronts.push({ x, y, nx, ny, dir });
        }
      }
    }
    const counts: Record<string, number> = {};
    fronts.forEach((f) => (counts[f.dir] = (counts[f.dir] ?? 0) + 1));
    const mainDir = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const main = fronts.filter((f) => f.dir === mainDir);
    main.forEach((f, i) => {
      const isEnd = (i === 0 || i === main.length - 1) && main.length >= 4;
      setEdge(layout, f.x, f.y, f.nx, f.ny, r.kind === 'food' || !isEnd ? E_GATE : E_GLASS);
    });
    fronts.filter((f) => f.dir !== mainDir).forEach((f) => setEdge(layout, f.x, f.y, f.nx, f.ny, E_GLASS));

    if ((r.kind === 'store' || r.kind === 'food') && r.y0 === 4) {
      setEdge(layout, r.x0 + Math.floor((r.x1 - r.x0) / 2), 4, r.x0 + Math.floor((r.x1 - r.x0) / 2), 3, E_STAFF);
    }
  });

  setEdge(layout, 18, 11, 18, 10, E_OPEN);
  setEdge(layout, 19, 11, 19, 10, E_OPEN);
  setEdge(layout, 18, 4, 18, 3, E_STAFF);
  for (const r of rooms) {
    if (r.y1 === 1 && r.y0 === 0) {
      const dx = r.id === 'security' ? 32 : Math.floor((r.x0 + r.x1) / 2);
      setEdge(layout, dx, 2, dx, 1, E_STAFF);
    }
  }
  setEdge(layout, 42, 2, 41, 2, E_STAFF);
  setEdge(layout, 42, 3, 41, 3, E_STAFF);
  for (let x = 22; x <= 25; x++) setEdge(layout, x, 24, x, 23, E_PUBLIC);

  for (let i = 0; i < N; i++) {
    const ri = roomAt[i];
    if (ri < 0 || !rooms[ri].ceiling) layout.ceilingKind[i] = C_NONE;
    else if (rooms[ri].kind === 'court') layout.ceilingKind[i] = C_SKYLIGHT;
  }
  const duct = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) layout.ceilingKind[idx(x, y)] = C_DUCT;
  };
  duct(6, 11, 13, 13);
  duct(14, 19, 13, 13);
  duct(28, 32, 13, 13);
  duct(36, 41, 13, 13);
  duct(20, 27, 4, 4);
  duct(34, 34, 5, 8);
  duct(24, 24, 7, 9);
  duct(16, 16, 17, 20);
  for (const [ax, ay] of [
    [12, 19],
    [38, 6],
    [29, 20],
    [7, 7],
    [34, 19],
  ]) {
    for (let y = ay; y < ay + 2; y++) for (let x = ax; x < ax + 2; x++) layout.ceilingKind[idx(x, y)] = C_AC;
  }

  furnish(layout);

  const wp = (x: number, y: number, wait = 0): Waypoint => ({ x, y, wait });
  layout.nightRoutes = [
    [
      wp(33, 1, 40), wp(30, 3), wp(19, 3), wp(18, 7), wp(18, 11), wp(12, 12), wp(7, 12, 4), wp(7, 14), wp(16, 14),
      wp(21, 15), wp(25, 16, 3), wp(26, 13), wp(24, 9, 5), wp(21, 8), wp(28, 11), wp(40, 12, 4), wp(40, 14), wp(29, 14),
      wp(25, 11), wp(19, 12), wp(18, 6), wp(19, 3), wp(40, 3), wp(44, 2, 6), wp(36, 3),
    ],
    [
      wp(31, 3, 10), wp(34, 6), wp(34, 8, 3), wp(34, 6), wp(39, 3), wp(39, 8, 3), wp(39, 3), wp(29, 3), wp(30, 8, 3),
      wp(29, 3), wp(15, 3), wp(15, 7, 3), wp(15, 3), wp(11, 3), wp(11, 8, 3), wp(11, 3), wp(8, 3), wp(8, 6, 3), wp(8, 3),
      wp(23, 3), wp(24, 1, 6),
    ],
  ];
  layout.dayRoute = [
    wp(7, 12, 8), wp(19, 12), wp(22, 12), wp(25, 15, 10), wp(29, 14), wp(40, 14, 8), wp(40, 12), wp(29, 12),
    wp(25, 11), wp(22, 17, 10), wp(18, 14), wp(7, 14),
  ];
  layout.janitorRoutes = [
    [wp(8, 11), wp(40, 11), wp(40, 12), wp(8, 12), wp(8, 14), wp(40, 14), wp(40, 15), wp(8, 15)],
    [wp(21, 6), wp(27, 6), wp(27, 10), wp(20, 10), wp(20, 15), wp(27, 17), wp(22, 22), wp(25, 19)],
  ];
  layout.cameraSpots = [
    { x: 6.2, y: 11.2, angle: Math.PI / 4, sweep: 0.5 },
    { x: 33.5, y: 2.2, angle: Math.PI * 0.75, sweep: 0.75 },
    { x: 20.3, y: 11.3, angle: Math.PI / 4, sweep: 0.6 },
    { x: 41.8, y: 15.8, angle: (-3 * Math.PI) / 4, sweep: 0.5 },
    { x: 18.2, y: 4.3, angle: Math.PI / 2, sweep: 0.2 },
    { x: 27.8, y: 6.2, angle: (3 * Math.PI) / 4, sweep: 0.5 },
    { x: 6.3, y: 3.8, angle: 0, sweep: 0.3 },
    { x: 41.7, y: 11.2, angle: (3 * Math.PI) / 4, sweep: 0.5 },
  ];
  return layout;
}

function furnish(layout: Layout) {
  const rng = new Rng(1337);
  const { rooms, roomIndex } = layout;
  const reserved = new Set<number>(Object.values(layout.spots).map((s) => idx(s.x, s.y)));
  reserved.add(idx(layout.hatch.x, layout.hatch.y));

  const add = (kind: FixtureKind, x: number, y: number, opts: Partial<Fixture> = {}) => {
    const w = opts.w ?? 1;
    const d = opts.d ?? 1;
    for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) if (layout.fixtureAt[idx(xx, yy)] >= 0) return;
    const f: Fixture = {
      id: layout.fixtures.length,
      kind,
      x,
      y,
      w,
      d,
      room: layout.roomAt[idx(x, y)],
      blocks: true,
      color: '#888',
      color2: '#555',
      seed: rng.int(0, 1e6),
      ...opts,
    };
    layout.fixtures.push(f);
    for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) layout.fixtureAt[idx(xx, yy)] = f.id;
  };
  const free = (x: number, y: number) => !reserved.has(idx(x, y)) && layout.fixtureAt[idx(x, y)] < 0;
  const R = (id: string) => rooms[roomIndex[id]];

  add('fountain', 23, 13, { w: 2, d: 2, color: '#2aa6a0', color2: '#8fe3f0' });
  for (const [x, y] of [
    [21, 12],
    [26, 12],
    [21, 16],
    [26, 16],
  ])
    add('palm', x, y, { color: '#c4a57a', color2: '#2f8f4e' });
  for (const [x, y] of [
    [8, 13],
    [33, 13],
    [39, 13],
    [14, 13],
  ])
    add('bench', x, y, { color: '#6b4a2f', color2: '#3b3b3b' });
  add('kiosk', 17, 13, { color: '#ff4fa3', color2: '#ffffff', label: 'CELL-U-LAR' });
  add('kiosk', 30, 13, { color: '#ffb000', color2: '#ffffff', label: 'SHADES HUT' });
  add('directory', 19, 14, { color: '#20304a', color2: '#7fd6ff' });
  add('trash', 12, 11, { color: '#5a4a3a', color2: '#333' });
  add('trash', 29, 15, { color: '#5a4a3a', color2: '#333' });

  for (const [x, y] of [
    [21, 7],
    [26, 7],
    [21, 9],
    [26, 9],
    [23, 8],
    [25, 10],
  ])
    add('table', x, y, { color: '#e8e2d4', color2: rng.pick(['#2aa6a0', '#ff4fa3', '#7a5cff']) });
  add('trash', 27, 8, { color: '#5a4a3a', color2: '#333' });

  for (const id of ['sbarrito', 'teriyaki', 'jubilee', 'cinnabomb']) {
    const r = R(id);
    add('oven', r.x1, 4, { color: '#9aa0a6', color2: r.accent });
    add('counter', r.x0, 5, { w: 2, color: r.accent, color2: '#f4efe6', label: r.name });
  }

  add('vending', 19, 6, { color: '#c8102e', color2: '#f4f4f4' });
  add('payphone', 19, 8, { color: '#6a6f78', color2: '#222' });
  add('payphone', 19, 9, { color: '#6a6f78', color2: '#222' });

  const music = R('samgroovy');
  add('counter', music.x0, 5, { w: 2, color: music.accent, color2: '#222' });
  for (const y of [7, 9]) for (const x of [music.x0 + 1, music.x0 + 2]) add('cdbin', x, y, { color: '#3b2a1a', color2: rng.pick(['#ff8c1a', '#2a7fff', '#ff3355', '#2fd17a']) });

  const hot = R('hotspot');
  for (let y = 5; y <= 9; y += 2) add('rack', hot.x0, y, { color: '#111', color2: rng.pick(['#d1003f', '#222', '#6a00ff']) });
  for (let y = 5; y <= 9; y += 2) add('rack', hot.x1, y, { color: '#111', color2: rng.pick(['#d1003f', '#222', '#ff6600']) });
  add('counter', hot.x0 + 1, 5, { color: '#111', color2: '#d1003f' });

  const rh = R('radiohut');
  for (let y = 6; y <= 9; y++) add('shelf', rh.x0, y, { color: '#ddd', color2: rng.pick(['#e8202a', '#2a2a2a', '#ffd000']) });
  for (let y = 6; y <= 9; y++) add('shelf', rh.x1, y, { color: '#ddd', color2: rng.pick(['#e8202a', '#2a2a2a', '#1a6aff']) });
  add('boxes', rh.x0, 4, { color: '#b08b5a', color2: '#8a6a40' });
  add('counter', rh.x0 + 2, 5, { color: '#e8202a', color2: '#eee' });

  const eb = R('ebgamez');
  for (let y = 5; y <= 9; y++) add('shelf', eb.x0, y, { color: '#1d3f9e', color2: rng.pick(['#2fd17a', '#ff3355', '#ffd000']) });
  for (let y = 6; y <= 9; y++) add('shelf', eb.x1, y, { color: '#1d3f9e', color2: rng.pick(['#2fd17a', '#ff3355', '#ffd000']) });
  add('cabinet', eb.x0 + 2, 7, { color: '#222', color2: '#2fd17a' });
  add('counter', eb.x0 + 2, 5, { color: '#1d3f9e', color2: '#eee' });

  for (const x of [32, 33, 35, 36]) add('cabinet', x, 5, { color: rng.pick(['#2a1a5a', '#5a1a2a', '#1a3a5a']), color2: rng.pick(['#ff2bd6', '#2bfff0', '#ffe52b', '#7cff2b']) });
  add('ddr', 32, 7, { color: '#222', color2: '#ff2bd6' });
  add('airhockey', 36, 7, { color: '#ddd', color2: '#2b6bff' });
  add('prize', 32, 9, { w: 2, color: '#ff2bd6', color2: '#ffe52b' });
  add('tokens', 36, 9, { color: '#ffb000', color2: '#ff2bd6' });

  const sp = R('spenceleys');
  for (let y = 5; y <= 9; y += 2) add('shelf', sp.x0, y, { color: '#221133', color2: rng.pick(['#a24bff', '#39ff14', '#ff2bd6']) });
  for (let y = 6; y <= 9; y++) add('display', sp.x1, y, { color: '#221133', color2: rng.pick(['#a24bff', '#39ff14', '#ff6600', '#ff2bd6']) });
  add('counter', sp.x0 + 2, 5, { color: '#221133', color2: '#a24bff' });

  const ab = R('abercromp');
  for (const [x, y] of [
    [7, 18],
    [9, 18],
    [7, 20],
    [9, 20],
  ])
    add('display', x, y, { color: '#4a3524', color2: rng.pick(['#9fb7c9', '#c9b79f', '#3a4a5a', '#ffffff']) });
  for (let y = 17; y <= 21; y++) add('rack', ab.x0, y, { color: '#2a1f17', color2: rng.pick(['#5a7a9a', '#c9b79f', '#2a3a4a']) });
  add('counter', 10, 22, { color: '#2a1f17', color2: '#c9b79f' });

  const bd = R('boundaries');
  for (let y = 17; y <= 22; y++) add('bookshelf', bd.x0, y, { color: '#5a3a22', color2: rng.pick(['#c84b3a', '#3a6ac8', '#e8c33a', '#3ac86a']) });
  for (const y of [20, 22]) add('bookshelf', 13, y, { color: '#5a3a22', color2: rng.pick(['#c84b3a', '#3a6ac8', '#e8c33a']) });
  add('table', 14, 18, { color: '#5a3a22', color2: '#7a1f2b' });
  add('counter', 14, 21, { color: '#7a1f2b', color2: '#eee' });

  const bb = R('blockbusted');
  for (const y of [18, 20]) for (const x of [16, 17, 18]) add('shelf', x, y, { color: '#1747a6', color2: rng.pick(['#ffd000', '#ff3355', '#2a2a2a']) });
  for (let y = 17; y <= 22; y++) add('shelf', bb.x1, y, { color: '#1747a6', color2: '#ffd000' });
  add('counter', 15, 22, { w: 2, color: '#ffd000', color2: '#1747a6' });

  add('display', 20, 20, { color: '#ff5fa8', color2: '#fff0f8' });
  add('display', 21, 22, { color: '#ff5fa8', color2: '#c9a2ff' });
  add('counter', 20, 22, { color: '#ff5fa8', color2: '#fff' });

  add('cage', 27, 19, { color: '#bbb', color2: '#2fae66' });
  add('cage', 27, 21, { color: '#bbb', color2: '#3aa0e0' });
  add('cage', 26, 22, { color: '#bbb', color2: '#e0a03a' });

  for (const [x, y] of [
    [29, 18],
    [30, 18],
    [29, 20],
  ])
    add('display', x, y, { color: '#e8d8c0', color2: rng.pick(['#9ae6a0', '#ffb0c0', '#a0d0ff']) });
  for (let y = 17; y <= 22; y++) add('shelf', 31, y, { color: '#f2ece0', color2: rng.pick(['#9ae6a0', '#ffb0c0', '#a0d0ff', '#ffe08a']) });

  for (const [x, y] of [
    [33, 18],
    [35, 18],
    [33, 21],
    [35, 21],
  ])
    add('toybin', x, y, { color: '#ffb000', color2: rng.pick(['#ff3355', '#2a7fff', '#2fd17a']) });
  for (let y = 17; y <= 22; y++) add('shelf', 32, y, { color: '#ddd', color2: rng.pick(['#ff3355', '#2a7fff', '#ffd000']) });

  for (const [x, y] of [
    [38, 18],
    [40, 18],
    [38, 20],
    [40, 20],
  ])
    add('case', x, y, { color: '#d9d2c2', color2: '#c9a23a' });
  add('counter', 39, 22, { w: 2, color: '#2a2a2a', color2: '#c9a23a' });

  for (const a of [R('searz'), R('dillmans')]) {
    const frontX = a.id === 'searz' ? a.x1 : a.x0;
    for (let y = a.y0 + 1; y <= a.y1 - 1; y += 2) {
      for (let x = a.x0 + 1; x <= a.x1 - 1; x += 2) {
        if (x === frontX || (y >= 11 && y <= 15 && Math.abs(x - frontX) <= 1)) continue;
        if (a.id === 'searz' && y >= 11 && y <= 13 && x <= 4) continue;
        add(rng.chance(0.5) ? 'rack' : 'shelf', x, y, { color: '#c8c8c8', color2: rng.pick(['#1c4fa0', '#8a1538', '#555', '#2fae66', '#c9a23a']) });
      }
    }
  }
  add('servicedesk', 3, 11, { w: 2, color: '#1c4fa0', color2: '#ffffff', label: 'CUSTOMER SERVICE' });

  add('mopsink', 6, 0, { color: '#bbb', color2: '#6a8aa0' });
  add('shelf', 8, 0, { color: '#8a8a8a', color2: '#c84b3a' });
  add('boxes', 12, 0, { color: '#b08b5a', color2: '#8a6a40' });
  for (let x = 14; x <= 21; x += 2) add('boxes', x, 0, { color: '#b08b5a', color2: '#8a6a40' });
  add('desk', 22, 0, { color: '#7a6a5a', color2: '#ddd' });
  add('desk', 26, 0, { color: '#7a6a5a', color2: '#ddd' });
  add('boiler', 28, 0, { color: '#8a8f96', color2: '#c84b3a' });
  add('monitors', 30, 0, { color: '#2a2a2a', color2: '#7fd6ff' });
  add('desk', 31, 0, { color: '#4a4a4a', color2: '#7fd6ff' });
  add('lostfound', 35, 0, { color: '#2a5aa0', color2: '#ffd000', label: 'LOST & FOUND' });
  for (let x = 37; x <= 41; x++) add('panel', x, 0, { color: '#9aa0a6', color2: '#ffd000' });

  for (const x of [7, 16, 27, 38]) if (free(x, 2)) add('boxes', x, 2, { color: '#b08b5a', color2: '#8a6a40' });
  add('ladder', layout.hatch.x, layout.hatch.y, { blocks: false, color: '#c9a23a', color2: '#7a6a3a' });

  add('dumpster', 44, 1, { color: '#2f6a3a', color2: '#1f4a2a' });
  add('dumpster', 46, 1, { color: '#2f6a3a', color2: '#1f4a2a' });
  add('pallet', 46, 3, { color: '#b08b5a', color2: '#5a8ac8' });

  for (let i = 0; i < 9; i++) {
    const x = rng.pick([1, 3, 5, 8, 10, 13, 16, 29, 32, 35, 38, 41, 44, 46]);
    const y = rng.pick([25, 26, 27]);
    if (free(x, y)) add('car', x, y, { color: rng.pick(['#c84b3a', '#3a6ac8', '#e8e8e8', '#2a2a2a', '#c8b43a', '#3a8a5a', '#8a3ac8']), color2: '#9fc8e8' });
  }
  for (const x of [6, 18, 30, 42]) if (free(x, 24)) add('lamppost', x, 24, { color: '#555', color2: '#ffe8a0' });

  for (let i = 0; i < N; i++) {
    const fi = layout.fixtureAt[i];
    if (fi >= 0 && reserved.has(i) && layout.fixtures[fi].blocks) throw new Error(`fixture on reserved tile ${i}`);
  }
}

export const LAYOUT = buildLayout();

export function roomOf(x: number, y: number): RoomDef | null {
  if (!inBounds(x, y)) return null;
  const ri = LAYOUT.roomAt[idx(x, y)];
  return ri >= 0 ? LAYOUT.rooms[ri] : null;
}
