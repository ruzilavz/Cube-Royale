const menu = document.getElementById('menu');
const pveBtn = document.getElementById('pveBtn');
const pvpBtn = document.getElementById('pvpBtn');

let mode = null; // 'pve' or 'pvp'
let socket;

let app,
  world,
  engine,
  player,
  foods,
  bots = [],
  remotePlayers = {},
  cubes = [],
  effects = [],
  leaderboardContainer;

const { Engine, World: MWorld, Bodies, Body, Vector, Events } = Matter;

const WORLD_SIZE = 5000;
const FOOD_COUNT = 250;
const MAX_PLAYER_SIZE = 250;
const BLOCK_SIZE = 10;
let cubeIdCounter = 0;

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
  if (PIXI.filters && PIXI.filters.DropShadowFilter) {
    g.filters = [
      new PIXI.filters.DropShadowFilter({
        distance: 1,
        blur: 2,
        alpha: 0.6,
      }),
    ];
  }
}

function getRandomGrowthPosition(cube) {
  const occupied = new Set(cube.grid.map((c) => `${c.x},${c.y}`));
  const candidates = [];
  for (const cell of cube.grid) {
    const dirs = [
      [BLOCK_SIZE, 0],
      [-BLOCK_SIZE, 0],
      [0, BLOCK_SIZE],
      [0, -BLOCK_SIZE],
    ];
    for (const [dx, dy] of dirs) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        occupied.add(key); // avoid duplicates
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) {
    const radius = Math.ceil(cube.size / BLOCK_SIZE);
    let x, y, key;
    do {
      x = (Math.floor(Math.random() * radius * 2) - radius) * BLOCK_SIZE;
      y = (Math.floor(Math.random() * radius * 2) - radius) * BLOCK_SIZE;
      key = `${x},${y}`;
    } while (occupied.has(key));
    return { x, y };
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
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

  leaderboardContainer = new PIXI.Container();
  leaderboardContainer.x = 10;
  leaderboardContainer.y = 10;
  app.stage.addChild(leaderboardContainer);

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

  bots = [];
  cubes = [];
  effects = [];

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
  setInterval(updateLeaderboard, 500);
}

function createCube(color, size, withPhysics = true) {
  const container = new PIXI.Container();
  container.cid = cubeIdCounter++;
  container.size = size;
  container.color = color;
  container.isCube = true;
  container.withPhysics = withPhysics;
  container.grid = [];
  const count = Math.round(size / BLOCK_SIZE);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const block = new PIXI.Graphics();
      drawVoxel(block, color);
      const bx = -size / 2 + i * BLOCK_SIZE;
      const by = -size / 2 + j * BLOCK_SIZE;
      block.x = bx;
      block.y = by;
      container.addChild(block);
      container.grid.push({ block, x: bx, y: by });
    }
  }
  container.massSize = container.grid.length;
  container.blockSize = BLOCK_SIZE;
  container.hitTime = 0;
  container.shakeTime = 0;
  if (withPhysics) {
    cubes.push(container);
  }
  updateCubeLayout(container);
  return container;
}

