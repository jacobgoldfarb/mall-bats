import { app, focusTile, refresh, selectBuild, selectObject, startMove, SPEEDS, toast } from '../app';
import { audio } from '../audio/audio';
import { assignedJob, callAllHome, callOff, currentJob, jobUnavailable, shiftKey, shiftNow } from '../game/crew';
import {
  SUSPICION_LEVELS,
  BUILD,
  BUILDS,
  COSTUMES,
  JOB,
  KIOSK_LEVEL,
  LEVELS,
  MAX_LEVEL,
  NOOKS,
  NOOK_RADIUS,
  nooksUsing,
  POPUP_LEVEL,
  TRAITS,
  levelInfo,
  unlocksAt,
  canRotate,
  type BuildCategory,
} from '../game/defs';
import { resolveModal, showVisitor } from '../game/events';
import { INSPECTORS, coverInspection, forecastInspection, forecastLabel, garyCanCover, signUsesLeft, type InspectionForecast } from '../game/inspect';
import { LAYOUT, C_DUCT, C_AC, C_SKYLIGHT, C_NONE, idx, inBounds } from '../game/layout';
import { FOOD_PRICE, LOW_MOOD, MEAL_HOURS, mealNeed, moodStatBonus, moodTarget } from '../game/needs';
import { feedBlocked, feedTamagotchi } from '../game/npc';
import { OBJECTIVES, objectiveProgress } from '../game/objectives';
import { ACHIEVEMENTS, suspicionDecay, suspicionLevel, auctionBid, levelOf } from '../game/ops';
import { KIOSK_COST, POPUP_COST, POPUP_RENT, buildCost, buyFood, clearJam, demolishAt, leaseKiosk, noiseField, openPopup, popupName, popupWalkIns, powerCap, rotateObject } from '../game/sim';
import type { Crew, GameState, Inspection, Placed } from '../game/state';
import { AUCTION_DAY, dayOf, formatClock, formatDate, morningOf, phaseAt, phaseLabel } from '../game/time';
import { getDerived } from '../game/world';
import { crewSprite } from '../render/renderer';
import { Icon } from './icons';
import { Delta } from './delta';
import { openJobs } from './jobs';
import { Bar, BuildIcon, Dots, Portrait } from './widgets';
import { peakHeat, rampGradient, type HeatKind } from '../render/heat';

const money = (n: number) => `$${Math.floor(n).toLocaleString()}`;

export function TopBar({ s }: { s: GameState }) {
  const day = dayOf(s.time);
  const phase = phaseAt(s.time);
  const d = getDerived(s);
  const level = levelOf(s);
  const lvl = suspicionLevel(s.suspicion);
  const bid = auctionBid(s);
  const daysLeft = AUCTION_DAY - day;
  const gap = s.cash - bid;
  return (
    <div class="topbar panel">
      <div class="logo" onClick={() => ((app.menu = 'pause'), refresh())}>
        MALL<span>BATS</span>
      </div>
      <div class="clock">
        <div class="clock-top">
          <span class="date">{formatDate(day)}</span>
          <span class={`phase phase-${phase}`}>{phaseLabel(phase, day)}</span>
        </div>
        <div class="time">{formatClock(s.time)}</div>
      </div>
      <div class="speeds">
        <button class={`btn ${app.paused ? 'on' : 'ghost'}`} onClick={() => ((app.paused = !app.paused), refresh())} title="Pause (Space)">
          <i class="glyph-pause" />
        </button>
        {SPEEDS.map((sp, i) => (
          <button class={`btn ${!app.paused && app.speed === sp ? 'on' : 'ghost'}`} onClick={() => ((app.speed = sp), (app.paused = false), refresh())} title={`Speed ${sp}x (${i + 1})`}>
            {SPEEDS.slice(0, i + 1).map(() => (
              <i class="glyph-play" />
            ))}
          </button>
        ))}
      </div>
      <div class="divider" />
      <div class="stats">
        <div class="stat cash" title="Beat the developer's bid on Dec 31.">
          <Icon name="cash" />
          <div>
            <b>{money(s.cash)}</b>
            <Delta value={s.cash} scope={s} format={money} />
            <small>{s.todayIncome > 0 ? `+${money(s.todayIncome)} TODAY` : 'CASH'}</small>
          </div>
        </div>
        <FoodStat s={s} cap={d.foodCap} fridge={!!d.fridge} />
        <Resource scope={s} icon="parts" label="Parts" value={s.parts} cap={d.partsCap} title="Gear is built from these. Spares become goods at a Workbench." />
        <Resource scope={s} icon="goods" label="Goods" value={s.goods} cap={d.goodsCap} title="Sears Returns pays cash for these, no receipt needed." />
        <MoodStat s={s} />
      </div>
      <div class="divider" />
      <LevelMeter s={s} level={level} />
      <div class={`meter alert lvl${lvl}`} title={suspicionTitle(lvl)}>
        <Icon name="alert" />
        <div style={{ flex: 1 }}>
          <div class="meter-head">
            <span class="label">SUSPICION</span>
            <b>
              {SUSPICION_LEVELS[lvl].name} {Math.round(s.suspicion)}%
            </b>
          </div>
          <div class="alert-track">
            {SUSPICION_LEVELS.slice(1).map((l) => (
              <i style={{ left: `${l.at}%` }} />
            ))}
            <div class="alert-fill" style={{ width: `${s.suspicion}%` }} />
          </div>
          <span class="label">
            COOLS −{Math.round(suspicionDecay(s, !s.spottedTonight))}/DAY{s.spottedTonight ? ' · SPOTTED TONIGHT' : ''}
          </span>
        </div>
      </div>
      <div class="meter auction" title="Auction at noon, New Year's Eve. Every store that closes lowers the bid.">
        <Icon name="auction" />
        <div>
          <span class="label">{s.flags.auctionKnown ? `AUCTION · ${daysLeft > 0 ? `${daysLeft} DAYS` : 'TODAY'}` : 'RUMOR · DEC 31'}</span>
          <div class="meter-head">
            <b>{money(bid)}</b>
          </div>
          <span class={`verdict ${gap > 0 ? 'ahead' : ''}`}>{gap > 0 ? `AHEAD BY ${money(gap)}` : `SHORT ${money(-gap)}`}</span>
        </div>
      </div>
      <button class="btn small ghost menu-btn" onClick={() => ((app.menu = 'pause'), refresh())} title="Menu (Esc)">
        Menu<kbd>Esc</kbd>
      </button>
    </div>
  );
}

