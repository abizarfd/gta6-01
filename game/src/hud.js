// hud.js — the on-screen interface: cash, health, wanted stars, the mission
// banner, toasts, subtitles and the live minimap in the corner.
import { ROAD_CENTERS, ROAD_HALF, WORLD_W, WORLD_H, BEACH_Y, WATER_Y, districtAt } from './city.js';
import { clamp, formatMoney } from './util.js';
import { credFor, rankTitle } from './progression.js';

export function drawHUD(g, game, viewW, viewH) {
  const p = game.world.player;
  const wanted = game.wanted;
  drawTopLeft(g, game, viewW);
  drawWanted(g, wanted, viewW);
  drawMissionBanner(g, game, viewW);
  drawBottomLeft(g, game, viewW, viewH);
  drawMinimap(g, game, viewW, viewH);
  drawSubtitles(g, game, viewW, viewH);
  drawToasts(g, game, viewW, viewH);
  if (game.message) drawCenterMessage(g, game, viewW, viewH);
  drawDistrictLabel(g, game, viewW, viewH);
}

function panel(g, x, y, w, h) {
  g.fillStyle = 'rgba(10, 14, 20, 0.62)';
  g.beginPath();
  g.roundRect(x, y, w, h, 8);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = 1;
  g.stroke();
}

function drawTopLeft(g, game, viewW) {
  const p = game.world.player;
  panel(g, 14, 14, 210, 74);
  // Cash.
  g.fillStyle = '#7CFC9A';
  g.font = 'bold 22px system-ui, sans-serif';
  g.textAlign = 'left';
  g.fillText(formatMoney(p.money), 26, 42);
  // Street Cred rank, top-right of the same panel.
  g.textAlign = 'right';
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.font = 'bold 9px system-ui, sans-serif';
  g.fillText('RANK', 212, 28);
  g.fillStyle = '#ffd23f';
  g.font = 'bold 12px system-ui, sans-serif';
  g.fillText(rankTitle(credFor(game.missions)).toUpperCase(), 212, 44);
  g.textAlign = 'left';
  // Health bar.
  g.fillStyle = 'rgba(255,255,255,0.2)';
  g.fillRect(26, 52, 186, 10);
  const hpW = 186 * clamp(p.hp / 100, 0, 1);
  g.fillStyle = p.hp > 50 ? '#2ecc71' : p.hp > 25 ? '#f39c12' : '#e74c3c';
  g.fillRect(26, 52, hpW, 10);
  g.fillStyle = '#fff';
  g.font = 'bold 10px system-ui, sans-serif';
  g.fillText('HEALTH', 26, 76);
  // Car health when driving.
  if (p.inCar) {
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(26, 84, 186, 6);
    g.fillStyle = '#5dade2';
    g.fillRect(26, 84, 186 * clamp(p.inCar.hp / 100, 0, 1), 6);
    g.fillStyle = '#fff';
    g.font = 'bold 10px system-ui, sans-serif';
    g.fillText(p.inCar.name.toUpperCase() + '  •  ' + Math.round(Math.abs(p.inCar.speed) * 0.36) + ' km/h', 26, 102);
  }
}

function drawWanted(g, wanted, viewW) {
  const x0 = viewW - 190;
  panel(g, x0, 14, 176, 44);
  g.font = 'bold 11px system-ui, sans-serif';
  g.textAlign = 'left';
  g.fillStyle = '#cfd6de';
  g.fillText('WANTED', x0 + 12, 30);
  for (let i = 0; i < 5; i++) {
    const cx = x0 + 78 + i * 20;
    const cy = 36;
    g.font = '20px system-ui, sans-serif';
    g.textAlign = 'center';
    if (i < wanted.level) {
      g.fillStyle = '#ffd23f';
      g.fillText('★', cx, cy);
    } else {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillText('☆', cx, cy);
    }
  }
}

