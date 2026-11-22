// entities.js — the living things of Solmar Bay: the player, cars, traffic and
// pedestrians. Traffic follows the road grid with lanes, turns at intersections
// and stops for red lights; pedestrians stroll the sidewalks and run from danger.
import {
  ROAD_CENTERS, ROAD_HALF, WORLD_W, WORLD_H, BEACH_Y,
  collideBuildings, randomRoadPoint, randomSidewalkPoint, isOnRoad,
} from './city.js';
import { clamp, dist, pick, mulberry32, angleDelta } from './util.js';

export const CAR_MODELS = {
  sedan: { name: 'Sedan', len: 52, wid: 26, maxSpeed: 400, accel: 300, turn: 2.6 },
  sport: { name: 'Sport', len: 54, wid: 25, maxSpeed: 560, accel: 420, turn: 3.0 },
  taxi: { name: 'Taxi', len: 52, wid: 26, maxSpeed: 410, accel: 310, turn: 2.6 },
  van: { name: 'Van', len: 62, wid: 28, maxSpeed: 320, accel: 220, turn: 2.1 },
  truck: { name: 'Truck', len: 74, wid: 30, maxSpeed: 300, accel: 190, turn: 1.8 },
  cop: { name: 'Interceptor', len: 54, wid: 26, maxSpeed: 500, accel: 380, turn: 3.0 },
};

const CAR_COLORS = {
  sedan: ['#c23b2e', '#2e5fa3', '#e8e4da', '#3a3f44', '#7a4a8f', '#4a8a5a', '#c9a227'],
  sport: ['#e01e37', '#f5a623', '#1fb6d4', '#8a2be2', '#111111', '#e8e4da'],
  taxi: ['#f7c948'],
  van: ['#e8e4da', '#8a97a3', '#5a6b7a', '#b5543f'],
  truck: ['#6b7c8a', '#a8642e', '#4a5a3a'],
  cop: ['#1a1d22'],
};

const PED_SHIRTS = ['#e4572e', '#2e86ab', '#f6bd60', '#7fb069', '#c77dff', '#f4845f', '#5f6caf', '#e8e4da', '#3a3f44'];
const PED_SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

let nextCarId = 1;
let nextPedId = 1;

export function makeCar(model, x, y, angle, driver) {
  const spec = CAR_MODELS[model];
  return {
    id: nextCarId++,
    model,
    name: spec.name,
    x, y,
    angle,
    speed: 0,
    color: pick(Math.random, CAR_COLORS[model]),
    driver: driver || 'traffic', // 'traffic' | 'player' | 'cop' | 'parked'
    hp: 100,
    parked: driver === 'parked',
    // traffic AI
    vertical: Math.random() < 0.5,
    dir: Math.random() < 0.5 ? 1 : -1,
    cruise: 130 + Math.random() * 60,
    waitAtLight: 0,
    smoke: 0,
    honkCd: 0,
  };
}

export function makePed(x, y, rng) {
  return {
    id: nextPedId++,
    x, y,
    angle: rng() * Math.PI * 2,
    speed: 0,
    walkSpeed: 42 + rng() * 26,
    shirt: pick(rng, PED_SHIRTS),
    skin: pick(rng, PED_SKINS),
    tx: x, ty: y, // current sidewalk target
    state: 'walk', // walk | idle | flee | down
    stateT: 0,
    dead: false,
    fleeX: 0, fleeY: 0,
  };
}

// Traffic lights: intersections where (i + j) is even get a light that cycles.
export function lightState(time, i, j) {
  if ((i + j) % 2 !== 0) return 'green';
  const phase = Math.floor(time / 6) % 2;
  return phase === 0 ? 'ns' : 'ew'; // which axis has green
}

export function createWorld(seed) {
  const rng = mulberry32(seed);
  return {
    rng,
    time: 0,
    player: {
      x: 620, y: 1560, angle: -Math.PI / 2, hp: 100, money: 250,
      inCar: null, onFootSpeed: 0, sprinting: false,
      punchCd: 0, shootCd: 0, hurtCd: 0, dead: false,
    },
    cars: [],
    peds: [],
    cops: [],
    heli: null, // police helicopter, live at wanted level 4 (see police.js)
    bullets: [],
    particles: [],
    pickups: [],
    trafficTarget: 14,
    pedTarget: 20,
  };
}

