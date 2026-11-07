import { useEffect, useState } from 'preact/hooks';
import { app, refresh, subscribe } from '../app';
import { audio } from '../audio/audio';
import { clearSave, hasSave, loadGame, newGame, saveGame } from '../game/create';
import { PLAYER_BODIES } from '../game/defs';
import { ACHIEVEMENTS } from '../game/ops';
import type { Difficulty, GameState } from '../game/state';
import { LAYOUT } from '../game/layout';
import { Icon } from './icons';
import { Portrait } from './widgets';
import { JobsMenu } from './jobs';
import { BottomBar, BuildPanel, CrewPanel, GameOver, InspectionPanel, LevelUpBanner, LogPanel, ModalView, ObjectiveCard, SelectedObject, Toasts, Tooltip, TopBar } from './hud';

export function startGame(s: GameState) {
  app.state = s;
  app.levelUp = null;
  app.screen = 'game';
  app.menu = 'none';
  app.paused = false;
  app.speed = 1;
  app.view.layer = 1;
  app.view.build = null;
  app.view.demolish = false;
  app.view.selectedCrew = s.crew[0]?.id ?? null;
  app.crewExpanded = s.crew[0]?.id ?? null;
  app.renderer!.cam.zoom = 1.25;
  app.renderer!.centerOn(LAYOUT.hatch.x + 4, LAYOUT.hatch.y + 3);
  refresh();
}

function quitToTitle() {
  if (app.state && !app.state.over) saveGame(app.state);
  app.screen = 'title';
  app.state = null;
  app.menu = 'none';
  refresh();
}

export function App() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const un = subscribe(() => setTick((t) => t + 1));
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => {
      un();
      clearInterval(id);
    };
  }, []);

  if (app.screen === 'title') return <Title />;
  const s = app.state!;
  return (
    <div class="hud">
      <TopBar s={s} />
      <div class="center-stack">
        <ObjectiveCard s={s} />
        <InspectionPanel s={s} />
        {app.paused && !s.modals.length && app.menu === 'none' && (
          <div class="paused-banner">
            PAUSED<kbd>Space</kbd>
          </div>
        )}
      </div>
      <BuildPanel s={s} />
      <CrewPanel s={s} />
      <LogPanel s={s} />
      <BottomBar s={s} />
      <SelectedObject s={s} />
      {!app.view.dragStart && app.menu === 'none' && !s.modals.length && <Tooltip s={s} />}
      <Toasts />
      <LevelUpBanner />
      {!s.over && <ModalView s={s} />}
      {s.over && (
        <GameOver
          s={s}
          onMenu={() => {
            clearSave();
            quitToTitle();
          }}
          onNew={() => {
            clearSave();
            app.state = null;
            app.screen = 'title';
            app.menu = 'newgame';
            refresh();
          }}
        />
      )}
      {app.menu === 'pause' && <PauseMenu s={s} />}
      {app.menu === 'settings' && <Settings />}
      {app.menu === 'help' && <Help />}
      {app.menu === 'jobs' && <JobsMenu s={s} />}
    </div>
  );
}

function Title() {
  const save = hasSave();
  return (
    <div class="title-screen">
      <div class="vapor-grid" />
      <div class="title-card">
        <div class="title-sub">NORTHGATE MALL · FALL 2004</div>
        <h1 class="title-logo">
          MALL
          <br />
          BATS
        </h1>
        <div class="title-tag">A mall squatter tycoon. Build a kingdom in the ceiling. Come out at night. Don't get caught.</div>
        <div class="title-buttons">
          {save && (
            <button
              class="btn big"
              onClick={() => {
                audio.start();
                const s = loadGame();
                if (s) startGame(s);
              }}
            >
              Continue
            </button>
          )}
          <button
            class="btn big"
            onClick={() => {
              audio.start();
              app.menu = 'newgame';
              refresh();
            }}
          >
            New Game
          </button>
          <button class="btn big" onClick={() => ((app.menu = 'help'), refresh())}>
            How to Play
          </button>
          <button class="btn big" onClick={() => ((app.menu = 'settings'), refresh())}>
            Settings
          </button>
          {window.desktop && (
            <button class="btn big" onClick={() => window.desktop!.quit()}>
              Quit
            </button>
          )}
        </div>
        <div class="title-foot">♪ now playing: muzak_final_FINAL(2).mid</div>
      </div>
      {app.menu === 'newgame' && <NewGame />}
      {app.menu === 'settings' && <Settings />}
      {app.menu === 'help' && <Help />}
    </div>
  );
}

