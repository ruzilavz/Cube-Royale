const menu = document.getElementById('menu');
const pveBtn = document.getElementById('pveBtn');
const pvpBtn = document.getElementById('pvpBtn');

let mode = null; // 'pve' or 'pvp'
let socket;

let app, world, engine, player, foods, bots = [], remotePlayers = {}, cubes = [];

const { Engine, World: MWorld, Bodies, Body, Vector, Events } = Matter;

const WORLD_SIZE = 5000;
const FOOD_COUNT = 250;
const MAX_PLAYER_SIZE = 250;

pveBtn.addEventListener('click', () => startGame('pve'));
pvpBtn.addEventListener('click', () => startGame('pvp'));

function startGame(selected) {
  mode = selected;
  menu.style.display = 'none';
  initGame();
  if (mode === 'pve') {
    createBots(9);
  } else if (mode === 'pvp') {
    setupSocket();
  }
}

function initGame() {
  engine = Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 0;

  app = new PIXI.Application({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x222222,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
  });
  document.body.appendChild(app.view);

  world = new PIXI.Container();
  app.stage.addChild(world);

  const half = WORLD_SIZE / 2;
  MWorld.add(engine.world, [
    Bodies.rectangle(0, -half - 50, WORLD_SIZE, 100, { isStatic: true }),
    Bodies.rectangle(0, half + 50, WORLD_SIZE, 100, { isStatic: true }),
    Bodies.rectangle(-half - 50, 0, 100, WORLD_SIZE, { isStatic: true }),
    Bodies.rectangle(half + 50, 0, 100, WORLD_SIZE, { isStatic: true })
  ]);

  Events.on(engine, 'collisionStart', handleCollisions);

  const border = new PIXI.Graphics();
  border.lineStyle(4, 0xffffff);
  border.drawRect(-WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE);
  world.addChild(border);

  player = createCube(0x00ff00, 50);
  Body.setPosition(player.body, { x: 0, y: 0 });
  world.addChild(player);

  foods = [];
  for (let i = 0; i < FOOD_COUNT; i++) {
    spawnFood();
  }

  setInterval(() => {
    for (let i = 0; i < 3; i++) {
      spawnFood();
    }
  }, 5000);

  let targetX = 0;
  let targetY = 0;
  window.addEventListener('mousemove', (e) => {
    targetX = e.clientX - app.screen.width / 2;
    targetY = e.clientY - app.screen.height / 2;
  });
  window.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    targetX = touch.clientX - app.screen.width / 2;
    targetY = touch.clientY - app.screen.height / 2;
  });

  app.ticker.add((delta) => gameLoop(delta, targetX, targetY));
}

function createCube(color, size, withPhysics = true) {
  const g = new PIXI.Graphics();
  g.beginFill(color);
  g.drawRect(-size / 2, -size / 2, size, size);
  g.endFill();
  g.size = size;
  g.color = color;
  g.isCube = true;
  if (withPhysics) {
    const body = Bodies.rectangle(0, 0, size, size, { frictionAir: 0.2 });
    g.body = body;
    body.g = g;
    MWorld.add(engine.world, body);
    cubes.push(g);
  }
  return g;
}

function spawnFood() {
  const food = new PIXI.Graphics();
  const size = 5;
  food.beginFill(0xffcc00);
  food.drawCircle(0, 0, size);
  food.endFill();
  food.x = (Math.random() - 0.5) * WORLD_SIZE;
  food.y = (Math.random() - 0.5) * WORLD_SIZE;
  food.isFood = true;
  food.massSize = size;
  const body = Bodies.circle(food.x, food.y, size, { isSensor: true });
  food.body = body;
  body.g = food;
  MWorld.add(engine.world, body);
  world.addChild(food);
  foods.push(food);
}

function setCubeSize(cube, newSize) {
  const scale = newSize / cube.size;
  Body.scale(cube.body, scale, scale);
  cube.size = newSize;
  cube.clear();
  cube.beginFill(cube.color);
  cube.drawRect(-cube.size / 2, -cube.size / 2, cube.size, cube.size);
  cube.endFill();
}

function gameLoop(delta, targetX, targetY) {
  // движение игрока
  const dx = targetX;
  const dy = targetY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) {
    const speed = 2;
    Body.translate(player.body, { x: (dx / len) * speed * delta, y: (dy / len) * speed * delta });
  }
  Engine.update(engine, delta * 16);

  if (mode === 'pve') {
    updateBots(delta);
  } else if (mode === 'pvp' && socket) {
    socket.emit('update', { x: player.body.position.x, y: player.body.position.y, size: player.size });
  }

  syncGraphics();
}

function removeParticle(p) {
  MWorld.remove(engine.world, p.body);
  world.removeChild(p);
  const idx = foods.indexOf(p);
  if (idx !== -1) foods.splice(idx, 1);
}