function updateCubeLayout(cube) {
  if (cube.grid.length === 0) {
    if (cube.body) {
      MWorld.remove(engine.world, cube.body);
      cube.body = null;
    }
    cube.size = 0;
    cube.massSize = 0;
    return;
  }

  let sumX = 0,
    sumY = 0;
  for (const cell of cube.grid) {
    sumX += cell.x + cube.blockSize / 2;
    sumY += cell.y + cube.blockSize / 2;
  }
  const cx = sumX / cube.grid.length;
  const cy = sumY / cube.grid.length;

  for (const cell of cube.grid) {
    cell.x -= cx;
    cell.y -= cy;
    cell.block.x = cell.x;
    cell.block.y = cell.y;
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const cell of cube.grid) {
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x);
    maxY = Math.max(maxY, cell.y);
  }

  const width = maxX - minX + BLOCK_SIZE;
  const height = maxY - minY + BLOCK_SIZE;
  const newSize = Math.max(width, height);

  let pos = { x: 0, y: 0 },
    vel = { x: 0, y: 0 },
    angle = 0,
    angVel = 0;

  if (cube.body) {
    const old = cube.body;
    pos = { x: old.position.x, y: old.position.y };
    vel = { x: old.velocity.x, y: old.velocity.y };
    angle = old.angle;
    angVel = old.angularVelocity;
    MWorld.remove(engine.world, old);
  }

  if (cube.withPhysics) {
    const parts = cube.grid.map((cell) => {
      const part = Bodies.rectangle(
        cell.x + cube.blockSize / 2,
        cell.y + cube.blockSize / 2,
        cube.blockSize,
        cube.blockSize
      );
      part.g = cube;
      return part;
    });
    const body = Body.create({ parts, frictionAir: 0.2 });
    Body.setPosition(body, { x: pos.x + cx, y: pos.y + cy });
    Body.setVelocity(body, vel);
    Body.setAngle(body, angle);
    Body.setAngularVelocity(body, angVel);
    body.g = cube;
    cube.body = body;
    MWorld.add(engine.world, body);
  } else {
    cube.body = null;
  }

  cube.size = newSize;
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
  if (cube.deathTimeout) {
    clearTimeout(cube.deathTimeout);
    cube.deathTimeout = null;
  }
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
  const len = Vector.magnitude({ x: dx, y: dy });
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
      f.rotation += f.rotationSpeed * delta;
    }
  }

  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life += delta;
    const t = e.life / e.maxLife;
    e.g.scale.set(1 + t);
    e.g.alpha = e.startAlpha * (1 - t);
    if (e.life >= e.maxLife) {
      world.removeChild(e.g);
      effects.splice(i, 1);
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
  if (p.pickupCooldown && Date.now() < p.pickupCooldown) return;
  if (!cube.body && cube.grid.length === 0) return;

  removeParticle(p);
  const block = new PIXI.Graphics();
  drawVoxel(block, cube.color);
  const pos = getRandomGrowthPosition(cube);
  block.x = pos.x;
  block.y = pos.y;
  cube.addChild(block);
  cube.grid.push({ block, x: pos.x, y: pos.y });
  updateCubeLayout(cube);

  if (cube.deathTimeout) {
    clearTimeout(cube.deathTimeout);
    cube.deathTimeout = null;
  }
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
  const SEP_DIST = 40;
  for (const bot of bots) {
    let move = { x: 0, y: 0 };

    // Separation so bots don't crowd
    for (const other of bots) {
      if (other === bot) continue;
      const diff = Vector.sub(bot.body.position, other.body.position);
      const d = Vector.magnitude(diff);
      if (d > 0 && d < SEP_DIST) {
        const push = Vector.mult(diff, (SEP_DIST - d) / SEP_DIST);
        move = Vector.add(move, push);
      }
    }

    let prey = null;
    let preyDist = Infinity;
    let threat = null;
    let threatDist = Infinity;
    for (const c of cubes) {
      if (c === bot) continue;
      const d = Vector.magnitude(Vector.sub(c.body.position, bot.body.position));
      if (c.massSize < bot.massSize && d < preyDist) {
        prey = c;
        preyDist = d;
      }
      if (c.massSize > bot.massSize && d < threatDist) {
        threat = c;
        threatDist = d;
      }
    }

    let targetFood = null;
    let foodDist = Infinity;
    for (const f of foods) {
      const d = Vector.magnitude(Vector.sub(f.body.position, bot.body.position));
      if (d < foodDist) {
        targetFood = f;
        foodDist = d;
      }
    }

    let dir = null;
    if (threat && threatDist < 250) {
      dir = Vector.sub(bot.body.position, threat.body.position);
    } else if (prey && preyDist < 400) {
      if (preyDist > 120) {
        dir = Vector.sub(prey.body.position, bot.body.position);
      }
    } else if (targetFood && foodDist < 500) {
      dir = Vector.sub(targetFood.body.position, bot.body.position);
    }

    if (!dir) {
      if (!bot.wanderDir || Math.random() < 0.02) {
        bot.wanderDir = Vector.normalise({ x: Math.random() - 0.5, y: Math.random() - 0.5 });
      }
      dir = bot.wanderDir;
    }

    move = Vector.add(move, dir);
    if (move.x !== 0 || move.y !== 0) {
      move = Vector.normalise(move);
      const speed = 2;
      Body.translate(bot.body, { x: move.x * speed * delta, y: move.y * speed * delta });
    }
  }
}

function handleCollisions(event) {
  const processed = new Set();
  for (const pair of event.pairs) {
    const a = pair.bodyA.g;
    const b = pair.bodyB.g;
    if (!a || !b) continue;
    if (a.isCube && b.isCube && a !== b) {
      const key = a.cid < b.cid ? `${a.cid}-${b.cid}` : `${b.cid}-${a.cid}`;
      if (!processed.has(key)) {
        collideCubes(a, b);
        processed.add(key);
      }
    } else if (a.isCube && b.isFood) {
      collectParticle(a, b);
    } else if (b.isCube && a.isFood) {
      collectParticle(b, a);
    }
  }
}

