const menu = document.getElementById('menu');
const pveBtn = document.getElementById('pveBtn');
const pvpBtn = document.getElementById('pvpBtn');
const styleBtn = document.getElementById('styleBtn');
const closeStyleBtn = document.getElementById('closeStyleBtn');
const styleModal = document.getElementById('styleModal');
const styleOptions = document.querySelectorAll('.style-option');
styleOptions.forEach((opt) => {
  opt.addEventListener('click', () => {
    styleOptions.forEach((o) => o.classList.remove('selected'));
    opt.classList.add('selected');
    selectedStyle = opt.dataset.style;
  });
});
if (styleOptions[0]) styleOptions[0].classList.add('selected');

styleBtn.addEventListener('click', () => {
  styleModal.style.display = 'flex';
});

closeStyleBtn.addEventListener('click', () => {
  styleModal.style.display = 'none';
});


// Переключение на пробел
let snakeKeyHandler;
let snakeClickHandler;
snakeKeyHandler = (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    toggleSnake();
  }
};
window.addEventListener('keydown', snakeKeyHandler);

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
  leaderboardContainer,
  mouseMoveHandler,
  touchMoveHandler

const { Engine, World: MWorld, Bodies, Body, Vector, Events } = Matter;

const WORLD_SIZE = 5000;
const FOOD_COUNT = 250;
const MAX_PLAYER_SIZE = 250;
const BLOCK_SIZE = 35;
const SPACING = 0;
const CELL_SIZE = BLOCK_SIZE + SPACING;
const FOOD_SIZE = 25;
let cubeIdCounter = 0;
const HIT_COOLDOWN = 500; // ms between damage from the same cube
const EAT_INTERVAL = 15; // ticks between consuming blocks during eating
const SPEED_BASE = 3;
const SNAKE_SPEED = 2;
const SNAKE_COOLDOWN = 3000; // ms
const SNAKE_HISTORY_STEP = 2; // frames between segment positions
let globalTime = 0;
const BIG_CUBE_SIZE = 60;
const BIG_CUBE_MASS = 10;

const STYLES = {
  cheese: { path: 'assets/styles/cheese.png', color: 0xffe066 },
  watermelon: { path: 'assets/styles/watermelon.png', color: 0xff5577 },
  meat: { path: 'assets/styles/meat.png', color: 0xff9999 },
  orange: { path: 'assets/styles/orange.png', color: 0xffaa33 },
  grass: { path: 'assets/styles/grass.png', color: 0x77cc55 },
  salmon: { path: 'assets/styles/salmon.png', color: 0xff8888 },
  tree: { path: 'assets/styles/tree.png', color: 0x228833 },
  marble: { path: 'assets/styles/marble.png', color: 0xcccccc },
  pepsi: { path: 'assets/styles/pepsi.png', color: 0x0033cc },
  egg: { path: 'assets/styles/egg.png', color: 0xffffaa },
  sparklingWater: { path: 'assets/styles/sparkling.water.png', color: 0x99ddee },
  mechanical: { path: 'assets/styles/mechanical.png', color: 0x777777 },
  worm: { path: 'assets/styles/worm.png', color: 0xcc6622 }
};

let selectedStyle = 'cheese';

const BOT_SNAKE_PROB = 0.0005; // 0.05% chance per tick

function initSnakeProps(cube) {
  cube.isSnake = false;
  cube.snakeSegments = [];
  cube.lastSnakeToggle = 0;
  cube.savedSnakeGrid = [];
  cube.positionHistory = [];
}

function lighten(color, amount) {
  const rgb = PIXI.utils.hex2rgb(color);
  return PIXI.utils.rgb2hex(rgb.map(c => Math.min(1, c + amount)));
}

function darken(color, amount) {
  const rgb = PIXI.utils.hex2rgb(color);
  return PIXI.utils.rgb2hex(rgb.map(c => Math.max(0, c - amount)));
}

