// main.js — Solmar Bay: the bootstrap, the game loop and the glue.
// States: menu, howto, playing, paused, wasted, busted. The world, the wanted
// system, the missions, combat and the HUD all meet here.
import { generateCity, WORLD_W, WORLD_H, BEACH_Y, randomSidewalkPoint, districtAt } from './city.js';
import { createWorld, maintainPopulation, updateTraffic, updatePeds, movePlayerOnFoot, nearestCar, enterCar, exitCar, updatePlayerCar, makeCar } from './entities.js';
import { createWanted, addCrime, updateWanted, updatePolice, updatePoliceHelicopter, anyCopSees } from './police.js';
import { createMissionState, startMission, currentStep, missionTarget, updateMission, updateTaxi, taxiTarget, initPackages, updatePackages, MISSIONS, SAL_BAR, HOT_CAR_SPOT } from './missions.js';
import { updateCombat, playerShoot, playerPunch, updatePlayerTimers } from './combat.js';
import { createCamera, updateCamera, drawWorld } from './render.js';
import { drawHUD, districtOfPlayer } from './hud.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadGame, hasSave, applySave, clearSave } from './save.js';
import { credFor, rankTitle, nextRank } from './progression.js';
import { clamp, dist, formatMoney } from './util.js';

const CITY_SEED = 20261118;
const canvas = document.getElementById('game');
const g = canvas.getContext('2d');
const input = new Input(canvas);
const sounds = new SoundBank();

let viewW = 0;
let viewH = 0;
function resize() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = viewW;
  canvas.height = viewH;
}
window.addEventListener('resize', resize);
resize();

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot') || '';

function newGameState() {
  const city = generateCity(CITY_SEED);
  const world = createWorld(CITY_SEED);
  const missions = createMissionState();
  initPackages(missions);
  const state = {
    city,
    world,
    wanted: createWanted(),
    missions,
    camera: createCamera(),
    time: 0,
    playSeconds: 0,
    state: 'menu',
    subtitle: '',
    subtitleT: 0,
    toasts: [],
    message: '',
    messageSub: '',
    messageT: 0,
    aimAngle: 0,
    shake: 0,
    districtLabel: '',
    districtLabelT: 0,
    lastDistrict: '',
    hotCarSpawned: false,
    autosaveT: 0,
    menuChoice: 0,
    statusEl: document.getElementById('status'),
  };
  // Opening population: a few cars and people near Sal's Bar.
  for (let i = 0; i < 10; i++) maintainPopulation(world, world.player);
  world.player.x = SAL_BAR.x;
  world.player.y = SAL_BAR.y + 130;
  return state;
}

let game = newGameState();

function say(text, seconds) {
  game.subtitle = text;
  game.subtitleT = seconds || 4;
}

function toast(text) {
  const last = game.toasts[game.toasts.length - 1];
  if (last && last.text === text) {
    // Same message again: refresh it instead of stacking a duplicate line.
    last.life = 3;
    return;
  }
  game.toasts.push({ text, life: 3 });
  if (game.toasts.length > 3) game.toasts.shift();
}

function crime(kind, amount) {
  const before = game.wanted.level;
  addCrime(game.wanted, kind, amount);
  if (game.wanted.level > before) {
    toast('Wanted level ' + game.wanted.level + ' — the police are coming!');
    sounds.setSiren(true);
  }
}

function spawnHotCar() {
  if (game.hotCarSpawned) return;
  game.hotCarSpawned = true;
  const car = makeCar('sport', HOT_CAR_SPOT.x, HOT_CAR_SPOT.y, 0, 'parked');
  car.color = '#e01e37';
  car._hotCar = true;
  game.world.cars.push(car);
}

function beginMission(index) {
  const def = startMission(game.missions, index);
  if (!def) return;
  sounds.missionStart();
  say(def.intro, 6);
  toast('New mission: ' + def.title);
}

function respawnAtHospital() {
  const p = game.world.player;
  p.x = 2560;
  p.y = 1560;
  p.hp = 100;
  p.dead = false;
  p.inCar = null;
  game.wanted.level = 0;
  game.wanted.heat = 0;
  game.world.cars = game.world.cars.filter((c) => c.driver !== 'cop');
  game.world.cops = [];
  sounds.setSiren(false);
  game.camera.x = p.x - viewW / 2;
  game.camera.y = p.y - viewH / 2;
}

