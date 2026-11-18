// combat.js — shooting, punching and explosions in Solmar Bay.
// The player aims with the mouse and fires with click; bullets fly, hit cars,
// pedestrians and cops, and wrecked cars explode.
import { dist, clamp } from './util.js';
import { collideBuildings } from './city.js';

export function createCombat() {
  return { shake: 0 };
}

export function fireBullet(world, x, y, angle, fromPlayer) {
  world.bullets.push({
    x: x + Math.cos(angle) * 22,
    y: y + Math.sin(angle) * 22,
    vx: Math.cos(angle) * 780,
    vy: Math.sin(angle) * 780,
    life: 0.9,
    fromPlayer,
  });
}

export function spawnExplosion(world, x, y, big) {
  const n = big ? 26 : 12;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * (big ? 320 : 180);
    world.particles.push({
      kind: 'fire',
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.5,
      max: 1,
      size: 6 + Math.random() * (big ? 14 : 8),
      color: ['#ff9f1c', '#ff5714', '#ffd23f', '#8a8a8a'][Math.floor(Math.random() * 4)],
    });
  }
  for (let i = 0; i < 8; i++) {
    world.particles.push({
      kind: 'smoke', x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30,
      life: 1.2 + Math.random(), max: 2, size: 14 + Math.random() * 10, color: '#555',
    });
  }
}

export function spawnBlood(world, x, y) {
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    world.particles.push({
      kind: 'blood', x, y,
      vx: Math.cos(a) * (30 + Math.random() * 90),
      vy: Math.sin(a) * (30 + Math.random() * 90),
      life: 0.5, max: 0.5, size: 3 + Math.random() * 3, color: '#a31621',
    });
  }
}

export function spawnMuzzle(world, x, y, angle) {
  world.particles.push({
    kind: 'muzzle',
    x: x + Math.cos(angle) * 26,
    y: y + Math.sin(angle) * 26,
    vx: 0, vy: 0, life: 0.06, max: 0.06, size: 12, color: '#ffd23f',
  });
}

// Update bullets, particles and the screen shake. ctx: { wanted, addCrime, sounds, onPlayerHurt }.
export function updateCombat(world, city, ctx, dt) {
  const p = world.player;
  // Bullets fly and hit things.
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    // Walls stop bullets.
    const [rx, ry] = collideBuildings(city, b.x, b.y, 2);
    if (rx !== b.x || ry !== b.y) {
      b.life = 0;
      world.particles.push({ kind: 'spark', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.15, max: 0.15, size: 5, color: '#ffd23f' });
      continue;
    }
    if (b.fromPlayer) {
      // Hit a pedestrian.
      for (const ped of world.peds) {
        if (ped.dead) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 16) {
          b.life = 0;
          ped.dead = true;
          ped.state = 'down';
          spawnBlood(world, ped.x, ped.y);
          ctx.addCrime('killPed');
          break;
        }
      }
      if (b.life <= 0) continue;
      // Hit a foot cop.
      for (const cop of world.cops || []) {
        if (cop.dead) continue;
        if (dist(b.x, b.y, cop.x, cop.y) < 16) {
          b.life = 0;
          cop.dead = true;
          spawnBlood(world, cop.x, cop.y);
          ctx.addCrime('killCop');
          break;
        }
      }
      if (b.life <= 0) continue;
      // Hit a car (not the player's own).
      for (const car of world.cars) {
        if (car === p.inCar) continue;
        if (dist(b.x, b.y, car.x, car.y) < 30) {
          b.life = 0;
          car.hp -= 12;
          world.particles.push({ kind: 'spark', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.15, max: 0.15, size: 6, color: '#ffd23f' });
          if (car.hp <= 0 && !car._exploded) {
            car._exploded = true;
            world._carExploded = car;
          }
          break;
        }
      }
    } else {
      // Enemy bullets (reserved for later: cops do not shoot in this build).
      if (dist(b.x, b.y, p.x, p.y) < 14 && !p.inCar) {
        b.life = 0;
        ctx.onPlayerHurt(10);
      }
    }
  }
  world.bullets = world.bullets.filter((b) => b.life > 0);

  // Particles age and drift.
  for (const pt of world.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= (1 - 2 * dt);
    pt.vy *= (1 - 2 * dt);
    pt.life -= dt;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);

  // A wrecked car blows up.
  if (world._carExploded) {
    const car = world._carExploded;
    world._carExploded = null;
    spawnExplosion(world, car.x, car.y, true);
    ctx.sounds.explosion();
    ctx.shake = 0.5;
    // The blast hurts nearby peds and the player.
    for (const ped of world.peds) {
      if (!ped.dead && dist(ped.x, ped.y, car.x, car.y) < 90) {
        ped.dead = true;
        ped.state = 'down';
      }
    }
    if (!p.inCar && dist(p.x, p.y, car.x, car.y) < 80) ctx.onPlayerHurt(30);
    if (p.inCar === car) {
      ctx.onPlayerHurt(40);
    }
    world.cars = world.cars.filter((c) => c !== car);
    if (p.inCar === car) p.inCar = null;
  }
}

// The player's own shooting: mouse aim, click to fire, with a short cooldown.
export function playerShoot(world, aimAngle, ctx) {
  const p = world.player;
  if (p.shootCd > 0 || p.inCar || p.dead) return;
  p.shootCd = 0.22;
  p.angle = aimAngle;
  fireBullet(world, p.x, p.y, aimAngle, true);
  spawnMuzzle(world, p.x, p.y, aimAngle);
  ctx.sounds.shoot();
  ctx.shake = Math.max(ctx.shake, 0.08);
  // Firing in the open draws the law.
  ctx.addCrime('shoot', 12);
}

// A quick punch at the nearest ped or cop in front of the player.
export function playerPunch(world, ctx) {
  const p = world.player;
  if (p.punchCd > 0 || p.inCar || p.dead) return;
  p.punchCd = 0.45;
  ctx.sounds.punch();
  const reach = 34;
  const tx = p.x + Math.cos(p.angle) * reach;
  const ty = p.y + Math.sin(p.angle) * reach;
  for (const ped of world.peds) {
    if (ped.dead) continue;
    if (dist(tx, ty, ped.x, ped.y) < 22) {
      ped.dead = true;
      ped.state = 'down';
      spawnBlood(world, ped.x, ped.y);
      ctx.addCrime('assault');
      return;
    }
  }
  for (const cop of world.cops || []) {
    if (cop.dead) continue;
    if (dist(tx, ty, cop.x, cop.y) < 22) {
      cop.dead = true;
      spawnBlood(world, cop.x, cop.y);
      ctx.addCrime('killCop');
      return;
    }
  }
}

export function updatePlayerTimers(world, dt) {
  const p = world.player;
  if (p.shootCd > 0) p.shootCd -= dt;
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.hurtCd > 0) p.hurtCd -= dt;
}
