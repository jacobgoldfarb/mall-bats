import { moodStatBonus } from '../game/needs';
import { useState } from 'preact/hooks';
import { app, refresh } from '../app';
import { audio } from '../audio/audio';
import { currentJob, jobBlocked, shiftNow } from '../game/crew';
import { JOB, JOBS, type JobDef, type JobId } from '../game/defs';
import { jobEstimate } from '../game/jobs';
import { levelOf } from '../game/ops';
import type { Crew, GameState } from '../game/state';
import { CLOSING_SPAN, dayOf, formatClock, mallHours, md } from '../game/time';
import { crewSprite } from '../render/renderer';
import { Bar, Dots, Portrait } from './widgets';

type Shift = 'day' | 'night';

const RISK_TEXT: Record<JobDef['risk'], string> = { none: 'Safe', low: 'Low risk', medium: 'Medium risk', high: 'High risk' };
const STAT_COLOR = { stealth: '#5ccfc2', charm: '#ff6db3', handy: '#ffc93e' };
const STATS = ['stealth', 'charm', 'handy'] as const;

let draggedCrew: number | null = null;

let dragGhost: HTMLCanvasElement | null = null;

// Chrome snapshots drag images without the #ui zoom, so the ghost has to live outside it.
function startDrag(e: DragEvent, c: Crew) {
  draggedCrew = c.id;
  e.dataTransfer!.setData('text/plain', String(c.id));
  const portrait = (e.currentTarget as HTMLElement).querySelector('canvas')!;
  if (!dragGhost) {
    dragGhost = document.createElement('canvas');
    dragGhost.style.cssText = 'position:fixed;left:-1000px;top:0;pointer-events:none';
    document.body.appendChild(dragGhost);
  }
  const size = portrait.clientWidth * app.uiScale;
  dragGhost.width = portrait.width;
  dragGhost.height = portrait.height;
  dragGhost.style.width = dragGhost.style.height = `${size}px`;
  dragGhost.getContext('2d')!.drawImage(portrait, 0, 0);
  e.dataTransfer!.setDragImage(dragGhost, size / 2, size / 2);
}

const jobOf = (c: Crew, shift: Shift) => (shift === 'day' ? c.dayJob : c.nightJob);

function setJob(c: Crew, shift: Shift, job: JobId) {
  if (shift === 'day') c.dayJob = job;
  else c.nightJob = job;
  c.jobCooldown = {};
  audio.play('click');
  refresh();
}

const SEASONAL_LEAD_DAYS = 3;

function onTheBoard(s: GameState, def: JobDef): boolean {
  if (!def.only) return true;
  const today = dayOf(s.time);
  for (let k = 0; k <= SEASONAL_LEAD_DAYS; k++) {
    const [m, d] = md(today + k);
    if (m === def.only[0] && d === def.only[1]) return true;
  }
  return false;
}

export function openJobs(crewId: number | null, shift?: Shift) {
  app.jobsCrew = crewId;
  if (shift) app.jobsShift = shift;
  app.menu = 'jobs';
  refresh();
}

function shiftHours(s: GameState, shift: Shift): string {
  const hours = mallHours(dayOf(s.time));
  if (!hours) return 'Mall closed today: night rules all day';
  return shift === 'day' ? `While the mall is open · ${formatClock(hours.open)}–${formatClock(hours.close)}` : `After closing · ${formatClock(hours.close + CLOSING_SPAN)}–6:00 AM`;
}

function shiftJobs(s: GameState, shift: Shift): JobDef[] {
  return JOBS.filter((j) => j.id !== 'rest' && (j.shift === shift || j.shift === 'both') && onTheBoard(s, j));
}

