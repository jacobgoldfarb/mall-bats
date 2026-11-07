import { BUILD, COSTUMES, canRotate, type BuildId, type JobId } from '../game/defs';
import { C_AC, C_DUCT, C_OPEN, C_SKYLIGHT, E_GATE, E_GLASS, E_OPEN, E_PUBLIC, E_STAFF, H, LAYOUT, N, W, idx, inBounds, type RoomDef } from '../game/layout';
import { hash2 } from '../game/rng';
import { guardCone } from '../game/npc';
import { drawHeatMap } from './heat';
import type { Crew, GameState, Npc, Placed } from '../game/state';
import { dayOf, minuteOfDay, phaseAt } from '../game/time';
import { forecastInspection, forecastLabel } from '../game/inspect';
import { CAMERA_FOV, CAMERA_RANGE, boundariesSignal, cameraAngle, canPlace, sightPolygon } from '../game/world';
import { popupName } from '../game/sim';
import { BODY_FONT, DISPLAY_FONT, bubble, box, diamondPath, drawPerson, drawPet, faceQuad, isoText, roundRect, type Ctx, type WorkMotion } from './draw';
import { TH, TW, isoX, isoY, mix, screenToWorld, shade, type Camera } from './iso';
import { drawBuildable, drawFixture, drawFloorSleeper, sleeperSprite } from './objects';
import { characterIds, drawPropSprite, texture, type Texture } from './sprites';

export type Overlay = 'none' | 'noise' | 'smell' | 'power';

export interface ViewState {
  layer: 0 | 1;
  overlay: Overlay;
  hover: { x: number; y: number } | null;
  build: BuildId | null;
  demolish: boolean;
  dragStart: { x: number; y: number } | null;
  selectedCrew: number | null;
  xray: boolean;
  flip: boolean;
}

interface Drawable {
  depth: number;
  order: number;
  fn: () => void;
}

const WALL_H = 18;
const WORK_MOTION: Partial<Record<JobId, WorkMotion>> = {
  fountain: 'rummage',
  dumpster: 'rummage',
  samples: 'rummage',
  radiohut: 'rummage',
  pallets: 'rummage',
  stockroom: 'rummage',
  lostfound: 'rummage',
  gary: 'rummage',
  vending: 'jiggle',
  arcade: 'jiggle',
  busk: 'sway',
  tinker: 'hammer',
  kiosk: 'pitch',
  popup: 'pitch',
  returns: 'pitch',
  boundaries: 'pitch',
};
const OUTER_H = 46;
const FRONT_H = 7;
const MAP_X = isoX(0, H);
const MAP_W = isoX(W, 0) - MAP_X;
const MAP_H = isoY(W, H);

interface FloorLook {
  tex: Texture;
  mul: [number, number, number] | null;
  flip: boolean;
}

function floorLook(id: string, x: number, y: number, color?: string): FloorLook | null {
  const tex = texture(id);
  if (!tex) return null;
  const n = color ? parseInt(color.slice(1), 16) : 0;
  const mul: FloorLook['mul'] = color ? [((n >> 16) & 255) / tex.avg[0], ((n >> 8) & 255) / tex.avg[1], (n & 255) / tex.avg[2]] : null;
  return { tex, mul, flip: !tex.tint && hash2(x, y, 21) > 0.5 };
}

function bakeIso(width: number, height: number, originX: number, lookAt: (tx: number, ty: number) => FloorLook | null, originY = 0): ImageData {
  const img = new ImageData(width, height);
  const cache = new Map<number, FloorLook | null>();
  for (let py = 0; py < height; py++) {
    const b = (py + originY + 0.5) / (TH / 2);
    for (let px = 0; px < width; px++) {
      const a = (px + originX + 0.5) / (TW / 2);
      const wx = (a + b) / 2;
      const wy = (b - a) / 2;
      const tx = Math.floor(wx);
      const ty = Math.floor(wy);
      const key = ty * 4096 + tx;
      let look = cache.get(key);
      if (look === undefined) {
        look = lookAt(tx, ty);
        cache.set(key, look);
      }
      if (!look) continue;
      const { size, data } = look.tex;
      const span = size / 32;
      let u = ((((tx % span) + span) % span) + wx - tx) / span;
      const v = ((((ty % span) + span) % span) + wy - ty) / span;
      if (look.flip) u = 1 - u;
      const si = (Math.min(size - 1, Math.floor(v * size)) * size + Math.min(size - 1, Math.floor(u * size))) * 4;
      const o = (py * width + px) * 4;
      const m = look.mul;
      img.data[o] = m ? data[si] * m[0] : data[si];
      img.data[o + 1] = m ? data[si + 1] * m[1] : data[si + 1];
      img.data[o + 2] = m ? data[si + 2] * m[2] : data[si + 2];
      img.data[o + 3] = 255;
    }
  }
  return img;
}

function onContextRestored(canvas: HTMLCanvasElement, redraw: () => void) {
  canvas.addEventListener('contextrestored', redraw);
}

function roomScreenRect(r: RoomDef) {
  const left = Math.max(0, Math.floor(isoX(r.x0, r.y1 + 1) - MAP_X) - 2);
  const right = Math.min(MAP_W, Math.ceil(isoX(r.x1 + 1, r.y0) - MAP_X) + 2);
  const top = Math.max(0, Math.floor(isoY(r.x0, r.y0)) - 2);
  const bottom = Math.min(MAP_H, Math.ceil(isoY(r.x1 + 1, r.y1 + 1)) + 2);
  return { left, top, width: right - left, height: bottom - top };
}

