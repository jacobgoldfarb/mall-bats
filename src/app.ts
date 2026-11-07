import { BUILD, type BuildCategory, type BuildId } from './game/defs';
import type { GameState, Placed } from './game/state';
import type { Overlay, Renderer, ViewState } from './render/renderer';

export type Screen = 'title' | 'game';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'bad' | 'good' | 'achievement';
  until: number;
}

export interface AppState {
  screen: Screen;
  state: GameState | null;
  demo: GameState | null;
  view: ViewState;
  speed: number;
  paused: boolean;
  menu: 'none' | 'pause' | 'settings' | 'help' | 'newgame' | 'jobs';
  jobsCrew: number | null;
  jobsShift: 'day' | 'night';
  buildCategory: BuildCategory | 'sets';
  buildOpen: boolean;
  selectedObj: number | null;
  hoverScreen: { x: number; y: number } | null;
  toasts: Toast[];
  levelUp: { level: number; until: number } | null;
  renderer: Renderer | null;
  tick: number;
  logOpen: boolean;
  objectiveOpen: boolean;
  inspectionsOpen: boolean;
  levelsOpen: boolean;
  crewExpanded: number | null;
  autoPause: boolean;
  uiScale: number;
}

export const app: AppState = {
  screen: 'title',
  state: null,
  demo: null,
  view: {
    layer: 1,
    overlay: 'none',
    hover: null,
    build: null,
    moving: null,
    demolish: false,
    dragStart: null,
    selectedCrew: null,
    xray: false,
    flip: false,
  },
  speed: 1,
  paused: false,
  menu: 'none',
  jobsCrew: null,
  jobsShift: 'day',
  buildCategory: 'structure',
  buildOpen: true,
  selectedObj: null,
  hoverScreen: null,
  toasts: [],
  levelUp: null,
  renderer: null,
  tick: 0,
  logOpen: true,
  objectiveOpen: true,
  inspectionsOpen: false,
  levelsOpen: false,
  crewExpanded: null,
  autoPause: localStorage.getItem('dropceiling.autopause') !== '0',
  uiScale: 1,
};

export const LEVEL_UP_MS = 5200;

let toastId = 1;
const listeners = new Set<() => void>();

export function refresh() {
  app.tick++;
  for (const l of listeners) l();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toast(text: string, tone: Toast['tone'] = 'info', ms = 2600) {
  app.toasts.push({ id: toastId++, text, tone, until: performance.now() + ms });
  if (app.toasts.length > 4) app.toasts.shift();
  refresh();
}

let overlayBeforePowerFocus: Overlay | null = null;

export function focusPowerFor(type: BuildId | null) {
  const def = type && BUILD[type];
  const powered = !!def && (!!def.power || !!def.supply);
  if (powered && app.view.overlay !== 'power') {
    overlayBeforePowerFocus = app.view.overlay;
    app.view.overlay = 'power';
  } else if (!powered && overlayBeforePowerFocus !== null) {
    app.view.overlay = overlayBeforePowerFocus;
    overlayBeforePowerFocus = null;
  }
}

export function selectObject(id: number | null) {
  app.selectedObj = id;
  focusPowerFor(id === null ? null : (app.state?.objects.find((o) => o.id === id)?.type ?? null));
}

export const buildLayer = (id: BuildId): 0 | 1 => (BUILD[id].floor ? 0 : 1);

export function selectBuild(id: BuildId | null) {
  focusPowerFor(id);
  app.view.build = id;
  app.view.moving = null;
  app.view.demolish = false;
  app.view.dragStart = null;
  if (id) app.view.layer = buildLayer(id);
  refresh();
}

export function startMove(o: Placed) {
  selectBuild(o.type);
  app.view.moving = o.id;
  app.view.flip = !!o.flipped;
  app.selectedObj = null;
}

export function focusTile(x: number, y: number, layer?: 0 | 1) {
  if (layer !== undefined) app.view.layer = layer;
  app.renderer?.centerOn(x + 0.5, y + 0.5);
}

export const SPEEDS = [1, 3, 8];
export const MINUTES_PER_SECOND = 5;

declare global {
  interface Window {
    desktop?: {
      isDesktop: boolean;
      quit: () => void;
      toggleFullscreen: () => void;
      unlockAchievement: (id: string) => void;
    };
  }
}