function onBusted(reason) {
  if (game.state !== 'playing') return;
  const p = game.world.player;
  const lost = Math.floor(p.money * 0.1);
  p.money -= lost;
  game.state = 'busted';
  game.message = 'BUSTED';
  game.messageSub = 'The Solmar Bay PD took $' + lost.toLocaleString('en-US') + ' in fines. Press Enter to walk free.';
  sounds.busted();
  sounds.setSiren(false);
  sounds.setEngine(false, 0);
}

function onWasted() {
  if (game.state !== 'playing') return;
  const p = game.world.player;
  const lost = Math.floor(p.money * 0.1);
  p.money -= lost;
  p.dead = true;
  game.state = 'wasted';
  game.message = 'WASTED';
  game.messageSub = 'You woke up at City Hospital, $' + lost.toLocaleString('en-US') + ' lighter. Press Enter to get back out there.';
  sounds.missionFail();
  sounds.setSiren(false);
  sounds.setEngine(false, 0);
}

function onPlayerHurt(amount) {
  const p = game.world.player;
  if (p.hurtCd > 0 || p.dead) return;
  p.hp -= amount;
  p.hurtCd = 0.5;
  game.shake = Math.max(game.shake, 0.25);
  if (p.hp <= 0) {
    p.hp = 0;
    onWasted();
  }
}

function startPlaying(fresh) {
  if (fresh) {
    game = newGameState();
  }
  game.state = 'playing';
  sounds.ensure();
  sounds.startMusic();
  game.statusEl.textContent = 'Playing Solmar Bay. Mission: ' + (game.missions.active ? game.missions.active.def.title : 'free roam');
}

// ---- Screenshot staging: ?shot=start|city|chase|mission ----
// Renders a deterministic, already-alive scene so screenshots show the game
// at its best without a player having to drive there first.
function applyShotMode() {
  const world = game.world;
  const p = world.player;
  if (shotMode === 'start') {
    game.state = 'menu';
    return;
  }
  game.state = 'playing';
  sounds.ensure();
  if (shotMode === 'city') {
    // Playa Dorada: on foot on the sand, the sea and the boardwalk in frame.
    p.x = 1950;
    p.y = 3360;
    prestep(6);
  } else if (shotMode === 'chase') {
    // Start mid-city heading east so the camera stays centred on the chase.
    const car = makeCar('sport', 1050, 750, 0, 'player');
    car.color = '#e01e37';
    car.speed = 380;
    world.cars.push(car);
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    // Four stars: the police helicopter joins the hunt at this level.
    game.wanted.level = 4;
    game.wanted.heat = 60;
    beginMission(1);
    // Put the mission target on the minimap and the beam in the world.
    prestep(1);
  } else if (shotMode === 'mission') {
    // The Solmar Job at its tensest beat: Jax at the bank vault, the hold
    // half-cracked, three stars on the board and the cruisers closing in.
    // Jax waits in the car on the road south of the bank — the cruisers
    // orbit him on the open road instead of piling onto the bank itself.
    beginMission(2);
    game.missions.active.step = 1;
    const car = makeCar('sedan', 1675, 720, -Math.PI / 2, 'player');
    world.cars.push(car);
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    game.wanted.level = 3;
    game.wanted.heat = 50;
    prestep(2);
    // The vault hold is live now: stage it half-cracked. The hold decays
    // while nobody holds E, so stage it high enough that the bar still
    // reads half-full when the shutter falls.
    if (game.missions.active) {
      game.missions.active.holdT = 8.0;
      say('Sal: Crack the vault — four seconds on the door, then grab the cash and run.', 6);
    }
  }
  game.camera.x = clamp(p.x - viewW / 2, 0, Math.max(0, WORLD_W - viewW));
  game.camera.y = clamp(p.y - viewH / 2, 0, Math.max(0, WORLD_H - viewH));
  // Keep the district label fully visible in the shot, not half-faded, and
  // refresh any toast so none of them shows half-faded either.
  game.districtLabelT = 6;
  for (const t of game.toasts) t.life = 3;
}