function toggleSnake(cube = player) {
  const now = Date.now();
  if (!cube || now - cube.lastSnakeToggle < SNAKE_COOLDOWN) return;
  cube.lastSnakeToggle = now;
  if (!cube.isSnake) {
    const prevMass = cube.massSize;
    const newSegments = [];
    const bodyCells = cube.grid.filter((c) => c.size === BLOCK_SIZE);
    cube.savedSnakeGrid = bodyCells.map((c) => ({ x: c.x, y: c.y }));
    cube.grid = cube.grid.filter((c) => c.size !== BLOCK_SIZE);
    cube.massSize = 1; // mass of the head only
    cube.positionHistory = [];
    const headPos = cube.body ? { x: cube.body.position.x, y: cube.body.position.y } : { x: cube.x, y: cube.y };
    for (const cell of bodyCells) {
      cube.removeChild(cell.block);
      const seg = createCube(cube.styleName, BLOCK_SIZE, 1, true, 1);
      seg.parentCube = cube;
      seg.isSnakeSegment = true;
        if (cube.body) {
          const off = cube.size / 2 + (newSegments.length + 0.5) * CELL_SIZE;
          Body.setPosition(seg.body, {
            x: cube.body.position.x - off,
            y: cube.body.position.y,
          });
        }
      world.addChild(seg);
      newSegments.push(seg);
    }
    const extra = Math.max(0, prevMass - 1 - bodyCells.length);
    for (let i = 0; i < extra; i++) {
      const seg = createCube(cube.styleName, BLOCK_SIZE, 1, true, 1);
      seg.parentCube = cube;
        if (cube.body) {
          const off = cube.size / 2 + (newSegments.length + 0.5) * CELL_SIZE;
          Body.setPosition(seg.body, {
            x: cube.body.position.x - off,
            y: cube.body.position.y,
          });
        }
      world.addChild(seg);
      newSegments.push(seg);
    }
    cube.snakeSegments = newSegments;
      const totalSegs = cube.snakeSegments.length;
      for (let i = totalSegs * SNAKE_HISTORY_STEP; i >= 0; i--) {
        const off = cube.size / 2 + (i / SNAKE_HISTORY_STEP - 0.5) * CELL_SIZE;
        cube.positionHistory.push({
          x: headPos.x - off,
          y: headPos.y,
        });
      }
    updateCubeLayout(cube);
    if (cube.body) cube.body.collisionFilter.group = -cube.cid;
    for (const seg of cube.snakeSegments) {
      if (seg.body) seg.body.collisionFilter.group = -cube.cid;
    }
    cube.isSnake = true;
  } else {
    const segCount = cube.snakeSegments.length;
    for (const seg of cube.snakeSegments) {
      destroyCube(seg);
    }
    cube.snakeSegments = [];
    for (let i = 0; i < segCount; i++) {
      const pos = cube.savedSnakeGrid[i] || getRandomGrowthPosition(cube);
      const block = new PIXI.Sprite(PIXI.Texture.from(STYLES[cube.styleName].path));
      block.width = BLOCK_SIZE;
      block.height = BLOCK_SIZE;
      block.x = pos.x;
      block.y = pos.y;
      cube.addChild(block);
      cube.grid.push({ block, x: pos.x, y: pos.y, size: BLOCK_SIZE });
      cube.massSize += 1;
    }
    cube.savedSnakeGrid = [];
    updateCubeLayout(cube);
    if (cube.body) cube.body.collisionFilter.group = 0;
    cube.positionHistory = [];
    cube.isSnake = false;
  }
}

function addSnakeSegment(cube = player) {
  if (!cube.isSnake) return;
  const seg = createCube(cube.styleName, BLOCK_SIZE, 1, true, 1);
  seg.parentCube = cube;
  seg.isSnakeSegment = true;
  const spawnIndex = Math.max(
    0,
    cube.positionHistory.length -
      (cube.snakeSegments.length + 2) * SNAKE_HISTORY_STEP
  );
  let historyPos = cube.positionHistory[spawnIndex];
  if (!historyPos) {
    historyPos =
      cube.positionHistory[0] || {
        x: cube.body.position.x,
        y: cube.body.position.y,
      };
  }
  Body.setPosition(seg.body, historyPos);
  if (seg.body) seg.body.collisionFilter.group = -cube.cid;
  world.addChild(seg);
  cube.snakeSegments.push(seg);
  for (let i = 0; i < SNAKE_HISTORY_STEP; i++) {
    cube.positionHistory.unshift({ x: historyPos.x, y: historyPos.y });
  }
}