function LevelMeter({ s, level }: { s: GameState; level: number }) {
  const here = levelInfo(level);
  const next = level < MAX_LEVEL ? levelInfo(level + 1) : null;
  return (
    <div class="meter rank" onClick={() => ((app.levelsOpen = !app.levelsOpen), refresh())} title="See what's coming.">
      <Icon name="rank" />
      <div style={{ flex: 1 }}>
        <div class="meter-head">
          <span class="label">LV {level}</span>
          <b>{here.title}</b>
        </div>
        {next ? <Bar value={((s.totalEarned - here.earned) / (next.earned - here.earned)) * 100} color="#dc348c" /> : <span class="label">MAX LEVEL</span>}
        {next && (
          <span class="label">
            NEXT · {next.theme.toUpperCase()} · {money(next.earned - s.totalEarned)}
          </span>
        )}
      </div>
      {app.levelsOpen && <LevelList s={s} level={level} />}
    </div>
  );
}

function LevelList({ s, level }: { s: GameState; level: number }) {
  return (
    <div class="level-list panel" onClick={(e) => e.stopPropagation()}>
      {LEVELS.map((l, i) => {
        const n = i + 1;
        return (
          <div class={`level-row ${n <= level ? 'done' : ''} ${n === level + 1 ? 'next' : ''}`}>
            <b>
              LV {n} · {l.title}
            </b>
            <span class="level-earned">{n <= level ? '✓' : money(l.earned - s.totalEarned)}</span>
            <i>{l.theme}</i>
            <small>{unlocksAt(n).join(' · ')}</small>
          </div>
        );
      })}
    </div>
  );
}

function suspicionTitle(lvl: number): string {
  return [`${SUSPICION_LEVELS[lvl].name}: ${SUSPICION_LEVELS[lvl].desc}`, 'Lie low and it fades. At 100%, the Bats are evicted.'].join('\n');
}

function FoodStat({ s, cap, fridge }: { s: GameState; cap: number; fridge: boolean }) {
  const hungry = s.missedMeals > 0;
  const appetite = mealNeed(s) * MEAL_HOURS.length;
  const title = [`${mealNeed(s)} portions at 8 AM and 8 PM.`, fridge ? '' : 'Spoils without a fridge.'].filter(Boolean).join('\n');
  return (
    <div class={`stat food ${hungry ? 'empty' : s.food >= cap ? 'full' : ''}`} title={`${title}\nClick to stock up.`} onClick={() => ((app.buildOpen = true), (app.buildCategory = 'food'), refresh())}>
      <Icon name="food" />
      <div>
        <b>{Math.floor(s.food)}</b>
        <Delta value={s.food} scope={s} />
        <small>{hungry ? 'HUNGRY' : `-${appetite} / DAY`}</small>
      </div>
    </div>
  );
}

function MoodStat({ s }: { s: GameState }) {
  const target = moodTarget(s);
  const low = s.mood < LOW_MOOD;
  const title = [
    'Happy Bats work faster. Miserable ones quit.',
    'Comfort, beds and hot meals keep it up.',
    ...getDerived(s).nooks.map((n) => `${n.def.name}: ${n.def.bonus}`),
  ].join('\n');
  return (
    <div class={`stat ${low ? 'empty' : ''}`} title={title}>
      <Icon name="leisure" />
      <div>
        <b>{Math.round(s.mood)}</b>
        <Delta value={Math.round(s.mood)} scope={s} min={2} />
        <small>MOOD {target > s.mood + 2 ? '▲' : target < s.mood - 2 ? '▼' : ''}</small>
      </div>
    </div>
  );
}

function Resource({ icon, label, value, cap, title, vital, scope }: { icon: string; label: string; value: number; cap: number; title: string; vital?: boolean; scope: object }) {
  const state = value >= cap ? 'full' : vital && value <= 0 ? 'empty' : '';
  return (
    <div class={`stat ${state}`} title={title}>
      <Icon name={icon} />
      <div>
        <b>{Math.floor(value)}</b>
        <Delta value={value} scope={scope} />
        <small>
          {state === 'full' ? 'FULL' : label.toUpperCase()} /{cap}
        </small>
      </div>
    </div>
  );
}

const CATS: { id: BuildCategory | 'sets'; label: string; short: string }[] = [
  { id: 'structure', label: 'Structure and power', short: 'Base' },
  { id: 'living', label: 'Home', short: 'Home' },
  { id: 'food', label: 'Food', short: 'Food' },
  { id: 'stealth', label: 'Stealth', short: 'Hide' },
  { id: 'work', label: 'Work and business', short: 'Work' },
  { id: 'sets', label: 'Furniture sets', short: 'Sets' },
];

