import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "*").split(",").map(s => s.trim());

// ---- Express setup
const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.get("/healthz", (_, res) => res.json({ ok: true }));

// ---- HTTP + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] }
});

// ---- game state
const rooms = new Map();

// ---- make game room
function makeRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; 
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

// ---- room state
function sendRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = Array.from(room.players.values()); 
  io.to(roomId).emit("room_state", { roomId, players });
}

io.on("connection", (socket) => {
  console.log("client connected:", socket.id);

  // ---- create room
  socket.on("host_create", (ack) => {
    let roomId;
    do { roomId = makeRoomId(); } while (rooms.has(roomId));

    rooms.set(roomId, {
      roomId,
      players: new Map(),  
      round: null          
    });

    // ---- join socket
    socket.join(roomId);
    console.log(`room created: ${roomId}`);
    ack?.({ roomId });
  });

  // ---- join room
  socket.on("join_room", ({ roomId, name }, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });

    // record player
    room.players.set(socket.id, { id: socket.id, name: name?.trim() || "Player" });

    // join the Socket.IO room and notify everyone
    socket.join(roomId);
    sendRoomState(roomId);

    ack?.({ ok: true, playerId: socket.id });
    console.log(`player ${socket.id} joined ${roomId} as "${name}"`);
  });

  // ---- disconnect
  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms) {
      if (room.players.delete(socket.id)) {
        if (room.players.size === 0) {
          rooms.delete(roomId);
          console.log(`room ${roomId} deleted (empty)`);
        } else {
          sendRoomState(roomId);
        }
        break;
      }
    }
    console.log("client disconnected:", socket.id);
  });
});

// ---- listeners
server.listen(PORT, "0.0.0.0", () =>
  console.log("Server running on http://localhost:" + PORT)
);