function getMoveSpeed(cube = player) {
  if (cube.isSnake || cube.parentCube?.isSnake) return SNAKE_SPEED;
  return SPEED_BASE;
}

function getTotalMass(cube) {
  let m = cube.massSize;
  if (cube.snakeSegments) {
    for (const s of cube.snakeSegments) m += s.massSize;
  }
  return m;
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

  player = createCube(selectedStyle, BIG_CUBE_SIZE, BIG_CUBE_MASS, true, 1);
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
  mouseMoveHandler = (e) => {
    targetX = e.clientX - app.screen.width / 2;
    targetY = e.clientY - app.screen.height / 2;
  };
  touchMoveHandler = (e) => {
    const touch = e.touches[0];
    targetX = touch.clientX - app.screen.width / 2;
    targetY = touch.clientY - app.screen.height / 2;
  };
  window.addEventListener('mousemove', mouseMoveHandler);
  window.addEventListener('touchmove', touchMoveHandler);

  snakeClickHandler = () => {
    toggleSnake();
  };
  window.addEventListener('mousedown', snakeClickHandler);

  app.ticker.add((delta) => gameLoop(delta, targetX, targetY));
  setInterval(updateLeaderboard, 500);
}

function createCube(styleName, blockSize = BLOCK_SIZE, mass = null, withPhysics = true, cells = 1) {
  const container = new PIXI.Container();
  container.cid = cubeIdCounter++;
  container.styleName = styleName;
  container.color = STYLES[styleName].color;
  container.isCube = true;
  container.withPhysics = withPhysics;
  container.grid = [];
  initSnakeProps(container);
  const size = blockSize * cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const block = new PIXI.Sprite(PIXI.Texture.from(STYLES[styleName].path));
      block.width = blockSize;
      block.height = blockSize;
      if (PIXI.filters && PIXI.filters.DropShadowFilter) {
        block.filters = [
          new PIXI.filters.DropShadowFilter({ distance: 1, blur: 2, alpha: 0.6 })
        ];
      }
      const bx = -size / 2 + i * blockSize;
      const by = -size / 2 + j * blockSize;
      block.x = bx;
      block.y = by;
      container.addChild(block);
      container.grid.push({ block, x: bx, y: by, size: blockSize });
    }
  }
  container.massSize = mass !== null ? mass : container.grid.length;
  container.blockSize = blockSize;
  container.hitTime = 0;
  container.lastHitTimes = {}; // track recent hits per other cube
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
    cell.block.x = cell.x + SPACING / 2;
    cell.block.y = cell.y + SPACING / 2;
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const cell of cube.grid) {
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x + cell.size);
    maxY = Math.max(maxY, cell.y + cell.size);
  }

  const width = maxX - minX;
  const height = maxY - minY;
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
        cell.x + cell.size / 2,
        cell.y + cell.size / 2,
        cell.size,
        cell.size
      );

      part.g = cube;
      part.cell = cell; // link body part to its grid cell
      cell.part = part;
      return part;
    });
  const body = Body.create({
    parts,
    frictionAir: 0.2,
    friction: 0,
    frictionStatic: 0,
    restitution: 0.05,
  });
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
}

function destroyCube(cube) {
  if (cube.body) {
    MWorld.remove(engine.world, cube.body);
    const idx = cubes.indexOf(cube);
    if (idx !== -1) cubes.splice(idx, 1);
  }
  world.removeChild(cube);
  if (cube.parentCube) {
    const owner = cube.parentCube;
    const idx = owner.snakeSegments.indexOf(cube);
    if (idx !== -1) owner.snakeSegments.splice(idx, 1);
  }
  if (cube === player) {
    player = null;
    showGameOver();
  }
  const bIdx = bots.indexOf(cube);
  if (bIdx !== -1) bots.splice(bIdx, 1);
  if (cube.deathTimeout) {
    clearTimeout(cube.deathTimeout);
    cube.deathTimeout = null;
  }
  for (const c of cubes) {
    if (c.eatTarget === cube) {
      c.eatTarget = null;
    }
  }
}

