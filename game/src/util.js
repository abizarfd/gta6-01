// util.js — small shared helpers for Solmar Bay: seeded random numbers,
// clamping, angles and geometry. Nothing here touches the DOM or the game state.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

// Shortest signed turn from angle a toward angle b, in (-PI, PI].
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDelta(a, b) * t;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function pickWeighted(rng, pairs) {
  let total = 0;
  for (const p of pairs) total += p[1];
  let roll = rng() * total;
  for (const p of pairs) {
    roll -= p[1];
    if (roll <= 0) return p[0];
  }
  return pairs[pairs.length - 1][0];
}

// Axis-aligned rectangle overlap test.
export function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Push a circle of radius r at (x, y) out of an AABB. Returns corrected [x, y].
export function circleRectResolve(x, y, r, rx, ry, rw, rh) {
  const cx = clamp(x, rx, rx + rw);
  const cy = clamp(y, ry, ry + rh);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return [x, y];
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * r, cy + (dy / d) * r];
  }
  // Centre inside the rectangle: push out along the smallest penetration axis.
  const left = x - rx;
  const right = rx + rw - x;
  const top = y - ry;
  const bottom = ry + rh - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [rx - r, y];
  if (m === right) return [rx + rw + r, y];
  if (m === top) return [x, ry - r];
  return [x, ry + rh + r];
}

export function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}
