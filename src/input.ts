import { app, buildLayer, refresh, selectBuild, selectObject, startMove, toast, SPEEDS } from './app';
import { audio } from './audio/audio';
import { shiftNow } from './game/crew';
import { BUILD, canRotate } from './game/defs';
import { openJobs } from './ui/jobs';
import { allHome } from './ui/hud';
import { LAYOUT, idx, inBounds } from './game/layout';
import { demolishAt, moveObject, placeObject, rotateObject } from './game/sim';
import { getDerived } from './game/world';

const keys = new Set<string>();

function placeRect(x0: number, y0: number, x1: number, y1: number) {
  const s = app.state!;
  const type = app.view.build!;
  const pending: [number, number][] = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) pending.push([x, y]);
  let placed = 0;
  let lastErr: string | null = null;
  let progress = true;
  while (progress && pending.length) {
    progress = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const [x, y] = pending[i];
      const err = placeObject(s, type, x, y);
      if (!err) {
        placed++;
        pending.splice(i, 1);
        progress = true;
      } else lastErr = err;
    }
  }
  if (placed) audio.play('build');
  else if (lastErr) {
    toast(lastErr, 'bad');
    audio.play('bad');
  }
  if (placed && pending.length && lastErr === 'Not enough cash') toast('Ran out of cash', 'bad');
}

function pickCrew(sx: number, sy: number) {
  const s = app.state!;
  const r = app.renderer!;
  let best: number | null = null;
  let bd = 22;
  for (const c of s.crew) {
    if (c.layer !== app.view.layer || c.state === 'away') continue;
    const p = r.worldToScreen(c.x, c.y, 14);
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d < bd) {
      bd = d;
      best = c.id;
    }
  }
  return best;
}

