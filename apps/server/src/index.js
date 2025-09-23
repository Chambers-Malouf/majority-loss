import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL?.toLowerCase() === "true"
    ? { rejectUnauthorized: false }
    : false,
});

console.log("DB URL LOADED?", !!process.env.DATABASE_URL);

// DB: upsert a game by code and return its row
async function getOrCreateGameByCode(code, maxPoints = 5) {
  const q = `
    INSERT INTO games (code, max_points)
    VALUES ($1, $2)
    ON CONFLICT (code) DO UPDATE SET
      max_points = EXCLUDED.max_points
    RETURNING id, code, status, max_points
  `;
  const { rows } = await pool.query(q, [code, maxPoints]); // $1=code, $2=maxPoints
  return rows[0];
}
// DB: add a player row for a game and return it
async function addPlayer(gameId, displayName = "Player") {
  const q = `
    INSERT INTO player_game (game_id, display_name, points)
    VALUES ($1, $2, 0)
    RETURNING id, game_id, display_name, points
  `;
  const { rows } = await pool.query(q, [gameId, displayName]); // $1=gameId, $2=name
  return rows[0];
}



const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "*").split(",").map(s => s.trim());

// ---- Express setup
const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.get("/healthz", (_req, res) => res.json({ ok: true, build: "debug-4" }));
app.get("/", (_, res) => res.status(200).send("OK")); // simple health check

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

// ---- NEW: start round helper
function startRound(roomId, durationSec = 10) {
  const room = rooms.get(roomId);
  if (!room) return;

  // clear any previous timer
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }

  const D = Math.max(1, Math.min(300, Number(durationSec) || 10)); // clamp 1..300s
  room.endAt = Date.now() + D * 1000;

  // notify everyone that the round started
  io.to(roomId).emit("round_started", { duration: D, endAt: room.endAt });

  // tick every second
  room.timer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((room.endAt - Date.now()) / 1000));
    io.to(roomId).emit("round_tick", { remaining });

    if (remaining <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      room.endAt = null;

      // later: tally answers and send results
      io.to(roomId).emit("game_over");
    }
  }, 1000);
}

// ---- socket handlers
io.on("connection", (socket) => {
  console.log("client connected:", socket.id);

  // ---- create room
socket.on("host_create", async (ack) => {
  let roomId;
  do { roomId = makeRoomId(); } while (rooms.has(roomId));

  // create/upsert the DB game row for this lobby code
  const game = await getOrCreateGameByCode(roomId, 5);

  rooms.set(roomId, {
    roomId,
    players: new Map(),
    round: null,
    timer: null,
    endAt: null,
    gameId: game.id, // <-- keep the DB id on the room
  });

  socket.join(roomId);
  console.log(`room created: ${roomId} (game id: ${game.id})`);
  ack?.({ roomId, gameId: game.id });
});


  // ---- start game (kick off countdown)
  socket.on("start_game", ({ roomId, duration } = {}, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });

    if (!room.players.has(socket.id)) return ack?.({ error: "NOT_IN_ROOM" });

    startRound(roomId, duration || 10);
    ack?.({ ok: true });
  });

  // ---- join room
socket.on("join_room", async ({ roomId, name }, ack) => {
  const room = rooms.get(roomId);
  if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });

  // write to DB
  const p = await addPlayer(room.gameId, (name || "Player").trim());

  // track in-memory
  room.players.set(socket.id, {
    id: socket.id,
    name: p.display_name,
    playerGameId: p.id,
    points: p.points,
  });

  socket.join(roomId);
  sendRoomState(roomId);
  ack?.({ ok: true, playerId: socket.id });
  console.log(`player ${socket.id} joined ${roomId} as "${p.display_name}" (pg:${p.id})`);
});


  // ---- disconnect
  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms) {
      if (room.players.delete(socket.id)) {
        if (room.players.size === 0) {
          if (room.timer) clearInterval(room.timer); // NEW: stop timer when room is empty
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

// ---- DEBUG (temporary): quick DB checks
app.get("/debug/games", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, code, status, max_points FROM games ORDER BY id DESC LIMIT 20"
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching games:", err);
    res.status(500).json({ error: "db_error" });
  }
});

app.get("/debug/players/:gameId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, display_name, points FROM player_game WHERE game_id = $1 ORDER BY id",
      [req.params.gameId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching players:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ---- start server
server.listen(PORT, "0.0.0.0", () =>
  console.log("Server running on http://localhost:" + PORT)
);
