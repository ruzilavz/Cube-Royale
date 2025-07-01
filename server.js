const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = 3000;

app.use(express.static("client"));

// Максимальное число игроков в комнате
const MAX_PLAYERS = 10;

// Информация о комнатах: { roomId: Set(socket.id) }
const rooms = {};
// Дополнительные данные об игроках
const players = {};

function findRoom() {
  for (const [id, players] of Object.entries(rooms)) {
    if (players.size < MAX_PLAYERS) {
      return id;
    }
  }
  // Создание новой комнаты
  const newId = Math.random().toString(36).substr(2, 9);
  rooms[newId] = new Set();
  return newId;
}

io.on("connection", (socket) => {
  console.log("Игрок подключился:", socket.id);

  socket.on("join-room", (data) => {
    const roomId = findRoom();
    socket.join(roomId);
    socket.roomId = roomId;
    rooms[roomId].add(socket.id);
    players[socket.id] = { style: data?.style || "cheese" };

    // Отправить новому игроку уже находящихся в комнате
    const others = Array.from(rooms[roomId])
      .filter((id) => id !== socket.id)
      .map((id) => ({ id, style: players[id]?.style || "cheese" }));
    socket.emit("current-players", others);

    // Уведомить других игроков
    socket
      .to(roomId)
      .emit("player-joined", { id: socket.id, style: players[socket.id].style });
    console.log(`Игрок ${socket.id} в комнате ${roomId}`);
  });

  socket.on("update", (data) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit("player-update", {
      id: socket.id,
      x: data.x,
      y: data.y,
      size: data.size,
      style: data.style,
      isSnake: data.isSnake,
      segments: data.segments,
      mass: data.mass,
      score: data.score,
    });
  });

  socket.on("disconnect", () => {
    console.log("Игрок отключился:", socket.id);
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].delete(socket.id);
      socket.to(roomId).emit("player-left", socket.id);
      if (rooms[roomId].size === 0) {
        delete rooms[roomId];
      }
    }
    delete players[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
