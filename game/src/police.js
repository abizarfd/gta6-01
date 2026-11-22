// police.js — the wanted system of Solmar Bay.
// Crimes raise the wanted level; police cars and foot cops spawn and chase the
// player; staying out of sight lets the heat cool off. Getting caught on foot
// means BUSTED, losing cash and the heat.
import { WORLD_W, WORLD_H, BEACH_Y, randomRoadPoint, snapToRoad } from './city.js';
import { clamp, dist, angleDelta } from './util.js';
import { makeCar, CAR_MODELS } from './entities.js';

export const MAX_WANTED = 5;

export function createWanted() {
  return {
    level: 0,
    heat: 0, // 0..100 inside the current level; crimes push it up
    quietTime: 0, // seconds since the last crime
    seenTimer: 0, // seconds a cop has had line of sight recently
    bustedTimer: 0,
  };
}

// Crime weights: how much heat one act adds.
export const CRIME_HEAT = {
  stealCar: 45,
  killPed: 40,
  killCop: 70,
  shoot: 12,
  assault: 20,
  speedingNearCop: 6,
};

export function addCrime(wanted, kind, amount) {
  const add = amount !== undefined ? amount : CRIME_HEAT[kind] || 10;
  wanted.heat += add;
  wanted.quietTime = 0;
  let leveled = false;
  while (wanted.heat >= 100 && wanted.level < MAX_WANTED) {
    wanted.heat -= 100;
    wanted.level++;
    leveled = true;
  }
  if (wanted.level >= MAX_WANTED) wanted.heat = Math.min(wanted.heat, 99);
  return leveled;
}

export function updateWanted(wanted, dt, copCanSee, inCar) {
  wanted.quietTime += dt;
  if (copCanSee) {
    wanted.seenTimer = Math.min(wanted.seenTimer + dt, 10);
    wanted.quietTime = 0;
  } else {
    wanted.seenTimer = Math.max(0, wanted.seenTimer - dt);
  }
  // Cool off only when nobody is watching and no crime happened lately.
  if (wanted.level > 0 && wanted.quietTime > 18 && wanted.seenTimer <= 0) {
    wanted.heat -= dt * 6;
    if (wanted.heat <= 0) {
      wanted.level--;
      wanted.heat = wanted.level > 0 ? 90 : 0;
      wanted.quietTime = 0;
    }
  }
  if (wanted.level === 0) wanted.heat = 0;
}

// A foot cop: chases on foot, tries to grab the player.
export function makeFootCop(x, y) {
  return {
    kind: 'footcop',
    x, y,
    angle: 0,
    speed: 0,
    hp: 100,
    state: 'chase',
    stateT: 0,
    shirt: '#1a2a4a',
    skin: '#e0ac69',
    dead: false,
  };
}

export function wantedCopCount(level) {
  return level <= 0 ? 0 : level * 2;
}

