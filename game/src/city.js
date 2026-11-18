// city.js — Solmar Bay, a fictional sun-soaked coastal city.
// The city is a road grid with named districts, a beach on the south shore,
// parks, palms and landmark buildings. All positions are deterministic from a
// seed, so a screenshot run and a play run see the same streets.
import { mulberry32, pick, clamp } from './util.js';

export const WORLD_W = 3600;
export const WORLD_H = 3600;
export const ROAD_STEP = 300;
export const ROAD_HALF = 36; // half the asphalt width
export const ROAD_CENTERS = [];
for (let c = 150; c <= 3150; c += ROAD_STEP) ROAD_CENTERS.push(c);

export const BEACH_Y = 3300; // sand starts here
export const WATER_Y = 3470; // sea starts here

export const DISTRICTS = [
  { name: 'Downtown', x0: 0, y0: 0, x1: 3600, y1: 900 },
  { name: 'Barrio Sol', x0: 0, y0: 900, x1: 1800, y1: 2100 },
  { name: 'Palm Hills', x0: 1800, y0: 900, x1: 3600, y1: 2100 },
  { name: 'Portside', x0: 0, y0: 2100, x1: 1800, y1: 3300 },
  { name: 'Marina', x0: 1800, y0: 2100, x1: 3600, y1: 3300 },
  { name: 'Playa Dorada', x0: 0, y0: 3300, x1: 3600, y1: 3600 },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Solmar Bay';
}

export function isOnRoad(x, y) {
  if (y >= BEACH_Y) return false;
  for (const c of ROAD_CENTERS) {
    if (Math.abs(x - c) <= ROAD_HALF || Math.abs(y - c) <= ROAD_HALF) return true;
  }
  return false;
}