// Advance the simulation without rendering, so a staged scene is already busy.
function prestep(seconds) {
  const steps = Math.floor(seconds * 30);
  for (let i = 0; i < steps; i++) {
    simulate(1 / 30, true);
  }
}

function simulate(dt, staged) {
  const world = game.world;
  const p = world.player;
  game.time += dt;
  world.time = game.time;
  game.playSeconds += dt;

  // Player movement.
  if (p.inCar) {
    if (!staged) {
      // Screenshot staging: the chase shot drives itself down the straight
      // east road (y = 750) so the frame shows a moving chase, not a stall.
      const autopilot = shotMode === 'chase' && game.state === 'playing';
      const driveInput = autopilot ? {
        down: (code) => {
          if (code === 'KeyW' || code === 'ArrowUp') return true;
          if (code === 'KeyA' || code === 'ArrowLeft') return p.inCar.y > 762;
          if (code === 'KeyD' || code === 'ArrowRight') return p.inCar.y < 738;
          return false;
        },
      } : input;
      updatePlayerCar(world, game.city, driveInput, dt);
    } else if (shotMode === 'chase') {
      // Staged chase: the car drives itself forward. Other staged shots
      // hold still — a parked car at the bank should stay at the bank.
      const car = p.inCar;
      car.speed = Math.min(car.speed + 200 * dt, 420);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      p.x = car.x;
      p.y = car.y;
    }
  } else if (!staged) {
    const mv = input.moveVector();
    world._sprintKey = input.down('ShiftLeft') || input.down('ShiftRight');
    movePlayerOnFoot(world, game.city, mv.x, mv.y, dt);
  }

  maintainPopulation(world, p);
  updateTraffic(world, dt);
  const threats = [];
  if (world.bullets.length > 0) threats.push({ x: p.x, y: p.y, r: 320 });
  updatePeds(world, dt, threats);

  // Crimes the world notices on its own.
  if (world._ranOverPed) {
    world._ranOverPed = null;
    crime('killPed');
    toast('You ran someone over!');
  }
  if (world._lastCrash && game.time - world._lastCrash.t < dt * 1.5) {
    sounds.crash();
    game.shake = Math.max(game.shake, 0.2);
  }

  updatePolice(world, game.wanted, dt, onBusted);
  updatePoliceHelicopter(world, game.wanted, dt);
  updateWanted(game.wanted, dt, anyCopSees(world, p), !!p.inCar);
  sounds.setSiren(game.wanted.level > 0 && game.state === 'playing');
  sounds.setEngine(!!p.inCar && game.state === 'playing', p.inCar ? Math.abs(p.inCar.speed) / 560 : 0);

  const ctx = {
    world,
    wanted: game.wanted,
    input,
    sounds,
    say,
    toast,
    addCrime: crime,
    spawnHotCar,
    hotCarSpawned: game.hotCarSpawned,
    randomSidewalkPoint: () => randomSidewalkPoint(world.rng),
    shake: 0,
    onPlayerHurt,
  };
  updateMission(game.missions, ctx, dt);
  updateTaxi(game.missions, ctx, dt);
  updatePackages(game.missions, ctx);
  updateCombat(world, game.city, { ...ctx, shake: game.shake }, dt);
  updatePlayerTimers(world, dt);
  if (ctx.shake) game.shake = Math.max(game.shake, ctx.shake);

  // Safety net: HP can only fall through onPlayerHurt, but never let the
  // player walk around at 0 HP if some path sets it directly.
  if (p.hp <= 0 && !p.dead && game.state === 'playing') onWasted();

  // District banner.
  const d = districtOfPlayer(game);
  if (d !== game.lastDistrict) {
    game.lastDistrict = d;
    game.districtLabel = d;
    game.districtLabelT = 3;
  }
  if (game.districtLabelT > 0) game.districtLabelT -= dt;
  if (game.subtitleT > 0) game.subtitleT -= dt;
  for (const t of game.toasts) t.life -= dt;
  game.toasts = game.toasts.filter((t) => t.life > 0);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 1.4);

  // Autosave every 45 seconds of play.
  game.autosaveT += dt;
  if (game.autosaveT > 45 && game.state === 'playing') {
    game.autosaveT = 0;
    if (saveGame(game)) toast('Progress saved');
  }
}

