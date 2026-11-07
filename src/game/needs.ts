import { log } from './ops';
import type { Crew, GameState } from './state';
import { dayOf, isCold } from './time';
import { getDerived } from './world';

export const FOOD_PRICE = 4;
export const MEALTIME_PRICE = 6;
export const MEAL_HOURS = [8, 20];
export const LOW_MOOD = 30;
export const GREAT_MOOD = 80;

type StatId = 'stealth' | 'charm' | 'handy';
const STAT_IDS: StatId[] = ['stealth', 'charm', 'handy'];

export const bestStat = (c: Crew): StatId => STAT_IDS.reduce((best, k) => (c[k] > c[best] ? k : best));

export function moodStatBonus(s: GameState, c: Crew, k: StatId): number {
  if (s.mood < LOW_MOOD) return -1;
  return s.mood >= GREAT_MOOD && k === bestStat(c) ? 1 : 0;
}

export const stat = (s: GameState, c: Crew, k: StatId) => Math.max(1, Math.min(5, c[k] + moodStatBonus(s, c, k)));

export const isOverworked = (c: Crew) => c.state !== 'away' && c.energy <= 0;

const present = (s: GameState) => s.crew.filter((c) => c.state !== 'away');
const portions = (c: Crew) => (c.traits.includes('glutton') ? 1.5 : 1);

export function mealNeed(s: GameState): number {
  return Math.ceil(present(s).reduce((sum, c) => sum + portions(c), 0));
}

export function addMood(s: GameState, amount: number) {
  s.mood = Math.max(0, Math.min(100, s.mood + amount));
}

export function addSharedMood(s: GameState, amount: number) {
  addMood(s, amount / Math.max(1, present(s).length));
}

export const moodWorkMult = (mood: number) => 0.6 + (0.6 * mood) / 100;

export function workMult(s: GameState): number {
  return moodWorkMult(s.mood) * (s.missedMeals > 0 ? 0.85 : 1);
}

export function serveMeal(s: GameState) {
  const need = mealNeed(s);
  if (!need) return;
  const fromStash = Math.min(need, s.food);
  const bought = Math.min(need - fromStash, Math.floor(s.cash / MEALTIME_PRICE));
  s.food -= fromStash;
  s.cash -= bought * MEALTIME_PRICE;
  const eaten = fromStash + bought;
  const plate = getDerived(s).hotPlates[0];
  if (plate && eaten) {
    plate.usedUntil = s.time + 30;
    addMood(s, 3);
  }
  if (eaten < need) {
    s.missedMeals++;
    log(s, `Not enough food: ${eaten}/${need} portions. The Bats went to bed hungry.`, 'bad');
  } else {
    s.missedMeals = 0;
    if (bought) log(s, `The stash ran short, so someone grabbed ${bought} burger${bought === 1 ? '' : 's'} at A&W for $${bought * MEALTIME_PRICE}. Stocking up is cheaper.`, 'warn');
  }
  for (const c of present(s)) {
    if (c.layer !== 1 || (c.state !== 'idle' && c.state !== 'leisure')) continue;
    c.state = 'eating';
    c.timer = 20;
    c.useObj = -1;
    c.thought = plate ? 'Ramen night' : 'Eating cold leftovers';
  }
}

export function moodTarget(s: GameState): number {
  const crew = present(s);
  const count = Math.max(1, crew.length);
  const d = getDerived(s);
  const beds = d.beds.reduce((a, b) => a + b.slots, 0);
  const comfortPer = Math.min(36, (d.comfort / count) * 4);
  const jolly = crew.some((c) => c.traits.includes('jolly')) ? 6 : 0;
  const bedless = crew.filter((c) => c.bedId < 0).length / count;
  const overworked = crew.filter(isOverworked).length / count;
  const cold = isCold(dayOf(s.time)) && !s.objects.some((o) => o.type === 'heater' && o.powered);
  let target = 38 + comfortPer + jolly - 14 * bedless - 24 * overworked;
  if (s.missedMeals > 0) target -= 12 + 8 * Math.min(2, s.missedMeals);
  if (cold) target -= 10;
  if (count > beds + 1) target -= 6;
  return Math.max(0, Math.min(100, target));
}

export function hourlyMood(s: GameState) {
  s.mood += (moodTarget(s) - s.mood) * 0.08;
  if (s.mood < 12) s.miserable += 1;
  else s.miserable = Math.max(0, s.miserable - 0.5);
}