function collectParticle(cube, p) {
  const added = p.massSize;
  const newSize = Math.min(cube.size + added, MAX_PLAYER_SIZE);
  setCubeSize(cube, newSize);
  removeParticle(p);
}

function createBots(count) {
  for (let i = 0; i < count; i++) {
    const bot = createCube(0xff0000, 50);
    Body.setPosition(bot.body, { x: (Math.random() - 0.5) * WORLD_SIZE, y: (Math.random() - 0.5) * WORLD_SIZE });
    bot.size = 50;
    bot.target = null;
    bots.push(bot);
    world.addChild(bot);
  }
}

function updateBots(delta) {
  for (const bot of bots) {
    let nearest = null;
    let dist = Infinity;
    for (const c of cubes) {
      if (c === bot) continue;
      const d = Vector.magnitude(Vector.sub(bot.body.position, c.body.position));
      if (d < dist) {
        dist = d;
        nearest = c;
      }
    }
    if (nearest) {
      let dir;
      if (bot.size >= nearest.size) {
        dir = Vector.sub(nearest.body.position, bot.body.position);
      } else {
        dir = Vector.sub(bot.body.position, nearest.body.position);
      }
      const len = Vector.magnitude(dir);
      if (len > 0) {
        const speed = 2;
        Body.translate(bot.body, { x: (dir.x / len) * speed * delta, y: (dir.y / len) * speed * delta });
      }
    }
  }
}

function handleCollisions(event) {
  for (const pair of event.pairs) {
    const a = pair.bodyA.g;
    const b = pair.bodyB.g;
    if (!a || !b) continue;
    if (a.isCube && b.isCube) {
      collideCubes(a, b);
    } else if (a.isCube && b.isFood) {
      collectParticle(a, b);
    } else if (b.isCube && a.isFood) {
      collectParticle(b, a);
    }
  }
}

function collideCubes(c1, c2) {
  if (c1.size === c2.size) return;
  let smaller = c1.size < c2.size ? c1 : c2;
  let larger = c1.size < c2.size ? c2 : c1;
  const maxParticle = Math.min(smaller.size * 0.25, smaller.size);
  const partSize = Math.max(5, Math.floor(Math.random() * maxParticle));
  if (partSize <= 0) return;
  const newSize = Math.max(5, smaller.size - partSize);
  setCubeSize(smaller, newSize);
  const pos = { x: smaller.body.position.x, y: smaller.body.position.y };
  const particle = createParticleFromCollision(partSize, pos, larger.body.position);
  world.addChild(particle);
}

function createParticleFromCollision(size, pos, from) {
  const p = new PIXI.Graphics();
  p.beginFill(0xffcc00);
  p.drawCircle(0, 0, size);
  p.endFill();
  p.x = pos.x;
  p.y = pos.y;
  p.isFood = true;
  p.massSize = size;
  const body = Bodies.circle(pos.x, pos.y, size, { isSensor: true });
  p.body = body;
  body.g = p;
  const dir = Vector.normalise(Vector.sub(pos, from));
  Body.setVelocity(body, { x: dir.x * 5, y: dir.y * 5 });
  MWorld.add(engine.world, body);
  foods.push(p);
  return p;
}

function syncGraphics() {
  for (const c of cubes) {
    c.x = c.body.position.x;
    c.y = c.body.position.y;
  }
  for (const f of foods) {
    f.x = f.body.position.x;
    f.y = f.body.position.y;
  }
  world.x = app.screen.width / 2 - player.body.position.x;
  world.y = app.screen.height / 2 - player.body.position.y;
}

function setupSocket() {
  socket = io();
  socket.on('connect', () => {
    socket.emit('join-room');
  });

  socket.on('current-players', (ids) => {
    ids.forEach((id) => createRemotePlayer(id));
  });

  socket.on('player-joined', (id) => {
    createRemotePlayer(id);
  });

  socket.on('player-left', (id) => {
    removeRemotePlayer(id);
  });

  socket.on('player-update', (data) => {
    const rp = remotePlayers[data.id];
    if (rp) {
      rp.x = data.x;
      rp.y = data.y;
      if (rp.size !== data.size) {
        rp.size = data.size;
        rp.clear();
        rp.beginFill(0x0000ff);
        rp.drawRect(-rp.size / 2, -rp.size / 2, rp.size, rp.size);
        rp.endFill();
      }
    }
  });
}

function createRemotePlayer(id) {
  if (remotePlayers[id]) return;
  const g = createCube(0x0000ff, 50, false);
  g.size = 50;
  g.x = 0;
  g.y = 0;
  remotePlayers[id] = g;
  world.addChild(g);
}

function removeRemotePlayer(id) {
  const g = remotePlayers[id];
  if (!g) return;
  world.removeChild(g);
  delete remotePlayers[id];
}