function interactPrompt() {
  const p = game.world.player;
  const m = game.missions;
  if (p.inCar) return 'E — Exit car';
  const step = currentStep(m);
  if (step && step.type === 'talk' && dist(p.x, p.y, step.x, step.y) < step.r) return 'E — Talk';
  if (!m.active && m.available < MISSIONS.length) {
    const bar = { x: SAL_BAR.x, y: SAL_BAR.y };
    if (dist(p.x, p.y, bar.x, bar.y) < 110) return 'E — Start mission: ' + MISSIONS[m.available].title;
  }
  const car = nearestCar(game.world, p.x, p.y, 70);
  if (car) return 'E — ' + (car.driver === 'traffic' ? 'Steal the ' + car.name : 'Enter the ' + car.name);
  return '';
}

function handleInteract() {
  const p = game.world.player;
  const m = game.missions;
  if (p.inCar) {
    exitCar(game.world);
    return;
  }
  // A talk step in range takes priority over getting in a car: the mission
  // system reads the same E press later this frame and advances the step.
  const step = currentStep(m);
  if (step && step.type === 'talk' && dist(p.x, p.y, step.x, step.y) < step.r) return;
  // Start the next story mission at Sal's Bar.
  if (!m.active && m.available < MISSIONS.length) {
    const bar = { x: SAL_BAR.x, y: SAL_BAR.y };
    if (dist(p.x, p.y, bar.x, bar.y) < 110) {
      beginMission(m.available);
      return;
    }
  }
  const car = nearestCar(game.world, p.x, p.y, 70);
  if (car) {
    const wasDriven = car.driver === 'traffic';
    const copNear = game.world.cars.some((c) => c.driver === 'cop' && dist(c.x, c.y, p.x, p.y) < 320);
    enterCar(game.world, car);
    sounds.horn();
    if (wasDriven) {
      crime('stealCar');
      toast('You stole a car!');
    } else if (copNear) {
      crime('stealCar', 30);
      toast('A cop saw you take that car!');
    }
  }
}

function update(dt) {
  if (game.state === 'menu') {
    // Slow cinematic pan over Downtown behind the title.
    game.time += dt;
    game.camera.x = 1200 + Math.sin(game.time * 0.05) * 500;
    game.camera.y = 700 + Math.cos(game.time * 0.04) * 300;
    if (input.wasPressed('Enter')) startPlaying(true);
    return;
  }
  if (game.state === 'howto') {
    if (input.wasPressed('Escape') || input.wasPressed('Enter')) game.state = 'menu';
    return;
  }
  if (game.state === 'paused') {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) game.state = 'playing';
    return;
  }
  if (game.state === 'wasted' || game.state === 'busted') {
    if (input.wasPressed('Enter')) {
      respawnAtHospital();
      game.state = 'playing';
      game.message = '';
      game.messageSub = '';
    }
    return;
  }

  // Playing.
  if (input.wasPressed('Escape')) {
    game.state = 'paused';
    return;
  }
  if (input.wasPressed('KeyM')) sounds.setMuted(!sounds.muted);
  if (input.wasPressed('KeyP')) {
    if (saveGame(game)) toast('Progress saved');
  }

  const p = game.world.player;
  // Aim from the player to the mouse.
  const px = (p.x - game.camera.x) * game.camera.zoom;
  const py = (p.y - game.camera.y) * game.camera.zoom;
  game.aimAngle = Math.atan2(input.mouseY - py, input.mouseX - px);

  if (input.wasPressed('KeyE')) handleInteract();
  if (input.wasPressed('KeyF')) playerPunch(game.world, { sounds, addCrime: crime });
  if (input.mouseDown && !p.inCar) {
    playerShoot(game.world, game.aimAngle, { sounds, addCrime: crime, shake: game.shake });
  }

  simulate(dt, false);

  // Mission target for the renderer and the minimap.
  const mt = missionTarget(game.missions);
  const tt = taxiTarget(game.missions);
  game.missionTarget = mt || tt;
  game.taxiTarget = mt ? null : tt;

  updateCamera(game.camera, p.x, p.y, viewW, viewH, dt, game.shake);
}

