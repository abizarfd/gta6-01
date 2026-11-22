// missions.js — the story of Solmar Bay and its side work.
// Jax Moreno comes home owing money. Sal Marin, who runs Sal's Bar, gives him
// jobs; each job is a chain of small steps the engine below walks through.
// Side work (taxi fares and stashed cash) runs alongside the story.
import { dist } from './util.js';

export const SAL_BAR = { x: 595, y: 1520 };
export const WAREHOUSE = { x: 1080, y: 2850 };
export const BANK = { x: 1675, y: 450 };
export const MOTEL = { x: 465, y: 2530 };
export const GARAGE = { x: 2890, y: 2540 };
export const HOT_CAR_SPOT = { x: 1650, y: 480 };

export const MISSIONS = [
  {
    id: 'm1',
    title: 'Welcome Back, Jax',
    giver: 'Sal Marin',
    intro: "Sal: Jax! You're back. I need a package from the Portside warehouse. Bring it here, no questions.",
    reward: 400,
    steps: [
      { type: 'talk', x: SAL_BAR.x, y: SAL_BAR.y, r: 90, label: 'Talk to Sal at the bar', line: "Sal: The package is at the Portside warehouse. My boys are watching the door — be quick." },
      { type: 'goto', x: WAREHOUSE.x, y: WAREHOUSE.y, r: 130, label: 'Pick up the package at Portside Warehouse', line: 'Jax: Got it. Someone tipped the cops — move!' },
      { type: 'goto', x: SAL_BAR.x, y: SAL_BAR.y, r: 90, label: 'Bring the package back to Sal', line: "Sal: Clean work. Here's your cut. There's more where that came from." },
    ],
  },
  {
    id: 'm2',
    title: 'Hot Wheels',
    giver: 'Sal Marin',
    intro: "Sal: A client wants a red Comet GT, parked up in Downtown. Take it. Bring it to the Marina Garage. Cops will notice.",
    reward: 900,
    steps: [
      { type: 'steal', x: HOT_CAR_SPOT.x, y: HOT_CAR_SPOT.y, r: 70, label: 'Steal the red Comet GT in Downtown', line: 'Jax: Nice ride. Now get it to the Marina Garage in one piece.' },
      { type: 'deliver', x: GARAGE.x, y: GARAGE.y, r: 110, label: 'Deliver the Comet GT to the Marina Garage', line: "Sal: The client is happy. You're getting good at this, Jax." },
    ],
  },
  {
    id: 'm3',
    title: 'The Solmar Job',
    giver: 'Sal Marin',
    intro: "Sal: The big one. Solmar Bank, Friday night. Crack the vault, grab the cash, and lose the heat at the Sunset Motel.",
    reward: 5000,
    steps: [
      { type: 'goto', x: BANK.x, y: BANK.y, r: 130, label: 'Reach Solmar Bank', line: 'Jax: Alright. In and out, nobody gets hurt.' },
      { type: 'hold', x: BANK.x, y: BANK.y, r: 110, secs: 4, label: 'Hold E to crack the vault', line: 'Jax: Vault is open! Grab the cash and RUN!' },
      { type: 'escape', x: MOTEL.x, y: MOTEL.y, r: 130, label: 'Escape to the Sunset Motel', line: "Sal: You did it, Jax. You're square with me now. Solmar Bay is yours." },
    ],
  },
];

export function createMissionState() {
  return {
    active: null, // { def, step, holdT, surviveT }
    completed: [],
    available: 0, // index into MISSIONS of the next story mission
    taxi: null, // { stage: 'pickup'|'dropoff', x, y, fare, passenger }
    taxiFares: 0, // fares finished — feeds Street Cred
    packages: [], // { x, y, taken }
    packageTotal: 0,
  };
}

export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return null;
  state.active = { def, step: 0, holdT: 0, surviveT: 0, startedAt: 0 };
  return def;
}

export function currentStep(state) {
  if (!state.active) return null;
  return state.active.def.steps[state.active.step];
}

export function missionTarget(state) {
  const step = currentStep(state);
  if (!step) return null;
  return { x: step.x, y: step.y, label: step.label };
}

