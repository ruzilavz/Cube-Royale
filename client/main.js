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
const BLOCK_SIZE = 10;

function lighten(color, amount) {
  const rgb = PIXI.utils.hex2rgb(color);
  return PIXI.utils.rgb2hex(rgb.map(c => Math.min(1, c + amount)));
}

function darken(color, amount) {
  const rgb = PIXI.utils.hex2rgb(color);
  return PIXI.utils.rgb2hex(rgb.map(c => Math.max(0, c - amount)));
}

function drawVoxel(g, color) {
  const light = lighten(color, 0.2);
  const dark = darken(color, 0.2);
  g.beginFill(color);
  g.drawRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
  g.endFill();
  g.beginFill(light);
  g.drawRect(0, 0, BLOCK_SIZE, BLOCK_SIZE * 0.4);
  g.endFill();
  g.beginFill(dark);
  g.drawRect(0, BLOCK_SIZE * 0.6, BLOCK_SIZE, BLOCK_SIZE * 0.4);
  g.endFill();
}

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

  player = createCube(0x00ff00, BLOCK_SIZE * 2); // start with 4 blocks
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
  const container = new PIXI.Container();
  container.size = size;
  container.color = color;
  container.isCube = true;
  container.grid = [];
  const count = Math.round(size / BLOCK_SIZE);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const block = new PIXI.Graphics();
      drawVoxel(block, color);
      block.x = -size / 2 + i * BLOCK_SIZE;
      block.y = -size / 2 + j * BLOCK_SIZE;
      container.addChild(block);
      container.grid.push(block);
    }
  }
  container.massSize = container.grid.length;
  container.blockSize = BLOCK_SIZE;
  if (withPhysics) {
    const body = Bodies.rectangle(0, 0, size, size, { frictionAir: 0.2 });
    container.body = body;
    body.g = container;
    MWorld.add(engine.world, body);
    cubes.push(container);
  }
  updateCubeLayout(container);
  return container;
}

function updateCubeLayout(cube) {
  const count = Math.ceil(Math.sqrt(cube.grid.length));
  const newSize = count * BLOCK_SIZE;
  if (cube.body && cube.size !== newSize) {
    const scale = newSize / cube.size;
    Body.scale(cube.body, scale, scale);
  }
  cube.size = newSize;
  let idx = 0;
  for (let j = 0; j < count; j++) {
    for (let i = 0; i < count && idx < cube.grid.length; i++) {
      const block = cube.grid[idx];
      block.x = -cube.size / 2 + i * BLOCK_SIZE;
      block.y = -cube.size / 2 + j * BLOCK_SIZE;
      idx++;
    }
  }
  cube.massSize = cube.grid.length;
}

function destroyCube(cube) {
  if (cube.body) {
    MWorld.remove(engine.world, cube.body);
    const idx = cubes.indexOf(cube);
    if (idx !== -1) cubes.splice(idx, 1);
  }
  world.removeChild(cube);
  if (cube === player) {
    player = null;
  }
  const bIdx = bots.indexOf(cube);
  if (bIdx !== -1) bots.splice(bIdx, 1);
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


function gameLoop(delta, targetX, targetY) {
  if (!player) return;
  // движение игрока
  const dx = targetX;
  const dy = targetY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) {
    const speed = 2;
    Body.translate(player.body, { x: (dx / len) * speed * delta, y: (dy / len) * speed * delta });
  }
  Engine.update(engine, delta * 16);

  for (const f of foods) {
    if (f.isFragment) {
      const t = app.ticker.lastTime / 1000;
      const scale = 1 + 0.1 * Math.sin(t + f.pulseOffset);
      f.scale.set(scale, scale);
    }
  }

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
  removeParticle(p);
  const block = new PIXI.Graphics();
  drawVoxel(block, cube.color);
  cube.addChild(block);
  cube.grid.push(block);
  updateCubeLayout(cube);
}

function createBots(count) {
  for (let i = 0; i < count; i++) {
    const bot = createCube(0xff0000, BLOCK_SIZE * 2); // start with 4 blocks
    Body.setPosition(bot.body, { x: (Math.random() - 0.5) * WORLD_SIZE, y: (Math.random() - 0.5) * WORLD_SIZE });
    bot.massSize = bot.grid.length;
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
      if (bot.massSize >= nearest.massSize) {
        if (dist < 150) {
          // keep some distance when too close
          dir = Vector.sub(bot.body.position, nearest.body.position);
        } else {
          dir = Vector.sub(nearest.body.position, bot.body.position);
        }
      } else {
        // flee from stronger cubes
        dir = Vector.sub(bot.body.position, nearest.body.position);
      }
      const len = Vector.magnitude(dir);
      if (len > 0) {
        const speed = 2;
        Body.translate(bot.body, { x: (dir.x / len) * speed * delta, y: (dir.y / len) * speed * delta });
      }
    } else {
      // wander randomly when no targets
      if (!bot.wanderDir || Math.random() < 0.02) {
        bot.wanderDir = Vector.normalise({ x: Math.random() - 0.5, y: Math.random() - 0.5 });
      }
      const speed = 1.5;
      Body.translate(bot.body, { x: bot.wanderDir.x * speed * delta, y: bot.wanderDir.y * speed * delta });
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
  if (c1.massSize === c2.massSize) return;
  let smaller = c1.massSize < c2.massSize ? c1 : c2;
  let larger = c1.massSize < c2.massSize ? c2 : c1;
  const removeCount = Math.min(3, smaller.grid.length);
  removeCubeBlocks(smaller, removeCount, larger.body.position);
}

function createFragmentFromCollision(size, pos, from, color) {
  const frag = new PIXI.Graphics();
  drawVoxel(frag, color);
  frag.x = pos.x;
  frag.y = pos.y;
  frag.isFood = true;
  frag.isFragment = true;
  frag.alpha = 0.8;
  frag.pulseOffset = Math.random() * Math.PI * 2;
  if (PIXI.filters && PIXI.filters.DropShadowFilter) {
    frag.filters = [new PIXI.filters.DropShadowFilter({
      distance: 2,
      alpha: 0.5,
      blur: 2,
    })];
  }
  frag.massSize = size;
  const body = Bodies.rectangle(pos.x, pos.y, size, size, {
    isSensor: true,
    frictionAir: 0.05,
  });
  frag.body = body;
  body.g = frag;
  const dir = Vector.normalise(Vector.sub(pos, from));
  Body.setVelocity(body, { x: dir.x * 3, y: dir.y * 3 });
  MWorld.add(engine.world, body);
  foods.push(frag);
  return frag;
}

function removeCubeBlocks(cube, count, fromPos) {
  for (let i = 0; i < count && cube.grid.length > 0; i++) {
    const idx = Math.floor(Math.random() * cube.grid.length);
    const block = cube.grid.splice(idx, 1)[0];
    cube.removeChild(block);
    if (cube.body) {
      const pos = {
        x: cube.body.position.x + block.x + cube.blockSize / 2,
        y: cube.body.position.y + block.y + cube.blockSize / 2,
      };
      const frag = createFragmentFromCollision(cube.blockSize, pos, fromPos, cube.color);
      world.addChild(frag);
    }
  }
  updateCubeLayout(cube);
  if (cube.grid.length === 0) {
    destroyCube(cube);
  }
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
  if (player) {
    world.x = app.screen.width / 2 - player.body.position.x;
    world.y = app.screen.height / 2 - player.body.position.y;
  }
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
    }
  });
}

function createRemotePlayer(id) {
  if (remotePlayers[id]) return;
  const g = createCube(0x0000ff, BLOCK_SIZE * 2, false); // start with 4 blocks
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