export function attachInput(canvas: HTMLCanvasElement) {
  let panning = false;
  let panMoved = 0;
  let last = { x: 0, y: 0 };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    audio.start();
    if (app.screen !== 'game' || !app.state) return;
    last = { x: e.clientX, y: e.clientY };
    if (e.button === 1 || e.button === 2) {
      panning = true;
      panMoved = 0;
      return;
    }
    const t = app.renderer!.screenToTile(e.clientX, e.clientY);
    if (app.view.build) {
      if (app.view.layer !== buildLayer(app.view.build)) {
        app.view.layer = buildLayer(app.view.build);
        refresh();
        return;
      }
      app.view.dragStart = { x: t.x, y: t.y };
      return;
    }
    if (app.view.demolish) {
      if (app.view.layer !== 1) return;
      app.view.dragStart = { x: t.x, y: t.y };
      return;
    }
    const crew = pickCrew(e.clientX, e.clientY);
    if (crew !== null) {
      app.view.selectedCrew = crew;
      app.crewExpanded = crew;
      selectObject(null);
      audio.play('click');
      refresh();
      return;
    }
    if (inBounds(t.x, t.y)) {
      const d = getDerived(app.state);
      const obj = (app.view.layer === 1 ? d.objAt : d.floorAt).get(idx(t.x, t.y));
      selectObject(obj ? obj.id : null);
      if (obj) audio.play('click');
    } else selectObject(null);
    app.view.selectedCrew = null;
    refresh();
  });

  window.addEventListener('mousemove', (e) => {
    app.hoverScreen = { x: e.clientX, y: e.clientY };
    if (app.screen !== 'game' || !app.renderer) return;
    if (panning) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      panMoved += Math.abs(dx) + Math.abs(dy);
      app.renderer.cam.x += dx;
      app.renderer.cam.y += dy;
      app.renderer.clampCamera();
      last = { x: e.clientX, y: e.clientY };
      return;
    }
    const overUi = (e.target as HTMLElement) !== canvas;
    if (overUi) {
      app.view.hover = null;
      return;
    }
    const t = app.renderer.screenToTile(e.clientX, e.clientY);
    app.view.hover = { x: t.x, y: t.y };
  });

  window.addEventListener('mouseup', (e) => {
    if (panning && (e.button === 1 || e.button === 2)) {
      panning = false;
      if (e.button === 2 && panMoved < 5) {
        if (app.view.build || app.view.demolish) {
          selectBuild(null);
        } else {
          app.view.selectedCrew = null;
          selectObject(null);
          refresh();
        }
      }
      return;
    }
    if (e.button !== 0 || !app.state || !app.view.dragStart) return;
    const t = app.renderer!.screenToTile(e.clientX, e.clientY);
    const start = app.view.dragStart;
    app.view.dragStart = null;
    const moving = app.state.objects.find((o) => o.id === app.view.moving);
    if (moving) {
      const err = moveObject(app.state, moving, t.x, t.y);
      if (err) {
        toast(err, 'bad');
        audio.play('bad');
      } else {
        if (canRotate(moving.type)) moving.flipped = app.view.flip;
        audio.play('build');
        selectBuild(null);
      }
    } else if (app.view.build) {
      const draggable = app.view.build === 'deck' || app.view.build === 'foam';
      if (draggable) placeRect(start.x, start.y, t.x, t.y);
      else {
        const err = placeObject(app.state, app.view.build, t.x, t.y, app.view.flip);
        if (err) {
          toast(err, 'bad');
          audio.play('bad');
        } else {
          audio.play('build');
          if (BUILD[app.view.build].unique && !e.shiftKey) selectBuild(null);
        }
      }
    } else if (app.view.demolish) {
      let removed = 0;
      for (let y = Math.min(start.y, t.y); y <= Math.max(start.y, t.y); y++)
        for (let x = Math.min(start.x, t.x); x <= Math.max(start.x, t.x); x++) {
          if (!inBounds(x, y)) continue;
          if (!demolishAt(app.state, x, y)) removed++;
        }
      if (removed) audio.play('demolish');
    }
    refresh();
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (!app.renderer) return;
      app.renderer.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
      app.renderer.clampCamera();
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    keys.add(e.key.toLowerCase());
    if (app.screen !== 'game' || !app.state) return;
    audio.start();
    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        app.view.layer = app.view.layer === 0 ? 1 : 0;
        audio.play('climb');
        break;
      case ' ':
        e.preventDefault();
        app.paused = !app.paused;
        break;
      case '1':
      case '2':
      case '3':
        app.speed = SPEEDS[Number(e.key) - 1];
        app.paused = false;
        break;
      case 'Escape':
        if (app.view.build || app.view.demolish) selectBuild(null);
        else if (app.view.selectedCrew !== null || app.selectedObj !== null) {
          app.view.selectedCrew = null;
          selectObject(null);
        } else app.menu = app.menu === 'none' ? 'pause' : 'none';
        break;
      case 'b':
      case 'B':
        app.buildOpen = !app.buildOpen;
        break;
      case 'x':
      case 'X':
        app.view.build = null;
        app.view.demolish = !app.view.demolish;
        if (app.view.demolish) app.view.layer = 1;
        break;
      case 'o':
      case 'O': {
        const order = ['none', 'noise', 'smell', 'power'] as const;
        app.view.overlay = order[(order.indexOf(app.view.overlay) + 1) % order.length];
        if (app.view.overlay === 'power') app.view.layer = 1;
        break;
      }
      case 'Alt':
        e.preventDefault();
        app.view.xray = true;
        break;
      case 'f':
      case 'F': {
        const c = app.state.crew.find((x) => x.id === app.view.selectedCrew);
        if (c) {
          app.view.layer = c.layer;
          app.renderer!.centerOn(c.x, c.y);
        }
        break;
      }
      case 'r':
      case 'R': {
        const obj = app.state.objects.find((o) => o.id === app.selectedObj);
        if (app.view.build) app.view.flip = !app.view.flip;
        else if (obj) rotateObject(obj);
        break;
      }
      case 'j':
      case 'J':
        if (app.menu === 'jobs') app.menu = 'none';
        else if (app.menu === 'none') openJobs(app.view.selectedCrew ?? app.crewExpanded, shiftNow(app.state) ?? undefined);
        break;
      case 'h':
      case 'H':
        app.renderer!.centerOn(LAYOUT.hatch.x + 0.5, LAYOUT.hatch.y + 0.5);
        break;
      case 'g':
      case 'G':
        allHome(app.state);
        break;
      case 'm':
      case 'M': {
        const obj = app.state.objects.find((o) => o.id === app.selectedObj);
        if (obj && !BUILD[obj.type].floor) startMove(obj);
        break;
      }
    }
    refresh();
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.key === 'Alt') {
      app.view.xray = false;
      refresh();
    }
  });
  window.addEventListener('blur', () => {
    keys.clear();
    app.view.xray = false;
  });
}

export function updateKeyboardPan(dt: number) {
  const r = app.renderer;
  if (!r || app.screen !== 'game') return;
  const speed = 700 * dt;
  let dx = 0;
  let dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy += speed;
  if (keys.has('s') || keys.has('arrowdown')) dy -= speed;
  if (keys.has('a') || keys.has('arrowleft')) dx += speed;
  if (keys.has('d') || keys.has('arrowright')) dx -= speed;
  if (dx || dy) {
    r.cam.x += dx;
    r.cam.y += dy;
    r.clampCamera();
  }
}
