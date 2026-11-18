// render.js — draws Solmar Bay: the sun-soaked streets, buildings, beach,
// traffic, people and the effects that make it feel alive. Top-down 2D canvas,
// culled to the camera viewport so the whole city stays cheap to draw.
import {
  WORLD_W, WORLD_H, ROAD_CENTERS, ROAD_HALF, BEACH_Y, WATER_Y, districtAt,
} from './city.js';
import { clamp, dist } from './util.js';
import { CAR_MODELS } from './entities.js';
import { lightState } from './entities.js';

export function createCamera() {
  return { x: 0, y: 0, zoom: 1, shakeT: 0, shakeX: 0, shakeY: 0 };
}

export function updateCamera(cam, targetX, targetY, viewW, viewH, dt, shake) {
  const vw = viewW / cam.zoom;
  const vh = viewH / cam.zoom;
  const tx = clamp(targetX - vw / 2, 0, Math.max(0, WORLD_W - vw));
  const ty = clamp(targetY - vh / 2, 0, Math.max(0, WORLD_H - vh));
  cam.x += (tx - cam.x) * Math.min(1, 8 * dt);
  cam.y += (ty - cam.y) * Math.min(1, 8 * dt);
  if (shake > 0.01) {
    cam.shakeX = (Math.random() - 0.5) * shake * 22;
    cam.shakeY = (Math.random() - 0.5) * shake * 22;
  } else {
    cam.shakeX = 0;
    cam.shakeY = 0;
  }
}

function inView(cam, viewW, viewH, x, y, w, h, pad) {
  const p = pad || 60;
  return x + w > cam.x - p && x < cam.x + viewW / cam.zoom + p &&
    y + h > cam.y - p && y < cam.y + viewH / cam.zoom + p;
}

export function drawWorld(g, game, cam, viewW, viewH) {
  const { city, world } = game;
  g.save();
  g.translate(-cam.x + cam.shakeX, -cam.y + cam.shakeY);
  g.scale(cam.zoom, cam.zoom);

  drawGround(g, game, cam, viewW, viewH);
  drawRoads(g, game, cam, viewW, viewH);
  drawParks(g, game, cam, viewW, viewH);
  drawBuildings(g, game, cam, viewW, viewH);
  drawProps(g, game, cam, viewW, viewH);
  drawPickups(g, game, cam, viewW, viewH);
  drawMissionBeam(g, game);
  drawPeds(g, game, cam, viewW, viewH);
  drawCars(g, game, cam, viewW, viewH);
  drawPlayer(g, game);
  drawBullets(g, game, cam, viewW, viewH);
  drawParticles(g, game, cam, viewW, viewH);
  g.restore();

  // Warm afternoon light over everything.
  const grad = g.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.35, viewW / 2, viewH / 2, viewH * 0.95);
  grad.addColorStop(0, 'rgba(255, 214, 130, 0.05)');
  grad.addColorStop(1, 'rgba(20, 20, 60, 0.16)');
  g.fillStyle = grad;
  g.fillRect(0, 0, viewW, viewH);
}