function spawnTrafficCar(world, player) {
  for (let tries = 0; tries < 12; tries++) {
    // Pick the orientation FIRST, then a point on a road of that orientation,
    // so the car always faces along the road it spawns on.
    const vertical = world.rng() < 0.5;
    const c = pick(world.rng, ROAD_CENTERS);
    const along = 100 + world.rng() * 3000;
    const p = vertical ? { x: c, y: along } : { x: along, y: c };
    const d = dist(p.x, p.y, player.x, player.y);
    if (d < 450 || d > 900) continue;
    if (world.cars.some((car) => dist(car.x, car.y, p.x, p.y) < 90)) continue;
    const model = pick(world.rng, ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sport', 'truck']);
    const dir = world.rng() < 0.5 ? 1 : -1;
    const lane = 17;
    const x = vertical ? p.x + (dir > 0 ? lane : -lane) : p.x;
    const y = vertical ? p.y : p.y + (dir > 0 ? lane : -lane);
    const angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = makeCar(model, x, y, angle, 'traffic');
    car.vertical = vertical;
    car.dir = dir;
    car.speed = car.cruise * (0.7 + world.rng() * 0.3);
    world.cars.push(car);
    return;
  }
}

export function spawnParkedCar(world, player) {
  for (let tries = 0; tries < 12; tries++) {
    // Same rule as traffic: orientation first, then a point on a road of
    // that orientation, so a parked car always sits along its road.
    const vertical = world.rng() < 0.5;
    const c = pick(world.rng, ROAD_CENTERS);
    const along = 100 + world.rng() * 3000;
    const p = vertical ? { x: c, y: along } : { x: along, y: c };
    const d = dist(p.x, p.y, player.x, player.y);
    if (d < 300 || d > 900) continue;
    if (world.cars.some((car) => dist(car.x, car.y, p.x, p.y) < 80)) continue;
    const side = world.rng() < 0.5 ? 1 : -1;
    const x = vertical ? p.x + side * 26 : p.x;
    const y = vertical ? p.y : p.y + side * 26;
    const angle = vertical ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    const model = pick(world.rng, ['sedan', 'sedan', 'sport', 'van']);
    const car = makeCar(model, x, y, angle, 'parked');
    world.cars.push(car);
    return;
  }
}

function spawnPed(world, player) {
  for (let tries = 0; tries < 10; tries++) {
    const p = randomSidewalkPoint(world.rng);
    const d = dist(p.x, p.y, player.x, player.y);
    if (d < 260 || d > 900) continue;
    if (world.peds.some((q) => dist(q.x, q.y, p.x, p.y) < 40)) continue;
    const ped = makePed(p.x, p.y, world.rng);
    const t = randomSidewalkPoint(world.rng);
    ped.tx = t.x;
    ped.ty = t.y;
    world.peds.push(ped);
    return;
  }
}

export function maintainPopulation(world, player) {
  const traffic = world.cars.filter((c) => c.driver === 'traffic').length;
  // Spawn up to two a call when the streets are empty, so the city fills fast.
  for (let i = 0; i < 2 && world.cars.filter((c) => c.driver === 'traffic').length < world.trafficTarget; i++) {
    spawnTrafficCar(world, player);
  }
  const parked = world.cars.filter((c) => c.driver === 'parked').length;
  if (parked < 8) spawnParkedCar(world, player);
  for (let i = 0; i < 2 && world.peds.filter((p) => !p.dead).length < world.pedTarget; i++) {
    spawnPed(world, player);
  }
  // Despawn far-away traffic and peds so the streets stay fresh.
  world.cars = world.cars.filter((c) => {
    if (c.driver === 'player') return true;
    return dist(c.x, c.y, player.x, player.y) < 1100;
  });
  world.peds = world.peds.filter((p) => dist(p.x, p.y, player.x, player.y) < 1000 || p.dead);
}

function carAhead(world, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = null;
  let bestD = Infinity;
  for (const o of world.cars) {
    if (o === car) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const along = dx * fx + dy * fy;
    if (along <= 0 || along > 110) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side < 30 && along < bestD) { bestD = along; best = o; }
  }
  return best ? { d: bestD, car: best } : null;
}