type PlayerBody = (typeof PLAYER_BODIES)[number];

function NewGame() {
  const [body, setBody] = useState<PlayerBody>(PLAYER_BODIES[0]);
  const [name, setName] = useState<string>(body.name);
  const [diff, setDiff] = useState<Difficulty>('normal');
  const pickBody = (next: PlayerBody) => {
    if (PLAYER_BODIES.some((b) => b.name === name.trim())) setName(next.name);
    setBody(next);
  };
  const diffs: { id: Difficulty; name: string; desc: string }[] = [
    { id: 'easy', name: 'Window Shopper', desc: 'Lazier guards, cheaper auction, forgiving suspicion.' },
    { id: 'normal', name: 'Squatter', desc: 'The intended experience.' },
    { id: 'hard', name: 'Dead Mall', desc: 'Sharp-eyed guards, stingy power bills, a hungry developer.' },
  ];
  return (
    <div class="modal-wrap">
      <div class="modal panel newgame">
        <h2>Who are you?</h2>
        <div class="who">
          <div class="bodies">
            {PLAYER_BODIES.map((b) => (
              <button class={`body ${body.id === b.id ? 'on' : ''}`} onClick={() => pickBody(b)} title={b.name}>
                <Portrait sprite={b.sprite} size={58} bg={body.id === b.id ? '#8a2a6a' : '#2a1d3a'} />
              </button>
            ))}
          </div>
          <label class="field">
            <span>Your name</span>
            <input value={name} maxLength={14} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          </label>
        </div>
        <div class="diffs">
          {diffs.map((d) => (
            <button class={`diff ${diff === d.id ? 'on' : ''}`} onClick={() => setDiff(d.id)}>
              <b>{d.name}</b>
              <small>{d.desc}</small>
            </button>
          ))}
        </div>
        <div class="modal-choices">
          <button
            class="btn big"
            onClick={() => {
              clearSave();
              startGame(newGame({ name: name.trim() || body.name, sprite: body.sprite }, diff));
            }}
          >
            Find the ladder
          </button>
          <button class="btn big" onClick={() => ((app.menu = 'none'), refresh())}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function PauseMenu({ s }: { s: GameState }) {
  return (
    <div class="modal-wrap">
      <div class="modal panel pause">
        <h2>Paused</h2>
        <div class="title-buttons">
          <button class="btn big" onClick={() => ((app.menu = 'none'), refresh())}>
            Resume
          </button>
          <button
            class="btn big"
            onClick={() => {
              saveGame(s);
              app.menu = 'none';
              app.toasts.push({ id: Date.now(), text: 'Game saved', tone: 'good', until: performance.now() + 2000 });
              refresh();
            }}
          >
            Save
          </button>
          <button class="btn big" onClick={() => ((app.menu = 'help'), refresh())}>
            How to Play
          </button>
          <button class="btn big" onClick={() => ((app.menu = 'settings'), refresh())}>
            Settings
          </button>
          <button class="btn big" onClick={quitToTitle}>
            Save & Quit to Title
          </button>
          {window.desktop && (
            <button
              class="btn big"
              onClick={() => {
                saveGame(s);
                window.desktop!.quit();
              }}
            >
              Save & Quit Game
            </button>
          )}
        </div>
        {s.achievements.length > 0 && (
          <div class="achievements">
            {Object.entries(ACHIEVEMENTS).map(([id, a]) => (
              <i class={s.achievements.includes(id) ? '' : 'locked'} title={a.desc}>
                <Icon name="trophy" size={16} /> {a.name}
              </i>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Settings() {
  const v = audio.volume;
  const slider = (label: string, key: keyof typeof v) => (
    <label class="field">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={v[key]}
        onInput={(e) => {
          v[key] = Number((e.target as HTMLInputElement).value);
          audio.applyVolume();
          localStorage.setItem('dropceiling.audio', JSON.stringify(v));
          refresh();
        }}
      />
    </label>
  );
  return (
    <div class="modal-wrap">
      <div class="modal panel settings">
        <h2>Settings</h2>
        {slider('Master volume', 'master')}
        {slider('Muzak', 'music')}
        {slider('Sound effects', 'sfx')}
        <label class="field check">
          <input
            type="checkbox"
            checked={app.autoPause}
            onChange={(e) => {
              app.autoPause = (e.target as HTMLInputElement).checked;
              localStorage.setItem('dropceiling.autopause', app.autoPause ? '1' : '0');
              refresh();
            }}
          />
          <span>Auto-pause when an inspection is scheduled</span>
        </label>
        {window.desktop && (
          <button class="btn" onClick={() => window.desktop!.toggleFullscreen()}>
            Toggle fullscreen
          </button>
        )}
        <div class="modal-choices">
          <button class="btn big" onClick={() => ((app.menu = app.screen === 'game' ? 'pause' : 'none'), refresh())}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Help() {
  return (
    <div class="modal-wrap">
      <div class="modal panel help">
        <h2>How to Squat a Mall</h2>
        <div class="help-grid">
          <section>
            <h4>
              <Icon name="art.intro" /> The Ceiling
            </h4>
            <p>
              Your kingdom lives above the drop ceiling. Lay <b>plywood</b> out from the hatch in the Service Corridor, then move in. <b>Tab</b> flips between the ceiling and the mall.
            </p>
          </section>
          <section>
            <h4>
              <Icon name="leisure" /> What's Below Matters
            </h4>
            <p>
              Every store below hides some noise and some smell. A TV over Galaxy is fine. A TV over Coles is not. The <b>Noise</b> and <b>Smell</b> maps show what's leaking.
            </p>
          </section>
          <section>
            <h4>
              <Icon name="art.gary" /> Inspections
            </h4>
            <p>
              Stores that hear or smell too much report you, and inspectors come up to look. The red zone shows where. Move things out, or give them a reason to leave early.
            </p>
          </section>
          <section>
            <h4>
              <Icon name="food" /> Food & Mood
            </h4>
            <p>
              The Bats eat together at <b>8 AM and 8 PM</b>. <b>Mood</b> is shared: comfort, beds and hot meals keep it up, and happy Bats work faster. Stay miserable and someone leaves.
            </p>
          </section>
          <section>
            <h4>
              <Icon name="rank" /> Levels
            </h4>
            <p>
              The more the Bats bring home, the further the crew goes. Each level opens something new. Click the level meter to peek ahead.
            </p>
          </section>
          <section>
            <h4>
              <Icon name="sets" /> Furniture Sets
            </h4>
            <p>
              Some furniture is better together. Check the <b>Sets</b> tab for the recipes.
            </p>
          </section>
          <section>
            <h4>
              <Icon name="mall" /> Mall Floor
            </h4>
            <p>
              Some <b>Hide</b> gear goes on the mall floor. Pick a spot and a Bat runs it down when they're free, with all the usual risk.
            </p>
          </section>
          <section>
            <h4>
              <Icon name="power" /> Power Bills
            </h4>
            <p>
              Splices steal power from the store below, and that store pays the bill. Bills get reviewed every Monday. Don't get greedy.
            </p>
          </section>
          <section>
            <h4>
              <Icon name="work" /> Jobs
            </h4>
            <p>
              Open the <b>Job Board</b> (J) and give each Bat a <b>Day</b> and a <b>Night</b> job. Night pays better, but Gary is out there, and <b>All home</b> (G) pulls everyone back up. Each Bat carries <b>Heat</b>: get spotted and Officer Dana starts paying attention. A day at home cools it.
            </p>
          </section>
          <section>
            <h4>
              <Icon name="alert" /> Suspicion
            </h4>
            <p>
              <b>Suspicion</b> is how sure the mall is that someone lives upstairs. It brings more guards, more cameras and more inspections. It cools off on quiet nights. At <b>100%</b>, the Bats are evicted.
            </p>
          </section>
          <section>
            <h4>
              <Icon name="cash" /> The Goal
            </h4>
            <p>
              Northgate Mall goes to auction on <b>Dec 31, 2004</b>. Have more <b>cash</b> than the developer bids. As stores close, the mall dies and the bid drops.
            </p>
          </section>
          <section>
            <h4>Controls</h4>
            <p>Right-drag or WASD to pan · Wheel to zoom · Space to pause · 1/2/3 for speed · B Build · X Remove · M Move · G All home · O cycle overlays · Alt for x-ray · H go to the hatch · Esc for the menu</p>
          </section>
        </div>
        <div class="modal-choices">
          <button class="btn big" onClick={() => ((app.menu = app.screen === 'game' ? 'pause' : 'none'), refresh())}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