export function updatePolice(world, wanted, dt, onBusted) {
  const player = world.player;
  // Spawn cop cars to match the wanted level.
  const copCars = world.cars.filter((c) => c.driver === 'cop');
  const want = wantedCopCount(wanted.level);
  if (copCars.length < want) {
    for (let tries = 0; tries < 8 && world.cars.filter((c) => c.driver === 'cop').length < want; tries++) {
      const p = randomRoadPoint(world.rng);
      if (dist(p.x, p.y, player.x, player.y) < 500) continue;
      if (dist(p.x, p.y, player.x, player.y) > 950) continue;
      const snap = snapToRoad(p.x, p.y);
      const car = makeCar('cop', snap.x, snap.y, player.x > snap.x ? 0 : Math.PI, 'cop');
      car.speed = 200;
      car.siren = true;
      world.cars.push(car);
    }
  }
  // Despawn cop cars that fell far behind when the heat is gone.
  if (wanted.level === 0) {
    world.cars = world.cars.filter((c) => c.driver !== 'cop' || dist(c.x, c.y, player.x, player.y) < 700);
  }

  // Foot cops: spawn a couple at higher wanted levels when the player is on foot.
  const footCops = world.cops || (world.cops = []);
  if (wanted.level >= 2 && !player.inCar && footCops.filter((c) => !c.dead).length < wanted.level) {
    for (let tries = 0; tries < 6; tries++) {
      const a = world.rng() * Math.PI * 2;
      const x = clamp(player.x + Math.cos(a) * 420, 40, WORLD_W - 40);
      const y = clamp(player.y + Math.sin(a) * 420, 40, BEACH_Y - 40);
      footCops.push(makeFootCop(x, y));
      break;
    }
  }

  // Cop cars chase the player: steer toward them, ram gently on foot.
  for (const car of world.cars) {
    if (car.driver !== 'cop') continue;
    if (car.orbitDir === undefined) car.orbitDir = world.rng() < 0.5 ? 1 : -1;
    const spec = CAR_MODELS.cop;
    const d = dist(car.x, car.y, player.x, player.y);
    // Close in, then orbit the player instead of piling onto one spot: a
    // ring of cruisers reads as a pursuit, a pile-up reads as a bug. Start
    // the curve early and ease off up close so cruisers do not overshoot
    // onto the player's car.
    let wantAngle = Math.atan2(player.y - car.y, player.x - car.x);
    if (d < 220) wantAngle += car.orbitDir * 0.9;
    const turn = clamp(angleDelta(car.angle, wantAngle), -1, 1);
    car.angle += turn * 3.2 * dt;
    const targetSpeed = d > 200 ? spec.maxSpeed * 0.92 : d < 80 ? 150 : 280;
    if (car.speed < targetSpeed) car.speed += spec.accel * dt;
    else car.speed -= 200 * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 40, WORLD_W - 40);
    car.y = clamp(car.y, 40, WORLD_H - 40);
    // A cop car touching the player on foot is an arrest.
    if (!player.inCar && d < 34 && !player.dead) {
      onBusted('rammed');
    }
  }

  // Foot cops run at the player; touching means BUSTED.
  for (const cop of footCops) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, player.x, player.y);
    if (player.inCar) {
      // They give up and jog back toward the road.
      cop.state = 'idle';
      continue;
    }
    cop.state = 'chase';
    cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
    cop.speed = 205;
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    if (d < 26 && !player.dead) onBusted('caught');
  }
  world.cops = footCops.filter((c) => !c.dead && dist(c.x, c.y, player.x, player.y) < 1200);
}

// A police helicopter: joins the hunt at wanted level 4 and circles above
// the player. It never shoots or lands — it is the eye in the sky that makes
// a four-star chase feel like one, and it shows on the minimap.
export function createPoliceHelicopter(x, y) {
  return { x, y, angle: 0, rotor: 0, bob: Math.random() * Math.PI * 2 };
}

export function updatePoliceHelicopter(world, wanted, dt) {
  const player = world.player;
  if (wanted.level >= 4 && !world.heli) {
    world.heli = createPoliceHelicopter(player.x - 260, player.y - 260);
  }
  if (wanted.level < 3) {
    world.heli = null;
    return;
  }
  const heli = world.heli;
  if (!heli) return;
  heli.rotor += dt * 28;
  heli.bob += dt;
  // Hover off the player's shoulder and circle slowly, never right overhead,
  // so its shadow and body stay readable on screen.
  const orbit = Math.atan2(player.y - heli.y, player.x - heli.x) + 0.9;
  const wantX = player.x + Math.cos(orbit) * 170;
  const wantY = player.y + Math.sin(orbit) * 170;
  heli.x += (wantX - heli.x) * Math.min(1, 1.6 * dt);
  heli.y += (wantY - heli.y) * Math.min(1, 1.6 * dt);
  heli.angle = Math.atan2(player.y - heli.y, player.x - heli.x);
}

// Does any cop currently see the player? (Close range, no check for walls:
// the streets are open and the minimap shows the chase either way.)
export function anyCopSees(world, player) {
  for (const car of world.cars) {
    if (car.driver === 'cop' && dist(car.x, car.y, player.x, player.y) < 520) return true;
  }
  for (const cop of world.cops || []) {
    if (!cop.dead && dist(cop.x, cop.y, player.x, player.y) < 300) return true;
  }
  return false;
}
