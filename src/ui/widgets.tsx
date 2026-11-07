import { useEffect, useRef } from 'preact/hooks';
import type { BuildId } from '../game/defs';
import type { Look } from '../game/state';
import { drawPerson } from '../render/draw';
import { isoX, isoY } from '../render/iso';
import { drawBuildable } from '../render/objects';
import { characterSprite, drawPortrait } from '../render/sprites';

export function Portrait({ look, sprite, size = 44, bg = '#1a2040' }: { look?: Look; sprite?: string; size?: number; bg?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, bg);
    g.addColorStop(1, '#0a0c1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const s = sprite ? characterSprite(sprite) : null;
    if (s) return drawPortrait(ctx, s, size);
    if (!look) return;
    const scale = size / 26;
    ctx.save();
    ctx.translate(size / 2, size * 1.25);
    ctx.scale(scale, scale);
    drawPerson(ctx, 0, 0, look, { walking: false, t: 0, facingScreen: 0.0001 });
    ctx.restore();
  }, [look, sprite, size, bg]);
  return <canvas ref={ref} class="portrait" style={{ width: `${size}px`, height: `${size}px` }} />;
}

export function BuildIcon({ type, size = 40 }: { type: BuildId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    const scale = size / 52;
    ctx.save();
    ctx.translate(size / 2, size * 0.42);
    ctx.scale(scale, scale);
    ctx.translate(-isoX(0.5, 0.5), -isoY(0.5, 0.5));
    ctx.fillStyle = type === 'deck' ? '#c49a68' : 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(isoX(0, 0), isoY(0, 0));
    ctx.lineTo(isoX(1, 0), isoY(1, 0));
    ctx.lineTo(isoX(1, 1), isoY(1, 1));
    ctx.lineTo(isoX(0, 1), isoY(0, 1));
    ctx.closePath();
    ctx.fill();
    drawBuildable(ctx, type, 0, 0, 10, { powered: true, inUse: type === 'tv' || type === 'hot_plate' });
    ctx.restore();
  }, [type, size]);
  return <canvas ref={ref} style={{ width: `${size}px`, height: `${size}px` }} />;
}

export function Bar({ value, color, label, title }: { value: number; color: string; label?: string; title?: string }) {
  return (
    <div class="bar" title={title}>
      {label && <span class="bar-label">{label}</span>}
      <div class="bar-track">
        <div class="bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

export function Dots({ n, color = '#2ad4c8', bonus = 0 }: { n: number; color?: string; bonus?: number }) {
  const shown = Math.max(1, Math.min(5, n + bonus));
  return (
    <span class="dots" title={bonus ? `${bonus > 0 ? '+1 from great mood' : '−1 from low mood'}` : undefined}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i class={bonus > 0 && i === shown && i > n ? 'up' : bonus < 0 && i === n && i > shown ? 'down' : ''} style={{ background: i <= shown ? color : 'rgba(255,255,255,0.12)' }} />
      ))}
    </span>
  );
}