function drawMissionBanner(g, game, viewW) {
  const m = game.missions;
  const step = m.active ? m.active.def.steps[m.active.step] : null;
  const taxi = m.taxi ? (m.taxi.stage === 'pickup' ? 'Pick up the fare' : 'Drop off the passenger') : null;
  const label = step ? step.label : taxi;
  if (!label) return;
  const title = m.active ? m.active.def.title : 'TAXI FARE';
  g.textAlign = 'center';
  const w = 460;
  const x = (viewW - w) / 2;
  panel(g, x, 14, w, 52);
  g.fillStyle = '#ffd23f';
  g.font = 'bold 12px system-ui, sans-serif';
  g.fillText(title.toUpperCase(), viewW / 2, 32);
  g.fillStyle = '#fff';
  g.font = '14px system-ui, sans-serif';
  g.fillText(label, viewW / 2, 52);
  // Hold-to-crack progress.
  if (step && step.type === 'hold' && m.active.holdT > 0) {
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(x + 60, 58, w - 120, 5);
    g.fillStyle = '#ffd23f';
    g.fillRect(x + 60, 58, (w - 120) * clamp(m.active.holdT / step.secs, 0, 1), 5);
  }
}

function drawBottomLeft(g, game, viewW, viewH) {
  const p = game.world.player;
  const lines = p.inCar
    ? ['W/S drive  •  A/D steer', 'E exit car  •  M mute  •  Esc pause']
    : ['WASD move  •  Shift sprint  •  Mouse aim', 'Click shoot  •  F punch  •  E enter car / talk'];
  g.font = '12px system-ui, sans-serif';
  g.textAlign = 'left';
  lines.forEach((line, i) => {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillText(line, viewH ? 16 : 16, viewH - 44 + i * 18 + 1);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText(line, 15, viewH - 44 + i * 18);
  });
}