export function nearestRoadCenter(v) {
  let best = ROAD_CENTERS[0];
  let bd = Infinity;
  for (const c of ROAD_CENTERS) {
    const d = Math.abs(v - c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// A point on a road, snapped to the centre line of the closest road.
export function snapToRoad(x, y) {
  const dx = Math.abs(x - nearestRoadCenter(x));
  const dy = Math.abs(y - nearestRoadCenter(y));
  if (dx <= dy) return { x: nearestRoadCenter(x), y: clamp(y, 80, 3220), vertical: true };
  return { x: clamp(x, 80, 3520), y: nearestRoadCenter(y), vertical: false };
}

const ROOF_COLORS = ['#b5543f', '#c97b4a', '#8f9aa8', '#5f7d6a', '#a8665c', '#7a6a8f', '#4a6b8a', '#96805a'];
const WALL_COLORS = ['#e8d9b8', '#d9c2a3', '#cbb59a', '#e3cfae', '#d4b89a', '#c9a98c'];
const HOUSE_COLORS = ['#f2e3c6', '#e8cfae', '#dfe8d8', '#f0d7c2', '#e6d3e0', '#d8e2ea'];

export function generateCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const parks = [];
  const props = []; // benches, hydrants, lamps, dumpsters

  const addBuilding = (x, y, w, h, opts) => {
    const b = { x, y, w, h, ...opts };
    buildings.push(b);
    return b;
  };

  // Landmarks first, at fixed blocks, so missions always find them.
  // Sal's Bar — Barrio Sol, block (2, 4): roads x=450..750, y=1350..1650.
  addBuilding(520, 1400, 150, 110, {
    kind: 'landmark', name: "Sal's Bar", roof: '#7a3b2e', wall: '#e8d9b8', tall: 1,
  });
  // Solmar Bank — Downtown, block (5, 1).
  addBuilding(1580, 380, 190, 130, {
    kind: 'landmark', name: 'Solmar Bank', roof: '#4a6b8a', wall: '#dfe4e8', tall: 3,
  });
  // City Hospital — Palm Hills, block (8, 4).
  addBuilding(2480, 1400, 210, 140, {
    kind: 'landmark', name: 'City Hospital', roof: '#e8e8e8', wall: '#f2f2ea', tall: 2,
  });
  // Marina Garage — Marina, block (9, 8).
  addBuilding(2780, 2480, 220, 120, {
    kind: 'landmark', name: 'Marina Garage', roof: '#3f5a4a', wall: '#cfc4a8', tall: 1,
  });
  // Sunset Motel (safehouse) — Portside, block (1, 8).
  addBuilding(380, 2480, 170, 100, {
    kind: 'landmark', name: 'Sunset Motel', roof: '#c97b4a', wall: '#f2e3c6', tall: 1,
  });
  // Portside warehouse — Portside, block (3, 9).
  addBuilding(980, 2780, 200, 130, {
    kind: 'landmark', name: 'Portside Warehouse', roof: '#5a5a5a', wall: '#b8a888', tall: 1,
  });

  const landmarkRects = buildings.map((b) => ({ x: b.x - 8, y: b.y - 8, w: b.w + 16, h: b.h + 16 }));

  // Fill every other block.
  for (let bi = 0; bi < ROAD_CENTERS.length - 1; bi++) {
    for (let bj = 0; bj < ROAD_CENTERS.length - 1; bj++) {
      const bx0 = ROAD_CENTERS[bi] + ROAD_HALF + 8;
      const by0 = ROAD_CENTERS[bj] + ROAD_HALF + 8;
      const bx1 = ROAD_CENTERS[bi + 1] - ROAD_HALF - 8;
      const by1 = ROAD_CENTERS[bj + 1] - ROAD_HALF - 8;
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;

      // Skip blocks that hold a landmark.
      if (landmarkRects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) continue;

      const roll = rng();
      const downtown = bj <= 2;
      if (roll < 0.12) {
        // Park block: grass, trees, benches, no buildings.
        parks.push({ x: bx0, y: by0, w: bw, h: bh });
        const n = 5 + Math.floor(rng() * 6);
        for (let t = 0; t < n; t++) {
          trees.push({ x: bx0 + 20 + rng() * (bw - 40), y: by0 + 20 + rng() * (bh - 40), palm: rng() < 0.4, s: 0.8 + rng() * 0.5 });
        }
        props.push({ kind: 'bench', x: cx - 30, y: cy });
        props.push({ kind: 'bench', x: cx + 30, y: cy + 20 });
        continue;
      }
      if (downtown && roll < 0.45) {
        // Downtown tower: one big slab.
        addBuilding(bx0 + 18, by0 + 18, bw - 36, bh - 36, {
          kind: 'tower', roof: pick(rng, ROOF_COLORS), wall: pick(rng, WALL_COLORS), tall: 3 + Math.floor(rng() * 3),
        });
      } else if (roll < 0.55) {
        // Commercial row: two shops side by side.
        const half = bw / 2;
        addBuilding(bx0 + 6, by0 + 14, half - 12, bh - 28, {
          kind: 'shop', roof: pick(rng, ROOF_COLORS), wall: pick(rng, WALL_COLORS), tall: 1,
        });
        addBuilding(bx0 + half + 6, by0 + 14, half - 12, bh - 28, {
          kind: 'shop', roof: pick(rng, ROOF_COLORS), wall: pick(rng, WALL_COLORS), tall: 1,
        });
        props.push({ kind: 'awning', x: bx0 + half / 2, y: by0 + bh - 6 });
      } else {
        // Houses: two or three small homes with yards.
        const n = 2 + (rng() < 0.5 ? 1 : 0);
        for (let h = 0; h < n; h++) {
          const hx = bx0 + 10 + (h * (bw - 20)) / n;
          const hw = (bw - 20) / n - 12;
          addBuilding(hx, by0 + 16 + rng() * 30, hw, 62 + rng() * 40, {
            kind: 'house', roof: pick(rng, ROOF_COLORS), wall: pick(rng, HOUSE_COLORS), tall: 1,
          });
        }
        if (rng() < 0.6) trees.push({ x: bx0 + 24 + rng() * (bw - 48), y: by0 + bh - 26, palm: rng() < 0.5, s: 0.9 + rng() * 0.4 });
      }
      // Street lamps on the block corners.
      props.push({ kind: 'lamp', x: bx0 - 4, y: by0 - 4 });
      props.push({ kind: 'lamp', x: bx1 + 4, y: by1 + 4 });
    }
  }

  // Palm-lined beach: rows of palms on the sand, a boardwalk line, umbrellas.
  for (let x = 120; x < 3500; x += 130) {
    trees.push({ x: x + (rng() - 0.5) * 40, y: 3345 + rng() * 40, palm: true, s: 1.1 + rng() * 0.5 });
    if (rng() < 0.5) props.push({ kind: 'umbrella', x: x + 60, y: 3390 + rng() * 40 });
  }
  // Marina docks on the east edge.
  for (let y = 2200; y < 3200; y += 180) {
    props.push({ kind: 'dock', x: 3540, y });
  }

  return { buildings, trees, parks, props, seed };
}

// Resolve a circle against every building. Returns corrected [x, y].
// The caller passes a scratch list to avoid allocations in the hot loop.
export function collideBuildings(city, x, y, r) {
  let nx = x;
  let ny = y;
  for (const b of city.buildings) {
    if (nx + r < b.x || nx - r > b.x + b.w || ny + r < b.y || ny - r > b.y + b.h) continue;
    const cx = clamp(nx, b.x, b.x + b.w);
    const cy = clamp(ny, b.y, b.y + b.h);
    const dx = nx - cx;
    const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      nx = cx + (dx / d) * r;
      ny = cy + (dy / d) * r;
    } else {
      const left = nx - b.x;
      const right = b.x + b.w - nx;
      const top = ny - b.y;
      const bottom = b.y + b.h - ny;
      const m = Math.min(left, right, top, bottom);
      if (m === left) nx = b.x - r;
      else if (m === right) nx = b.x + b.w + r;
      else if (m === top) ny = b.y - r;
      else ny = b.y + b.h + r;
    }
  }
  return [nx, ny];
}

export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

export function randomRoadPoint(rng) {
  const vertical = rng() < 0.5;
  const c = pick(rng, ROAD_CENTERS);
  const along = 100 + rng() * 3000;
  return vertical ? { x: c, y: along } : { x: along, y: c };
}

export function randomSidewalkPoint(rng) {
  const p = randomRoadPoint(rng);
  const off = (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 12 + rng() * 8);
  if (p.x === nearestRoadCenter(p.x) && Math.abs(p.x - nearestRoadCenter(p.x)) < 1) {
    return { x: p.x + off, y: clamp(p.y, 90, 3200) };
  }
  return { x: clamp(p.x, 90, 3500), y: p.y + off };
}
