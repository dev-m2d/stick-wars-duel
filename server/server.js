const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors({ origin: "*" }));
app.get("/", (_req, res) => res.json({ name: "Stick Wars Duel server", status: "online" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join(""); }
  while (rooms.has(code));
  return code;
}
function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (room) {
    room.players = room.players.filter(id => id !== socket.id);
    socket.to(code).emit("room:opponent-left");
    if (room.players.length === 0) rooms.delete(code);
  }
  socket.leave(code);
  socket.data.roomCode = null;
}

io.on("connection", socket => {
  socket.on("room:create", callback => {
    const code = makeCode();
    rooms.set(code, { players: [socket.id], started: false });
    socket.join(code); socket.data.roomCode = code; socket.data.player = 1;
    if (typeof callback === "function") callback({ ok: true, code, player: 1 });
  });

  socket.on("room:join", ({ code } = {}, callback) => {
    const clean = String(code || "").toUpperCase().trim();
    const room = rooms.get(clean);
    if (!room) return typeof callback === "function" && callback({ ok: false, message: "الكود غير صحيح أو الغرفة غير موجودة." });
    if (room.players.length >= 2) return typeof callback === "function" && callback({ ok: false, message: "الغرفة ممتلئة بالفعل." });
    room.players.push(socket.id); room.started = true;
    socket.join(clean); socket.data.roomCode = clean; socket.data.player = 2;
    if (typeof callback === "function") callback({ ok: true, code: clean, player: 2 });
    io.to(clean).emit("room:start", { code: clean });
  });

  socket.on("game:action", data => {
    if (!data || data.code !== socket.data.roomCode) return;
    socket.to(data.code).emit("game:action", { ...data, player: socket.data.player });
  });
  socket.on("game:snapshot", data => {
    if (!data || data.code !== socket.data.roomCode || socket.data.player !== 1) return;
    socket.to(data.code).emit("game:snapshot", { ...data, player: 1 });
  });
  socket.on("disconnect", () => leaveRoom(socket));
});
const port = process.env.PORT || 3000;
server.listen(port, () => console.log("Stick Wars Duel server listening on " + port));