function collideCubes(c1, c2) {
  removeCubeBlocks(c1, 1, c2.body.position);
  removeCubeBlocks(c2, 1, c1.body.position);
}

function createFragmentFromCollision(size, pos, from, color) {
  const frag = new PIXI.Graphics();
  drawVoxel(frag, color);
  frag.x = pos.x;
  frag.y = pos.y;
  frag.isFood = true;
  frag.isFragment = true;
  frag.alpha = 0.8;
  frag.pickupCooldown = Date.now() + 500;
  frag.rotationSpeed = (Math.random() - 0.5) * 0.1;
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
    frictionAir: 0.15,
  });
  frag.body = body;
  body.g = frag;
  const dir = Vector.normalise(Vector.sub(pos, from));
  Body.setVelocity(body, { x: dir.x * 4, y: dir.y * 4 });
  MWorld.add(engine.world, body);
  foods.push(frag);
  return frag;
}

function createBlockExplosion(pos) {
  const g = new PIXI.Graphics();
  g.beginFill(0xffffff, 0.8);
  g.drawCircle(0, 0, 6);
  g.endFill();
  g.x = pos.x;
  g.y = pos.y;
  const e = { g, life: 0, maxLife: 20, startAlpha: 0.8 };
  world.addChild(g);
  effects.push(e);
}

function createDeathCloud(pos) {
  const g = new PIXI.Graphics();
  g.beginFill(0xffffff, 0.6);
  g.drawCircle(0, 0, 20);
  g.endFill();
  g.x = pos.x;
  g.y = pos.y;
  const e = { g, life: 0, maxLife: 60, startAlpha: 0.6 };
  world.addChild(g);
  effects.push(e);
}

function removeCubeBlocks(cube, count = 1, fromPos) {
  for (let i = 0; i < count && cube.grid.length > 0; i++) {
    const idx = Math.floor(Math.random() * cube.grid.length);
    const cell = cube.grid.splice(idx, 1)[0];
    cube.removeChild(cell.block);
    if (cube.body) {
      const pos = {
        x: cube.body.position.x + cell.x + cube.blockSize / 2,
        y: cube.body.position.y + cell.y + cube.blockSize / 2,
      };
      const frag = createFragmentFromCollision(
        cube.blockSize,
        pos,
        fromPos,
        cube.color
      );
      world.addChild(frag);
      createBlockExplosion(pos);
    }
  }
  cube.hitTime = 12;
  cube.shakeTime = 12;
  updateCubeLayout(cube);
  if (cube.grid.length === 0 && !cube.deathTimeout) {
    cube.deathTimeout = setTimeout(() => {
      if (cube.grid.length === 0) {
        if (cube.body) {
          createDeathCloud(cube.body.position);
        }
        destroyCube(cube);
      }
      cube.deathTimeout = null;
    }, 600);
  }
}

function syncGraphics() {
  for (const c of cubes) {
    const shake = c.shakeTime > 0 ? 2 : 0;
    if (c.body) {
      c.x = c.body.position.x + (shake ? (Math.random() - 0.5) * shake : 0);
      c.y = c.body.position.y + (shake ? (Math.random() - 0.5) * shake : 0);
    }
    if (c.hitTime > 0) {
      c.hitTime -= 1;
      c.tint = 0xffaaaa;
      c.shakeTime -= 1;
    } else {
      c.tint = 0xffffff;
    }
  }
  for (const f of foods) {
    f.x = f.body.position.x;
    f.y = f.body.position.y;
  }
  if (player && player.body) {
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

function updateLeaderboard() {
  if (!leaderboardContainer) return;
  leaderboardContainer.removeChildren();
  const entries = [];
  if (player) {
    entries.push({ name: 'You', color: player.color, mass: player.grid.length });
  }
  for (const bot of bots) {
    entries.push({ name: 'Bot', color: bot.color, mass: bot.grid.length });
  }
  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    entries.push({ name: id.slice(0, 4), color: rp.color, mass: rp.grid.length });
  }
  entries.sort((a, b) => b.mass - a.mass);
  const top = entries.slice(0, 10);
  top.forEach((e, i) => {
    const text = new PIXI.Text(`${i + 1}. ${e.mass}`, {
      fill: e.color,
      fontSize: 14,
    });
    text.y = i * 16;
    leaderboardContainer.addChild(text);
  });
}
