import { goTo, moveAgent } from './crew';
import { LAYOUT, N, W, idx } from './layout';
import { log, rand } from './ops';
import type { GameState, Pet } from './state';
import { blocksWalking, getDerived } from './world';

const SCURRY_SPEED = 0.5;
const WANDER_RADIUS = 6;
const HEEL_RADIUS = 1.5;
const NAP_CHANCE = 0.3;
const SNACKS = ['half a soft pretzel', 'a sleeve of Bagel Bites', 'a single chicken nugget', 'a Cinnabon, mostly intact', 'a bag of Funyuns', 'three Sbarro garlic knots'];

const atHatch = (): Pet => ({
  name: 'Bandit',
  x: LAYOUT.hatch.x + 0.5,
  y: LAYOUT.hatch.y + 0.5,
  layer: 1,
  path: [],
  pathI: 0,
  goal: -1,
  facing: 0,
  moving: false,
  climb: 0,
  napping: false,
  timer: 0,
});

const onPlywood = (s: GameState, b: Pet) => {
  const i = idx(Math.floor(b.x), Math.floor(b.y));
  return s.deck[i] === 1 || i === idx(LAYOUT.hatch.x, LAYOUT.hatch.y);
};

function wanderTarget(s: GameState, b: Pet): number | null {
  const awake = s.crew.filter((c) => c.layer === 1 && c.state !== 'away' && c.state !== 'sleeping');
  const heel = awake.length > 0 && rand.chance(0.5);
  const near = heel ? rand.pick(awake) : b;
  const radius = heel ? HEEL_RADIUS : WANDER_RADIUS;
  const d = getDerived(s);
  const tiles: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!s.deck[i]) continue;
    const o = d.objAt.get(i);
    if (o && blocksWalking(o)) continue;
    if (Math.hypot((i % W) + 0.5 - near.x, Math.floor(i / W) + 0.5 - near.y) <= radius) tiles.push(N + i);
  }
  return tiles.length ? rand.pick(tiles) : null;
}

export function updateBandit(s: GameState, dt: number) {
  if (!s.flags.ferret) return;
  if (!s.pet || !onPlywood(s, s.pet)) s.pet = atHatch();
  const b = s.pet;
  if (b.pathI < b.path.length) {
    moveAgent(b, SCURRY_SPEED, dt);
    return;
  }
  b.moving = false;
  b.timer -= dt;
  if (b.timer > 0) return;
  b.napping = !b.napping && rand.chance(NAP_CHANCE);
  if (b.napping) {
    b.timer = rand.range(60, 180);
    return;
  }
  const target = wanderTarget(s, b);
  if (target !== null && goTo(s, b, [target]) && b.path.some((n) => n < N)) b.path = [];
  b.timer = rand.range(4, 20);
}

export function banditForage(s: GameState) {
  if (!s.flags.ferret) return;
  const at = s.pet && { x: Math.floor(s.pet.x), y: Math.floor(s.pet.y), layer: 1 as const };
  const snack = rand.pick(SNACKS);
  if (s.food >= getDerived(s).foodCap) {
    log(s, `Bandit dragged ${snack} back through the vents. The stash was full, so he ate it.`, 'info', at);
    return;
  }
  s.food += 1;
  log(s, `Bandit dragged ${snack} back through the vents. +1 food.`, 'good', at);
}