export class Renderer {
  ctx: Ctx;
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  dpr = 1;
  width = 0;
  height = 0;
  private floorSig = '';
  private floor = new Map<string, Path2D>();
  private floorCanvas = document.createElement('canvas');
  private ceilingTiles = new Map<string, Path2D>();
  private ceilingCanvas: HTMLCanvasElement | null = null;
  private deckTiles: HTMLCanvasElement[] = [];
  private light: HTMLCanvasElement;
  private lctx: Ctx;
  private signs: { room: number; x: number; y: number; dir: 'x' | 'y' }[] = [];
  private cones = new Map<string, { x: number; y: number }[]>();

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d')!;
    this.computeSigns();
    this.buildCeilingTiles();
    this.resize();
    onContextRestored(this.floorCanvas, () => (this.floorSig = ''));
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.light.width = Math.floor(this.width * 0.5);
    this.light.height = Math.floor(this.height * 0.5);
  }

  centerOn(x: number, y: number) {
    this.cam.x = this.width / 2 - isoX(x, y) * this.cam.zoom;
    this.cam.y = this.height / 2 - isoY(x, y) * this.cam.zoom;
  }

  screenToTile(sx: number, sy: number) {
    const wx = (sx - this.cam.x) / this.cam.zoom;
    const wy = (sy - this.cam.y) / this.cam.zoom;
    const w = screenToWorld(wx, wy);
    return { x: Math.floor(w.x), y: Math.floor(w.y), fx: w.x, fy: w.y };
  }

  worldToScreen(x: number, y: number, z = 0) {
    return { x: isoX(x, y) * this.cam.zoom + this.cam.x, y: isoY(x, y, z) * this.cam.zoom + this.cam.y };
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const z0 = this.cam.zoom;
    const z1 = Math.max(0.45, Math.min(2.6, z0 * factor));
    this.cam.x = sx - ((sx - this.cam.x) * z1) / z0;
    this.cam.y = sy - ((sy - this.cam.y) * z1) / z0;
    this.cam.zoom = z1;
  }

  clampCamera() {
    const z = this.cam.zoom;
    const minX = isoX(0, H) * z;
    const maxX = isoX(W, 0) * z;
    const minY = isoY(0, 0, 60) * z;
    const maxY = isoY(W, H) * z;
    this.cam.x = Math.min(this.width * 0.6 - minX, Math.max(this.width * 0.4 - maxX, this.cam.x));
    this.cam.y = Math.min(this.height * 0.6 - minY, Math.max(this.height * 0.4 - maxY, this.cam.y));
  }

  private computeSigns() {
    LAYOUT.rooms.forEach((r, ri) => {
      if (r.kind !== 'store' && r.kind !== 'food' && r.kind !== 'anchor') return;
      const fronts: { x: number; y: number; dir: 'x' | 'y' }[] = [];
      for (let y = r.y0; y <= r.y1 + 1; y++) {
        for (let x = r.x0; x <= r.x1 + 1; x++) {
          if (!inBounds(x, y)) continue;
          const i = idx(x, y);
          const eN = LAYOUT.edgeN[i];
          if ((eN === E_GATE || eN === E_GLASS) && (LAYOUT.roomAt[i] === ri || (y > 0 && LAYOUT.roomAt[idx(x, y - 1)] === ri))) fronts.push({ x: x + 0.5, y, dir: 'x' });
          const eW = LAYOUT.edgeW[i];
          if ((eW === E_GATE || eW === E_GLASS) && (LAYOUT.roomAt[i] === ri || (x > 0 && LAYOUT.roomAt[idx(x - 1, y)] === ri))) fronts.push({ x, y: y + 0.5, dir: 'y' });
        }
      }
      const xs = fronts.filter((f) => f.dir === 'x');
      const ys = fronts.filter((f) => f.dir === 'y');
      const main = xs.length >= ys.length ? xs : ys;
      if (!main.length) return;
      this.signs.push({
        room: ri,
        x: main.reduce((a, f) => a + f.x, 0) / main.length,
        y: main.reduce((a, f) => a + f.y, 0) / main.length,
        dir: main[0].dir,
      });
    });
  }

  private add(map: Map<string, Path2D>, color: string): Path2D {
    let p = map.get(color);
    if (!p) {
      p = new Path2D();
      map.set(color, p);
    }
    return p;
  }

  private buildFloors(s: GameState) {
    const sig = s.rooms.map((r) => (r.vacant ? (r.popup ? 'p' : 'v') : 'o')).join('');
    if (sig === this.floorSig) return;
    const previous = this.floorSig;
    this.floorSig = sig;
    this.floor.clear();
    const looks = new Map<number, FloorLook | null>();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ri = LAYOUT.roomAt[idx(x, y)];
        if (ri < 0) continue;
        const r = LAYOUT.rooms[ri];
        const vacant = s.rooms[ri].vacant && !s.rooms[ri].popup;
        const look = this.texturedFloor(r, x, y, vacant);
        looks.set(idx(x, y), look);
        if (look) this.floorOverlay(r, x, y, vacant);
        else this.floorTile(r, x, y, vacant);
      }
    }
    const lookAt = (tx: number, ty: number) => (inBounds(tx, ty) ? (looks.get(idx(tx, ty)) ?? null) : null);
    const c = this.floorCanvas;
    const fctx = c.getContext('2d')!;
    const regions = previous.length === sig.length ? LAYOUT.rooms.filter((_, ri) => previous[ri] !== sig[ri]).map(roomScreenRect) : [{ left: 0, top: 0, width: MAP_W, height: MAP_H }];
    if (previous.length !== sig.length) {
      c.width = MAP_W;
      c.height = MAP_H;
    }
    for (const rect of regions) {
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.putImageData(bakeIso(rect.width, rect.height, MAP_X + rect.left, lookAt, rect.top), rect.left, rect.top);
      fctx.save();
      fctx.translate(-MAP_X, 0);
      fctx.beginPath();
      fctx.rect(rect.left + MAP_X, rect.top, rect.width, rect.height);
      fctx.clip();
      for (const [color, path] of this.floor) {
        fctx.fillStyle = color;
        fctx.fill(path);
      }
      fctx.restore();
    }
  }

  private texturedFloor(r: RoomDef, x: number, y: number, vacant: boolean): FloorLook | null {
    if (vacant) return floorLook('floor.vacant', x, y) ?? floorLook('floor.concrete', x, y, '#58534b');
    const base = r.floorColor;
    switch (r.floor) {
      case 'court': {
        const ring = Math.max(Math.abs(x + 0.5 - 24), Math.abs(y + 0.5 - 14));
        return floorLook('floor.tile', x, y, Math.floor(ring) % 2 ? '#2aa6a0' : '#e8dcc6');
      }
      case 'checker':
        return floorLook('floor.tile', x, y, (x + y) % 2 ? base : '#2aa6a0');
      case 'dock':
        return floorLook('floor.concrete', x, y, base);
      case 'asphalt':
        return floorLook('floor.asphalt', x, y) ?? floorLook('floor.concrete', x, y, base);
      case 'terrazzo':
      case 'arcade':
      case 'luxe':
        return floorLook(`floor.${r.floor}`, x, y);
      default:
        return floorLook(`floor.${r.floor}`, x, y, base) ?? floorLook('floor.tile', x, y, base);
    }
  }

  private floorOverlay(r: RoomDef, x: number, y: number, vacant: boolean) {
    if (vacant) return;
    if (r.floor === 'asphalt' && y >= 25 && x % 3 === 0 && (x < 21 || x > 26)) diamondPath(this.add(this.floor, '#d8d8d8'), x, y, 0.06, 1);
    if (r.floor === 'luxe' && (x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1)) diamondPath(this.add(this.floor, '#c9a23a'), x, y, 1, 1, 0, 0.35);
    if (r.floor === 'dock' && (y === 3 || x === 42)) for (let k = 0; k < 3; k++) diamondPath(this.add(this.floor, '#e8c22a'), x + k * 0.33, y + 0.4, 0.16, 0.2);
  }

  private floorTile(r: RoomDef, x: number, y: number, vacant: boolean) {
    const h = hash2(x, y, 11);
    const base = vacant ? '#58534b' : r.floorColor;
    const tile = (c: string) => diamondPath(this.add(this.floor, c), x, y);
    const dot = (c: string, fx: number, fy: number, sz = 1.2) => {
      const p = this.add(this.floor, c);
      const px = isoX(x + fx, y + fy);
      const py = isoY(x + fx, y + fy);
      p.rect(px - sz / 2, py - sz / 4, sz, sz / 2);
    };
    if (vacant) {
      tile((x + y) % 2 ? '#58534b' : '#5e5950');
      for (let k = 0; k < 3; k++) dot('#4a463f', hash2(x, y, k), hash2(y, x, k), 3);
      return;
    }
    switch (r.floor) {
      case 'terrazzo': {
        tile(h > 0.5 ? base : mix(base, '#ffffff', 0.12));
        for (let k = 0; k < 4; k++) dot(['#9a8a74', '#b06a5a', '#6a8a9a', '#ffffff'][k], hash2(x, y, k + 3), hash2(y, x, k + 9), 1.6);
        break;
      }
      case 'court': {
        const ring = Math.max(Math.abs(x + 0.5 - 24), Math.abs(y + 0.5 - 14));
        tile(Math.floor(ring) % 2 ? '#2aa6a0' : '#e8dcc6');
        break;
      }
      case 'checker':
        tile((x + y) % 2 ? base : '#2aa6a0');
        break;
      case 'carpet':
        tile(base);
        for (let k = 0; k < 2; k++) dot(shade(base, 0.25), hash2(x, y, k), hash2(y, x, k), 2.5);
        break;
      case 'wood': {
        tile(base);
        const p = this.add(this.floor, shade(base, -0.2));
        for (let k = 1; k < 4; k++) {
          p.moveTo(isoX(x, y + k / 4), isoY(x, y + k / 4));
          p.lineTo(isoX(x + 1, y + k / 4), isoY(x + 1, y + k / 4));
          p.lineTo(isoX(x + 1, y + k / 4 + 0.02), isoY(x + 1, y + k / 4 + 0.02));
          p.lineTo(isoX(x, y + k / 4 + 0.02), isoY(x, y + k / 4 + 0.02));
        }
        break;
      }
      case 'tile':
        tile((x + y) % 2 ? base : shade(base, -0.05));
        diamondPath(this.add(this.floor, shade(base, -0.12)), x + 0.47, y, 0.06, 1);
        diamondPath(this.add(this.floor, shade(base, -0.12)), x, y + 0.47, 1, 0.06);
        break;
      case 'black':
        tile((x + y) % 2 ? base : shade(base, 0.08));
        break;
      case 'arcade': {
        tile(base);
        const cols = ['#ff2bd6', '#2bfff0', '#ffe52b', '#7cff2b'];
        for (let k = 0; k < 3; k++) {
          const p = this.add(this.floor, cols[Math.floor(hash2(x, y, k) * 4)]);
          const fx = hash2(x, y, k + 5) * 0.8 + 0.1;
          const fy = hash2(y, x, k + 5) * 0.8 + 0.1;
          const px = isoX(x + fx, y + fy);
          const py = isoY(x + fx, y + fy);
          if (k === 0) {
            p.moveTo(px - 4, py);
            p.lineTo(px, py - 2);
            p.lineTo(px + 4, py);
            p.lineTo(px, py + 2);
            p.closePath();
          } else p.rect(px - 3, py - 0.8, 6, 1.6);
        }
        break;
      }
      case 'concrete':
        tile(h > 0.6 ? base : shade(base, -0.04));
        for (let k = 0; k < 2; k++) dot(shade(base, -0.18), hash2(x, y, k), hash2(y, x, k), 2);
        break;
      case 'asphalt': {
        tile(h > 0.5 ? base : shade(base, 0.04));
        if (y >= 25 && x % 3 === 0 && (x < 21 || x > 26)) diamondPath(this.add(this.floor, '#d8d8d8'), x, y, 0.06, 1);
        break;
      }
      case 'luxe':
        tile(base);
        if (x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1) diamondPath(this.add(this.floor, '#c9a23a'), x, y, 1, 1, 0, 0.35);
        break;
      case 'office':
        tile((x + y) % 2 ? base : shade(base, -0.06));
        break;
      case 'dock':
        tile(base);
        if (y === 3 || x === 42) for (let k = 0; k < 3; k++) diamondPath(this.add(this.floor, '#e8c22a'), x + k * 0.33, y + 0.4, 0.16, 0.2);
        break;
    }
  }

  private buildCeilingTiles() {
    const deck = texture('floor.deck');
    if (deck)
      this.deckTiles = [false, true].map((flip) => {
        const c = document.createElement('canvas');
        c.width = TW;
        c.height = TH;
        const dctx = c.getContext('2d')!;
        dctx.putImageData(
          bakeIso(TW, TH, -TW / 2, (tx, ty) => (tx === 0 && ty === 0 ? { tex: deck, mul: null, flip } : null)),
          0,
          0,
        );
        dctx.strokeStyle = 'rgba(70,40,20,0.45)';
        dctx.beginPath();
        dctx.moveTo(0, TH / 2);
        dctx.lineTo(TW / 2, TH - 0.5);
        dctx.lineTo(TW, TH / 2);
        dctx.stroke();
        onContextRestored(c, () => this.buildCeilingTiles());
        return c;
      });
    const open = (x: number, y: number) => inBounds(x, y) && [C_OPEN, C_DUCT, C_AC].includes(LAYOUT.ceilingKind[idx(x, y)]);
    const ceiling = floorLook('floor.ceiling', 0, 0);
    if (ceiling) {
      const c = (this.ceilingCanvas = document.createElement('canvas'));
      c.width = MAP_W;
      c.height = MAP_H;
      c.getContext('2d')!.putImageData(
        bakeIso(MAP_W, MAP_H, MAP_X, (tx, ty) => (open(tx, ty) ? { ...ceiling, flip: hash2(tx, ty, 4) > 0.5 } : null)),
        0,
        0,
      );
      onContextRestored(c, () => this.buildCeilingTiles());
      return;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = LAYOUT.ceilingKind[idx(x, y)];
        if (k === C_OPEN || k === C_DUCT || k === C_AC) {
          diamondPath(this.add(this.ceilingTiles, hash2(x, y, 4) > 0.85 ? '#4a4652' : (x + y) % 2 ? '#3f3c46' : '#43404a'), x, y, 1, 1, 0, 0.03);
          if (hash2(x, y, 9) > 0.9) diamondPath(this.add(this.ceilingTiles, '#5a4a3a'), x + 0.3, y + 0.3, 0.3, 0.25);
        }
      }
    }
  }

  draw(s: GameState, v: ViewState, t: number) {
    const ctx = this.ctx;
    const phase = phaseAt(s.time);
    const night = phase === 'night';
    this.cones.clear();
    this.buildFloors(s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = v.layer === 1 ? '#07060c' : night ? '#07080f' : '#14121e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const z = this.cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, this.cam.x * this.dpr, this.cam.y * this.dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.floorCanvas, MAP_X, 0);

    const items: Drawable[] = [];
    this.collectWalls(s, items, v.layer === 1);
    this.collectFixtures(s, items, t, night || v.layer === 1);
    if (v.layer === 0) {
      this.collectAgents(s, items, t, 0);
      for (const o of s.objects)
        if (BUILD[o.type].floor)
          items.push({
            depth: o.x + o.y + 1,
            order: 2,
            fn: () => {
              ctx.save();
              ctx.globalAlpha = o.delivered ? 1 : 0.45;
              drawBuildable(ctx, o.type, o.x, o.y, t, { powered: true, inUse: false });
              ctx.restore();
            },
          });
    }
    items.sort((a, b) => a.depth - b.depth || a.order - b.order);
    for (const it of items) it.fn();

    if (v.layer === 0) {
      this.drawCones(s, t);
      this.drawLighting(s, t, 0);
      if (v.overlay === 'noise' || v.overlay === 'smell') drawHeatMap(ctx, s, v.overlay);
      this.drawSigns(s, night);
      this.drawMallOverlays(s, t);
      this.drawAgentHud(s, v, 0);
    } else {
      this.drawCeiling(s, v, t);
    }
    this.drawCursor(s, v, t);
  }

  private collectWalls(s: GameState, items: Drawable[], dim: boolean) {
    const ctx = this.ctx;
    const open = phaseAt(s.time) === 'open';
    for (let y = 0; y <= H; y++) {
      for (let x = 0; x <= W; x++) {
        for (const dir of ['N', 'W'] as const) {
          if (dir === 'N' && (x >= W || y >= H + 1)) continue;
          if (dir === 'W' && (y >= H || x >= W + 1)) continue;
          const inb = inBounds(x, y);
          const e = inb ? (dir === 'N' ? LAYOUT.edgeN[idx(x, y)] : LAYOUT.edgeW[idx(x, y)]) : 1;
          if (!inb) {
            const ox = dir === 'N' ? x : x - 1;
            const oy = dir === 'N' ? y - 1 : y;
            if (!inBounds(ox, oy) || LAYOUT.roomAt[idx(ox, oy)] < 0) continue;
          }
          if (e === E_OPEN) continue;
          const here = inb ? LAYOUT.roomAt[idx(x, y)] : -1;
          const other = dir === 'N' ? (y > 0 && x < W ? LAYOUT.roomAt[idx(x, y - 1)] : -1) : x > 0 && y < H ? LAYOUT.roomAt[idx(x - 1, y)] : -1;
          if (here < 0 && other < 0) continue;
          const hereRoom = here >= 0 ? LAYOUT.rooms[here] : null;
          const front = here < 0 || hereRoom!.kind === 'outside';
          const outer = other < 0 || LAYOUT.rooms[other].kind === 'outside';
          const height = front ? FRONT_H : outer ? OUTER_H : WALL_H;
          const x0 = x;
          const y0 = y;
          const x1 = dir === 'N' ? x + 1 : x;
          const y1 = dir === 'N' ? y : y + 1;
          const depth = dir === 'N' ? x + y + 0.5 : x + y + 0.5;
          const gateRoom = [here, other].find((r) => r >= 0 && ['store', 'food', 'anchor'].includes(LAYOUT.rooms[r].kind)) ?? -1;
          items.push({
            depth,
            order: 0,
            fn: () => {
              const base = front ? '#b8ab98' : hereRoom ? wallColor(hereRoom) : '#8a8070';
              const c = dim ? shade(base, -0.4) : base;
              if (e === E_GATE) {
                const vacant = gateRoom >= 0 && s.rooms[gateRoom].vacant && !s.rooms[gateRoom].popup;
                const gr = gateRoom >= 0 ? LAYOUT.rooms[gateRoom] : null;
                const accent = gr ? (vacant ? '#666' : gr.accent) : '#888';
                faceQuad(ctx, x0, y0, x1, y1, 28, 34, shade(accent, dim ? -0.4 : 0));
                const postW = 0.06;
                if (dir === 'N') {
                  faceQuad(ctx, x0, y0, x0 + postW, y0, 0, 28, '#777');
                  faceQuad(ctx, x1 - postW, y1, x1, y1, 0, 28, '#777');
                } else {
                  faceQuad(ctx, x0, y0, x0, y0 + postW, 0, 28, '#777');
                  faceQuad(ctx, x1, y1 - postW, x1, y1, 0, 28, '#777');
                }
                if (!open || vacant) {
                  ctx.strokeStyle = dim ? 'rgba(120,120,130,0.5)' : 'rgba(150,150,160,0.85)';
                  ctx.lineWidth = 0.8;
                  ctx.beginPath();
                  for (let k = 1; k < 10; k++) {
                    const u = k / 10;
                    const gx = x0 + (x1 - x0) * u;
                    const gy = y0 + (y1 - y0) * u;
                    ctx.moveTo(isoX(gx, gy), isoY(gx, gy, 0));
                    ctx.lineTo(isoX(gx, gy), isoY(gx, gy, 28));
                  }
                  for (let k = 1; k < 5; k++) {
                    ctx.moveTo(isoX(x0, y0), isoY(x0, y0, k * 6));
                    ctx.lineTo(isoX(x1, y1), isoY(x1, y1, k * 6));
                  }
                  ctx.stroke();
                }
                return;
              }
              if (e === E_GLASS || e === E_PUBLIC) {
                faceQuad(ctx, x0, y0, x1, y1, 0, 4, shade(c, -0.1));
                ctx.save();
                ctx.globalAlpha = 0.35;
                faceQuad(ctx, x0, y0, x1, y1, 4, e === E_PUBLIC ? 30 : 26, '#bfe6ff');
                ctx.restore();
                faceQuad(ctx, x0, y0, x1, y1, e === E_PUBLIC ? 30 : 26, e === E_PUBLIC ? 34 : 28, '#888');
                return;
              }
              faceQuad(ctx, x0, y0, x1, y1, 0, height, c);
              faceQuad(ctx, x0, y0, x1, y1, 0, 2, shade(c, -0.28));
              faceQuad(ctx, x0, y0, x1, y1, height - 1.4, height, shade(c, 0.18));
              if (e === E_STAFF) {
                const m = 0.2;
                const ax = x0 + (x1 - x0) * m;
                const ay = y0 + (y1 - y0) * m;
                const bx = x1 - (x1 - x0) * m;
                const by = y1 - (y1 - y0) * m;
                faceQuad(ctx, ax, ay, bx, by, 0, Math.min(height - 1, 16), dim ? '#3a3a40' : '#6a6e78');
                ctx.fillStyle = '#c8102e';
                ctx.fillRect(isoX((ax + bx) / 2, (ay + by) / 2) - 2, isoY((ax + bx) / 2, (ay + by) / 2, 12), 4, 1.6);
              }
            },
          });
        }
      }
    }
  }

  private collectFixtures(s: GameState, items: Drawable[], t: number, dark: boolean) {
    const ctx = this.ctx;
    for (const f of LAYOUT.fixtures) {
      const rs = f.room >= 0 ? s.rooms[f.room] : null;
      const vacant = !!rs && rs.vacant && !rs.popup;
      items.push({ depth: f.x + f.y + (f.w + f.d) / 2, order: 1, fn: () => drawFixture(ctx, f, t, dark, vacant) });
    }
    if (s.business.kiosk) {
      items.push({
        depth: 11 + 13 + 1,
        order: 1,
        fn: () => drawFixture(ctx, { id: -1, kind: 'kiosk', x: 11, y: 13, w: 1, d: 1, room: -1, blocks: false, color: '#2aa6a0', color2: '#fff', seed: 3, label: 'PHONE CHARMZ' }, t, dark, false),
      });
    }
    s.cameras.forEach((c, i) => {
      if (!c.active) return;
      items.push({
        depth: c.x + c.y + 0.6,
        order: 2,
        fn: () => {
          const px = isoX(c.x, c.y);
          const py = isoY(c.x, c.y, 30);
          ctx.fillStyle = '#ddd';
          ctx.fillRect(px - 4, py - 3, 8, 5);
          ctx.fillStyle = '#333';
          const a = cameraAngle(c, s.time);
          const lx = isoX(c.x + Math.cos(a) * 0.3, c.y + Math.sin(a) * 0.3) - isoX(c.x, c.y);
          ctx.fillRect(px + lx * 0.5 - 2, py - 2, 4, 3);
          if (Math.floor(t * 0.12 + i) % 2) {
            ctx.fillStyle = '#ff2b2b';
            ctx.fillRect(px + 2, py - 3, 1.6, 1.6);
          }
        },
      });
    });
  }

  private collectAgents(s: GameState, items: Drawable[], t: number, layer: 0 | 1) {
    const ctx = this.ctx;
    const night = phaseAt(s.time) !== 'open' && phaseAt(s.time) !== 'morning';
    for (const n of s.npcs) {
      if (n.layer !== layer) continue;
      items.push({ depth: n.x + n.y, order: 3, fn: () => this.drawNpc(ctx, n, t, night) });
    }
    for (const c of s.crew) {
      if (c.layer !== layer || c.state === 'away') continue;
      items.push({ depth: c.x + c.y, order: 4, fn: () => this.drawCrew(ctx, s, c, t) });
    }
    const pet = s.pet;
    if (pet && s.flags.ferret && pet.layer === layer) items.push({ depth: pet.x + pet.y, order: 3, fn: () => drawPet(ctx, pet, isoX(pet.x, pet.y), isoY(pet.x, pet.y), t) });
  }

  private facingScreen(a: { facing: number }) {
    const dx = Math.cos(a.facing);
    const dy = Math.sin(a.facing);
    return dx - dy;
  }

  private drawNpc(ctx: Ctx, n: Npc, t: number, night: boolean) {
    const px = isoX(n.x, n.y);
    const py = isoY(n.x, n.y);
    drawPerson(ctx, px, py, n.look, {
      walking: n.moving,
      t: t + n.id * 7,
      facingScreen: this.facingScreen(n),
      facing: n.facing,
      sprite: npcSprite(n),
      segway: n.kind === 'dayguard',
      flash: n.kind === 'guard' && night,
      dog: n.dog,
      mop: n.kind === 'janitor',
      ladder: n.kind === 'inspector' && n.state === 'climb',
      sleeping: n.state === 'asleep',
    });
  }

  private drawCrew(ctx: Ctx, s: GameState, c: Crew, t: number) {
    const px = isoX(c.x, c.y);
    const py = isoY(c.x, c.y);
    ctx.strokeStyle = c.state === 'fleeing' ? '#ff2d55' : '#2ad4c8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(px, py, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    const sleeping = c.state === 'sleeping' && c.layer === 1;
    if (sleeping) {
      const bed = bedUnder(s, c);
      if (bed ? sleeperSprite(bed.type, sleepersIn(s, bed)) : drawFloorSleeper(ctx, c.x, c.y)) return;
    }
    drawPerson(ctx, px, py, c.look, {
      walking: c.moving,
      t: t + c.id * 5,
      facingScreen: this.facingScreen(c),
      facing: c.facing,
      sprite: crewSprite(c),
      crouch: c.hiding || (c.layer === 1 && !c.moving && !sleeping),
      sleeping,
      alpha: c.hiding ? 0.75 : 1,
      carry: c.carrying.cash + c.carrying.food + c.carrying.parts + c.carrying.goods > 0 && c.layer === 0,
      work: c.state === 'working' ? WORK_MOTION[c.activeJob] : undefined,
    });
  }

  private drawAgentHud(s: GameState, v: ViewState, layer: 0 | 1) {
    const ctx = this.ctx;
    for (const n of s.npcs) {
      if (n.layer !== layer || !n.bubble || n.bubble.until < s.time) continue;
      bubble(ctx, isoX(n.x, n.y), isoY(n.x, n.y, 36), n.bubble.text, n.bubble.tone);
    }
    for (const c of s.crew) {
      if (c.layer !== layer || c.state === 'away') continue;
      const px = isoX(c.x, c.y);
      const py = isoY(c.x, c.y, c.state === 'sleeping' ? 14 : 36);
      if (c.detect > 0.02 && layer === 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(px, py - 6, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = c.detect > 0.75 ? '#ff2d55' : c.detect > 0.22 ? '#ffb000' : '#ffe94a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py - 6, 7, -Math.PI / 2, -Math.PI / 2 + Math.min(1, c.detect) * Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = `600 10px ${BODY_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.detect >= 1 ? '!' : '?', px, py - 6);
      } else if (c.bubble && c.bubble.until > s.time) {
        bubble(ctx, px, py, c.bubble.text, c.bubble.tone);
      }
      if (v.selectedCrew === c.id || this.cam.zoom > 1.3) {
        ctx.font = `600 10px ${BODY_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const label = c.name;
        const w = ctx.measureText(label).width + 6;
        ctx.fillStyle = v.selectedCrew === c.id ? 'rgba(42,212,200,0.95)' : 'rgba(10,10,20,0.7)';
        roundRect(ctx, px - w / 2, isoY(c.x, c.y) + 6, w, 12, 4);
        ctx.fill();
        ctx.fillStyle = v.selectedCrew === c.id ? '#06141a' : '#fff';
        ctx.fillText(label, px, isoY(c.x, c.y) + 15);
      }
    }
  }

  private conePath(ctx: Ctx | Path2D, x: number, y: number, facing: number, fov: number, range: number) {
    const key = `${x},${y},${facing},${fov},${range}`;
    let points = this.cones.get(key);
    if (!points) {
      points = sightPolygon(x, y, facing, fov, range);
      this.cones.set(key, points);
    }
    ctx.moveTo(isoX(x, y), isoY(x, y));
    for (const p of points) ctx.lineTo(isoX(p.x, p.y), isoY(p.x, p.y));
    ctx.closePath();
  }

  private drawCones(s: GameState, _t: number) {
    const ctx = this.ctx;
    const phase = phaseAt(s.time);
    const night = phase === 'night' || phase === 'closing';
    for (const n of s.npcs) {
      if (n.layer !== 0) continue;
      if (n.kind !== 'guard' && n.kind !== 'dayguard' && n.kind !== 'janitor') continue;
      if (n.state === 'asleep' || n.state === 'offduty') continue;
      if (n.kind === 'janitor' && phase !== 'closing') continue;
      const cone = guardCone(n, s);
      ctx.beginPath();
      this.conePath(ctx, n.x, n.y, n.facing, cone.fov, cone.range);
      const chase = n.state === 'chase';
      ctx.fillStyle = chase ? 'rgba(255,45,85,0.22)' : night ? 'rgba(255,240,170,0.16)' : 'rgba(80,140,255,0.10)';
      ctx.fill();
      ctx.strokeStyle = chase ? 'rgba(255,45,85,0.6)' : night ? 'rgba(255,240,170,0.35)' : 'rgba(80,140,255,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (night && (s.flags.blackoutUntil ?? 0) <= s.time) {
      for (const c of s.cameras) {
        if (!c.active) continue;
        ctx.beginPath();
        this.conePath(ctx, c.x, c.y, cameraAngle(c, s.time), CAMERA_FOV, CAMERA_RANGE);
        ctx.fillStyle = 'rgba(255,40,40,0.10)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,60,60,0.3)';
        ctx.stroke();
      }
    }
  }

  private lightBegin(darkness: string) {
    const l = this.lctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.light.width, this.light.height);
    l.fillStyle = darkness;
    l.fillRect(0, 0, this.light.width, this.light.height);
    const z = this.cam.zoom * 0.5;
    l.setTransform(z, 0, 0, z, this.cam.x * 0.5, this.cam.y * 0.5);
    l.globalCompositeOperation = 'destination-out';
  }

  private lightAt(x: number, y: number, r: number, a = 1) {
    const l = this.lctx;
    const px = isoX(x, y);
    const py = isoY(x, y);
    const rad = r * TW * 0.5;
    const g = l.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(0.5, `rgba(0,0,0,${a * 0.6})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = g;
    l.beginPath();
    l.ellipse(px, py, rad, rad * 0.55, 0, 0, Math.PI * 2);
    l.fill();
  }

  private lightEnd() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  private drawLighting(s: GameState, t: number, _layer: 0) {
    const phase = phaseAt(s.time);
    const blackout = (s.flags.blackoutUntil ?? 0) > s.time;
    const m = minuteOfDay(s.time);
    const outsideDark = m < 7 * 60 || m > 18.5 * 60;
    let dark = phase === 'night' ? 0.8 : phase === 'closing' ? 0.38 : phase === 'morning' ? 0.2 : 0;
    if (blackout && phase === 'night') dark = 0.9;
    if (dark <= 0 && !outsideDark) {
      this.drawSkylight(s, t);
      return;
    }
    this.lightBegin(`rgba(6,8,22,${Math.max(dark, outsideDark ? 0.15 : 0)})`);
    if (phase !== 'night') {
      LAYOUT.rooms.forEach((r, ri) => {
        if (r.kind === 'outside' || r.kind === 'dock') return;
        if (s.rooms[ri].vacant && !s.rooms[ri].popup) return;
        this.lightAt((r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2, Math.max(r.x1 - r.x0, r.y1 - r.y0) * 0.9 + 3, 0.85);
      });
    } else {
      if (!blackout) {
        for (const [x, y] of [
          [22, 22],
          [25, 22],
          [18.5, 10.5],
          [7, 12],
          [40, 12],
          [24, 11],
        ])
          this.lightAt(x, y, 2.2, 0.5);
        for (const f of LAYOUT.fixtures) {
          if (f.kind === 'cabinet' || f.kind === 'vending' || f.kind === 'tokens' || f.kind === 'monitors') this.lightAt(f.x + 0.5, f.y + 1, 1.8, 0.55);
          if (f.kind === 'fountain') this.lightAt(f.x + 1, f.y + 1, 3, 0.6);
        }
      }
      for (const f of LAYOUT.fixtures) if (f.kind === 'lamppost') this.lightAt(f.x + 0.5, f.y + 0.5, 4, 0.7);
      const l = this.lctx;
      for (const n of s.npcs) {
        if (n.kind !== 'guard' || n.state === 'asleep' || n.state === 'offduty') continue;
        const cone = guardCone(n, s);
        const px = isoX(n.x, n.y);
        const py = isoY(n.x, n.y);
        const g = l.createRadialGradient(px, py, 0, px, py, cone.range * TW * 0.55);
        g.addColorStop(0, 'rgba(0,0,0,0.95)');
        g.addColorStop(1, 'rgba(0,0,0,0.2)');
        l.fillStyle = g;
        l.beginPath();
        this.conePath(l, n.x, n.y, n.facing, cone.fov, cone.range);
        l.fill();
        this.lightAt(n.x, n.y, 1.4, 0.6);
      }
      for (const c of s.crew) if (c.layer === 0 && c.state !== 'away') this.lightAt(c.x, c.y, 1.1, 0.55);
    }
    this.lightEnd();
  }

  private drawSkylight(_s: GameState, t: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = 20.5 + i * 2;
      const y = 11.5 + i * 1.5;
      const px = isoX(x, y);
      const py = isoY(x, y);
      const g = ctx.createLinearGradient(px, py - 220, px, py);
      const a = 0.05 + Math.sin(t * 0.01 + i) * 0.015;
      g.addColorStop(0, `rgba(255,250,220,0)`);
      g.addColorStop(1, `rgba(255,250,220,${a})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(px - 30, py - 220);
      ctx.lineTo(px + 10, py - 220);
      ctx.lineTo(px + 40, py);
      ctx.lineTo(px - 10, py + 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSigns(s: GameState, night: boolean) {
    const ctx = this.ctx;
    for (const sg of this.signs) {
      const r = LAYOUT.rooms[sg.room];
      const rs = s.rooms[sg.room];
      const vacant = rs.vacant && !rs.popup;
      const name = rs.popup ? popupName(s) : vacant ? 'SPACE AVAILABLE' : r.name;
      const color = rs.popup ? '#ff9e1b' : vacant ? '#8a8a8a' : r.accent;
      const size = r.kind === 'anchor' ? 13 : r.kind === 'food' ? 6 : name.length > 12 ? 7 : 9;
      const z = r.kind === 'food' ? 31 : 44;
      const len = r.kind === 'food' ? 1.6 : Math.min(3.6, name.length * 0.24 + 0.6);
      const ax = sg.dir === 'x' ? sg.x - len / 2 : sg.x;
      const ay = sg.dir === 'x' ? sg.y : sg.y - len / 2;
      const bx = sg.dir === 'x' ? sg.x + len / 2 : sg.x;
      const by = sg.dir === 'x' ? sg.y : sg.y + len / 2;
      faceQuad(ctx, ax, ay, bx, by, z - size * 0.9, z + size * 0.9, vacant ? '#2a2a2a' : '#15131c');
      isoText(ctx, name.toUpperCase(), sg.x, sg.y, z, sg.dir, size, night && !vacant ? '#fff' : vacant ? '#aaa' : shade(color, 0.35), {
        glow: vacant ? undefined : color,
        maxWidth: len * 40,
      });
    }
  }

  private drawMallOverlays(s: GameState, t: number) {
    const ctx = this.ctx;
    for (const ins of s.inspections) {
      const px = isoX(ins.x + 0.5, ins.y + 0.5);
      const py = isoY(ins.x + 0.5, ins.y + 0.5, 60 + Math.sin(t * 0.1) * 3);
      ctx.fillStyle = '#ff2d55';
      ctx.font = `24px ${DISPLAY_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('⚠', px, py);
    }
  }

  private drawCeiling(s: GameState, v: ViewState, t: number) {
    const ctx = this.ctx;
    const phase = phaseAt(s.time);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = v.xray ? 'rgba(6,5,12,0.25)' : 'rgba(6,5,12,0.55)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = v.xray ? 0.25 : 0.86;
    if (this.ceilingCanvas) ctx.drawImage(this.ceilingCanvas, MAP_X, 0);
    for (const [color, path] of this.ceilingTiles) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(160,220,255,0.06)';
    ctx.strokeStyle = 'rgba(180,220,255,0.35)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (LAYOUT.ceilingKind[idx(x, y)] !== C_SKYLIGHT) continue;
        ctx.beginPath();
        diamondPath(ctx, x, y);
        ctx.fill();
        ctx.stroke();
      }

    this.drawRoomOutlines(s);

    for (let i = 0; i < N; i++) {
      if (!s.deck[i]) continue;
      const x = i % W;
      const y = Math.floor(i / W);
      if (this.deckTiles.length) {
        ctx.drawImage(this.deckTiles[hash2(x, y, 2) > 0.5 ? 1 : 0], isoX(x, y) - TW / 2, isoY(x, y, 1));
        continue;
      }
      ctx.fillStyle = hash2(x, y, 2) > 0.5 ? '#d2a66c' : '#dcb078';
      ctx.beginPath();
      diamondPath(ctx, x, y, 1, 1, 1, 0.01);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,180,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,60,30,0.45)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let k = 1; k < 3; k++) {
        ctx.moveTo(isoX(x + k / 3, y), isoY(x + k / 3, y, 1));
        ctx.lineTo(isoX(x + k / 3, y + 1), isoY(x + k / 3, y + 1, 1));
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(60,40,20,0.6)';
      for (const [fx, fy] of [
        [0.15, 0.15],
        [0.85, 0.85],
      ])
        ctx.fillRect(isoX(x + fx, y + fy) - 0.6, isoY(x + fx, y + fy, 1) - 0.4, 1.2, 0.8);
    }

    const hx = LAYOUT.hatch.x;
    const hy = LAYOUT.hatch.y;
    ctx.fillStyle = '#80532f';
    ctx.beginPath();
    diamondPath(ctx, hx, hy, 1, 1, 1, 0.06);
    ctx.fill();
    ctx.fillStyle = '#1b1622';
    ctx.beginPath();
    diamondPath(ctx, hx, hy, 1, 1, 1, 0.16);
    ctx.fill();
    ctx.strokeStyle = '#a5afb8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const rx of [0.36, 0.64]) {
      ctx.moveTo(isoX(hx + rx, hy + 0.2), isoY(hx + rx, hy + 0.2, 1));
      ctx.lineTo(isoX(hx + rx, hy + 0.8), isoY(hx + rx, hy + 0.8, 1));
    }
    for (const ry of [0.3, 0.5, 0.7]) {
      ctx.moveTo(isoX(hx + 0.36, hy + ry), isoY(hx + 0.36, hy + ry, 1));
      ctx.lineTo(isoX(hx + 0.64, hy + ry), isoY(hx + 0.64, hy + ry, 1));
    }
    ctx.stroke();

    const items: Drawable[] = [];
    for (let i = 0; i < N; i++) {
      const k = LAYOUT.ceilingKind[i];
      const x = i % W;
      const y = Math.floor(i / W);
      if (k === C_DUCT) {
        const horiz = (x > 0 && LAYOUT.ceilingKind[idx(x - 1, y)] === C_DUCT) || (x < W - 1 && LAYOUT.ceilingKind[idx(x + 1, y)] === C_DUCT);
        items.push({
          depth: x + y + 1,
          order: 1,
          fn: () => {
            const colors = { top: '#a5afb8', left: '#7e8a96', right: '#5a6574' };
            if (horiz) box(ctx, x - 0.01, y + 0.24, 1.02, 0.52, 10, '#7e8a96', 3, colors);
            else box(ctx, x + 0.24, y - 0.01, 0.52, 1.02, 10, '#7e8a96', 3, colors);
            ctx.strokeStyle = 'rgba(38,44,56,0.55)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            for (const u of [0.25, 0.75]) {
              const [ax, ay, bx, by] = horiz ? [x + u, y + 0.24, x + u, y + 0.76] : [x + 0.24, y + u, x + 0.76, y + u];
              ctx.moveTo(isoX(ax, ay), isoY(ax, ay, 13));
              ctx.lineTo(isoX(bx, by), isoY(bx, by, 13));
              ctx.lineTo(isoX(bx, by), isoY(bx, by, 3));
            }
            ctx.stroke();
          },
        });
      } else if (k === C_AC && (x === 0 || LAYOUT.ceilingKind[idx(x - 1, y)] !== C_AC) && (y === 0 || LAYOUT.ceilingKind[idx(x, y - 1)] !== C_AC)) {
        items.push({
          depth: x + y + 2,
          order: 1,
          fn: () => {
            if (drawPropSprite(ctx, 'build.ac', x, y, { w: 2, d: 2 })) return;
            box(ctx, x + 0.05, y + 0.05, 1.9, 1.9, 30, '#8a9098', 0, { top: '#a8aeb6' });
            ctx.save();
            ctx.translate(isoX(x + 1, y + 1), isoY(x + 1, y + 1, 30));
            ctx.scale(1, 0.5);
            ctx.rotate(t * 0.2);
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.arc(0, 0, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#888';
            for (let b = 0; b < 4; b++) {
              ctx.rotate(Math.PI / 2);
              ctx.fillRect(-3, 0, 6, 16);
            }
            ctx.restore();
          },
        });
      }
    }
    for (const o of s.objects) {
      if (BUILD[o.type].floor) continue;
      const inUse = o.usedUntil > s.time;
      items.push({ depth: o.x + o.y + 1, order: 2, fn: () => drawBuildable(ctx, o.type, o.x, o.y, t, { powered: o.powered, inUse, flip: o.flipped, alert: o.jammed, sleepers: sleepersIn(s, o) }) });
    }
    this.collectAgents(s, items, t, 1);
    items.sort((a, b) => a.depth - b.depth || a.order - b.order);
    for (const it of items) it.fn();

    this.drawCeilingLighting(s, t, phase);
    if (v.overlay === 'noise' || v.overlay === 'smell') drawHeatMap(ctx, s, v.overlay, 1);
    this.drawGhosts(s);
    this.drawRoomLabels(s, v);
    this.drawInspectionZones(s, t);
    this.drawAgentHud(s, v, 1);

    if (v.overlay === 'power') this.drawPowerOverlay(s);
  }

  private drawRoomOutlines(s: GameState) {
    const ctx = this.ctx;
    ctx.lineWidth = 1.4;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ri = LAYOUT.roomAt[idx(x, y)];
        if (ri < 0 || !LAYOUT.rooms[ri].ceiling) continue;
        const col = complaintColor(s, ri, 0.45);
        ctx.strokeStyle = col;
        ctx.beginPath();
        if (y === 0 || LAYOUT.roomAt[idx(x, y - 1)] !== ri) {
          ctx.moveTo(isoX(x, y), isoY(x, y, 1));
          ctx.lineTo(isoX(x + 1, y), isoY(x + 1, y, 1));
        }
        if (x === 0 || LAYOUT.roomAt[idx(x - 1, y)] !== ri) {
          ctx.moveTo(isoX(x, y), isoY(x, y, 1));
          ctx.lineTo(isoX(x, y + 1), isoY(x, y + 1, 1));
        }
        if (y === H - 1 || LAYOUT.roomAt[idx(x, y + 1)] !== ri) {
          ctx.moveTo(isoX(x, y + 1), isoY(x, y + 1, 1));
          ctx.lineTo(isoX(x + 1, y + 1), isoY(x + 1, y + 1, 1));
        }
        if (x === W - 1 || LAYOUT.roomAt[idx(x + 1, y)] !== ri) {
          ctx.moveTo(isoX(x + 1, y), isoY(x + 1, y, 1));
          ctx.lineTo(isoX(x + 1, y + 1), isoY(x + 1, y + 1, 1));
        }
        ctx.stroke();
      }
    }
  }

  private drawPowerOverlay(s: GameState) {
    const ctx = this.ctx;
    const pc = s.objects.find((o) => o.type === 'pc');
    for (const o of s.objects) {
      const def = BUILD[o.type];
      if (def.supply) {
        ctx.strokeStyle = o.powered ? 'rgba(255,214,60,0.9)' : 'rgba(255,60,60,0.9)';
        ctx.fillStyle = o.powered ? 'rgba(255,214,60,0.08)' : 'rgba(255,60,60,0.08)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.ellipse(isoX(o.x + 0.5, o.y + 0.5), isoY(o.x + 0.5, o.y + 0.5), def.radius! * TW * 0.707, def.radius! * TH * 0.707, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        const label = `${o.supplyLoad}/${def.supply}W`;
        ctx.font = `600 10px ${BODY_FONT}`;
        ctx.fillStyle = '#ffe94a';
        ctx.textAlign = 'center';
        ctx.fillText(label, isoX(o.x + 0.5, o.y + 0.5), isoY(o.x + 0.5, o.y + 0.5, 22));
      } else if (def.power) {
        ctx.fillStyle = o.powered ? '#ffe94a' : '#ff2d55';
        ctx.font = `600 12px ${BODY_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(o.powered ? '⚡' : '✕', isoX(o.x + 0.5, o.y + 0.5), isoY(o.x + 0.5, o.y + 0.5, 30));
      }
    }
    if (pc) {
      ctx.fillStyle = '#5aff8a';
      ctx.font = `600 10px ${BODY_FONT}`;
      ctx.fillText(`Wi-Fi ${Math.round(boundariesSignal(pc.x, pc.y) * 100)}%`, isoX(pc.x + 0.5, pc.y + 0.5), isoY(pc.x + 0.5, pc.y + 0.5, 40));
    }
  }

  private drawCeilingLighting(s: GameState, _t: number, phase: string) {
    const ambient = phase === 'open' ? 0.28 : phase === 'night' ? 0.5 : 0.38;
    this.lightBegin(`rgba(4,3,10,${ambient})`);
    for (const o of s.objects) {
      const def = BUILD[o.type];
      if (def.light && o.powered) this.lightAt(o.x + 0.5, o.y + 0.5, def.light, 0.95);
    }
    this.lightAt(LAYOUT.hatch.x + 0.5, LAYOUT.hatch.y + 0.5, 2, 0.6);
    for (const c of s.crew) if (c.layer === 1 && c.state !== 'away') this.lightAt(c.x, c.y, 1.3, 0.5);
    for (let y = 11; y <= 17; y++) for (let x = 20; x <= 27; x += 2) this.lightAt(x + 1, y + 0.5, 1.6, phase === 'open' ? 0.7 : 0.3);
    this.lightEnd();

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const o of s.objects) {
      const def = BUILD[o.type];
      if (!def.light || !o.powered) continue;
      const px = isoX(o.x + 0.5, o.y + 0.5);
      const py = isoY(o.x + 0.5, o.y + 0.5);
      const r = def.light * TW * 0.45;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(${def.lightColor},0.22)`);
      g.addColorStop(1, `rgba(${def.lightColor},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGhosts(s: GameState) {
    const ctx = this.ctx;
    for (const n of s.npcs) {
      if (n.kind === 'shopper') continue;
      const px = isoX(n.x, n.y);
      const py = isoY(n.x, n.y);
      if (n.kind === 'guard' || n.kind === 'dayguard' || n.kind === 'janitor') {
        if (n.state === 'asleep' || n.state === 'offduty') continue;
        const cone = guardCone(n, s);
        ctx.beginPath();
        this.conePath(ctx, n.x, n.y, n.facing, cone.fov, cone.range);
        ctx.fillStyle = n.state === 'chase' ? 'rgba(255,45,85,0.16)' : 'rgba(255,230,120,0.08)';
        ctx.fill();
      }
      ctx.fillStyle = n.kind === 'inspector' ? '#ff7a1a' : n.kind === 'janitor' ? '#9ab09a' : '#5a8aff';
      ctx.beginPath();
      ctx.ellipse(px, py, 5, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `600 9px ${BODY_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(n.name.split(' ')[0], px, py - 6);
    }
    for (const c of s.crew) {
      if (c.layer !== 0 || c.state === 'away') continue;
      const px = isoX(c.x, c.y);
      const py = isoY(c.x, c.y);
      ctx.fillStyle = '#2ad4c8';
      ctx.beginPath();
      ctx.ellipse(px, py, 5, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    let shoppers = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (const n of s.npcs) {
      if (n.kind !== 'shopper' || shoppers++ > 60) continue;
      ctx.fillRect(isoX(n.x, n.y) - 1.5, isoY(n.x, n.y) - 1, 3, 2);
    }
  }

  private drawRoomLabels(s: GameState, v: ViewState) {
    const ctx = this.ctx;
    LAYOUT.rooms.forEach((r, ri) => {
      if (!r.ceiling || r.kind === 'court') return;
      const rs = s.rooms[ri];
      const cxw = (r.x0 + r.x1 + 1) / 2;
      const cyw = r.y1 - r.y0 >= 3 ? r.y0 + 1.2 : (r.y0 + r.y1 + 1) / 2;
      const px = isoX(cxw, cyw);
      const py = isoY(cxw, cyw, 2);
      const small = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) < 12;
      if (small && this.cam.zoom < 0.9 && !rs.complaint) return;
      const hovered = !!v.hover && LAYOUT.roomAt[idx(Math.max(0, Math.min(W - 1, v.hover.x)), Math.max(0, Math.min(H - 1, v.hover.y)))] === ri;
      const name = rs.popup ? `${popupName(s)} (yours)` : rs.vacant ? `${r.name} (vacant)` : r.name;
      ctx.font = `600 ${small ? 9 : 10}px ${BODY_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = Math.max(ctx.measureText(name).width + 10, 50);
      const h = rs.vacant || rs.popup ? 16 : 22;
      ctx.fillStyle = hovered ? 'rgba(15,74,82,0.95)' : 'rgba(27,22,34,0.62)';
      ctx.fillRect(px - w / 2, py - 9, w, h);
      if (hovered) {
        ctx.fillStyle = '#5ccfc2';
        ctx.fillRect(px - w / 2, py - 9, w, 1);
      }
      ctx.fillStyle = rs.vacant ? '#9a8f8f' : '#fbf6ec';
      ctx.fillText(name, px, py - 1);
      if (!rs.vacant && !rs.popup) {
        const c = Math.min(100, rs.complaint);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(px - w / 2 + 5, py + 7, w - 10, 3);
        ctx.fillStyle = complaintColor(s, ri, 1);
        ctx.fillRect(px - w / 2 + 5, py + 7, ((w - 10) * c) / 100, 3);
        if (v.overlay === 'noise' || v.overlay === 'smell') {
          const mask = v.overlay === 'noise' ? `NOISE COVER ${Math.round(r.noiseMask * 100)}%` : `SMELL COVER ${Math.round(r.smellMask * 100)}%`;
          ctx.font = `600 9px ${BODY_FONT}`;
          ctx.fillStyle = '#9fe0ff';
          ctx.fillText(mask, px, py + 19);
        }
      }
    });
  }

  private drawInspectionZones(s: GameState, t: number) {
    const ctx = this.ctx;
    for (const ins of s.inspections) {
      const r = ins.radius;
      const active = ins.state !== 'scheduled';
      ctx.save();
      ctx.strokeStyle = active ? '#ff2d55' : 'rgba(255,60,90,0.9)';
      ctx.fillStyle = active ? `rgba(255,45,85,${0.18 + Math.sin(t * 0.3) * 0.08})` : 'rgba(255,45,85,0.12)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.lineDashOffset = -t * 0.5;
      ctx.beginPath();
      diamondPath(ctx, ins.x - r, ins.y - r, r * 2 + 1, r * 2 + 1, 3);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      const px = isoX(ins.x + 0.5, ins.y + 0.5);
      const py = isoY(ins.x + 0.5, ins.y + 0.5, 40);
      const label = active
        ? ins.state === 'climbing'
          ? 'INSPECTING NOW'
          : 'INSPECTOR EN ROUTE'
        : `${ins.kind === 'power' ? 'ELECTRICIAN' : ins.kind === 'fire' ? 'FIRE MARSHAL' : ins.kind === 'pest' ? 'PEST CONTROL' : 'INSPECTION'} ${dayOf(ins.at) === dayOf(s.time) ? 'TODAY' : 'TOMORROW'} ${Math.floor((ins.at % 1440) / 60)}:${String(Math.floor(ins.at % 60)).padStart(2, '0')}`;
      ctx.font = `600 11px ${BODY_FONT}`;
      ctx.textAlign = 'center';
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = '#ff2d55';
      roundRect(ctx, px - w / 2, py - 10, w, 16, 5);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, px, py - 2);
      if (!active) {
        ctx.font = `9px ${BODY_FONT}`;
        ctx.fillStyle = '#ffb0c0';
        ctx.fillText(forecastLabel(forecastInspection(s, ins)), px, py + 12);
      }
    }
  }

  private drawCursor(s: GameState, v: ViewState, t: number) {
    const ctx = this.ctx;
    if (!v.hover) return;
    const { x, y } = v.hover;
    if (!inBounds(x, y)) return;
    if (v.build && v.layer === (BUILD[v.build].floor ? 0 : 1)) {
      const tiles: [number, number][] = [];
      if (v.dragStart && (v.build === 'deck' || v.build === 'foam')) {
        const x0 = Math.min(v.dragStart.x, x);
        const x1 = Math.max(v.dragStart.x, x);
        const y0 = Math.min(v.dragStart.y, y);
        const y1 = Math.max(v.dragStart.y, y);
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) tiles.push([xx, yy]);
      } else tiles.push([x, y]);
      let total = 0;
      for (const [tx, ty] of tiles) {
        const err = v.build === 'deck' && v.dragStart ? dragDeckError(s, tx, ty) : canPlace(s, v.build, tx, ty);
        if (!err) total += BUILD[v.build].cost;
        ctx.fillStyle = err ? 'rgba(255,45,85,0.35)' : 'rgba(42,212,200,0.35)';
        ctx.beginPath();
        diamondPath(ctx, tx, ty, 1, 1, 2);
        ctx.fill();
      }
      if (v.build !== 'deck') {
        ctx.save();
        ctx.globalAlpha = 0.7;
        drawBuildable(ctx, v.build, x, y, t, { powered: true, inUse: false, alpha: 0.7, flip: v.flip && canRotate(v.build) });
        ctx.restore();
        const def = BUILD[v.build];
        const rad = def.radius ?? def.insulationRadius ?? (def.periscope ? 6 : def.fanRadius);
        if (rad) {
          ctx.strokeStyle = 'rgba(255,233,74,0.8)';
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (def.insulationRadius || def.fanRadius) diamondPath(ctx, x - rad, y - rad, rad * 2 + 1, rad * 2 + 1, 2);
          else ctx.ellipse(isoX(x + 0.5, y + 0.5), isoY(x + 0.5, y + 0.5), rad * TW * 0.707, rad * TH * 0.707, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (v.build === 'pc') {
          ctx.fillStyle = '#5aff8a';
          ctx.font = `600 11px ${BODY_FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(`Wi-Fi ${Math.round(boundariesSignal(x, y) * 100)}%`, isoX(x + 0.5, y + 0.5), isoY(x + 0.5, y + 0.5, 40));
        }
      }
      if (tiles.length > 1) {
        const p = tiles[tiles.length - 1];
        ctx.fillStyle = '#fff';
        ctx.font = `600 12px ${BODY_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`$${total}`, isoX(p[0] + 0.5, p[1] + 0.5), isoY(p[0] + 0.5, p[1] + 0.5, 20));
      }
      return;
    }
    ctx.strokeStyle = v.demolish ? '#ff2d55' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    diamondPath(ctx, x, y, 1, 1, 2);
    ctx.stroke();
  }
}

export function dragDeckError(s: GameState, x: number, y: number): string | null {
  const err = canPlace(s, 'deck', x, y);
  if (err === 'Must connect to your territory') return null;
  return err;
}

const bedUnder = (s: GameState, c: Crew) => s.objects.find((o) => o.id === c.bedId && o.x === Math.floor(c.x) && o.y === Math.floor(c.y));
const sleepersIn = (s: GameState, bed: Placed) => s.crew.filter((c) => c.state === 'sleeping' && c.layer === 1 && bedUnder(s, c) === bed).length;

export const crewSprite = (c: Pick<Crew, 'archetype' | 'sprite' | 'costume'>) => (c.costume && COSTUMES[c.costume.id].sprite) || c.sprite || `char.crew.${c.archetype}`;

function npcSprite(n: Npc): string {
  if (n.kind !== 'shopper') return `char.npc.${n.kind}`;
  const pool = characterIds('char.shopper.');
  return pool.length ? pool[n.id % pool.length] : '';
}

function wallColor(r: RoomDef): string {
  switch (r.kind) {
    case 'store':
    case 'food':
      return mix(r.accent, '#d8d0c4', 0.55);
    case 'anchor':
      return mix(r.accent, '#e0d8cc', 0.7);
    case 'service':
    case 'maint':
    case 'dock':
      return '#8e8a82';
    case 'security':
    case 'office':
      return '#7a8494';
    default:
      return '#cbbfae';
  }
}

function complaintColor(s: GameState, ri: number, alpha: number): string {
  const rs = s.rooms[ri];
  if (rs.vacant || rs.popup) return `rgba(140,140,150,${alpha * 0.6})`;
  const c = Math.min(1, rs.complaint / 100);
  const r = Math.round(80 + 175 * c);
  const g = Math.round(220 - 170 * c);
  return `rgba(${r},${g},${Math.round(120 - 60 * c)},${alpha})`;
}
