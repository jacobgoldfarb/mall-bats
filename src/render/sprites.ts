import manifest from '../assets/sprites/manifest.json';
import type { Ctx } from './draw';
import { isoX, isoY } from './iso';

interface PropEntry {
  file: string;
  w: number;
  h: number;
  base: number;
}

interface FloorEntry {
  file: string;
  size: number;
  tint: boolean;
  avg: number[];
}

interface CharacterEntry {
  file: string;
  frame: number;
  dirs: string[];
  walk: number;
  sneak: number;
  footY: number;
}

export interface PropSprite extends PropEntry {
  img: CanvasImageSource;
}

export interface CharacterSprite extends CharacterEntry {
  img: CanvasImageSource;
}

export interface Texture {
  size: number;
  data: Uint8ClampedArray;
  avg: number[];
  tint: boolean;
}

const urls = import.meta.glob('../assets/sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const images = new Map<string, HTMLImageElement>();
const dimmed = new Map<string, HTMLCanvasElement>();
const textures = new Map<string, Texture>();

const props = manifest.props as Record<string, PropEntry[]>;
const floors = manifest.floors as Record<string, FloorEntry>;
const characters = manifest.characters as Record<string, CharacterEntry>;

export async function loadSprites() {
  await Promise.all(
    Object.entries(urls).map(
      ([path, url]) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            images.set(path.split('/').pop()!, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  );
  for (const [id, entry] of Object.entries(floors)) {
    const img = images.get(entry.file);
    if (!img) continue;
    const c = document.createElement('canvas');
    c.width = c.height = entry.size;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    textures.set(id, { size: entry.size, data: ctx.getImageData(0, 0, entry.size, entry.size).data, avg: entry.avg, tint: entry.tint });
  }
}

export function propSprite(id: string, seed = 0): PropSprite | null {
  const variants = props[id];
  if (!variants?.length) return null;
  const entry = variants[Math.abs(Math.floor(seed)) % variants.length];
  const img = images.get(entry.file);
  return img ? { ...entry, img } : null;
}

export function hasProp(id: string) {
  return !!props[id]?.length;
}

function dim(entry: PropEntry, img: HTMLImageElement) {
  let c = dimmed.get(entry.file);
  if (!c) {
    c = document.createElement('canvas');
    c.width = entry.w;
    c.height = entry.h;
    const ctx = c.getContext('2d')!;
    ctx.filter = 'brightness(0.55) saturate(0.6)';
    ctx.drawImage(img, 0, 0);
    dimmed.set(entry.file, c);
  }
  return c;
}

export function drawPropSprite(ctx: Ctx, id: string, x: number, y: number, opts: { w?: number; d?: number; seed?: number; dim?: boolean; z?: number } = {}): PropSprite | null {
  const s = propSprite(id, opts.seed);
  if (!s) return null;
  const w = opts.w ?? 1;
  const d = opts.d ?? 1;
  const cx = isoX(x + w / 2, y + d / 2);
  const cy = isoY(x + w / 2, y + d / 2, opts.z ?? 0);
  ctx.fillStyle = 'rgba(20,14,30,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, s.base * 0.46, s.base * 0.23, 0, 0, Math.PI * 2);
  ctx.fill();
  const img = opts.dim ? dim(s, s.img as HTMLImageElement) : s.img;
  ctx.drawImage(img, Math.round(cx - s.w / 2), Math.round(cy + s.base / 4 - s.h), s.w, s.h);
  return s;
}

export function characterSprite(id: string): CharacterSprite | null {
  const entry = characters[id];
  const img = entry && images.get(entry.file);
  return img ? { ...entry, img } : null;
}

export function characterIds(prefix: string) {
  return Object.keys(characters).filter((id) => id.startsWith(prefix) && images.has(characters[id].file));
}

export function screenDirection(facing: number) {
  const sx = Math.cos(facing) - Math.sin(facing);
  const sy = (Math.cos(facing) + Math.sin(facing)) / 2;
  const step = Math.round((Math.PI / 2 - Math.atan2(sy, sx)) / (Math.PI / 4));
  return ((step % 8) + 8) % 8;
}

export function drawPortrait(ctx: Ctx, s: CharacterSprite, size: number) {
  const crop = 30;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.img, s.frame / 2 - crop / 2, Math.max(0, s.footY - 46), crop, crop, 0, size * 0.12, size, size);
}

export function drawCharacterFrame(ctx: Ctx, s: CharacterSprite, px: number, py: number, dir: number, col: number, scale = 1) {
  const f = s.frame;
  const size = Math.round(f * scale);
  ctx.drawImage(s.img, col * f, dir * f, f, f, Math.round(px - size / 2), Math.round(py - s.footY * scale), size, size);
}

export function texture(id: string) {
  return textures.get(id) ?? null;
}