function drawGround(g, game, cam, viewW, viewH) {
  const x0 = Math.max(0, cam.x - 40);
  const y0 = Math.max(0, cam.y - 40);
  const x1 = Math.min(WORLD_W, cam.x + viewW / cam.zoom + 40);
  const y1 = Math.min(WORLD_H, cam.y + viewH / cam.zoom + 40);
  // Grass base.
  g.fillStyle = '#79a75c';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Mow stripes for a little texture.
  g.fillStyle = 'rgba(255,255,255,0.04)';
  const stripe = 120;
  for (let y = Math.floor(y0 / stripe) * stripe; y < y1; y += stripe * 2) {
    g.fillRect(x0, y, x1 - x0, stripe);
  }
  // Beach sand.
  if (y1 > BEACH_Y) {
    g.fillStyle = '#ecd9a0';
    g.fillRect(x0, BEACH_Y, x1 - x0, Math.min(y1, WATER_Y) - BEACH_Y);
    // Wet sand line.
    g.fillStyle = '#e0c88f';
    g.fillRect(x0, WATER_Y - 14, x1 - x0, 14);
  }
  // Sea, with animated wave lines.
  if (y1 > WATER_Y) {
    const sea = g.createLinearGradient(0, WATER_Y, 0, WORLD_H);
    sea.addColorStop(0, '#3aa7c9');
    sea.addColorStop(1, '#1d6f9e');
    g.fillStyle = sea;
    g.fillRect(x0, WATER_Y, x1 - x0, y1 - WATER_Y);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const wy = WATER_Y + 18 + i * 26 + Math.sin(game.time * 1.4 + i * 2) * 4;
      g.beginPath();
      for (let x = x0; x <= x1; x += 40) {
        const yy = wy + Math.sin(x * 0.02 + game.time * 2 + i) * 3;
        if (x === x0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
  }
}

function drawRoads(g, game, cam, viewW, viewH) {
  const x0 = Math.max(0, cam.x - 60);
  const y0 = Math.max(0, cam.y - 60);
  const x1 = Math.min(WORLD_W, cam.x + viewW / cam.zoom + 60);
  const y1 = Math.min(BEACH_Y, cam.y + viewH / cam.zoom + 60);
  // Asphalt.
  g.fillStyle = '#3a3f44';
  for (const c of ROAD_CENTERS) {
    if (c > y0 - ROAD_HALF && c < y1 + ROAD_HALF) g.fillRect(x0, c - ROAD_HALF, x1 - x0, ROAD_HALF * 2);
    if (c > x0 - ROAD_HALF && c < x1 + ROAD_HALF) g.fillRect(c - ROAD_HALF, y0, ROAD_HALF * 2, y1 - y0);
  }
  // Sidewalks: pale strips hugging each road.
  g.fillStyle = '#c9bda6';
  for (const c of ROAD_CENTERS) {
    if (c > y0 - ROAD_HALF - 10 && c < y1 + ROAD_HALF + 10) {
      g.fillRect(x0, c - ROAD_HALF - 9, x1 - x0, 9);
      g.fillRect(x0, c + ROAD_HALF, x1 - x0, 9);
    }
    if (c > x0 - ROAD_HALF - 10 && c < x1 + ROAD_HALF + 10) {
      g.fillRect(c - ROAD_HALF - 9, y0, 9, y1 - y0);
      g.fillRect(c + ROAD_HALF, y0, 9, y1 - y0);
    }
  }
  // Centre dashes.
  g.fillStyle = '#e8e4da';
  for (const c of ROAD_CENTERS) {
    if (c > y0 && c < y1) {
      for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) g.fillRect(x, c - 2, 22, 4);
    }
    if (c > x0 && c < x1) {
      for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) g.fillRect(c - 2, y, 4, 22);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(232,228,218,0.75)';
  for (const cx of ROAD_CENTERS) {
    for (const cy of ROAD_CENTERS) {
      if (!inView(cam, viewW, viewH, cx, cy, 1, 1, 90)) continue;
      for (let i = -3; i <= 3; i++) {
        g.fillRect(cx + i * 10 - 3, cy - ROAD_HALF - 4, 6, 8);
        g.fillRect(cx + i * 10 - 3, cy + ROAD_HALF - 4, 6, 8);
        g.fillRect(cx - ROAD_HALF - 4, cy + i * 10 - 3, 8, 6);
        g.fillRect(cx + ROAD_HALF - 4, cy + i * 10 - 3, 8, 6);
      }
      // Traffic lights at even intersections.
      const i = ROAD_CENTERS.indexOf(cx);
      const j = ROAD_CENTERS.indexOf(cy);
      if ((i + j) % 2 === 0) {
        const state = lightState(game.time, i, j);
        drawTrafficLight(g, cx - ROAD_HALF - 6, cy - ROAD_HALF - 6, state === 'ns');
        drawTrafficLight(g, cx + ROAD_HALF + 6, cy + ROAD_HALF + 6, state === 'ew');
      }
    }
  }
  // Boardwalk along the beach.
  if (y1 > BEACH_Y) {
    g.fillStyle = '#b59a72';
    g.fillRect(x0, BEACH_Y - 16, x1 - x0, 16);
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    g.lineWidth = 1;
    for (let x = Math.floor(x0 / 60) * 60; x < x1; x += 60) {
      g.beginPath();
      g.moveTo(x, BEACH_Y - 16);
      g.lineTo(x, BEACH_Y);
      g.stroke();
    }
  }
}

function drawTrafficLight(g, x, y, green) {
  g.fillStyle = '#22252a';
  g.fillRect(x - 4, y - 8, 8, 16);
  g.fillStyle = green ? '#2ecc71' : '#e74c3c';
  g.beginPath();
  g.arc(x, y - 3, 2.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = green ? '#e74c3c' : '#2ecc71';
  g.globalAlpha = 0.25;
  g.beginPath();
  g.arc(x, y + 3, 2.6, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}

function drawParks(g, game, cam, viewW, viewH) {
  for (const park of game.city.parks) {
    if (!inView(cam, viewW, viewH, park.x, park.y, park.w, park.h)) continue;
    g.fillStyle = '#6da34e';
    g.fillRect(park.x, park.y, park.w, park.h);
    g.strokeStyle = '#5a8a40';
    g.lineWidth = 3;
    g.strokeRect(park.x, park.y, park.w, park.h);
  }
  // Trees and palms.
  for (const t of game.city.trees) {
    if (!inView(cam, viewW, viewH, t.x, t.y, 1, 1, 40)) continue;
    drawTree(g, t.x, t.y, t.palm, t.s, game.time);
  }
}

function drawTree(g, x, y, palm, s, time) {
  // Soft shadow.
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(x + 6 * s, y + 6 * s, 12 * s, 8 * s, 0, 0, Math.PI * 2);
  g.fill();
  if (palm) {
    g.strokeStyle = '#8a6b4a';
    g.lineWidth = 3.5 * s;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 3 * s, y - 14 * s, x + 6 * s, y - 20 * s);
    g.stroke();
    g.strokeStyle = '#4e9e4a';
    g.lineWidth = 2.5 * s;
    const sway = Math.sin(time * 1.2 + x * 0.05) * 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      g.beginPath();
      g.moveTo(x + 6 * s, y - 20 * s);
      g.quadraticCurveTo(
        x + 6 * s + Math.cos(a) * 12 * s,
        y - 20 * s + Math.sin(a) * 10 * s + sway,
        x + 6 * s + Math.cos(a) * 17 * s,
        y - 20 * s + Math.sin(a) * 15 * s + sway,
      );
      g.stroke();
    }
  } else {
    g.fillStyle = '#4e8a3f';
    g.beginPath();
    g.arc(x, y - 6 * s, 12 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5da34a';
    g.beginPath();
    g.arc(x - 5 * s, y - 10 * s, 8 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6b4a2f';
    g.fillRect(x - 1.5 * s, y - 2 * s, 3 * s, 8 * s);
  }
}

function drawBuildings(g, game, cam, viewW, viewH) {
  for (const b of game.city.buildings) {
    if (!inView(cam, viewW, viewH, b.x, b.y, b.w, b.h, 80)) continue;
    // Drop shadow, offset down-right like the afternoon sun.
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    // Walls.
    g.fillStyle = b.wall;
    g.fillRect(b.x, b.y, b.w, b.h);
    // Roof inset.
    g.fillStyle = b.roof;
    const inset = b.tall > 1 ? 6 : 10;
    g.fillRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2);
    // Tall towers get window grids and a roof box.
    if (b.tall > 1) {
      g.fillStyle = 'rgba(255,255,255,0.28)';
      const cols = Math.max(2, Math.floor(b.w / 26));
      const rows = Math.max(2, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          g.fillRect(b.x + 10 + (i * (b.w - 20)) / cols, b.y + 10 + (j * (b.h - 20)) / rows, 8, 6);
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(b.x + b.w / 2 - 12, b.y + b.h / 2 - 9, 24, 18);
    } else {
      // Roof details: AC unit and skylight.
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, 14, 10);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(b.x + b.w * 0.65, b.y + b.h * 0.55, 18, 12);
    }
    // Shop awning stripe.
    if (b.kind === 'shop') {
      g.fillStyle = '#e4572e';
      g.fillRect(b.x, b.y + b.h - 6, b.w, 6);
      g.fillStyle = '#f6f1e6';
      for (let x = b.x + 6; x < b.x + b.w - 6; x += 16) g.fillRect(x, b.y + b.h - 6, 8, 6);
    }
    // Landmark name.
    if (b.kind === 'landmark') {
      g.font = 'bold 13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillText(b.name, b.x + b.w / 2 + 1, b.y + b.h / 2 + 5);
      g.fillStyle = '#fff8ea';
      g.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
}

function drawProps(g, game, cam, viewW, viewH) {
  for (const pr of game.city.props) {
    if (!inView(cam, viewW, viewH, pr.x, pr.y, 1, 1, 30)) continue;
    if (pr.kind === 'lamp') {
      g.fillStyle = '#2c2f33';
      g.fillRect(pr.x - 2, pr.y - 2, 4, 12);
      g.fillStyle = '#ffd97a';
      g.beginPath();
      g.arc(pr.x, pr.y - 3, 3.5, 0, Math.PI * 2);
      g.fill();
    } else if (pr.kind === 'bench') {
      g.fillStyle = '#8a6b4a';
      g.fillRect(pr.x - 10, pr.y - 3, 20, 6);
    } else if (pr.kind === 'umbrella') {
      g.fillStyle = '#e4572e';
      g.beginPath();
      g.arc(pr.x, pr.y, 11, Math.PI, 0);
      g.fill();
      g.fillStyle = '#8a6b4a';
      g.fillRect(pr.x - 1, pr.y - 12, 2, 12);
    } else if (pr.kind === 'dock') {
      g.fillStyle = '#a8845a';
      g.fillRect(pr.x - 26, pr.y - 6, 52, 12);
    }
  }
}

function drawPickups(g, game, cam, viewW, viewH) {
  for (const pkg of game.missions.packages) {
    if (pkg.taken) continue;
    if (!inView(cam, viewW, viewH, pkg.x, pkg.y, 1, 1, 40)) continue;
    const bob = Math.sin(game.time * 3 + pkg.x) * 3;
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath();
    g.ellipse(pkg.x, pkg.y + 8, 10, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2ecc71';
    g.fillRect(pkg.x - 8, pkg.y - 8 + bob, 16, 12);
    g.fillStyle = '#fff';
    g.font = 'bold 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('$', pkg.x, pkg.y + 2 + bob);
  }
}

function drawMissionBeam(g, game) {
  const target = game.missionTarget;
  if (!target) return;
  const pulse = 0.5 + Math.sin(game.time * 4) * 0.2;
  // Light column.
  const grad = g.createLinearGradient(0, target.y - 260, 0, target.y);
  grad.addColorStop(0, 'rgba(255, 210, 63, 0)');
  grad.addColorStop(1, `rgba(255, 210, 63, ${0.35 + pulse * 0.15})`);
  g.fillStyle = grad;
  g.fillRect(target.x - 14, target.y - 260, 28, 260);
  // Ground ring.
  g.strokeStyle = `rgba(255, 210, 63, ${0.7 + pulse * 0.3})`;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(target.x, target.y, 26 + Math.sin(game.time * 4) * 4, 0, Math.PI * 2);
  g.stroke();
  // Floating diamond marker.
  const dy = target.y - 46 + Math.sin(game.time * 3) * 5;
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.moveTo(target.x, dy + 12);
  g.lineTo(target.x + 10, dy);
  g.lineTo(target.x, dy - 12);
  g.lineTo(target.x - 10, dy);
  g.closePath();
  g.fill();
  g.strokeStyle = '#7a5c00';
  g.lineWidth = 1.5;
  g.stroke();
}

function drawCar(g, car, time) {
  const spec = CAR_MODELS[car.model];
  const len = spec.len;
  const wid = spec.wid;
  g.save();
  g.translate(car.x, car.y);
  g.rotate(car.angle);
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(-len / 2 + 4, -wid / 2 + 5, len, wid);
  // Wheels.
  g.fillStyle = '#14161a';
  const wl = len / 2 - 9;
  const ww = wid / 2 - 1;
  g.fillRect(-wl - 4, -ww - 3, 9, 6);
  g.fillRect(wl - 5, -ww - 3, 9, 6);
  g.fillRect(-wl - 4, ww - 3, 9, 6);
  g.fillRect(wl - 5, ww - 3, 9, 6);
  // Body.
  g.fillStyle = car.color;
  roundRect(g, -len / 2, -wid / 2, len, wid, 7);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1.5;
  g.stroke();
  // Windshield + rear window.
  g.fillStyle = 'rgba(20,30,45,0.85)';
  roundRect(g, len * 0.08, -wid / 2 + 3, len * 0.2, wid - 6, 3);
  g.fill();
  roundRect(g, -len * 0.32, -wid / 2 + 3, len * 0.16, wid - 6, 3);
  g.fill();
  // Roof.
  g.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(g, -len * 0.14, -wid / 2 + 4, len * 0.2, wid - 8, 4);
  g.fill();
  if (car.model === 'cop') {
    // White doors and a flashing light bar.
    g.fillStyle = '#f2f2f2';
    g.fillRect(-len * 0.14, -wid / 2, len * 0.2, wid);
    const flash = Math.floor(time * 4) % 2 === 0;
    g.fillStyle = flash ? '#ff2e2e' : '#2e7dff';
    g.fillRect(-6, -wid / 2 + 2, 5, 6);
    g.fillStyle = flash ? '#2e7dff' : '#ff2e2e';
    g.fillRect(1, -wid / 2 + 2, 5, 6);
    g.fillStyle = '#1a2a4a';
    g.font = 'bold 8px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('POLICE', 0, wid / 2 - 4);
  }
  if (car.model === 'taxi') {
    g.fillStyle = '#14161a';
    g.fillRect(-len * 0.14, -wid / 2, 5, wid);
    g.fillStyle = '#fff';
    g.font = 'bold 7px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('TAXI', 0, -wid / 2 + 8);
  }
  if (car._hotCar) {
    // The stolen Comet GT glints gold so the player can spot it.
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 2;
    g.strokeRect(-len / 2 - 3, -wid / 2 - 3, len + 6, wid + 6);
  }
  // Damage smoke is drawn as particles by the game, not here.
  // Headlights.
  g.fillStyle = 'rgba(255, 240, 180, 0.9)';
  g.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 5);
  g.fillRect(len / 2 - 2, wid / 2 - 8, 3, 5);
  g.restore();
}

function drawCars(g, game, cam, viewW, viewH) {
  for (const car of game.world.cars) {
    if (!inView(cam, viewW, viewH, car.x, car.y, 1, 1, 60)) continue;
    drawCar(g, car, game.time);
  }
}

function drawPedBody(g, x, y, angle, shirt, skin, walking, time, id) {
  g.save();
  g.translate(x, y);
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  g.ellipse(2, 3, 9, 6, 0, 0, Math.PI * 2);
  g.fill();
  const bob = walking ? Math.sin(time * 9 + id) * 1.5 : 0;
  // Body.
  g.fillStyle = shirt;
  g.beginPath();
  g.arc(0, bob * 0.3, 9, 0, Math.PI * 2);
  g.fill();
  // Head.
  g.fillStyle = skin;
  g.beginPath();
  g.arc(Math.cos(angle) * 3, Math.sin(angle) * 3 + bob * 0.3, 5.5, 0, Math.PI * 2);
  g.fill();
  // Facing tick.
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
  g.lineTo(Math.cos(angle) * 12, Math.sin(angle) * 12);
  g.stroke();
  g.restore();
}

function drawPeds(g, game, cam, viewW, viewH) {
  for (const ped of game.world.peds) {
    if (!inView(cam, viewW, viewH, ped.x, ped.y, 1, 1, 40)) continue;
    if (ped.dead) {
      g.save();
      g.translate(ped.x, ped.y);
      g.rotate(ped.angle + Math.PI / 2);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath();
      g.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ped.shirt;
      g.beginPath();
      g.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ped.skin;
      g.beginPath();
      g.arc(10, 0, 5, 0, Math.PI * 2);
      g.fill();
      g.restore();
      continue;
    }
    drawPedBody(g, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.state !== 'idle', game.time, ped.id);
    if (ped.state === 'flee') {
      g.font = 'bold 12px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.fillText('!', ped.x, ped.y - 18);
    }
  }
  // Foot cops.
  for (const cop of game.world.cops || []) {
    if (cop.dead) continue;
    if (!inView(cam, viewW, viewH, cop.x, cop.y, 1, 1, 40)) continue;
    drawPedBody(g, cop.x, cop.y, cop.angle, '#1a2a4a', cop.skin, true, game.time, 999);
    // Police cap.
    g.fillStyle = '#101c33';
    g.beginPath();
    g.arc(cop.x + Math.cos(cop.angle) * 3, cop.y + Math.sin(cop.angle) * 3, 6, 0, Math.PI * 2);
    g.fill();
  }
}

function drawPlayer(g, game) {
  const p = game.world.player;
  if (p.dead) return;
  if (p.inCar) return; // the car drawing covers the driver
  const aim = game.aimAngle;
  g.save();
  g.translate(p.x, p.y);
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(2, 4, 11, 7, 0, 0, Math.PI * 2);
  g.fill();
  const walking = p.onFootSpeed > 10;
  const bob = walking ? Math.sin(game.time * 11) * 1.5 : 0;
  // Jax: teal jacket, dark jeans.
  g.fillStyle = '#0f766e';
  g.beginPath();
  g.arc(0, bob * 0.3, 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f1c27d';
  g.beginPath();
  g.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3 + bob * 0.3, 6, 0, Math.PI * 2);
  g.fill();
  // Hair.
  g.fillStyle = '#1f2937';
  g.beginPath();
  g.arc(Math.cos(p.angle) * 3 - Math.cos(p.angle) * 2, Math.sin(p.angle) * 3 - Math.sin(p.angle) * 2 + bob * 0.3, 4.5, 0, Math.PI * 2);
  g.fill();
  // Gun arm toward the aim.
  g.strokeStyle = '#111827';
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(Math.cos(aim) * 18, Math.sin(aim) * 18);
  g.stroke();
  g.restore();
  // Low-health pulse.
  if (p.hp < 35 && !p.inCar) {
    g.strokeStyle = `rgba(255, 40, 40, ${0.3 + Math.sin(game.time * 6) * 0.2})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(p.x, p.y, 18, 0, Math.PI * 2);
    g.stroke();
  }
}

function drawBullets(g, game, cam, viewW, viewH) {
  g.fillStyle = '#ffd23f';
  for (const b of game.world.bullets) {
    if (!inView(cam, viewW, viewH, b.x, b.y, 1, 1, 20)) continue;
    g.beginPath();
    g.arc(b.x, b.y, 3, 0, Math.PI * 2);
    g.fill();
  }
}

function drawParticles(g, game, cam, viewW, viewH) {
  for (const pt of game.world.particles) {
    if (!inView(cam, viewW, viewH, pt.x, pt.y, 1, 1, 30)) continue;
    const a = clamp(pt.life / pt.max, 0, 1);
    g.globalAlpha = a;
    g.fillStyle = pt.color;
    if (pt.kind === 'smoke') {
      g.beginPath();
      g.arc(pt.x, pt.y, pt.size * (1.6 - a * 0.6), 0, Math.PI * 2);
      g.fill();
    } else if (pt.kind === 'muzzle') {
      g.beginPath();
      g.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      g.fill();
    } else {
      g.beginPath();
      g.arc(pt.x, pt.y, pt.size * a + 1, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
