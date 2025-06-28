const app = new PIXI.Application({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0x222222,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true
});
document.body.appendChild(app.view);

// Контейнер мира, в нем камера и всё остальное
const world = new PIXI.Container();
app.stage.addChild(world);

// Игрок: зелёный квадрат
const player = new PIXI.Graphics();
player.beginFill(0x00ff00);
player.drawRect(-25, -25, 50, 50);
player.endFill();
player.x = 0;
player.y = 0;
player.size = 50;
world.addChild(player);

// Еда: 100 точек в большом мире
const foods = [];
const FOOD_COUNT = 100;
for (let i = 0; i < FOOD_COUNT; i++) {
  const food = new PIXI.Graphics();
  food.beginFill(0xffcc00);
  food.drawCircle(0, 0, 5);
  food.endFill();
  food.x = (Math.random() - 0.5) * 10000;
  food.y = (Math.random() - 0.5) * 10000;
  world.addChild(food);
  foods.push(food);
}

// Управление мышью
let targetX = 0;
let targetY = 0;
window.addEventListener("mousemove", (e) => {
  targetX = e.clientX - app.screen.width / 2;
  targetY = e.clientY - app.screen.height / 2;
});

// Игровой цикл
app.ticker.add((delta) => {
  // Движение к указателю
  const dx = targetX;
  const dy = targetY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) {
    const speed = 2;
    player.x += (dx / len) * speed * delta;
    player.y += (dy / len) * speed * delta;
  }

  // Сбор еды
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    const dist = Math.hypot(f.x - player.x, f.y - player.y);
    if (dist < player.size / 2 + 5) {
      world.removeChild(f);
      foods.splice(i, 1);
      player.size += 2;
      player.clear();
      player.beginFill(0x00ff00);
      player.drawRect(-player.size / 2, -player.size / 2, player.size, player.size);
      player.endFill();
    }
  }

  // Камера
  world.x = app.screen.width / 2 - player.x;
  world.y = app.screen.height / 2 - player.y;
});
