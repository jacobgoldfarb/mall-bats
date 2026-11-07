import type { Look } from '../game/state';
import { isoX, isoY, shade } from './iso';
import { characterSprite, drawCharacterFrame, screenDirection, type CharacterSprite } from './sprites';

export type Ctx = CanvasRenderingContext2D;

export function diamondPath(p: Path2D | Ctx, x: number, y: number, w = 1, d = 1, z = 0, inset = 0) {
  p.moveTo(isoX(x + inset, y + inset), isoY(x + inset, y + inset, z));
  p.lineTo(isoX(x + w - inset, y + inset), isoY(x + w - inset, y + inset, z));
  p.lineTo(isoX(x + w - inset, y + d - inset), isoY(x + w - inset, y + d - inset, z));
  p.lineTo(isoX(x + inset, y + d - inset), isoY(x + inset, y + d - inset, z));
  p.closePath();
}

export function box(ctx: Ctx, x: number, y: number, w: number, d: number, h: number, color: string, z0 = 0, opts: { top?: string; left?: string; right?: string; stroke?: boolean } = {}) {
  const ax = isoX(x, y);
  const bx = isoX(x + w, y);
  const cx = isoX(x + w, y + d);
  const dx = isoX(x, y + d);
  const ay = isoY(x, y);
  const by = isoY(x + w, y);
  const cy = isoY(x + w, y + d);
  const dy = isoY(x, y + d);
  const z1 = z0 + h;
  ctx.fillStyle = opts.left ?? shade(color, -0.22);
  ctx.beginPath();
  ctx.moveTo(dx, dy - z0);
  ctx.lineTo(cx, cy - z0);
  ctx.lineTo(cx, cy - z1);
  ctx.lineTo(dx, dy - z1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = opts.right ?? shade(color, -0.38);
  ctx.beginPath();
  ctx.moveTo(bx, by - z0);
  ctx.lineTo(cx, cy - z0);
  ctx.lineTo(cx, cy - z1);
  ctx.lineTo(bx, by - z1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = opts.top ?? shade(color, 0.08);
  ctx.beginPath();
  ctx.moveTo(ax, ay - z1);
  ctx.lineTo(bx, by - z1);
  ctx.lineTo(cx, cy - z1);
  ctx.lineTo(dx, dy - z1);
  ctx.closePath();
  ctx.fill();
  if (opts.stroke) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

export function centeredBox(ctx: Ctx, tx: number, ty: number, size: number, h: number, color: string, z0 = 0, opts?: Parameters<typeof box>[8]) {
  const o = (1 - size) / 2;
  box(ctx, tx + o, ty + o, size, size, h, color, z0, opts);
}

export function rectBox(ctx: Ctx, tx: number, ty: number, w: number, d: number, h: number, color: string, z0 = 0, opts?: Parameters<typeof box>[8]) {
  box(ctx, tx + (1 - w) / 2, ty + (1 - d) / 2, w, d, h, color, z0, opts);
}

export function faceQuad(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(isoX(x0, y0), isoY(x0, y0, z0));
  ctx.lineTo(isoX(x1, y1), isoY(x1, y1, z0));
  ctx.lineTo(isoX(x1, y1), isoY(x1, y1, z1));
  ctx.lineTo(isoX(x0, y0), isoY(x0, y0, z1));
  ctx.closePath();
  ctx.fill();
}

export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type WorkMotion = 'rummage' | 'jiggle' | 'sway' | 'hammer' | 'pitch';

export interface PersonOpts {
  walking: boolean;
  t: number;
  facingScreen: number;
  facing?: number;
  sprite?: string;
  crouch?: boolean;
  sleeping?: boolean;
  alpha?: number;
  segway?: boolean;
  flash?: boolean;
  dog?: boolean;
  carry?: boolean;
  mop?: boolean;
  ladder?: boolean;
  work?: WorkMotion;
}

function drawLadder(ctx: Ctx, px: number, py: number) {
  ctx.strokeStyle = '#b8b8b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px - 9, py);
  ctx.lineTo(px - 11, py - 40);
  ctx.moveTo(px - 3, py);
  ctx.lineTo(px - 5, py - 40);
  for (let i = 1; i < 6; i++) {
    ctx.moveTo(px - 9 - i * 0.33, py - i * 7);
    ctx.lineTo(px - 3 - i * 0.33, py - i * 7);
  }
  ctx.stroke();
}

const WALK_FPS = 0.3;

function workPose(motion: WorkMotion | undefined, t: number) {
  switch (motion) {
    case 'rummage':
      return { squash: 1 - 0.16 * Math.max(0, Math.sin(t * 0.12)), tilt: 0, shift: 0 };
    case 'jiggle':
      return { squash: 1, tilt: 0, shift: Math.sin(t * 0.08) > 0.2 ? Math.round(Math.sin(t * 1.3) * 1.5) : 0 };
    case 'sway':
      return { squash: 1, tilt: Math.sin(t * 0.14) * 0.09, shift: 0 };
    case 'hammer':
      return { squash: 1 - 0.06 * Math.abs(Math.sin(t * 0.35)), tilt: 0, shift: 0 };
    case 'pitch':
      return { squash: 1 - 0.03 * Math.max(0, Math.sin(t * 0.09)), tilt: Math.sin(t * 0.045) * 0.03, shift: 0 };
    default:
      return { squash: 1, tilt: 0, shift: 0 };
  }
}

function drawNote(ctx: Ctx, px: number, py: number, t: number) {
  const rise = (t * 0.02) % 1;
  const x = Math.round(px + 9 + Math.sin(rise * 6) * 2);
  const y = Math.round(py - 38 - rise * 14);
  ctx.save();
  ctx.globalAlpha = 1 - rise;
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(x, y - 6, 1, 6);
  ctx.fillRect(x + 1, y - 6, 3, 1);
  ctx.fillRect(x + 3, y - 5, 1, 1);
  ctx.fillRect(x - 2, y - 1, 3, 2);
  ctx.restore();
}

function drawSpritePerson(ctx: Ctx, sprite: CharacterSprite, px: number, py: number, o: PersonOpts) {
  const dir = screenDirection(o.facing ?? Math.PI / 4);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ellipse(ctx, px, py, 9, 4, 'rgba(0,0,0,0.28)');
  if (o.sleeping) {
    ctx.translate(px, py - 6);
    ctx.rotate(-Math.PI / 2);
    drawCharacterFrame(ctx, sprite, 0, sprite.footY - sprite.frame / 2, 0, 0);
    ctx.restore();
    return;
  }
  const frame = Math.floor(o.t * WALK_FPS);
  const sneaking = o.crouch && o.walking && sprite.sneak > 0;
  const col = sneaking ? 1 + sprite.walk + (frame % sprite.sneak) : o.walking && sprite.walk ? 1 + (frame % sprite.walk) : 0;
  const motion = o.walking ? undefined : o.work;
  const pose = workPose(motion, o.t);
  const squash = (o.crouch && !sneaking ? 0.82 : 1) * pose.squash;
  if (squash !== 1 || pose.tilt || pose.shift) {
    ctx.translate(px + pose.shift, py);
    ctx.rotate(pose.tilt);
    ctx.scale(1, squash);
    drawCharacterFrame(ctx, sprite, 0, 0, dir, col);
  } else drawCharacterFrame(ctx, sprite, px, py, dir, col);
  ctx.restore();
  if (motion === 'sway') drawNote(ctx, px, py, o.t);
  if (o.carry) {
    ctx.fillStyle = '#c9a46a';
    ctx.fillRect(px - 5, py - 24, 10, 7);
    ctx.fillStyle = '#8a6a40';
    ctx.fillRect(px - 5, py - 21, 10, 1);
  }
  if (o.ladder) drawLadder(ctx, px, py);
  if (o.dog) {
    const flip = o.facingScreen < 0 ? -1 : 1;
    const dog = characterSprite('char.npc.dog');
    if (dog) drawCharacterFrame(ctx, dog, px - 14 * flip, py + 4, dir, o.walking && dog.walk ? 1 + (frame % dog.walk) : 0);
    else drawDog(ctx, px - 12 * flip, py + 3, o.t, o.walking, flip);
  }
}

export function drawPerson(ctx: Ctx, px: number, py: number, look: Look, o: PersonOpts) {
  const sprite = o.sprite ? characterSprite(o.sprite) : null;
  if (sprite) return drawSpritePerson(ctx, sprite, px, py, o);
  const s = look.build;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ellipse(ctx, px, py, 7 * s, 3.4 * s, 'rgba(0,0,0,0.28)');
  if (o.sleeping) {
    ctx.translate(px, py - 3);
    ellipse(ctx, 0, 0, 11, 4.5, look.top);
    ellipse(ctx, -9, -1.5, 4.2, 3.6, look.skin);
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(-10.5, -2.5, 3.6, Math.PI * 0.8, Math.PI * 1.9);
    ctx.fill();
    ctx.restore();
    return;
  }
  const crouch = o.crouch ? 6 : 0;
  const flip = o.facingScreen < 0 ? -1 : 1;
  const step = o.walking ? Math.sin(o.t * 0.35) : 0;
  const bob = o.walking ? Math.abs(Math.cos(o.t * 0.35)) * 1.2 : 0;
  const y0 = py - bob;

  if (o.segway) {
    ctx.fillStyle = '#222';
    ctx.fillRect(px - 7, py - 3, 14, 3);
    ellipse(ctx, px - 6, py - 1, 2.5, 2.5, '#111');
    ellipse(ctx, px + 6, py - 1, 2.5, 2.5, '#111');
    ctx.fillStyle = '#555';
    ctx.fillRect(px + 3 * flip, py - 24, 1.6, 22);
    ctx.fillRect(px + 1 * flip - 3, py - 25, 7, 1.6);
  }
  const legTop = y0 - 10 + crouch * 0.5;
  const footY = o.segway ? py - 3 : y0;
  ctx.fillStyle = look.bottom;
  if (!o.segway && o.walking) {
    ctx.fillRect(px - 3.8, legTop, 3, footY - legTop - step * 1.6);
    ctx.fillRect(px + 0.8, legTop, 3, footY - legTop + step * 1.6 - 0.4);
  } else {
    ctx.fillRect(px - 3.8, legTop, 3, footY - legTop);
    ctx.fillRect(px + 0.8, legTop, 3, footY - legTop);
  }
  ctx.fillStyle = look.shoes;
  ctx.fillRect(px - 4.3, footY - 1.6 - (o.walking && !o.segway ? step * 1.6 : 0), 3.8, 1.8);
  ctx.fillRect(px + 0.5, footY - 1.6 + (o.walking && !o.segway ? step * 1.6 : 0), 3.8, 1.8);

  const bodyTop = y0 - 22 * s + crouch;
  ctx.fillStyle = look.top;
  roundRect(ctx, px - 5.8 * s, bodyTop, 11.6 * s, 13 * s - crouch * 0.2, 3.2);
  ctx.fill();
  ctx.fillStyle = shade(look.top, -0.25);
  ctx.fillRect(px - 5.8 * s, bodyTop + 9 * s, 11.6 * s, 1.4);
  const armSwing = o.walking ? step * 2 : 0;
  ctx.fillStyle = shade(look.top, -0.12);
  roundRect(ctx, px - 7.6 * s, bodyTop + 1.5 + armSwing, 2.6, 9, 1.3);
  ctx.fill();
  roundRect(ctx, px + 5 * s, bodyTop + 1.5 - armSwing, 2.6, 9, 1.3);
  ctx.fill();
  ctx.fillStyle = look.skin;
  ctx.fillRect(px - 7.6 * s, bodyTop + 9.8 + armSwing, 2.6, 2);
  ctx.fillRect(px + 5 * s, bodyTop + 9.8 - armSwing, 2.6, 2);

  if (o.flash) {
    ctx.fillStyle = '#333';
    ctx.fillRect(px + 5 * flip * s, bodyTop + 7, 5 * flip, 2.4);
    ellipse(ctx, px + 10 * flip * s, bodyTop + 8.2, 1.6, 1.6, '#fff8c0');
  }
  if (o.carry) {
    ctx.fillStyle = '#c9a46a';
    ctx.fillRect(px - 4, bodyTop + 4, 8, 6);
  }
  if (o.mop) {
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(px + 6 * flip, bodyTop + 5);
    ctx.lineTo(px + 12 * flip, py);
    ctx.stroke();
    ellipse(ctx, px + 12 * flip, py, 3.5, 1.5, '#ddd');
  }
  if (o.ladder) drawLadder(ctx, px, py);

  const headY = bodyTop - 4.6 * s;
  ellipse(ctx, px, headY, 4.7 * s, 4.9 * s, look.skin);
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  switch (look.hairStyle) {
    case 0:
      ctx.arc(px, headY - 0.8, 4.9 * s, Math.PI, Math.PI * 2);
      break;
    case 1:
      ctx.arc(px, headY - 0.6, 5.1 * s, Math.PI * 0.85, Math.PI * 2.15);
      ctx.rect(px - 5 * s, headY - 1, 2, 7);
      ctx.rect(px + 3 * s, headY - 1, 2, 7);
      break;
    case 2:
      ctx.arc(px, headY - 1.2, 5 * s, Math.PI, Math.PI * 2);
      ctx.moveTo(px - 5 * s, headY - 1);
      ctx.lineTo(px + 1.5 * flip, headY + 2.5);
      ctx.lineTo(px + 5 * s, headY - 1);
      break;
    case 3:
      ctx.arc(px, headY - 1.4, 5.3 * s, Math.PI * 0.9, Math.PI * 2.1);
      ctx.arc(px, headY - 5.5, 2.4, 0, Math.PI * 2);
      break;
    default:
      ctx.arc(px, headY - 0.4, 5 * s, Math.PI * 0.95, Math.PI * 2.05);
      ctx.rect(px - 5.2 * s, headY - 1, 10.4 * s, 9);
  }
  ctx.fill();
  if (look.hat) {
    ctx.fillStyle = look.hatColor ?? '#222';
    ctx.beginPath();
    if (look.hat === 'beanie' || look.hat === 'hood') {
      ctx.arc(px, headY - 1.5, 5.3 * s, Math.PI, Math.PI * 2);
      ctx.fill();
      if (look.hat === 'hood') {
        ctx.fillStyle = look.top;
        ctx.beginPath();
        ctx.arc(px, headY - 0.5, 5.8 * s, Math.PI * 0.8, Math.PI * 2.2);
        ctx.fill();
        ellipse(ctx, px + flip * 0.8, headY + 0.8, 3.4, 3.6, look.skin);
      }
    } else if (look.hat === 'visor') {
      ctx.fillRect(px - 5 * s, headY - 3.6, 10 * s, 2);
      ctx.fillRect(px + (flip > 0 ? 2 : -8), headY - 2.2, 6, 1.6);
    } else if (look.hat === 'hardhat') {
      ctx.arc(px, headY - 1.6, 5.6 * s, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px - 6.8 * s, headY - 2.2, 13.6 * s, 1.6);
    } else {
      ctx.arc(px, headY - 1.4, 5.1 * s, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px + (flip > 0 ? 1 : -8), headY - 2.6, 7, 1.8);
      if (look.hat === 'trucker') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(px - 2.5, headY - 5.5, 5, 2.4);
      }
    }
  }
  ctx.fillStyle = '#1a1a1a';
  if (o.facingScreen !== 0) {
    ctx.fillRect(px + flip * 1.6 - 0.6, headY - 0.2, 1.2, 1.4);
    ctx.fillRect(px + flip * 3.6 - 0.6, headY - 0.2, 1.1, 1.4);
  }
  ctx.restore();

  if (o.dog) drawDog(ctx, px - 12 * flip, py + 3, o.t, o.walking, flip);
}

export function drawDog(ctx: Ctx, px: number, py: number, t: number, walking: boolean, flip: number) {
  ellipse(ctx, px, py, 7, 2.6, 'rgba(0,0,0,0.25)');
  const b = walking ? Math.sin(t * 0.5) * 1.2 : 0;
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(px - 5, py - 6, 2, 6 + b);
  ctx.fillRect(px + 3, py - 6, 2, 6 - b);
  roundRect(ctx, px - 7, py - 11, 14, 6, 3);
  ctx.fill();
  ctx.fillStyle = '#2a1a0a';
  roundRect(ctx, px + 4 * flip - 3, py - 15, 7, 6, 2.5);
  ctx.fill();
  ctx.fillRect(px + 8 * flip - (flip < 0 ? 3 : 0), py - 12.5, 3, 3);
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(px - 8 * flip - 1, py - 13 + Math.sin(t * 0.8) * 1.5, 2, 4);
}

export const BODY_FONT = '"Pixelify Bats", Verdana, sans-serif';
export const DISPLAY_FONT = '"Jersey 10", "Arial Black", sans-serif';

export function bubble(ctx: Ctx, px: number, py: number, text: string, tone?: 'alert' | 'info' | 'happy') {
  ctx.font = `600 11px ${BODY_FONT}`;
  const w = ctx.measureText(text).width + 10;
  const bg = tone === 'alert' ? '#ff2d55' : tone === 'happy' ? '#2fd17a' : tone === 'info' ? '#ffd23f' : '#ffffff';
  const fg = tone === 'alert' ? '#fff' : '#111';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, px - w / 2 + 1, py - 17, w, 15, 6);
  ctx.fill();
  ctx.fillStyle = bg;
  roundRect(ctx, px - w / 2, py - 18, w, 15, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(px - 3, py - 3.5);
  ctx.lineTo(px, py + 1.5);
  ctx.lineTo(px + 3, py - 3.5);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px, py - 10.2);
}

export function isoText(ctx: Ctx, text: string, x: number, y: number, z: number, dir: 'x' | 'y', size: number, color: string, opts: { glow?: string; maxWidth?: number } = {}) {
  ctx.save();
  ctx.translate(isoX(x, y), isoY(x, y, z));
  ctx.transform(1, dir === 'x' ? 0.5 : -0.5, 0, 1, 0, 0);
  ctx.font = `${size * 1.3}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = 8;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0, opts.maxWidth);
  ctx.restore();
}