export function JobsMenu({ s }: { s: GameState }) {
  const crew = s.crew.filter((c) => c.state !== 'away');
  const selected = crew.find((x) => x.id === app.jobsCrew) ?? null;
  const shift = app.jobsShift;
  const level = levelOf(s);
  const jobs = shiftJobs(s, shift);
  const open = jobs.filter((j) => level >= j.level);
  const locked = jobs.filter((j) => level < j.level);
  const close = () => ((app.menu = 'none'), (draggedCrew = null), refresh());
  return (
    <div class="modal-wrap" onClick={close}>
      <div class={`modal panel jobs-menu shift-${shift}`} onClick={(e) => e.stopPropagation()}>
        <div class="jobs-title">
          <h2>Job Board</h2>
          <div class="shift-tabs">
            {(['day', 'night'] as const).map((sh) => (
              <button class={`shift-tab ${sh} ${shift === sh ? 'on' : ''}`} onClick={() => ((app.jobsShift = sh), audio.play('click'), refresh())}>
                <b>{sh === 'day' ? 'Day shift' : 'Night shift'}</b>
                <small>{shiftHours(s, sh)}</small>
              </button>
            ))}
          </div>
          <button class="btn small ghost" onClick={close}>
            Done<kbd>J</kbd>
          </button>
        </div>
        <p class="jobs-explain">
          <b>Drag a Bat onto a job.</b>
        </p>
        <CrewTray s={s} crew={crew} selected={selected} shift={shift} />
        <div class="staff-grid">
          {open.map((def) => (
            <StaffCard s={s} def={def} crew={crew} selected={selected} shift={shift} />
          ))}
        </div>
        {locked.length > 0 && (
          <div class="locked-row">
            {locked.map((def) => (
              <span title={def.desc}>
                {def.name} <i>· LV {def.level}</i>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CrewTray({ s, crew, selected, shift }: { s: GameState; crew: Crew[]; selected: Crew | null; shift: Shift }) {
  const resting = crew.filter((c) => jobOf(c, shift) === 'rest').length;
  return (
    <div class="crew-tray">
      <div class="tray-head">
        <span class="tray-label">{resting ? `THE BATS · ${resting} RESTING` : 'THE BATS'}</span>
        <button class="btn small" disabled={!selected || jobOf(selected, shift) === 'rest'} onClick={() => selected && setJob(selected, shift, 'rest')} title={selected ? `Take ${selected.name} off this shift` : 'Select a Bat'}>
          Rest{selected ? ` ${selected.name}` : ''}
        </button>
        <button class="btn small" disabled={resting === crew.length} onClick={() => crew.forEach((c) => setJob(c, shift, 'rest'))}>
          Rest All
        </button>
      </div>
      <div class="tray-chips">
        {crew.map((c) => {
          const job = jobOf(c, shift);
          const live = shiftNow(s) === shift ? currentJob(s, c) : null;
          return (
            <div
              class={`bat-chip ${selected === c ? 'on' : ''} ${job === 'rest' ? 'idle' : ''}`}
              draggable
              onDragStart={(e) => startDrag(e, c)}
              onDragEnd={() => ((draggedCrew = null), refresh())}
              onClick={() => ((app.jobsCrew = selected === c ? null : c.id), audio.play('click'), refresh())}
            >
              <Portrait look={c.look} sprite={crewSprite(c.archetype)} size={32} bg={c.layer === 0 ? '#3a1a2a' : '#1a2040'} />
              <div class="chip-body">
                <b>{c.name}</b>
                <small>
                  {JOB[job].name}
                  {live && live !== job && live !== 'rest' && <span class="now"> → {JOB[live].name}</span>}
                </small>
                <div class="chip-stats">
                  {STATS.map((st) => (
                    <span title={st}>
                      {st[0].toUpperCase()}
                      <Dots n={c[st]} color={STAT_COLOR[st]} bonus={moodStatBonus(s, c, st)} />
                    </span>
                  ))}
                </div>
                <Bar value={c.energy} color={c.energy < 25 ? '#ec5b3c' : '#5ccfc2'} title={`Energy ${Math.round(c.energy)}`} />
                <Bar value={c.heat} color="#ff2d55" title={`Heat ${Math.round(c.heat)}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StaffCard({ s, def, crew, selected, shift }: { s: GameState; def: JobDef; crew: Crew[]; selected: Crew | null; shift: Shift }) {
  const [over, setOver] = useState(false);
  const staff = crew.filter((c) => jobOf(c, shift) === def.id);
  const preview = selected ?? staff[0] ?? crew[0];
  const e = preview ? jobEstimate(s, preview, def.id) : null;
  const blocked = preview ? jobBlocked(s, preview, def.id) : null;
  const canAdd = selected && jobOf(selected, shift) !== def.id;
  return (
    <div
      class={`staff-card risk-${def.risk} ${over ? 'over' : ''} ${blocked ? 'blocked' : ''} ${canAdd ? 'can-add' : ''} ${selected && staff.some((c) => c.id === selected.id) ? 'has-pick' : ''}`}
      onDragOver={(ev) => (ev.preventDefault(), over || setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(ev) => {
        ev.preventDefault();
        setOver(false);
        const c = crew.find((x) => x.id === draggedCrew);
        if (c) setJob(c, shift, def.id);
        draggedCrew = null;
      }}
      onClick={() => selected && canAdd && setJob(selected, shift, def.id)}
      title={def.desc}
    >
      <div class="jc-head">
        <b>{def.name}</b>
        <i class={`risk ${def.risk}`}>{RISK_TEXT[def.risk]}</i>
      </div>
      {preview && e && (
        <div class="jc-yield">
          {e.yields}
          {selected && <small> with {selected.name}</small>}
        </div>
      )}
      <div class="jc-meta">
        <span>
          USES {def.stat.toUpperCase()} {preview && <Dots n={preview[def.stat]} color={STAT_COLOR[def.stat]} />}
        </span>
      </div>
      {e?.limit && <div class="jc-limit">{e.limit}</div>}
      {blocked && <div class="jc-blocked">Right now: {blocked}</div>}
      <div class="slots">
        {staff.map((c) => (
          <button
            class={`slot-chip ${selected?.id === c.id ? 'on' : ''}`}
            draggable
            onDragStart={(ev) => (ev.stopPropagation(), startDrag(ev, c))}
            onDragEnd={() => ((draggedCrew = null), refresh())}
            onClick={(ev) => (ev.stopPropagation(), setJob(c, shift, 'rest'))}
            title={`Click to send ${c.name} back to rest.`}
          >
            <Portrait look={c.look} sprite={crewSprite(c.archetype)} size={22} />
            <span>{c.name}</span>
          </button>
        ))}
        {staff.length === 0 && <span class="slot-empty">{selected ? `Click to assign ${selected.name}` : 'Drop a Bat here'}</span>}
        {staff.length > 0 && canAdd && <span class="slot-empty">+ {selected!.name}</span>}
      </div>
    </div>
  );
}
