const menu = document.getElementById('menu');
const pveBtn = document.getElementById('pveBtn');
const pvpBtn = document.getElementById('pvpBtn');

let mode = null; // 'pve' or 'pvp'
let socket;

let app, world, player, foods, bots = [], remotePlayers = {};

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

  const border = new PIXI.Graphics();
  border.lineStyle(4, 0xffffff);
  border.drawRect(-WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE);
  world.addChild(border);

  player = createCube(0x00ff00, 50);
  player.x = 0;
  player.y = 0;
  player.size = 50;
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

function createCube(color, size) {
  const g = new PIXI.Graphics();
  g.beginFill(color);
  g.drawRect(-size / 2, -size / 2, size, size);
  g.endFill();
  return g;
}

function spawnFood() {
  const food = new PIXI.Graphics();
  food.beginFill(0xffcc00);
  food.drawCircle(0, 0, 5);
  food.endFill();
  food.x = (Math.random() - 0.5) * WORLD_SIZE;
  food.y = (Math.random() - 0.5) * WORLD_SIZE;
  world.addChild(food);
  foods.push(food);
}

function gameLoop(delta, targetX, targetY) {
  // движение игрока
  const dx = targetX;
  const dy = targetY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) {
    const speed = 2;
    player.x += (dx / len) * speed * delta;
    player.y += (dy / len) * speed * delta;
  }

  collectFood(player);

  if (mode === 'pve') {
    updateBots(delta);
  } else if (mode === 'pvp' && socket) {
    socket.emit('update', { x: player.x, y: player.y, size: player.size });
  }

  world.x = app.screen.width / 2 - player.x;
  world.y = app.screen.height / 2 - player.y;
}

function collectFood(obj) {
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    const dist = Math.hypot(f.x - obj.x, f.y - obj.y);
    if (dist < obj.size / 2 + 5) {
      world.removeChild(f);
      foods.splice(i, 1);
      if (obj.size < MAX_PLAYER_SIZE) {
        obj.size = Math.min(obj.size + 1, MAX_PLAYER_SIZE);
      }
      obj.clear();
      obj.beginFill(obj === player ? 0x00ff00 : 0xff0000);
      obj.drawRect(-obj.size / 2, -obj.size / 2, obj.size, obj.size);
      obj.endFill();
    }
  }
}

function createBots(count) {
  for (let i = 0; i < count; i++) {
    const bot = createCube(0xff0000, 50);
    bot.x = (Math.random() - 0.5) * WORLD_SIZE;
    bot.y = (Math.random() - 0.5) * WORLD_SIZE;
    bot.size = 50;
    bot.target = null;
    bots.push(bot);
    world.addChild(bot);
  }
}

function updateBots(delta) {
  for (const bot of bots) {
    if (!bot.target || !foods.includes(bot.target)) {
      let min = Infinity;
      for (const f of foods) {
        const d = Math.hypot(f.x - bot.x, f.y - bot.y);
        if (d < min) {
          min = d;
          bot.target = f;
        }
      }
    }
    if (bot.target) {
      const dx = bot.target.x - bot.x;
      const dy = bot.target.y - bot.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const speed = 2;
        bot.x += (dx / len) * speed * delta;
        bot.y += (dy / len) * speed * delta;
      }
    }
    collectFood(bot);
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
  const g = createCube(0x0000ff, 50);
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
