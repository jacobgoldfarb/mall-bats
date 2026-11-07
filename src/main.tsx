import { inject } from '@vercel/analytics';
import { render } from 'preact';

if (location.protocol === 'https:') inject();
import { app, LEVEL_UP_MS, MINUTES_PER_SECOND, refresh, toast } from './app';
import { audio } from './audio/audio';
import { newGame, saveGame } from './game/create';
import { ACHIEVEMENTS, achievementQueue, levelUpQueue, noticeQueue, sfxQueue } from './game/ops';
import { placeObject, tick } from './game/sim';
import { scheduleInspection } from './game/inspect';
import { dayOf, phaseAt } from './game/time';
import { LAYOUT } from './game/layout';
import { attachInput, updateKeyboardPan } from './input';
import { BODY_FONT, DISPLAY_FONT } from './render/draw';
import { Renderer } from './render/renderer';
import { loadSprites } from './render/sprites';
import { App, startGame } from './ui/App';
import '@fontsource/jersey-10/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import './ui/styles.css';

await Promise.all([loadSprites(), document.fonts.load(`600 10px ${BODY_FONT}`), document.fonts.load(`20px ${DISPLAY_FONT}`)]);
const canvas = document.getElementById('world') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
app.renderer = renderer;
attachInput(canvas);
if (import.meta.env.DEV) Object.assign(window, { __app: app, __dev: { newGame, placeObject, startGame, tick, scheduleInspection } });
import.meta.hot?.dispose(() => location.reload());

const savedAudio = localStorage.getItem('dropceiling.audio');
if (savedAudio) Object.assign(audio.volume, JSON.parse(savedAudio));

function makeDemo() {
  const s = newGame('Demo', 'normal', 2004);
  s.modals = [];
  s.cash = 1e6;
  s.time = 14 * 60;
  for (let x = 8; x <= 40; x++) for (const y of [2, 3]) placeObject(s, 'deck', x, y);
  for (let y = 4; y <= 9; y++) for (const x of [32, 33, 35, 36, 11, 12]) placeObject(s, 'deck', x, y);
  const items: [Parameters<typeof placeObject>[1], number, number][] = [
    ['splice', 33, 6],
    ['tv', 32, 6],
    ['lava_lamp', 35, 6],
    ['futon', 33, 8],
    ['lamp', 12, 5],
    ['splice', 12, 6],
    ['sleeping_bag', 11, 7],
    ['xmas', 20, 2],
    ['splice', 21, 3],
    ['hot_plate', 26, 3],
    ['arcade', 36, 5],
    ['raccoon', 30, 3],
  ];
  for (const [t, x, y] of items) placeObject(s, t, x, y);
  return s;
}

let lastAutosaveDay = -1;
let last = performance.now();
let titleT = 0;
let animationClock = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  updateKeyboardPan(dt);

  if (app.screen === 'title') {
    if (!app.demo) app.demo = makeDemo();
    titleT += dt;
    tick(app.demo, dt * MINUTES_PER_SECOND * 2);
    app.demo.suspicion = 0;
    app.demo.over = null;
    renderer.cam.zoom = 1.15;
    renderer.centerOn(24 + Math.sin(titleT * 0.05) * 9, 8 + Math.cos(titleT * 0.04) * 3);
    renderer.draw(app.demo, { ...app.view, layer: Math.floor(titleT / 14) % 2 === 0 ? 0 : 1, hover: null, build: null, demolish: false, overlay: 'none', selectedCrew: null }, now / 33);
    sfxQueue.length = 0;
    achievementQueue.length = 0;
    levelUpQueue.length = 0;
    noticeQueue.length = 0;
  } else if (app.state) {
    const s = app.state;
    const running = !app.paused && app.menu === 'none' && !s.modals.length && !s.over;
    if (running) {
      tick(s, dt * MINUTES_PER_SECOND * app.speed);
      animationClock += (dt * 1000) / 33;
    }
    renderer.clampCamera();
    renderer.draw(s, app.view, animationClock);

    while (sfxQueue.length) audio.play(sfxQueue.shift()!);
    while (noticeQueue.length) {
      const n = noticeQueue.shift()!;
      toast(n.text, 'bad', 4500);
      if (n.pause && app.autoPause) {
        app.paused = true;
        if (n.focus) {
          app.view.layer = n.focus.layer;
          renderer.centerOn(n.focus.x + 0.5, n.focus.y + 0.5);
        }
      }
    }
    if (levelUpQueue.length && !s.modals.length) {
      app.levelUp = { level: Math.max(...levelUpQueue), until: performance.now() + LEVEL_UP_MS };
      levelUpQueue.length = 0;
      refresh();
    }
    while (achievementQueue.length) {
      const id = achievementQueue.shift()!;
      toast(`🏆 Achievement: ${ACHIEVEMENTS[id]?.name ?? id}`, 'achievement', 4500);
      window.desktop?.unlockAchievement(id);
    }
    const phase = phaseAt(s.time);
    audio.setScene({ inCeiling: app.view.layer === 1, night: phase === 'night', open: phase === 'open', decay: Math.max(0, 0.9 - s.mallHealth) * 1.6 });
    const day = dayOf(s.time - 360);
    if (day !== lastAutosaveDay && !s.over) {
      if (lastAutosaveDay >= 0) saveGame(s);
      lastAutosaveDay = day;
    }
  }
  requestAnimationFrame(frame);
}

function applyUiScale() {
  const scale = Math.max(0.62, Math.min(1.25, Math.min(window.innerWidth / 1560, window.innerHeight / 900)));
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  app.uiScale = scale;
}

window.addEventListener('resize', () => {
  renderer.resize();
  applyUiScale();
});
applyUiScale();
window.addEventListener('beforeunload', () => {
  if (app.state && !app.state.over) saveGame(app.state);
});

render(<App />, document.getElementById('ui')!);
renderer.centerOn(LAYOUT.hatch.x, LAYOUT.hatch.y);
requestAnimationFrame(frame);