function lightAhead(world, car) {
  // Only matter when approaching an intersection along the car's axis.
  const ahead = 46;
  const ax = car.x + Math.cos(car.angle) * ahead;
  const ay = car.y + Math.sin(car.angle) * ahead;
  for (let i = 0; i < ROAD_CENTERS.length; i++) {
    for (let j = 0; j < ROAD_CENTERS.length; j++) {
      const cx = ROAD_CENTERS[i];
      const cy = ROAD_CENTERS[j];
      if (Math.abs(ax - cx) < 26 && Math.abs(ay - cy) < 26) {
        const state = lightState(world.time, i, j);
        if (state === 'green') return false;
        if (car.vertical) return state === 'ew';
        return state === 'ns';
      }
    }
  }
  return false;
}

function updateTrafficCar(world, car, dt) {
  const spec = CAR_MODELS[car.model];
  // At an intersection centre, sometimes turn. The lane offset is 17, so the
  // car is up to ~17 off the centre line on its own axis: test within 20.
  const nearX = Math.abs(car.x - nearestCenter(car.x)) < 20;
  const nearY = Math.abs(car.y - nearestCenter(car.y)) < 20;
  if (nearX && nearY && world.rng() < dt * 0.9) {
    const turn = world.rng();
    if (turn < 0.3) {
      // Turn left or right: rotate the heading by 90 degrees, then re-derive
      // the axis and the travel direction from the new heading.
      const left = world.rng() < 0.5;
      car.angle += left ? -Math.PI / 2 : Math.PI / 2;
      car.vertical = Math.abs(Math.sin(car.angle)) > Math.abs(Math.cos(car.angle));
      car.dir = car.vertical
        ? (Math.sin(car.angle) > 0 ? 1 : -1)
        : (Math.cos(car.angle) > 0 ? 1 : -1);
      // Snap onto the new lane centre so the turn looks clean.
      if (car.vertical) car.x = nearestCenter(car.x) + (car.dir > 0 ? 17 : -17);
      else car.y = nearestCenter(car.y) + (car.dir > 0 ? 17 : -17);
    } else if (turn < 0.38) {
      car.dir *= -1;
      car.angle += Math.PI;
    }
  }

  // Target speed: cruise, slower for a car ahead or a red light. A parked car
  // ahead is overtaken: swing to the opposite lane and keep speed.
  let target = car.cruise;
  const ahead = carAhead(world, car);
  if (ahead) {
    if (ahead.car.driver === 'parked' && ahead.d < 95) car.overtakeT = 2.2;
    if (ahead.d < 80) target = Math.min(target, Math.max(0, (ahead.d - 34) * 3));
  }
  if (car.overtakeT > 0) {
    car.overtakeT -= dt;
    target = car.cruise;
  }
  if (lightAhead(world, car)) target = 0;
  if (target < car.speed) car.speed = Math.max(target, car.speed - 320 * dt);
  else car.speed = Math.min(target, car.speed + spec.accel * 0.5 * dt);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // Stay on the road: snap the perpendicular axis back to the lane, and hard
  // clamp it inside the asphalt so a traffic jam can never shove a car off.
  // While overtaking, the lane is the opposite side of the road.
  const lane = 17;
  const laneSign = car.overtakeT > 0 ? -1 : 1;
  if (car.vertical) {
    const wantX = nearestCenter(car.x) + (car.dir > 0 ? lane : -lane) * laneSign;
    car.x += (wantX - car.x) * Math.min(1, 10 * dt);
    const cx = nearestCenter(car.x);
    if (Math.abs(car.x - cx) < 60) car.x = clamp(car.x, cx - 28, cx + 28);
  } else {
    const wantY = nearestCenter(car.y) + (car.dir > 0 ? lane : -lane) * laneSign;
    car.y += (wantY - car.y) * Math.min(1, 10 * dt);
    const cy = nearestCenter(car.y);
    if (Math.abs(car.y - cy) < 60) car.y = clamp(car.y, cy - 28, cy + 28);
  }
  car.x = clamp(car.x, 60, WORLD_W - 60);
  car.y = clamp(car.y, 60, BEACH_Y - 60);
  if (car.honkCd > 0) car.honkCd -= dt;
}

