const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = 3000;

app.use(express.static("client"));

io.on("connection", (socket) => {
  console.log("Игрок подключился:", socket.id);

  // Тут будут события позже
  socket.on("disconnect", () => {
    console.log("Игрок отключился:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