function spawnFood() {
  const styleNames = Object.keys(STYLES);
  const style = STYLES[styleNames[Math.floor(Math.random() * styleNames.length)]];
  const food = new PIXI.Sprite(PIXI.Texture.from(style.path));
  const size = FOOD_SIZE;
  food.width = size;
  food.height = size;
  food.x = (Math.random() - 0.5) * WORLD_SIZE;
  food.y = (Math.random() - 0.5) * WORLD_SIZE;
  food.isFood = true;
  food.collected = false;
  food.massSize = size;
  food.styleName = styleNames.find((n) => STYLES[n] === style);
  food.rotationSpeed = (Math.random() - 0.5) * 0.05;
  food.pulseOffset = Math.random() * Math.PI * 2;
  const body = Bodies.rectangle(food.x, food.y, size, size, { isSensor: true });
  food.body = body;
  body.g = food;
  if (PIXI.filters && PIXI.filters.DropShadowFilter) {
    food.filters = [new PIXI.filters.DropShadowFilter({ distance: 1, blur: 2, alpha: 0.6 })];
  }
  MWorld.add(engine.world, body);
  world.addChild(food);
  foods.push(food);
}


function gameLoop(delta, targetX, targetY) {
  if (!player || !player.body) return;
  // движение игрока
  const dx = targetX;
  const dy = targetY;
  const len = Vector.magnitude({ x: dx, y: dy });
  if (len > 0) {
    const speed = getMoveSpeed();
    Body.translate(player.body, { x: (dx / len) * speed * delta, y: (dy / len) * speed * delta });
  }

  if (player.isSnake) {
    updateSnakeSegments(delta, player);
  }
  for (const bot of bots) {
    if (bot.isSnake) updateSnakeSegments(delta, bot);
  }
  Engine.update(engine, delta * 16);

  globalTime += delta;
  for (const f of foods) {
    if (f.rotationSpeed) {
      f.rotation += f.rotationSpeed * delta;
    }
    if (f.pulseOffset !== undefined) {
      const pulse = 1 + Math.sin(globalTime * 0.1 + f.pulseOffset) * 0.1;
      f.scale.set(pulse);
      f.width = FOOD_SIZE;
      f.height = FOOD_SIZE;
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
    if (player && player.body) {
      socket.emit('update', { x: player.body.position.x, y: player.body.position.y, size: player.size });
    }
  }

  checkFoodCollisions();
  processEating(delta);

  syncGraphics();
}

function removeParticle(p) {
  if (p.body) {
    MWorld.remove(engine.world, p.body);
    p.body = null;
  }
  // ensure sprite is removed even if body was already null
  if (p.parent) p.parent.removeChild(p); else world.removeChild(p);
  const idx = foods.indexOf(p);
  if (idx !== -1) foods.splice(idx, 1);
}

function collectParticle(cube, p) {
  if (p.collected) return;
  if (p.pickupCooldown && Date.now() < p.pickupCooldown) return;
  if (p.enemyCooldown && p.ownerId && p.ownerId !== cube.cid && Date.now() < p.enemyCooldown) return;
  if (p.forbidOwner && p.sourceId === cube.cid) return;
  if (!cube.body && cube.grid.length === 0 && !cube.isSnake && !(cube.parentCube && cube.parentCube.isSnake)) return;

  p.collected = true;

  removeParticle(p);
  if (cube.isSnake) {
    addSnakeSegment(cube);
    return;
  }
  if (cube.parentCube && cube.parentCube.isSnake) {
    addSnakeSegment(cube.parentCube);
    return;
  }
  const block = new PIXI.Sprite(PIXI.Texture.from(STYLES[cube.styleName].path));
  if (block.texture?.baseTexture) {
    const tex = block.texture.baseTexture;
    const scaleX = BLOCK_SIZE / tex.width;
    const scaleY = BLOCK_SIZE / tex.height;
    block.scale.set(scaleX, scaleY);
  }
  block.width = BLOCK_SIZE;
  block.height = BLOCK_SIZE;
  if (PIXI.filters && PIXI.filters.DropShadowFilter) {
    block.filters = [
      new PIXI.filters.DropShadowFilter({ distance: 1, blur: 2, alpha: 0.6 })
    ];
  }
  const pos = getRandomGrowthPosition(cube);
  block.x = pos.x;
  block.y = pos.y;
  cube.addChild(block);
  cube.grid.push({ block, x: pos.x, y: pos.y, size: BLOCK_SIZE });
  cube.massSize += 1;
  updateCubeLayout(cube);

  if (cube.deathTimeout) {
    clearTimeout(cube.deathTimeout);
    cube.deathTimeout = null;
  }
}

function growCube(cube, count = 1) {
  for (let i = 0; i < count; i++) {
    if (cube.isSnake) {
      addSnakeSegment(cube);
      continue;
    }
    if (cube.parentCube && cube.parentCube.isSnake) {
      addSnakeSegment(cube.parentCube);
      continue;
    }
    const block = new PIXI.Sprite(PIXI.Texture.from(STYLES[cube.styleName].path));
    if (block.texture?.baseTexture) {
      const tex = block.texture.baseTexture;
      const scaleX = BLOCK_SIZE / tex.width;
      const scaleY = BLOCK_SIZE / tex.height;
      block.scale.set(scaleX, scaleY);
    }

    block.width = BLOCK_SIZE;
    block.height = BLOCK_SIZE;
    if (PIXI.filters && PIXI.filters.DropShadowFilter) {
      block.filters = [new PIXI.filters.DropShadowFilter({ distance: 1, blur: 2, alpha: 0.6 })];
    }
    const pos = getRandomGrowthPosition(cube);
    block.x = pos.x;
    block.y = pos.y;
    cube.addChild(block);
    cube.grid.push({ block, x: pos.x, y: pos.y, size: BLOCK_SIZE });
    cube.massSize += 1;
  }
  updateCubeLayout(cube);
  if (cube.deathTimeout) {
    clearTimeout(cube.deathTimeout);
    cube.deathTimeout = null;
  }
}

function startEating(winner, loser) {
  if (!winner || !loser) return;
  winner.eatTarget = loser;
  winner.eatTimer = 0;
}

function processEating(delta) {
  for (const c of cubes) {
    if (!c.eatTarget) continue;
    const t = c.eatTarget;
    if (!t.body || t.grid.length === 0) {
      c.eatTarget = null;
      continue;
    }
    if (getTotalMass(t) >= getTotalMass(c)) {
      c.eatTarget = null;
      continue;
    }
    const dist = Vector.magnitude(Vector.sub(c.body.position, t.body.position));
    if (dist > c.size + t.size) {
      c.eatTarget = null;
      continue;
    }
    c.eatTimer = (c.eatTimer || 0) + delta;
    if (c.eatTimer >= EAT_INTERVAL) {
      c.eatTimer = 0;
      if (getTotalMass(c) > getTotalMass(t)) {
        removeCubeBlocks(t, 1, c.body.position, {
          toward: true,
          ownerId: c.cid,
          forbidOwner: true,
        });
      } else {
        c.eatTarget = null;
        continue;
      }
      if (t.grid.length === 0) {
        c.eatTarget = null;
      }
    }
  }
}

function checkFoodCollisions() {
  const seen = new Set();
  const cubesToCheck = [];
  for (const c of cubes) {
    if (c.body) cubesToCheck.push(c);
    if (c.isSnake) {
      for (const seg of c.snakeSegments) {
        if (seg.body) cubesToCheck.push(seg);
      }
    }
  }
  for (const cube of cubesToCheck) {
    if (seen.has(cube)) continue;
    seen.add(cube);
    const cPos = cube.body ? cube.body.position : { x: cube.x, y: cube.y };
    for (const f of foods) {
      if (!f.body || f.collected) continue;
      const fSize = f.massSize || FOOD_SIZE;
      const dist = Vector.magnitude(Vector.sub(cPos, f.body.position));
      if (dist < (cube.size + fSize) / 2) {
        collectParticle(cube, f);
      }
    }
  }
}


function createBots(count) {
  const styleNames = Object.keys(STYLES);
  for (let i = 0; i < count; i++) {
    const randStyle = styleNames[Math.floor(Math.random() * styleNames.length)];
    const bot = createCube(randStyle, BIG_CUBE_SIZE, BIG_CUBE_MASS, true, 1); // big central cube
    Body.setPosition(bot.body, { x: (Math.random() - 0.5) * WORLD_SIZE, y: (Math.random() - 0.5) * WORLD_SIZE });
    bot.target = null;
    bots.push(bot);
    world.addChild(bot);
  }
}

function updateBots(delta) {
  const SEP_DIST = 40;
  for (const bot of bots) {
    if (!bot || !bot.body) continue;
    let move = { x: 0, y: 0 };

    // Separation so bots don't crowd
    for (const other of bots) {
      if (other === bot || !other.body) continue;
      const diff = Vector.sub(bot.body.position, other.body.position);
      const d = Vector.magnitude(diff);
      if (d > 0 && d < SEP_DIST) {
        const push = Vector.mult(diff, (SEP_DIST - d) / SEP_DIST);
        move = Vector.add(move, push);
      }
    }

    if (Math.random() < BOT_SNAKE_PROB) {
      toggleSnake(bot);
    }

    let prey = null;
    let preyDist = Infinity;
    let threat = null;
    let threatDist = Infinity;
    for (const c of cubes) {
      if (c === bot || !c.body) continue;
      const d = Vector.magnitude(Vector.sub(c.body.position, bot.body.position));
      if (getTotalMass(c) < getTotalMass(bot) && d < preyDist) {
        prey = c;
        preyDist = d;
      }
      if (getTotalMass(c) > getTotalMass(bot) && d < threatDist) {
        threat = c;
        threatDist = d;
      }
    }

    let targetFood = null;
    let foodDist = Infinity;
    for (const f of foods) {
      if (!f || !f.body) continue;
      const d = Vector.magnitude(Vector.sub(f.body.position, bot.body.position));
      if (d < foodDist) {
        targetFood = f;
        foodDist = d;
      }
    }

    let dir = null;
    if (threat && threat.body && threatDist < 250) {
      dir = Vector.sub(bot.body.position, threat.body.position);
    } else if (prey && prey.body && preyDist < 400) {
      if (preyDist > 120) {
        dir = Vector.sub(prey.body.position, bot.body.position);
      }
    } else if (targetFood && targetFood.body && foodDist < 500) {
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
      const speed = getMoveSpeed(bot);
      if (bot.body) {
        Body.translate(bot.body, { x: move.x * speed * delta, y: move.y * speed * delta });
      }
    }
  }
}

function updateSnakeSegments(delta, cube) {
  if (!cube.body) return;
  const headPos = { x: cube.body.position.x, y: cube.body.position.y };
  cube.positionHistory.push(headPos);
  const maxLen = (cube.snakeSegments.length + 1) * SNAKE_HISTORY_STEP * 5;
  if (cube.positionHistory.length > maxLen) {
    cube.positionHistory.splice(0, cube.positionHistory.length - maxLen);
  }

  for (let i = 0; i < cube.snakeSegments.length; i++) {
    const seg = cube.snakeSegments[i];
    if (!seg.body) continue;
    const histIndex = cube.positionHistory.length - 1 - (i + 1) * SNAKE_HISTORY_STEP;
    const target = cube.positionHistory[histIndex] || cube.positionHistory[0] || headPos;
    Body.setPosition(seg.body, target);
  }
}

function handleCollisions(event) {
  const processed = new Set();
  for (const pair of event.pairs) {
    const a = pair.bodyA.g;
    const b = pair.bodyB.g;
    if (!a || !b) continue;
    if (a.isCube && b.isCube && a !== b) {
      if (!a.body || !b.body) continue;
      const key = a.cid < b.cid ? `${a.cid}-${b.cid}` : `${b.cid}-${a.cid}`;
      if (!processed.has(key)) {
        collideCubes(a, b);
        processed.add(key);
      }
    } else if (a.isCube && b.isFood) {
      if (!a.body || !b.body) continue;
      collectParticle(a, b);
    } else if (b.isCube && a.isFood) {
      if (!a.body || !b.body) continue;
      collectParticle(b, a);
    }
  }
}

function isCubeEngulfed(bigger, smaller) {
  if (!bigger.body || !smaller.body) return false;
  for (let i = 1; i < smaller.body.parts.length; i++) {
    const part = smaller.body.parts[i];
    for (const v of part.vertices) {
      if (!Matter.Vertices.contains(bigger.body.vertices, v)) {
        return false;
      }
    }
  }
  return true;
}

function collideCubes(c1, c2) {
  if (!c1 || !c2 || !c1.body || !c2.body) return;
  const now = Date.now();
  const last1 = c1.lastHitTimes[c2.cid] || 0;
  const last2 = c2.lastHitTimes[c1.cid] || 0;
  if (now - last1 < HIT_COOLDOWN || now - last2 < HIT_COOLDOWN) {
    return; // avoid multiple hits in quick succession
  }
  c1.lastHitTimes[c2.cid] = now;
  c2.lastHitTimes[c1.cid] = now;

  const pos1 = { x: c1.body.position.x, y: c1.body.position.y };
  const pos2 = { x: c2.body.position.x, y: c2.body.position.y };

  let bigger = c1;
  let smaller = c2;
  if (getTotalMass(c2) > getTotalMass(c1)) {
    bigger = c2;
    smaller = c1;
  }

  if (smaller.isSnake && smaller.snakeSegments.length > 0) {
    // head cannot be eaten until segments are gone
  } else if (getTotalMass(bigger) > getTotalMass(smaller) && isCubeEngulfed(bigger, smaller)) {
    startEating(bigger, smaller);
  } else {
    removeCubeBlocks(c1, 1, pos2);
    removeCubeBlocks(c2, 1, pos1);
  }

  if (!c1.body || !c2.body) return;

  const dir = Vector.normalise(Vector.sub(pos2, pos1));
  if (dir.x || dir.y) {
    Body.translate(c1.body, { x: -dir.x * BLOCK_SIZE * 0.25, y: -dir.y * BLOCK_SIZE * 0.25 });
    Body.translate(c2.body, { x: dir.x * BLOCK_SIZE * 0.25, y: dir.y * BLOCK_SIZE * 0.25 });
  }
}

function createFragmentFromCollision(pos, from, color) {
  const size = BLOCK_SIZE;
  const frag = new PIXI.Graphics();
  drawVoxel(frag, color);
  frag.x = pos.x;
  frag.y = pos.y;
  frag.isFood = true;
  frag.isFragment = true;
  frag.alpha = 0.8;
  frag.collected = false;
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

function removeCubeBlocks(cube, count = 1, fromPos, options = {}) {
  if (cube.isSnake && cube.snakeSegments.length > 0) {
    const target = cube.snakeSegments[cube.snakeSegments.length - 1];
    removeCubeBlocks(target, count, fromPos, options);
    if (target.grid.length === 0) {
      cube.snakeSegments.pop();
    }
    return;
  }
  for (let i = 0; i < count && cube.grid.length > 0; i++) {
    let idx = cube.grid.findIndex((c) => c.size === BLOCK_SIZE);
    if (idx === -1) {
      idx = 0;
    }
    const cell = cube.grid.splice(idx, 1)[0];
    cube.massSize -= 1;
    cube.removeChild(cell.block);
    if (cube.body) {
      const worldX = cube.body.position.x + cell.x;
      const worldY = cube.body.position.y + cell.y;

      cell.block.x = worldX;
      cell.block.y = worldY;
      cell.block.isFood = true;
      cell.block.isFragment = true;
      cell.block.alpha = 0.8;
      cell.block.collected = false;
      cell.block.scale.set(1);
      cell.block.width = cell.size;
      cell.block.height = cell.size;
      if (cell.block.anchor?.set) cell.block.anchor.set(0);
      if (cell.block.pivot) cell.block.pivot.set(0);
      cell.block.rotation = 0;
      cell.block.alpha = 1;
      cell.block.ownerId = options.ownerId !== undefined ? options.ownerId : cube.cid;
      cell.block.sourceId = cube.cid;
      cell.block.forbidOwner = !!options.forbidOwner;
      cell.block.styleName = cube.styleName;
      cell.block.pickupCooldown = Date.now() + 1000;
      cell.block.enemyCooldown = Date.now() + 3000;
      cell.block.rotationSpeed = (Math.random() - 0.5) * 0.1;
      cell.block.pulseOffset = Math.random() * Math.PI * 2;
      if (PIXI.filters && PIXI.filters.DropShadowFilter) {
        cell.block.filters = [new PIXI.filters.DropShadowFilter({
          distance: 2,
          alpha: 0.5,
          blur: 2,
        })];
      }

      const body = Bodies.rectangle(
        worldX + cell.size / 2,
        worldY + cell.size / 2,
        cell.size,
        cell.size,
        { isSensor: true, frictionAir: 0.15 }
      );
      cell.block.body = body;
      body.g = cell.block;
      let diff = Vector.sub(
        { x: worldX + cell.size / 2, y: worldY + cell.size / 2 },
        fromPos
      );
      if (options.toward) diff = Vector.mult(diff, -1);
      const dir = Vector.normalise(diff);
      Body.setVelocity(body, { x: dir.x * 4, y: dir.y * 4 });

      MWorld.add(engine.world, body);
      foods.push(cell.block);
      world.addChild(cell.block);

      createBlockExplosion({ x: worldX + cell.size / 2, y: worldY + cell.size / 2 });
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
    for (const cell of c.grid) {
      if (cell.size === BLOCK_SIZE) {
        if (!cell.offsetSeed) cell.offsetSeed = Math.random() * Math.PI * 2;
        const sway = Math.sin(globalTime * 0.1 + cell.offsetSeed) * 1.5;
        cell.block.x = cell.x + SPACING / 2 + sway;
        cell.block.y = cell.y + SPACING / 2 + Math.cos(globalTime * 0.1 + cell.offsetSeed) * 1.5;
      }
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
  const g = createCube('cheese', BIG_CUBE_SIZE, null, false, 1); // big central cube
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
    entries.push({
      name: 'You',
      color: player.color,
      mass: getTotalMass(player),
      style: player.styleName,
      me: true
    });
  }

  for (const bot of bots) {
    entries.push({
      name: 'Bot',
      color: bot.color,
      mass: getTotalMass(bot),
      style: bot.styleName
    });
  }

  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    entries.push({
      name: id.slice(0, 4),
      color: rp.color,
      mass: rp.massSize,
      style: rp.styleName
    });
  }

  entries.sort((a, b) => b.mass - a.mass);
  const top = entries.slice(0, 10);

  top.forEach((e, i) => {
    const row = new PIXI.Container();

    const sprite = new PIXI.Sprite(PIXI.Texture.from(STYLES[e.style].path));
    sprite.width = 14;
    sprite.height = 14;
    row.addChild(sprite);

    const style = new PIXI.TextStyle({
      fill: e.me ? 0xffff00 : e.color,
      fontSize: 14,
      fontWeight: e.me ? 'bold' : 'normal'
    });
    const text = new PIXI.Text(`${i + 1}. ${e.mass}`, style);
    text.x = 18;
    row.addChild(text);

    row.y = i * 18;
    leaderboardContainer.addChild(row);
  });
}

function showGameOver() {
  if (!app) return;
  const style = new PIXI.TextStyle({
    fill: '#ff4444',
    fontSize: 48,
    fontWeight: 'bold',
    stroke: '#000000',
    strokeThickness: 4,
    align: 'center',
  });
  const text = new PIXI.Text('Вы проиграли!', style);
  text.anchor.set(0.5);
  text.x = app.screen.width / 2;
  text.y = app.screen.height / 2;
  if (PIXI.filters && PIXI.filters.DropShadowFilter) {
    text.filters = [new PIXI.filters.DropShadowFilter({ distance: 2, blur: 2, alpha: 0.7 })];
  }
  app.stage.addChild(text);

  if (mouseMoveHandler) window.removeEventListener('mousemove', mouseMoveHandler);
  if (touchMoveHandler) window.removeEventListener('touchmove', touchMoveHandler);
  if (snakeKeyHandler) window.removeEventListener('keydown', snakeKeyHandler);
  if (snakeClickHandler) window.removeEventListener('mousedown', snakeClickHandler);


  setTimeout(() => {
    if (typeof goToMainMenu === 'function') {
      try {
        goToMainMenu();
      } catch (e) {
        location.reload();
      }
    } else {
      location.reload();
    }
  }, 3000);
}

function goToMainMenu() {
  location.reload();
}