function drawMinimap(g, game, viewW, viewH) {
  const size = 190;
  const x0 = viewW - size - 14;
  const y0 = viewH - size - 14;
  const scale = size / WORLD_W;
  panel(g, x0 - 6, y0 - 6, size + 12, size + 12);
  g.save();
  g.beginPath();
  g.rect(x0, y0, size, size);
  g.clip();
  // Land.
  g.fillStyle = '#5d7a4a';
  g.fillRect(x0, y0, size, size);
  // Sea.
  g.fillStyle = '#1d6f9e';
  g.fillRect(x0, y0 + WATER_Y * scale, size, size);
  g.fillStyle = '#ecd9a0';
  g.fillRect(x0, y0 + BEACH_Y * scale, size, (WATER_Y - BEACH_Y) * scale);
  // Roads.
  g.fillStyle = '#3a3f44';
  for (const c of ROAD_CENTERS) {
    g.fillRect(x0, y0 + (c - ROAD_HALF) * scale, size, ROAD_HALF * 2 * scale);
    g.fillRect(x0 + (c - ROAD_HALF) * scale, y0, ROAD_HALF * 2 * scale, size);
  }
  // Buildings as dots.
  g.fillStyle = 'rgba(230, 220, 190, 0.7)';
  for (const b of game.city.buildings) {
    g.fillRect(x0 + b.x * scale, y0 + b.y * scale, Math.max(1.5, b.w * scale), Math.max(1.5, b.h * scale));
  }
  // Mission target.
  if (game.missionTarget) {
    const t = game.missionTarget;
    const pulse = 3 + Math.sin(game.time * 5) * 1.5;
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(x0 + t.x * scale, y0 + t.y * scale, pulse + 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#7a5c00';
    g.lineWidth = 1;
    g.stroke();
  }
  // Taxi target.
  const taxiT = game.taxiTarget;
  if (taxiT) {
    g.fillStyle = '#f7c948';
    g.beginPath();
    g.arc(x0 + taxiT.x * scale, y0 + taxiT.y * scale, 3, 0, Math.PI * 2);
    g.fill();
  }
  // Cop cars.
  for (const car of game.world.cars) {
    if (car.driver !== 'cop') continue;
    g.fillStyle = '#ff2e2e';
    g.beginPath();
    g.arc(x0 + car.x * scale, y0 + car.y * scale, 2.5, 0, Math.PI * 2);
    g.fill();
  }
  // Police helicopter, when one is hunting the player.
  if (game.world.heli) {
    const h = game.world.heli;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(x0 + h.x * scale, y0 + h.y * scale, 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ff2e2e';
    g.lineWidth = 1.5;
    g.stroke();
  }
  // Player arrow.
  const p = game.world.player;
  g.save();
  g.translate(x0 + p.x * scale, y0 + p.y * scale);
  g.rotate(p.inCar ? p.inCar.angle : p.angle);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(7, 0);
  g.lineTo(-5, -5);
  g.lineTo(-5, 5);
  g.closePath();
  g.fill();
  g.strokeStyle = '#111';
  g.lineWidth = 1;
  g.stroke();
  g.restore();
  g.restore();
  // North label.
  g.fillStyle = '#fff';
  g.font = 'bold 10px system-ui, sans-serif';
  g.textAlign = 'left';
  g.fillText('N', x0 + 4, y0 + 12);
}

function drawSubtitles(g, game, viewW, viewH) {
  if (!game.subtitle || game.subtitleT <= 0) return;
  g.textAlign = 'center';
  const lines = wrapText(g, game.subtitle, 620);
  g.font = '16px system-ui, sans-serif';
  const lineH = 22;
  const boxH = lines.length * lineH + 14;
  const y = viewH - 250;
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.beginPath();
  g.roundRect(viewW / 2 - 330, y, 660, boxH, 8);
  g.fill();
  g.fillStyle = '#fff';
  lines.forEach((line, i) => g.fillText(line, viewW / 2, y + 22 + i * lineH));
}

function wrapText(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawToasts(g, game, viewW, viewH) {
  g.textAlign = 'center';
  game.toasts.forEach((t, i) => {
    const a = clamp(t.life / 1, 0, 1);
    const y = 96 + i * 24;
    g.font = 'bold 15px system-ui, sans-serif';
    const w = g.measureText(t.text).width + 20;
    g.globalAlpha = a * 0.85;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.roundRect(viewW / 2 - w / 2, y - 17, w, 22, 6);
    g.fill();
    g.globalAlpha = a;
    g.fillStyle = '#ffd23f';
    g.fillText(t.text, viewW / 2, y);
    g.globalAlpha = 1;
  });
}

function drawCenterMessage(g, game, viewW, viewH) {
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.roundRect(viewW / 2 - 260, viewH / 2 - 110, 520, 90, 10);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 30px system-ui, sans-serif';
  g.fillText(game.message, viewW / 2, viewH / 2 - 62);
  if (game.messageSub) {
    g.font = '15px system-ui, sans-serif';
    g.fillStyle = '#cfd6de';
    g.fillText(game.messageSub, viewW / 2, viewH / 2 - 34);
  }
}

function drawDistrictLabel(g, game, viewW, viewH) {
  if (!game.districtLabel || game.districtLabelT <= 0) return;
  g.globalAlpha = clamp(game.districtLabelT / 1.2, 0, 1);
  // Dark pill behind the label so it reads over roads and rooftops.
  g.font = 'bold 26px system-ui, sans-serif';
  const w = Math.max(g.measureText(game.districtLabel).width, 90) + 24;
  g.fillStyle = 'rgba(10,14,20,0.55)';
  g.beginPath();
  g.roundRect(8, 112, w, 56, 8);
  g.fill();
  g.textAlign = 'left';
  g.fillStyle = '#fff';
  g.fillText(game.districtLabel, 20, 140);
  g.font = '13px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText('Solmar Bay', 20, 160);
  g.globalAlpha = 1;
}

export function districtOfPlayer(game) {
  return districtAt(game.world.player.x, game.world.player.y);
}