// Advance the active mission. ctx: { world, wanted, input, sounds, say, addCrime, spawnHotCar }.
// Returns 'done' | 'failed' | null.
export function updateMission(state, ctx, dt) {
  const m = state.active;
  if (!m) return null;
  const step = m.def.steps[m.step];
  const p = ctx.world.player;
  const d = dist(p.x, p.y, step.x, step.y);

  if (step.type === 'talk') {
    if (d < step.r && ctx.input.wasPressed('KeyE')) {
      advance(state, ctx);
      return null;
    }
  } else if (step.type === 'goto') {
    if (d < step.r) {
      if (m.def.id === 'm1' && m.step === 1) ctx.addCrime('stealCar', 45);
      if (m.def.id === 'm3' && m.step === 0) ctx.sounds.horn();
      advance(state, ctx);
      return null;
    }
  } else if (step.type === 'steal') {
    if (p.inCar && p.inCar._hotCar) {
      ctx.addCrime('stealCar', 100);
      ctx.sounds.missionStart();
      advance(state, ctx);
      return null;
    }
    if (d < step.r && !ctx.hotCarSpawned) ctx.spawnHotCar();
  } else if (step.type === 'deliver') {
    if (p.inCar && p.inCar._hotCar && d < step.r) {
      advance(state, ctx);
      return null;
    }
    if (p.inCar && !p.inCar._hotCar && d < step.r) {
      ctx.say('Wrong car — bring the red Comet GT.');
    }
  } else if (step.type === 'hold') {
    if (d < step.r && ctx.input.down('KeyE')) {
      m.holdT += dt;
      if (m.holdT >= step.secs) {
        ctx.addCrime('killCop', 100);
        ctx.addCrime('killCop', 100);
        ctx.sounds.cash();
        advance(state, ctx);
        return null;
      }
    } else {
      m.holdT = Math.max(0, m.holdT - dt * 2);
    }
  } else if (step.type === 'escape') {
    if (d < step.r) {
      advance(state, ctx);
      return null;
    }
  }
  return null;
}

function advance(state, ctx) {
  const m = state.active;
  const step = m.def.steps[m.step];
  if (step.line) ctx.say(step.line, 5);
  m.step++;
  m.holdT = 0;
  if (m.step >= m.def.steps.length) {
    completeMission(state, ctx);
  } else {
    ctx.sounds.pickup();
  }
}

function completeMission(state, ctx) {
  const m = state.active;
  const def = m.def;
  state.completed.push(def.id);
  state.active = null;
  state.available = Math.max(state.available, MISSIONS.findIndex((x) => x.id === def.id) + 1);
  ctx.world.player.money += def.reward;
  ctx.sounds.missionDone();
  ctx.say(def.title + ' complete! +' + '$' + def.reward.toLocaleString('en-US'), 6);
  ctx.toast(def.title + ' — COMPLETE  +$' + def.reward.toLocaleString('en-US'));
}

// ---- Side work: taxi fares ----
export function updateTaxi(state, ctx, dt) {
  const p = ctx.world.player;
  const t = state.taxi;
  if (!t) {
    // Offer a fare when the player is driving a taxi.
    if (p.inCar && p.inCar.model === 'taxi' && Math.random() < dt * 0.12) {
      const spot = ctx.randomSidewalkPoint();
      state.taxi = {
        stage: 'pickup',
        x: spot.x, y: spot.y,
        fare: 40 + Math.floor(Math.random() * 60),
        dx: 0, dy: 0,
      };
      ctx.say('Taxi fare waiting nearby — pick them up!', 4);
    }
    return;
  }
  const d = dist(p.x, p.y, t.x, t.y);
  if (t.stage === 'pickup' && d < 60 && p.inCar) {
    t.stage = 'dropoff';
    const dest = ctx.randomSidewalkPoint();
    t.dx = dest.x;
    t.dy = dest.y;
    ctx.say('Passenger: Take me over there, quick!', 4);
    ctx.sounds.pickup();
  } else if (t.stage === 'dropoff' && dist(p.x, p.y, t.dx, t.dy) < 70 && p.inCar) {
    p.money += t.fare;
    state.taxiFares = (state.taxiFares || 0) + 1;
    ctx.sounds.cash();
    ctx.toast('Fare complete  +$' + t.fare);
    state.taxi = null;
  } else if (!p.inCar) {
    // Left the cab: the fare walks away.
    state.taxi = null;
  }
}

export function taxiTarget(state) {
  const t = state.taxi;
  if (!t) return null;
  if (t.stage === 'pickup') return { x: t.x, y: t.y, label: 'Pick up the fare', color: '#f7c948' };
  return { x: t.dx, y: t.dy, label: 'Drop off the passenger', color: '#f7c948' };
}

// ---- Side work: stashed cash packages ----
export const PACKAGE_SPOTS = [
  { x: 780, y: 480 }, { x: 2280, y: 780 }, { x: 480, y: 2280 },
  { x: 3180, y: 1680 }, { x: 1980, y: 2880 }, { x: 1080, y: 1080 },
];

export function initPackages(state) {
  state.packages = PACKAGE_SPOTS.map((s) => ({ x: s.x, y: s.y, taken: false }));
  state.packageTotal = 0;
}

export function updatePackages(state, ctx) {
  const p = ctx.world.player;
  if (p.inCar) return;
  for (const pkg of state.packages) {
    if (pkg.taken) continue;
    if (dist(p.x, p.y, pkg.x, pkg.y) < 34) {
      pkg.taken = true;
      state.packageTotal++;
      p.money += 150;
      ctx.sounds.cash();
      ctx.toast('Stashed cash found  +$150');
    }
  }
}