export function BuildPanel({ s }: { s: GameState }) {
  const level = levelOf(s);
  if (!app.buildOpen) {
    return (
      <div class="buildpanel panel collapsed">
        <button class="btn" onClick={() => ((app.buildOpen = true), refresh())} title="Open build menu (B)">
          <Icon name="structure" size={16} /> Build<kbd>B</kbd>
        </button>
      </div>
    );
  }
  const items = BUILDS.filter((b) => b.category === app.buildCategory && !b.gift).sort((a, b) => a.level - b.level);
  return (
    <div class="buildpanel panel">
      <div class="panel-head">
        <span>
          Build <kbd>B</kbd>
        </span>
        <div class="tools">
          <button
            class={`btn small ${app.view.demolish ? 'danger' : 'ghost'}`}
            onClick={() => ((app.view.demolish = !app.view.demolish), (app.view.build = null), (app.view.layer = 1), refresh())}
            title="Demolish (X): 60% refund"
          >
            Remove<kbd>X</kbd>
          </button>
          <button class="btn small ghost icon-btn" onClick={() => ((app.buildOpen = false), refresh())} title="Collapse (B)">
            –
          </button>
        </div>
      </div>
      <div class="cats">
        {CATS.map((c) => (
          <button class={`cat ${app.buildCategory === c.id ? 'on' : ''}`} onClick={() => ((app.buildCategory = c.id), audio.play('click'), refresh())} title={c.label}>
            <Icon name={c.id} />
            <small>{c.short}</small>
          </button>
        ))}
      </div>
      {app.buildCategory === 'sets' ? (
        <SetsPanel s={s} />
      ) : (
        <div class={`items ${app.buildCategory === 'work' || app.buildCategory === 'food' ? 'business' : ''}`}>
          {app.buildCategory === 'food' && <FoodCourtRun s={s} />}
          {items.map((b) => {
            const locked = level < b.level;
            const cant = s.cash < b.cost || s.parts < (b.parts ?? 0);
            const on = app.view.build === b.id;
            return (
              <button
                class={`item ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${cant ? 'cant' : ''}`}
                disabled={locked}
                onClick={() => {
                  audio.play('click');
                  selectBuild(on ? null : b.id);
                }}
              >
                <BuildIcon type={b.id} />
                <div class="item-body">
                  <div class="item-name">
                    {b.name}
                    <b class={cant ? 'bad' : ''}>
                      ${b.cost}
                      {b.decoy && s.rooms.some((r) => r.decoys > 0) ? '+' : ''}
                      {b.parts ? (
                        <span class={`part-cost ${s.parts < b.parts ? 'short' : ''}`}>
                          {' + '}
                          {b.parts}
                          <Icon name="parts" />
                        </span>
                      ) : null}
                    </b>
                  </div>
                  <div class="item-desc">{locked ? `Locked · Level ${b.level}: ${levelInfo(b.level).theme}` : b.desc}</div>
                  {!locked && (
                    <div class="item-tags">
                      {b.power ? <i class="tag power">USES {b.power}W</i> : null}
                      {b.supply ? <i class="tag supply">GIVES {b.supply}W</i> : null}
                      {b.noise ? <i class="tag noise">NOISE {b.noise}</i> : null}
                      {b.smell ? <i class="tag smell">SMELL {b.smell}</i> : null}
                      {b.comfort ? <i class="tag comfort">COMFY {b.comfort}</i> : null}
                      {b.beds ? <i class="tag beds">BEDS {b.beds}</i> : null}
                      {nooksUsing(b.id).map((n) => (
                        <i class="tag set">SET: {n.name.toUpperCase()}</i>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {app.buildCategory === 'work' && <BusinessCards s={s} />}
        </div>
      )}
      {app.view.build && <div class="flavor">"{BUILD[app.view.build].flavor}"</div>}
    </div>
  );
}

function FoodCourtRun({ s }: { s: GameState }) {
  const { foodCap, fridge } = getDerived(s);
  const full = s.food >= foodCap;
  return (
    <div class="biz">
      <h4>
        <Icon name="food" /> Food Court Run
      </h4>
      <p>
        ${FOOD_PRICE} a portion. The crew eats {mealNeed(s)} at 8 AM and 8 PM.
      </p>
      <div class="row">
        {[5, 10, 25].map((n) => (
          <button
            class="btn small"
            disabled={full}
            onClick={() => {
              const err = buyFood(s, n);
              if (err) toast(err, 'bad');
              else audio.play('cash');
              refresh();
            }}
          >
            +{n} (${n * FOOD_PRICE})
          </button>
        ))}
      </div>
      <div class="muted small">{full ? 'The stash is full.' : `${Math.floor(s.food)}/${foodCap} stashed${fridge ? '' : '. Spoils without a fridge.'}`}</div>
    </div>
  );
}

function SetsPanel({ s }: { s: GameState }) {
  const d = getDerived(s);
  return (
    <div class="items business">
      <p class="muted small">Put these within {NOOK_RADIUS} tiles of each other.</p>
      {NOOKS.map((n) => {
        const count = d.nooks.filter((x) => x.def.id === n.id).length;
        return (
          <div class={`biz nook ${count ? 'formed' : ''}`}>
            <h4>
              {n.name}
              {count ? <span class="ok-line"> ✓{count > 1 ? ` ×${count}` : ''}</span> : null}
            </h4>
            <p>{n.items.map((t) => BUILD[t].name).join(' + ')}</p>
            <div class="nook-bonus">{n.bonus}</div>
          </div>
        );
      })}
    </div>
  );
}

function BusinessCards({ s }: { s: GameState }) {
  const level = levelOf(s);
  const vacant = s.rooms.map((r, i) => ({ r, i })).filter(({ r, i }) => r.vacant && !r.popup && LAYOUT.rooms[i].kind === 'store');
  return (
    <>
      <div class="biz">
        <h4>
          <Icon name="business" /> Phone Charmz Kiosk
        </h4>
        <p>A concourse cart under a fake LLC. Sell goods by day and look like you belong. ${KIOSK_COST}, then $20/day.</p>
        {s.business.kiosk ? (
          <div class="ok-line">✓ Leased</div>
        ) : (
          <button
            class="btn"
            disabled={level < KIOSK_LEVEL || s.cash < KIOSK_COST}
            onClick={() => {
              const err = leaseKiosk(s);
              if (err) toast(err, 'bad');
              refresh();
            }}
          >
            {level < KIOSK_LEVEL ? `Locked · Level ${KIOSK_LEVEL}` : `Lease for $${KIOSK_COST}`}
          </button>
        )}
      </div>
      <div class="biz">
        <h4>
          <Icon name="goods" /> Seasonal Pop-Up
        </h4>
        <p>Open shop in a dead storefront. Holiday shoppers pay anything. ${POPUP_COST}, then ${POPUP_RENT}/day.</p>
        {level >= POPUP_LEVEL && (
          <p class={popupWalkIns(s) < POPUP_RENT ? 'bad' : 'good'}>
            Walk-ins today: about ${popupWalkIns(s)}.
          </p>
        )}
        {s.business.popupRoom >= 0 ? (
          <div class="ok-line">
            ✓ {popupName(s)} in the old {LAYOUT.rooms[s.business.popupRoom].name}
          </div>
        ) : level < POPUP_LEVEL ? (
          <button class="btn" disabled>
            Locked · Level {POPUP_LEVEL}
          </button>
        ) : vacant.length === 0 ? (
          <div class="muted">No vacant stores yet. Give it time. This mall is dying.</div>
        ) : (
          vacant.map(({ i }) => (
            <button
              class="btn"
              disabled={s.cash < POPUP_COST}
              onClick={() => {
                const err = openPopup(s, i);
                if (err) toast(err, 'bad');
                refresh();
              }}
            >
              Open in old {LAYOUT.rooms[i].name} (${POPUP_COST})
            </button>
          ))
        )}
      </div>
    </>
  );
}

export function allHome(s: GameState) {
  const n = callAllHome(s);
  if (n) audio.play('climb');
  else toast('Nobody is out in the mall', 'info');
  refresh();
}

export function CrewPanel({ s }: { s: GameState }) {
  const beds = getDerived(s).beds.reduce((a, b) => a + b.slots, 0);
  const shortBeds = s.crew.length > beds;
  const out = s.crew.filter((c) => c.layer === 0 && c.state !== 'away').length;
  return (
    <div class="crewpanel panel">
      <div class="panel-head">
        <span>The Bats · {s.crew.length}</span>
        <button class="btn small" onClick={() => openJobs(app.view.selectedCrew ?? app.crewExpanded, shiftNow(s) ?? undefined)}>
          Job Board<kbd>J</kbd>
        </button>
        <button class={`btn small ${out ? 'danger' : 'ghost'}`} disabled={!out} onClick={() => allHome(s)} title="Everyone in the mall drops what they're doing and comes home. They're off for the rest of the shift.">
          All home<kbd>G</kbd>
        </button>
        <small class={shortBeds ? 'warn' : ''}>
          {beds} {beds === 1 ? 'BED' : 'BEDS'}
        </small>
      </div>
      <div class="crew-list">
        {s.crew.map((c) => (
          <CrewCard s={s} c={c} expanded={app.crewExpanded === c.id} />
        ))}
      </div>
      {s.ladder.map((v) => (
        <button class="ladder-row" onClick={() => (showVisitor(s, v), refresh())} title="Someone is waiting at the ladder.">
          <Portrait look={v.candidate.look} sprite={crewSprite(v.candidate)} size={22} />
          <span>
            {v.candidate.name} is waiting at the ladder · until {formatDate(dayOf(v.until))}
          </span>
        </button>
      ))}
      {levelOf(s) >= JOB.gary.level && !s.gary.recruited && <GaryRow s={s} />}
    </div>
  );
}

function GaryRow({ s }: { s: GameState }) {
  const insiderText = `Gary is your man on the inside.${garyCanCover(s) ? ' He can lose one inspection this week.' : ''}`;
  return (
    <div class="gary-row" title={s.gary.insider ? undefined : 'Leave him NY Fries at night.'}>
      <Icon name="art.gary" size={16} />
      <span>{s.gary.insider ? insiderText : `Gary's goodwill · ${Math.round(s.gary.affinity)}/100`}</span>
      {!s.gary.insider && <Bar value={s.gary.affinity} color="linear-gradient(90deg,#ffb000,#ff4fa3)" />}
    </div>
  );
}

function JobSummary({ s, c }: { s: GameState; c: Crew }) {
  const live = shiftNow(s);
  const working = currentJob(s, c);
  return (
    <div class="crew-jobs" onClick={(e) => e.stopPropagation()}>
      {(['day', 'night'] as const).map((shift) => {
        const job = shift === 'day' ? c.dayJob : c.nightJob;
        const fillingIn = live === shift && working !== job && working !== 'rest';
        return (
          <button class={`job-summary ${shift} ${live === shift ? 'live' : ''}`} onClick={() => openJobs(c.id, shift)} title="Open the Job Board">
            <span>{shift === 'day' ? 'DAY' : 'NIGHT'}</span>
            <b>
              <i class={live === shift && working === job && job !== 'rest' ? 'now' : job !== 'rest' && jobUnavailable(s, c, job) ? 'skip' : ''}>{JOB[job].name}</i>
              {fillingIn && <i class="now"> → {JOB[working].name}</i>}
            </b>
          </button>
        );
      })}
    </div>
  );
}

function heatTitle(c: Crew): string {
  return `How well security knows ${c.name}'s face. At 100%, Officer Dana makes an arrest. A day at home cools it.`;
}

function awayText(s: GameState, c: Crew): string {
  if (c.awayUntil === Infinity) return 'In custody';
  if (c.awayUntil - s.time < 1440) return `Released, back around ${formatClock(c.awayUntil)}`;
  return `In county until ${formatDate(dayOf(c.awayUntil))}`;
}

function CostumeChip({ s, costume }: { s: GameState; costume: NonNullable<Crew['costume']> }) {
  const def = COSTUMES[costume.id];
  const days = Math.max(1, Math.ceil((costume.until - s.time) / 1440));
  return (
    <i class="trait good" title={def.desc}>
      {def.name} · {days}d
    </i>
  );
}

function CrewCard({ s, c, expanded }: { s: GameState; c: Crew; expanded: boolean }) {
  const away = c.state === 'away';
  const where = away ? awayText(s, c) : c.layer === 0 ? 'In the mall' : 'In the ceiling';
  const job = currentJob(s, c);
  const selected = app.view.selectedCrew === c.id;
  return (
    <div
      class={`crew ${selected ? 'sel' : ''} ${away ? 'away' : ''} ${c.state === 'fleeing' ? 'fleeing' : ''}`}
      onClick={() => {
        app.view.selectedCrew = c.id;
        app.crewExpanded = expanded ? null : c.id;
        refresh();
      }}
    >
      <div class="crew-top">
        <Portrait look={c.look} sprite={crewSprite(c)} size={40} bg={c.layer === 0 ? '#3a1a2a' : '#1a2040'} />
        <div class="crew-id">
          <div class="crew-name">
            {c.name} <small>{c.title}</small>
          </div>
          <div class="crew-thought">
            <span class={c.layer === 0 ? 'in-mall' : ''}>{where}</span> · {c.thought}
          </div>
          <div class="crew-bars">
            <Bar
              value={c.energy}
              color={c.energy < 25 ? '#ec5b3c' : '#5ccfc2'}
              label="NRG"
              title="Running on empty drags the whole crew down. Rest refills it."
            />
            <Bar value={c.heat} color="#ff2d55" label="HEAT" title={heatTitle(c)} />
          </div>
        </div>
        {c.detect > 0.05 && c.layer === 0 && <div class="detect" style={{ '--d': `${Math.min(1, c.detect) * 360}deg` } as Record<string, string>} />}
      </div>
      {!away && <JobSummary s={s} c={c} />}
      {expanded && !away && (
        <div class="crew-detail" onClick={(e) => e.stopPropagation()}>
          <div class="statline">
            <span>
              STEALTH <Dots n={c.stealth} color="#5ccfc2" bonus={moodStatBonus(s, c, 'stealth')} />
            </span>
            <span>
              CHARM <Dots n={c.charm} color="#ff6db3" bonus={moodStatBonus(s, c, 'charm')} />
            </span>
            <span>
              HANDY <Dots n={c.handy} color="#ffc93e" bonus={moodStatBonus(s, c, 'handy')} />
            </span>
          </div>
          {(c.traits.length > 0 || c.costume) && (
            <div class="traits">
              {c.costume && <CostumeChip s={s} costume={c.costume} />}
              {c.traits.map((t) => (
                <i class={`trait ${TRAITS[t].good ? 'good' : 'bad'}`} title={TRAITS[t].desc}>
                  {TRAITS[t].name}
                </i>
              ))}
            </div>
          )}
          <div class="bio">"{c.bio}"</div>
          <Bar value={c.heat} color="#ff2d55" label="Heat" title={heatTitle(c)} />
          <div class="row">
            <button class="btn small" onClick={() => ((app.view.layer = c.layer), app.renderer?.centerOn(c.x, c.y), refresh())}>
              Find<kbd>F</kbd>
            </button>
            <button class="btn small" onClick={() => openJobs(c.id, shiftNow(s) ?? undefined)}>
              Jobs<kbd>J</kbd>
            </button>
            {shiftNow(s) && c.calledOff !== shiftKey(s) && (c.layer === 0 || assignedJob(s, c) !== 'rest') && (
              <button class="btn small danger" onClick={() => (callOff(s, c), refresh())} title="Comes home and sits out the rest of this shift.">
                {c.layer === 0 ? 'Call home' : 'Off this shift'}
              </button>
            )}
            <span class="muted">
              Job: {JOB[job].name} · earned {money(c.earned)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function LogPanel({ s }: { s: GameState }) {
  const entries = (app.logOpen ? s.log.slice() : s.log.slice(-2)).reverse();
  return (
    <div class={`logpanel panel ${app.logOpen ? '' : 'mini'}`}>
      <div class="panel-head" onClick={() => ((app.logOpen = !app.logOpen), refresh())} title={app.logOpen ? 'Show less' : 'Show more'}>
        <span>
          <Icon name="pager" size={16} /> PA & Pager
        </span>
        <small>{app.logOpen ? 'LESS ▴' : 'MORE ▾'}</small>
      </div>
      <div class="log">
        {entries.map((l) => (
          <div
            class={`entry ${l.kind} ${l.focus ? 'has-focus' : ''}`}
            title={l.focus ? 'Click to look' : undefined}
            onClick={() => {
              if (l.focus) focusTile(l.focus.x, l.focus.y, l.focus.layer);
              refresh();
            }}
          >
            <time>{formatClock(l.t)}</time>
            {l.kind === 'pa' && <b class="pa">PA</b>}
            {l.kind === 'phone' && <b class="phone">{l.from}</b>}
            <span>{l.text}</span>
            {l.focus && <i class="go">LOOK</i>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ObjectiveCard({ s }: { s: GameState }) {
  const o = OBJECTIVES[s.objective];
  if (!o) return null;
  const prog = objectiveProgress(s);
  const open = app.objectiveOpen;
  return (
    <div class={`objective ${open ? '' : 'min'}`} onClick={() => ((app.objectiveOpen = !open), refresh())} title={open ? 'Click to minimize' : 'Click for details'}>
      <div class="obj-label">
        <span>
          TO-DO · {s.objective + 1}/{OBJECTIVES.length}
        </span>
        <span>{open ? 'HIDE ▴' : 'HINT ▾'}</span>
      </div>
      <div class="obj-text">
        <i class="obj-check" /> {o.text} {prog && <b>{prog}</b>}
      </div>
      {open && <div class="obj-hint">{o.hint}</div>}
    </div>
  );
}

const isClean = (f: InspectionForecast) => f.verdict !== 'search' || (!f.confiscated.length && !f.deckTiles.length);
const whenText = (s: GameState, ins: Inspection) => (ins.state === 'scheduled' ? `${morningOf(dayOf(s.time), dayOf(ins.at)).replace(' morning', '')} ${formatClock(ins.at)}` : 'on the way now');

export function InspectionPanel({ s }: { s: GameState }) {
  const upcoming = s.inspections.filter((i) => i.state !== 'done').sort((a, b) => a.at - b.at);
  if (!upcoming.length) return null;
  const forecasts = upcoming.map((ins) => forecastInspection(s, ins));
  const risky = forecasts.filter((f) => !isClean(f)).length;
  const open = app.inspectionsOpen;
  const next = upcoming[0];
  const toggle = () => ((app.inspectionsOpen = !open), audio.play('click'), refresh());
  return (
    <div class={`inspections ${open ? 'open' : ''} ${risky ? 'risky' : 'clean'}`}>
      <button class="insp-bar" onClick={toggle} title={open ? 'Collapse' : 'Show inspections'}>
        <Icon name="alert" size={16} />
        <b>{upcoming.length === 1 ? 'Inspection' : `${upcoming.length} inspections`}</b>
        <span>
          {LAYOUT.rooms[next.room].name}, {whenText(s, next)}
        </span>
        <i>{risky ? `${risky} will find stuff` : 'covered'}</i>
        <em>{open ? 'LESS ▴' : 'MORE ▾'}</em>
      </button>
      {open && (
        <div class="insp-list">
          {upcoming.map((ins, k) => {
            const f = forecasts[k];
            return (
              <div class={`insp ${isClean(f) ? 'clean' : ''}`} onClick={() => (focusTile(ins.x, ins.y, 1), refresh())} title="Click to look">
                <div class="insp-head">
                  <b>
                    {INSPECTORS[ins.kind].label} · {LAYOUT.rooms[ins.room].name}
                  </b>
                  <span>{whenText(s, ins)}</span>
                </div>
                <div class={isClean(f) ? 'good' : 'bad'}>{forecastLabel(f)}</div>
                {garyCanCover(s) && ins.state === 'scheduled' && (
                  <button
                    class="btn small"
                    onClick={(e) => {
                      e.stopPropagation();
                      coverInspection(s, ins);
                      refresh();
                    }}
                    title="Once a week"
                  >
                    Ask Gary to lose this one
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const HEAT_LEGEND: Record<HeatKind, { low: string; high: string; idle: string; how: string }> = {
  noise: {
    low: 'Quiet',
    high: 'Loud',
    idle: 'Nothing up here is making noise right now.',
    how: 'Noise from your gear and footsteps leaks into the stores below. Stores with low noise cover complain first. Foam and the pod muffle it.',
  },
  smell: {
    low: 'Faint',
    high: 'Reeking',
    idle: 'Nothing up here smells right now.',
    how: 'Cooking and crowds leave a smell that drifts down and lingers. Food courts hide it, bookstores do not. Box fans clear it faster.',
  },
};

function HeatLegend({ s, kind }: { s: GameState; kind: HeatKind }) {
  const legend = HEAT_LEGEND[kind];
  const idle = peakHeat(s, kind) < 0.02;
  return (
    <div class="heat-legend panel">
      <div class="heat-scale">
        <span>{legend.low}</span>
        <i style={{ background: rampGradient(kind) }} />
        <span>{legend.high}</span>
      </div>
      <p>{idle ? legend.idle : legend.how}</p>
    </div>
  );
}

export function BottomBar({ s }: { s: GameState }) {
  const overlays = [
    { id: 'none', label: 'Plain' },
    { id: 'noise', label: 'Noise' },
    { id: 'smell', label: 'Smell' },
    { id: 'power', label: 'Power' },
  ] as const;
  const night = phaseAt(s.time) === 'night';
  const inMall = s.crew.filter((c) => c.layer === 0 && c.state !== 'away').length;
  return (
    <div class="bottombar panel">
      <div class="layer-switch" title="Switch view (Tab)">
        <button class={`btn ${app.view.layer === 1 ? 'on' : 'ghost'}`} onClick={() => ((app.view.layer = 1), audio.play('climb'), refresh())}>
          Ceiling
        </button>
        <button class={`btn ${app.view.layer === 0 ? 'on' : 'ghost'}`} onClick={() => ((app.view.layer = 0), audio.play('climb'), refresh())}>
          Mall{' '}
          {inMall > 0 && (
            <i class="badge" title={`${inMall} Bat${inMall === 1 ? '' : 's'} down in the mall`}>
              {inMall}
            </i>
          )}
        </button>
      </div>
      <div class="overlays" title="Cycle overlays (O)">
        <span class="label">
          VIEW<kbd>O</kbd>
        </span>
        {overlays.map((o) => (
          <button
            class={`chip ${app.view.overlay === o.id ? 'on' : ''}`}
            onClick={() => {
              app.view.overlay = o.id;
              if (o.id === 'power') app.view.layer = 1;
              refresh();
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {(app.view.overlay === 'noise' || app.view.overlay === 'smell') && <HeatLegend s={s} kind={app.view.overlay} />}
      {app.view.build ? (
        <div class="hint active">
          {app.view.moving !== null ? 'Moving' : 'Placing'} {BUILD[app.view.build].name}. {app.view.moving === null && (app.view.build === 'deck' || app.view.build === 'foam') ? 'Drag to lay many. ' : ''}
          {app.view.build === 'raccoon' && app.view.hover && inBounds(app.view.hover.x, app.view.hover.y) && <PlacementPrice s={s} />}
          {canRotate(app.view.build) && (
            <span>
              <kbd>R</kbd>rotate
            </span>
          )}
          <span>
            <kbd>RMB</kbd>/<kbd>Esc</kbd> stop
          </span>
        </div>
      ) : app.view.demolish ? (
        <div class="hint active">
          Click or drag to remove (60% refund).
          <span>
            <kbd>RMB</kbd>/<kbd>Esc</kbd> stop
          </span>
        </div>
      ) : (
        <div class="hint">
          <span>
            <kbd>Tab</kbd>view
          </span>
          <span>
            <kbd>RMB</kbd>pan
          </span>
          <span>
            <kbd>Alt</kbd>x-ray
          </span>
          <span>
            <kbd>H</kbd>hatch
          </span>
          {night && <span class="warn">Night: watch the flashlights</span>}
        </div>
      )}
    </div>
  );
}

function PlacementPrice({ s }: { s: GameState }) {
  const { x, y } = app.view.hover!;
  const ri = LAYOUT.roomAt[idx(x, y)];
  if (ri < 0) return null;
  const price = buildCost(s, 'raccoon', x, y);
  return (
    <b class={price > BUILD.raccoon.cost ? 'warn' : ''}>
      {money(price)} above {LAYOUT.rooms[ri].name}
      {price > BUILD.raccoon.cost ? ". They've heard this one before." : '.'}{' '}
    </b>
  );
}

export function Tooltip({ s }: { s: GameState }) {
  const h = app.view.hover;
  const sc = app.hoverScreen;
  if (!h || !sc || !inBounds(h.x, h.y) || app.view.dragStart) return null;
  const ri = LAYOUT.roomAt[idx(h.x, h.y)];
  if (ri < 0) return null;
  const r = LAYOUT.rooms[ri];
  const rs = s.rooms[ri];
  const d = getDerived(s);
  const obj = d.objAt.get(idx(h.x, h.y));
  const ck = LAYOUT.ceilingKind[idx(h.x, h.y)];
  const pet = app.view.layer === 1 && s.flags.ferret && s.pet && Math.floor(s.pet.x) === h.x && Math.floor(s.pet.y) === h.y ? s.pet : null;
  const lines: string[] = [];
  if (app.view.layer === 1) {
    if (ck === C_DUCT) lines.push('HVAC duct: cannot build');
    else if (ck === C_AC) lines.push('Rooftop AC unit: cannot build');
    else if (ck === C_SKYLIGHT) lines.push('Skylight: everyone below would see you');
    else if (ck === C_NONE) lines.push(r.kind === 'anchor' ? 'Anchor store firewall: no access' : 'No ceiling access');
  }
  const cap = powerCap(s, ri);
  return (
    <div class="tooltip" style={{ left: `${(sc.x + 18) / app.uiScale}px`, top: `${(sc.y + 18) / app.uiScale}px` }}>
      <div class="tt-head">
        {app.view.layer === 1 ? 'Above ' : ''}
        <b>{rs.popup ? popupName(s) : r.name}</b>
        {rs.vacant && !rs.popup && <i class="muted"> · vacant</i>}
      </div>
      {r.blurb && <div class="tt-blurb">{r.blurb}</div>}
      {r.ceiling && !rs.vacant && (
        <div class="tt-grid">
          <span>Noise cover</span>
          <b>{Math.round(r.noiseMask * 100)}%</b>
          <span>Smell cover</span>
          <b>{Math.round(r.smellMask * 100)}%</b>
          <span>Staff sensitivity</span>
          <b>{r.sensitivity >= 1.3 ? 'Very high' : r.sensitivity >= 0.9 ? 'High' : r.sensitivity >= 0.55 ? 'Normal' : 'Low'}</b>
          <span>Complaints</span>
          <b class={rs.complaint > 60 ? 'bad' : ''}>{Math.round(rs.complaint)}%</b>
          <span>Power bill (week)</span>
          <b class={rs.power > cap ? 'bad' : ''}>
            {rs.power.toFixed(1)} / {cap.toFixed(0)} kWh
          </b>
          {r.kind === 'store' && rs.strain >= 1 && (
            <>
              <span>Manager</span>
              <b class="bad">{rs.strain >= 2 ? 'Talking about leaving' : 'Fed up'}</b>
            </>
          )}
        </div>
      )}
      {app.view.layer === 1 && noiseField[idx(h.x, h.y)] > 0.05 && (
        <div class="tt-line">
          <i class="tag noise">NOISE</i> {noiseField[idx(h.x, h.y)].toFixed(1)} here
        </div>
      )}
      {app.view.layer === 1 && s.smell[idx(h.x, h.y)] > 1 && (
        <div class="tt-line">
          <i class="tag smell">SMELL</i> {s.smell[idx(h.x, h.y)].toFixed(0)} here
        </div>
      )}
      {lines.map((l) => (
        <div class="tt-line warn">{l}</div>
      ))}
      {obj && app.view.layer === 1 && (
        <div class="tt-line">
          <b>{BUILD[obj.type].name}</b> {BUILD[obj.type].power ? obj.powered ? <span class="good">· powered</span> : <span class="bad">· no power</span> : ''}
          {BUILD[obj.type].supply ? ` · ${obj.supplyLoad}/${BUILD[obj.type].supply}W` : ''}
        </div>
      )}
      {pet && (
        <div class="tt-line">
          <b>Bandit</b> {pet.napping ? 'is asleep in a Pringles can.' : 'brings home a snack every morning.'}
        </div>
      )}
    </div>
  );
}

function objectUsage(s: GameState, o: Placed, roomName: string): string[] {
  const def = BUILD[o.type];
  const names = (crew: Crew[]) => crew.map((c) => c.name).join(', ');
  if (def.beds) {
    const sleepers = s.crew.filter((c) => c.bedId === o.id);
    return [`Sleeps ${def.beds}. ${sleepers.length ? `Claimed by ${names(sleepers)}.` : 'Unclaimed.'}`];
  }
  if (o.type === 'workbench') {
    const user = s.crew.find((c) => c.useObj === o.id && c.state === 'working');
    return [user ? `${user.name} is tinkering.` : 'Free.'];
  }
  if (o.type === 'tamagotchi') return [!o.delivered ? 'Waiting for someone to carry it down.' : o.beeping ? 'Beeping. Someone will come looking.' : 'Quiet. Feed it after hours to start the beeping.'];
  if (def.racket) {
    if (o.jammed) return ['Jammed. Earning nothing until cleared.'];
    if (!o.powered) return ['Unpowered. Earning nothing.'];
    return [`Skimming ${roomName}'s registers. Busy stores pay more.`];
  }
  if (def.drop) return [`Drops into ${roomName}.`];
  if (def.deterUses) return [signUsesLeft(o) === 1 ? 'Good for one more inspection.' : `Good for ${signUsesLeft(o)} more inspections.`];
  const users = s.crew.filter((c) => c.useObj === o.id);
  return users.length ? [`In use by ${names(users)}.`] : [];
}

export function SelectedObject({ s }: { s: GameState }) {
  if (app.selectedObj === null) return null;
  const o = s.objects.find((x) => x.id === app.selectedObj);
  if (!o) return null;
  const def = BUILD[o.type];
  const room = LAYOUT.rooms[LAYOUT.roomAt[idx(o.x, o.y)]];
  const layer = def.floor ? 0 : 1;
  return (
    <div class="selobj panel">
      <div class="panel-head">
        <span>{def.name}</span>
        <button class="btn small ghost icon-btn" onClick={() => (selectObject(null), refresh())} title="Close (Esc)">
          ×
        </button>
      </div>
      <div class="selobj-body">
        <BuildIcon type={o.type} size={56} />
        <div>
          <div>{def.desc}</div>
          <div class="muted">
            {layer ? 'Above' : 'In'} {room.name}
          </div>
          {def.power && <div class={o.powered ? 'good' : 'bad'}>{o.powered ? 'Powered' : 'Unpowered: build a Power Splice within range'}</div>}
          {def.supply && (
            <div>
              Load: {o.supplyLoad}/{def.supply}W {def.offGrid ? '(off-grid)' : `· billed to ${o.tapRoom >= 0 ? LAYOUT.rooms[o.tapRoom].name : 'nobody (dead)'}`}
            </div>
          )}
          {objectUsage(s, o, room.name).map((line) => (
            <div class="usage">{line}</div>
          ))}
          <div class="flavor">"{def.flavor}"</div>
          {o.jammed && (
            <button
              class="btn small"
              disabled={s.parts < 5}
              onClick={() => {
                const err = clearJam(s, o);
                if (err) toast(err, 'bad');
                else audio.play('build');
                refresh();
              }}
            >
              Clear jam (5 parts)
            </button>
          )}
          {o.type === 'tamagotchi' && (
            <button class="btn small" disabled={!!feedBlocked(s, o)} title={feedBlocked(s, o) ?? 'Starts the beeping. The nearest guard comes looking.'} onClick={() => (feedTamagotchi(s, o), refresh())}>
              Feed it
            </button>
          )}
          {canRotate(o.type) && !def.floor && (
            <button class="btn small" onClick={() => (rotateObject(o), audio.play('click'), refresh())}>
              Rotate<kbd>R</kbd>
            </button>
          )}
          {!def.floor && (
            <button class="btn small" onClick={() => (startMove(o), refresh())} title="Pick it up and set it down somewhere else. Free.">
              Move<kbd>M</kbd>
            </button>
          )}
          <button
            class="btn small danger"
            onClick={() => {
              demolishAt(s, o.x, o.y, layer);
              selectObject(null);
              audio.play('demolish');
              refresh();
            }}
          >
            Remove (+${Math.floor(def.cost * 0.6)})
          </button>
        </div>
      </div>
    </div>
  );
}

const ART = new Set(['intro', 'news', 'caught', 'gary', 'feast', 'wallet', 'mannequin', 'pretzel', 'ferret', 'psychic', 'mallwalkers', 'vent', 'hotdog', 'furby', 'glamour']);

export function ModalView({ s }: { s: GameState }) {
  const m = s.modals[0];
  if (!m) return null;
  const visitor = s.ladder.find((v) => v.id === m.data?.visitor)?.candidate;
  return (
    <div class="modal-wrap">
      <div class="modal panel">
        <div class={`modal-art art-${m.art ?? 'none'}`}>
          {m.art === 'recruit' && visitor ? (
            <Portrait look={visitor.look} sprite={crewSprite(visitor)} size={96} bg="#48298a" />
          ) : (
            <Icon name={`art.${ART.has(m.art ?? '') ? m.art : 'pager'}`} size={128} />
          )}
        </div>
        <h2>{m.title}</h2>
        <div class="modal-body">{m.body.split('\n').map((p) => (p ? <p>{p}</p> : <br />))}</div>
        <div class="modal-choices">
          {m.choices.map((c) => (
            <button
              class="btn big"
              disabled={!!c.disabled}
              title={c.disabled ?? c.hint}
              onClick={() => {
                audio.start();
                audio.play('click');
                resolveModal(s, m.id, c.action);
                refresh();
              }}
            >
              {c.label}
              {c.disabled && <small>{c.disabled}</small>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const SPARK_COLORS = ['var(--pink-3)', 'var(--teal-3)', 'var(--cream)', 'var(--gold)'];
const SPARKS = Array.from({ length: 16 }, (_, i) => ({ angle: i * 22.5, color: SPARK_COLORS[i % 4], reach: i % 2 ? 230 : 300 }));

export function LevelUpBanner() {
  const shown = app.levelUp;
  if (!shown || shown.until < performance.now()) return null;
  const { title, theme } = levelInfo(shown.level);
  const unlocks = unlocksAt(shown.level);
  return (
    <div class="levelup" key={shown.level}>
      <div class="levelup-rays" />
      {SPARKS.map((p) => (
        <i class="levelup-spark" key={p.angle} style={{ '--angle': `${p.angle}deg`, '--reach': `${p.reach}px`, '--color': p.color }} />
      ))}
      <div class="levelup-card" onClick={() => ((app.levelUp = null), refresh())}>
        <div class="levelup-kicker">LEVEL UP!</div>
        <div class="levelup-level">{shown.level}</div>
        <div class="levelup-title">{title}</div>
        <div class="levelup-theme">{theme}</div>
        {unlocks.length > 0 && (
          <div class="levelup-unlocks">
            <b>NEW</b>
            {unlocks.map((u) => (
              <span key={u}>{u}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Toasts() {
  const now = performance.now();
  app.toasts = app.toasts.filter((t) => t.until > now);
  return (
    <div class="toasts">
      {app.toasts.map((t) => (
        <div class={`toast ${t.tone}`} key={t.id}>
          {t.tone === 'achievement' && <Icon name="trophy" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

const GRADES = [
  { min: 0.5, grade: 'S', name: 'Mall Mogul' },
  { min: 0.2, grade: 'A', name: 'Comfortable' },
  { min: 0.05, grade: 'B', name: 'Close enough' },
  { min: 0, grade: 'C', name: 'By a nose' },
];

function WinGrade({ s }: { s: GameState }) {
  const margin = s.over?.margin;
  if (margin === undefined) return null;
  const g = GRADES.find((x) => margin >= x.min)!;
  return (
    <div class="grade">
      Grade <b>{g.grade}</b> · {g.name} · won by {Math.round(margin * 100)}%{s.stats.caught === 0 ? ' · nobody ever got caught' : ''}
    </div>
  );
}

export function GameOver({ s, onMenu, onNew }: { s: GameState; onMenu: () => void; onNew: () => void }) {
  const o = s.over!;
  const max = Math.max(50, ...s.dailyIncome);
  return (
    <div class="modal-wrap over">
      <div class={`modal panel gameover ${o.won ? 'won' : 'lost'}`}>
        <h1>{o.title}</h1>
        <WinGrade s={s} />
        <div class="modal-body">{o.text.split('\n').map((p) => (p ? <p>{p}</p> : <br />))}</div>
        <div class="chart">
          {s.dailyIncome.map((v) => (
            <i style={{ height: `${(v / max) * 100}%` }} title={`$${v}`} />
          ))}
        </div>
        <div class="stats-grid">
          <span>Days survived</span>
          <b>{dayOf(s.time) + 1}</b>
          <span>Total earned</span>
          <b>{money(s.totalEarned)}</b>
          <span>Peak crew</span>
          <b>{s.stats.peakCrew}</b>
          <span>Fountain wishes fished</span>
          <b>{money(s.stats.fountainCash)}</b>
          <span>Goods crafted / eBay sold</span>
          <b>
            {s.stats.goodsCrafted} / {s.stats.ebaySold}
          </b>
          <span>Inspections survived</span>
          <b>{s.stats.inspections}</b>
          <span>Inspections dodged</span>
          <b>{s.stats.inspectionsFoundNothing + s.stats.raccoons}</b>
          <span>Raccoons blamed</span>
          <b>{s.stats.raccoons}</b>
          <span>Times spotted / caught</span>
          <b>
            {s.stats.spotted} / {s.stats.caught}
          </b>
          <span>Longest clean streak</span>
          <b>{s.stats.bestNightStreak} nights</b>
          <span>Stores that closed</span>
          <b>{s.stats.storesClosed}</b>
        </div>
        {s.achievements.length > 0 && (
          <div class="achievements">
            {s.achievements.map((a) => (
              <i title={ACHIEVEMENTS[a]?.desc}>
                <Icon name="trophy" size={16} /> {ACHIEVEMENTS[a]?.name}
              </i>
            ))}
          </div>
        )}
        <div class="modal-choices">
          <button class="btn big" onClick={onNew}>
            New Game
          </button>
          <button class="btn big" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
