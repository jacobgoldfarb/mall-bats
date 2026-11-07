import { MAX_PER_SPOT, POOL_OF, baseCycle, has, jobUnavailable } from './crew';
import { JOB, LOT, type JobDef, type JobId } from './defs';
import { stat } from './needs';
import type { Crew, GameState } from './state';
import { dayOf, md, seasonFactor } from './time';

export interface JobEstimate {
  yields: string;
  limit: string | null;
  risk: JobDef['risk'];
  stat: { name: string; value: number };
  blocked: string | null;
}

const range = (lo: number, hi: number, unit: (n: number) => string) => {
  const a = Math.round(lo);
  const b = Math.round(hi);
  return a === b ? unit(a) : `${unit(a)}–${unit(b).replace(/^\$/, '')}`;
};
const cash = (n: number) => `$${n}`;
const per = (n: number) => Math.max(1, Math.round(n));

function typicalCrowd(s: GameState): number {
  return Math.min(1.6, seasonFactor(dayOf(s.time)) * 0.85 * (0.5 + 0.6 * s.mallHealth));
}

function yieldText(s: GameState, c: Crew, job: JobId, cyclesPerHour: number): string {
  const [m, d] = md(dayOf(s.time));
  const n = cyclesPerHour;
  const crowd = typicalCrowd(s);
  switch (job) {
    case 'rest':
      return 'Energy back, hangs out';
    case 'fountain':
      return `${range((2.5 + stat(s, c, 'handy') * 1.2) * 0.7 * n, (2.5 + stat(s, c, 'handy') * 1.2) * 1.3 * n, cash)}/hr`;
    case 'arcade':
      return `${range((4 + stat(s, c, 'handy') * 2.2) * 0.8 * n, (4 + stat(s, c, 'handy') * 2.2) * 1.2 * n, cash)}/hr`;
    case 'busk': {
      const base = (1 + stat(s, c, 'charm')) * crowd * (has(c, 'performer') ? 1.6 : 1) * n;
      return `${range(base * 0.6, base * 1.4, cash)}/hr`;
    }
    case 'dumpster':
      return `${per(3 * n)} food/hr`;
    case 'vending':
      return `${per(2 * n)} food + $${per(1.5 * n)}/hr`;
    case 'samples':
      return `${per(2 * n)} food/hr`;
    case 'radiohut':
      return `${per((stat(s, c, 'handy') >= 4 ? 10 : 5) * n)} parts/hr`;
    case 'pallets':
      return `${per(7.5 * n)} parts/hr`;
    case 'stockroom':
      return `${per(4 * n)} parts + ${per(n)} goods/hr`;
    case 'lostfound':
      return `$${per(22 * n)} + ${per(2 * n)} goods/hr`;
    case 'gary':
      return `+${6 + stat(s, c, 'charm') * 2} goodwill (once a night)`;
    case 'boundaries':
      return `+${per((5 * n) / Math.max(1, s.crew.length))} mood/hr`;
    case 'returns': {
      const mult = (has(c, 'returnspro') ? 1.4 : 1) * (m === 12 && d === 26 ? 1.8 : 1);
      return `${range(50 * mult * n, 80 * mult * n, cash)}/hr, ${per(LOT * n)} goods/hr`;
    }
    case 'kiosk':
    case 'popup': {
      const kiosk = job === 'kiosk';
      const chance = Math.min(0.95, ((kiosk ? 0.3 : 0.42) + stat(s, c, 'charm') * 0.08) * crowd * (has(c, 'salesman') ? 1.5 : 1));
      const sales = chance * (kiosk ? 1 : 2) * n;
      const price = kiosk ? 50 : 71;
      return `$${Math.round(sales * price)}/hr, ${per(LOT * sales)} goods/hr`;
    }
    case 'tinker':
      return `${per(LOT * n)} goods/hr from ${per(2 * LOT * n)} parts`;
    case 'scrap':
      return `$${per((6 + stat(s, c, 'handy') * 2) * n)}/hr from ${per(10 * n)} parts`;
    case 'rig':
      return `−${((0.6 + stat(s, c, 'handy') * 0.3) * n).toFixed(1)} kWh/hr off a bill`;
    case 'lookout':
      return 'Bats under the periscope are harder to spot';
    case 'listings': {
      const mult = 0.7 + stat(s, c, 'charm') * 0.1;
      return `${range(30 * mult * n, 54 * mult * n, cash)}/hr, ${per(LOT * n)} goods/hr`;
    }
    case 'doorbuster':
      return `${range((3 + stat(s, c, 'charm') * 2) * 0.7 * n, (3 + stat(s, c, 'charm') * 2) * 1.3 * n, cash)}/hr`;
    case 'zalez':
      return `$${(1600 + stat(s, c, 'stealth') * 250).toLocaleString()} and 10 goods, once`;
  }
}

function limitText(s: GameState, job: JobId): string | null {
  const pool = POOL_OF[job];
  if (pool) {
    const left = Math.max(0, Math.floor(s.pools[pool] ?? 0));
    return job === 'fountain' || job === 'arcade' ? `$${left} left today` : `${left} left today`;
  }
  if (job === 'returns' || job === 'kiosk' || job === 'popup' || job === 'listings') return `${Math.floor(s.goods)} goods in stash`;
  if (job === 'tinker' || job === 'scrap') return `${Math.floor(s.parts)} parts in stash`;
  if (JOB[job].spot) return `${MAX_PER_SPOT} Bats at most`;
  return null;
}

export function jobEstimate(s: GameState, c: Crew, job: JobId): JobEstimate {
  const def = JOB[job];
  return {
    yields: yieldText(s, c, job, 60 / baseCycle(s, c, job)),
    limit: limitText(s, job),
    risk: def.risk,
    stat: { name: def.stat.toUpperCase(), value: stat(s, c, def.stat) },
    blocked: job === 'rest' ? null : jobUnavailable(s, c, job),
  };
}