function nearestCenter(v) {
  let best = ROAD_CENTERS[0];
  let bd = Infinity;
  for (const c of ROAD_CENTERS) {
    const d = Math.abs(v - c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function updateTraffic(world, dt) {
  for (const car of world.cars) {
    if (car.driver === 'traffic') updateTrafficCar(world, car, dt);
  }
  // Gentle car-car separation so traffic does not pile up. Parked cars never
  // move: traffic goes around them instead of shoving them off their spot.
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.driver === 'player' || b.driver === 'player') continue;
      if (a.driver === 'parked' || b.driver === 'parked') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 44;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

export function updatePeds(world, dt, threats) {
  for (const ped of world.peds) {
    if (ped.dead) continue;
    ped.stateT -= dt;
    // Flee from a nearby threat (gunfire, explosion, speeding car).
    let fx = 0;
    let fy = 0;
    let scared = false;
    for (const t of threats) {
      const d = dist(ped.x, ped.y, t.x, t.y);
      if (d < t.r) {
        scared = true;
        fx += (ped.x - t.x) / (d + 1);
        fy += (ped.y - t.y) / (d + 1);
      }
    }
    if (scared && ped.state !== 'flee') {
      ped.state = 'flee';
      ped.stateT = 1.5 + Math.random() * 1.5;
    }
    if (ped.state === 'flee') {
      const len = Math.hypot(fx, fy) || 1;
      ped.angle = Math.atan2(fy / len, fx / len);
      ped.speed = 200;
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      if (ped.stateT <= 0) ped.state = 'walk';
    } else if (ped.state === 'idle') {
      ped.speed = 0;
      if (ped.stateT <= 0) {
        ped.state = 'walk';
        const t = randomSidewalkPoint(world.rng);
        ped.tx = t.x;
        ped.ty = t.y;
      }
    } else {
      const d = dist(ped.x, ped.y, ped.tx, ped.ty);
      if (d < 12) {
        if (Math.random() < 0.25) {
          ped.state = 'idle';
          ped.stateT = 1 + Math.random() * 3;
        } else {
          const t = randomSidewalkPoint(world.rng);
          ped.tx = t.x;
          ped.ty = t.y;
        }
        ped.speed = 0;
      } else {
        ped.angle = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
        ped.speed = ped.walkSpeed;
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
    }
    ped.x = clamp(ped.x, 40, WORLD_W - 40);
    ped.y = clamp(ped.y, 40, WORLD_H - 40);
  }
}

// Player on foot: move with collision against buildings and cars.
export function movePlayerOnFoot(world, city, vx, vy, dt) {
  const p = world.player;
  const speed = 175;
  const sprint = 265;
  const sprinting = (vx !== 0 || vy !== 0) && world._sprintKey;
  const sp = sprinting ? sprint : speed;
  p.sprinting = sprinting;
  p.x += vx * sp * dt;
  p.y += vy * sp * dt;
  if (vx !== 0 || vy !== 0) p.angle = Math.atan2(vy, vx);
  p.onFootSpeed = (vx !== 0 || vy !== 0) ? sp : 0;
  const [nx, ny] = collideBuildings(city, p.x, p.y, 14);
  p.x = nx;
  p.y = ny;
  // Soft push out of cars.
  for (const car of world.cars) {
    const d = dist(p.x, p.y, car.x, car.y);
    const min = 30;
    if (d < min && d > 0.01) {
      p.x += ((p.x - car.x) / d) * (min - d);
      p.y += ((p.y - car.y) / d) * (min - d);
    }
  }
  p.x = clamp(p.x, 30, WORLD_W - 30);
  p.y = clamp(p.y, 30, WORLD_H - 30);
}

export function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const car of world.cars) {
    if (car.driver === 'player') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function enterCar(world, car) {
  const p = world.player;
  if (!car || p.inCar) return false;
  if (car.driver === 'traffic') {
    // Yank the driver out: they flee on foot.
    const ped = makePed(car.x + 30, car.y + 30, world.rng);
    ped.state = 'flee';
    ped.stateT = 3;
    world.peds.push(ped);
  }
  car.driver = 'player';
  car.parked = false;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  return true;
}

export function exitCar(world) {
  const p = world.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = 'parked';
  car.parked = true;
  car.speed = 0;
  const side = 34;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * side;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * side;
  p.inCar = null;
}

// Arcade driving: accelerate, brake, steer; two-circle collision with buildings.
export function updatePlayerCar(world, city, input, dt) {
  const p = world.player;
  const car = p.inCar;
  if (!car) return;
  const spec = CAR_MODELS[car.model];
  const forward = input.down('KeyW') || input.down('ArrowUp');
  const back = input.down('KeyS') || input.down('ArrowDown');
  const left = input.down('KeyA') || input.down('ArrowLeft');
  const right = input.down('KeyD') || input.down('ArrowRight');
  if (forward) car.speed += spec.accel * dt;
  else if (back) car.speed -= (car.speed > 8 ? spec.accel * 0.9 : spec.accel * 0.45) * dt;
  else {
    // Rolling drag.
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  }
  car.speed = clamp(car.speed, -160, spec.maxSpeed);
  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  const steerFactor = clamp(Math.abs(car.speed) / 140, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * spec.turn * steerFactor * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Two-circle building collision (front and rear).
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const half = spec.len / 2 - 8;
  for (const [cx, cy] of [[car.x + fx * half, car.y + fy * half], [car.x - fx * half, car.y - fy * half]]) {
    const [rx, ry] = collideBuildings(city, cx, cy, 15);
    if (rx !== cx || ry !== cy) {
      const pushX = rx - cx;
      const pushY = ry - cy;
      car.x += pushX;
      car.y += pushY;
      if (Math.abs(car.speed) > 180) {
        car.hp -= 6;
        car.speed *= 0.45;
        world._lastCrash = { t: world.time, speed: Math.abs(car.speed) };
      } else {
        car.speed *= 0.6;
      }
    }
  }
  // Car-car bumps.
  for (const o of world.cars) {
    if (o === car) continue;
    const d = dist(car.x, car.y, o.x, o.y);
    const min = 42;
    if (d < min && d > 0.01) {
      const nx = (car.x - o.x) / d;
      const ny = (car.y - o.y) / d;
      const push = (min - d) / 2;
      car.x += nx * push;
      car.y += ny * push;
      if (o.driver !== 'parked') {
        o.x -= nx * push;
        o.y -= ny * push;
      }
      if (Math.abs(car.speed) > 200) {
        car.speed *= 0.7;
        car.hp -= 4;
        if (o.driver === 'traffic') o.speed = Math.max(o.speed, 40);
        world._lastCrash = { t: world.time, speed: Math.abs(car.speed) };
      }
    }
  }
  // Running over pedestrians.
  for (const ped of world.peds) {
    if (ped.dead) continue;
    const d = dist(car.x, car.y, ped.x, ped.y);
    if (d < 26 && Math.abs(car.speed) > 60) {
      ped.dead = true;
      ped.state = 'down';
      car.speed *= 0.94;
      world._ranOverPed = ped;
    }
  }
  car.x = clamp(car.x, 40, WORLD_W - 40);
  car.y = clamp(car.y, 40, WORLD_H - 40);
  p.x = car.x;
  p.y = car.y;
  if (car.hp <= 0 && !car._exploded) {
    car._exploded = true;
    world._carExploded = car;
  }
  if (car.hp < 45 && Math.random() < dt * 6) {
    world.particles.push({
      kind: 'smoke', x: car.x - fx * 10, y: car.y - fy * 10, vx: 0, vy: -20,
      life: 0.8, max: 0.8, size: 10, color: '#555',
    });
  }
}
