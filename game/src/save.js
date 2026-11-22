// save.js — save and load for Solmar Bay, via localStorage.
// Progress (cash, completed missions, packages, player position) survives a
// reload; the city itself is rebuilt from the seed, so only progress is stored.
const SAVE_KEY = 'solmar-bay-save-v1';

export function saveGame(game) {
  try {
    const p = game.world.player;
    const data = {
      version: 1,
      savedAt: Date.now(),
      money: p.money,
      hp: p.hp,
      x: p.x,
      y: p.y,
      missionsCompleted: game.missions.completed,
      missionsAvailable: game.missions.available,
      taxiFares: game.missions.taxiFares || 0,
      packagesTaken: game.missions.packages.filter((k) => k.taken).length,
      packageTotal: game.missions.packageTotal,
      playSeconds: Math.floor(game.playSeconds || 0),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* storage unavailable */ }
}

export function applySave(game, data) {
  const p = game.world.player;
  p.money = data.money;
  p.hp = data.hp;
  p.x = data.x;
  p.y = data.y;
  game.missions.completed = data.missionsCompleted || [];
  game.missions.available = data.missionsAvailable || 0;
  game.missions.taxiFares = data.taxiFares || 0;
  game.playSeconds = data.playSeconds || 0;
  const taken = data.packagesTaken || 0;
  game.missions.packages.forEach((pkg, i) => {
    pkg.taken = i < taken;
  });
  game.missions.packageTotal = data.packageTotal || taken;
}