function drawMenu() {
  // The city behind the title.
  drawWorld(g, { ...game, missionTarget: null }, game.camera, viewW, viewH);
  g.fillStyle = 'rgba(8, 12, 24, 0.55)';
  g.fillRect(0, 0, viewW, viewH);

  const cx = viewW / 2;
  g.textAlign = 'center';
  g.fillStyle = '#ffd23f';
  g.font = 'bold 84px system-ui, sans-serif';
  g.fillText('SOLMAR BAY', cx, viewH * 0.26);
  g.fillStyle = '#fff';
  g.font = '22px system-ui, sans-serif';
  g.fillText('A sun-soaked crime story  •  an open-world game', cx, viewH * 0.26 + 42);
  g.font = '15px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText('Steal cars. Outrun the law. Take back the city.', cx, viewH * 0.26 + 72);

  const buttons = [
    { label: 'NEW GAME', action: 'new' },
    ...(hasSave() ? [{ label: 'CONTINUE', action: 'continue' }] : []),
    { label: 'HOW TO PLAY', action: 'howto' },
  ];
  const bw = 320;
  const bh = 52;
  let by = viewH * 0.44;
  game._menuButtons = [];
  buttons.forEach((b, i) => {
    const y = by + i * (bh + 14);
    const hover = input.mouseX > cx - bw / 2 && input.mouseX < cx + bw / 2 && input.mouseY > y && input.mouseY < y + bh;
    g.fillStyle = hover ? '#ffd23f' : 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.roundRect(cx - bw / 2, y, bw, bh, 10);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = hover ? '#111' : '#fff';
    g.font = 'bold 18px system-ui, sans-serif';
    g.fillText(b.label, cx, y + 34);
    game._menuButtons.push({ ...b, x: cx - bw / 2, y, w: bw, h: bh });
  });
  // Handle clicks after drawing: a click starts a new game state, so the
  // draw loop must never touch the new state's fields afterwards.
  const menuButtons = game._menuButtons;
  for (const b of menuButtons) {
    const hover = input.mouseX > b.x && input.mouseX < b.x + b.w && input.mouseY > b.y && input.mouseY < b.y + b.h;
    if (hover && input.mouseClicked) {
      if (b.action === 'new') {
        clearSave();
        startPlaying(true);
      } else if (b.action === 'continue') {
        startPlaying(true);
        const data = loadGame();
        if (data) {
          applySave(game, data);
          toast('Save loaded — welcome back, Jax');
        }
      } else if (b.action === 'howto') {
        game.state = 'howto';
      }
      break;
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.font = '13px system-ui, sans-serif';
  g.fillText('WASD move  •  Mouse aim  •  Click shoot  •  E enter car / talk  •  F punch  •  Shift sprint', cx, viewH - 48);
  g.fillText('An original game. No affiliation with any existing game series.', cx, viewH - 26);
}

function drawHowTo() {
  g.fillStyle = '#10141d';
  g.fillRect(0, 0, viewW, viewH);
  const cx = viewW / 2;
  g.textAlign = 'center';
  g.fillStyle = '#ffd23f';
  g.font = 'bold 40px system-ui, sans-serif';
  g.fillText('HOW TO PLAY', cx, 90);
  const lines = [
    ['Move', 'WASD or arrow keys — hold Shift to sprint'],
    ['Aim & shoot', 'Mouse to aim, click to fire. F to punch.'],
    ['Cars', 'Walk up to a car and press E to get in. Stealing a driven car raises your wanted level.'],
    ['Wanted', 'Stars mean the police are after you. Lose them by staying out of sight — the heat cools off.'],
    ['Missions', 'Talk to Sal at Sal\'s Bar to start a story mission. Follow the gold marker.'],
    ['Side work', 'Drive a taxi for fares, or find stashed cash ($150) around the city.'],
    ['Street Cred', 'Missions, taxi fares and stashed cash raise your rank: Wheelman, Hustler, Runner, Kingpin of Solmar Bay.'],
    ['Save', 'Progress autosaves. P saves now. Esc pauses. M mutes.'],
    ['Busted / Wasted', 'Caught or killed: you lose 10% of your cash and wake up at City Hospital.'],
  ];
  g.textAlign = 'left';
  let y = 150;
  for (const [title, body] of lines) {
    g.fillStyle = '#ffd23f';
    g.font = 'bold 17px system-ui, sans-serif';
    g.fillText(title, cx - 340, y);
    g.fillStyle = '#e8e8e8';
    g.font = '16px system-ui, sans-serif';
    g.fillText(body, cx - 340, y + 24);
    y += 62;
  }
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.font = 'bold 16px system-ui, sans-serif';
  g.fillText('Press Esc or Enter to go back', cx, viewH - 60);
}

function drawPaused() {
  drawWorld(g, game, game.camera, viewW, viewH);
  drawHUD(g, game, viewW, viewH);
  g.fillStyle = 'rgba(8, 12, 24, 0.6)';
  g.fillRect(0, 0, viewW, viewH);
  const cx = viewW / 2;
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.font = 'bold 44px system-ui, sans-serif';
  g.fillText('PAUSED', cx, viewH / 2 - 40);
  g.font = '16px system-ui, sans-serif';
  g.fillStyle = '#cfd6de';
  g.fillText('Esc — resume      P — save now      M — mute', cx, viewH / 2 + 10);
  g.fillText('Progress autosaves every 45 seconds.', cx, viewH / 2 + 38);
  const cred = credFor(game.missions);
  const nr = nextRank(cred);
  g.fillStyle = '#ffd23f';
  g.fillText(
    nr ? 'Street Cred ' + cred + ' — ' + nr.left + ' to ' + nr.title : 'Street Cred ' + cred + ' — top rank, ' + rankTitle(cred),
    cx, viewH / 2 + 66,
  );
}

function drawPlaying() {
  drawWorld(g, game, game.camera, viewW, viewH);
  // Crosshair on foot.
  const p = game.world.player;
  if (!p.inCar && game.state === 'playing') {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(input.mouseX, input.mouseY, 9, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(input.mouseX - 13, input.mouseY);
    g.lineTo(input.mouseX - 5, input.mouseY);
    g.moveTo(input.mouseX + 5, input.mouseY);
    g.lineTo(input.mouseX + 13, input.mouseY);
    g.moveTo(input.mouseX, input.mouseY - 13);
    g.lineTo(input.mouseX, input.mouseY - 5);
    g.moveTo(input.mouseX, input.mouseY + 5);
    g.lineTo(input.mouseX, input.mouseY + 13);
    g.stroke();
  }
  drawHUD(g, game, viewW, viewH);
  // Interact prompt.
  const prompt = interactPrompt();
  if (prompt && game.state === 'playing') {
    g.textAlign = 'center';
    g.font = 'bold 15px system-ui, sans-serif';
    const w = g.measureText(prompt).width + 28;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.beginPath();
    g.roundRect(viewW / 2 - w / 2, viewH - 96, w, 34, 8);
    g.fill();
    g.fillStyle = '#ffd23f';
    g.fillText(prompt, viewW / 2, viewH - 73);
  }
}

function drawEndScreen() {
  drawWorld(g, game, game.camera, viewW, viewH);
  g.fillStyle = 'rgba(8, 12, 24, 0.62)';
  g.fillRect(0, 0, viewW, viewH);
  const cx = viewW / 2;
  g.textAlign = 'center';
  g.fillStyle = game.state === 'wasted' ? '#e74c3c' : '#5dade2';
  g.font = 'bold 72px system-ui, sans-serif';
  g.fillText(game.message, cx, viewH / 2 - 20);
  g.fillStyle = '#fff';
  g.font = '18px system-ui, sans-serif';
  g.fillText(game.messageSub, cx, viewH / 2 + 24);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.font = '15px system-ui, sans-serif';
  g.fillText('Press Enter to continue', cx, viewH / 2 + 60);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - (frame._last || now)) / 1000);
  frame._last = now;
  update(dt);
  if (game.state === 'menu') drawMenu();
  else if (game.state === 'howto') drawHowTo();
  else if (game.state === 'paused') drawPaused();
  else if (game.state === 'wasted' || game.state === 'busted') drawEndScreen();
  else drawPlaying();
  input.endFrame();
}

// Load a save on the menu if one exists, so Continue shows the right state.
if (hasSave()) {
  const data = loadGame();
  if (data) {
    game.missions.completed = data.missionsCompleted || [];
    game.missions.available = data.missionsAvailable || 0;
  }
}

if (shotMode) applyShotMode();

// Debug handle for automated playtests (read-only state inspection).
window.__solmar = { get game() { return game; } };

requestAnimationFrame(frame);
