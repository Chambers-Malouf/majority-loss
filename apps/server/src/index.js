// ===================================================
// ================ IMPORTS & CONFIG =================
// ===================================================
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";

// Polyfill fetch if not available
if (typeof fetch === "undefined") {
  global.fetch = (await import("node-fetch")).default;
}

const MAX_ROUNDS = 10;
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.PGSSL?.toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : false,
});

// ===================================================
// ================= DATABASE HELPERS ================
// ===================================================

async function getOrCreateGameByCode(code, maxPoints = 5) {
  const q = `
    INSERT INTO games (code, max_points)
    VALUES ($1, $2)
    ON CONFLICT (code) DO UPDATE SET
      max_points = EXCLUDED.max_points
    RETURNING id, code, status, max_points
  `;
  const { rows } = await pool.query(q, [code, maxPoints]);
  return rows[0];
}

async function addPlayer(gameId, displayName = "Player") {
  const q = `
    INSERT INTO player_game (game_id, display_name, points)
    VALUES ($1, $2, 0)
    RETURNING id, game_id, display_name, points
  `;
  const { rows } = await pool.query(q, [gameId, displayName]);
  return rows[0];
}

async function getRandomQuestionWithOptions() {
  const qSql = `SELECT id, text FROM questions ORDER BY random() LIMIT 1`;
  const qRes = await pool.query(qSql);
  if (!qRes.rows.length) throw new Error("no_questions");

  const q = qRes.rows[0];
  const oSql = `SELECT id, text FROM options WHERE question_id = $1 ORDER BY id`;
  const oRes = await pool.query(oSql, [q.id]);

  return {
    id: q.id,
    text: q.text,
    options: oRes.rows.map((r) => ({ id: r.id, text: r.text })),
  };
}

// ===================================================
// ================= EXPRESS SETUP ===================
// ===================================================
const app = express();
const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim());

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

app.get("/healthz", (_req, res) => res.json({ ok: true, build: "clean-v1" }));
app.get("/", (_, res) => res.status(200).send("OK"));

// ===================================================
// ================== API ENDPOINTS ==================
// ===================================================
// ===================================================
// ================= USER PROFILE API ================
// ===================================================
app.use(express.json());

// Create or update profile
app.post("/api/profile", async (req, res) => {
  const { display_name, avatar_url } = req.body || {};
  if (!display_name) {
    return res.status(400).json({ ok: false, error: "MISSING_NAME" });
  }

  try {
    // Step 1: find or create user
    const userRes = await pool.query(
      `INSERT INTO users (display_name)
       VALUES ($1)
       ON CONFLICT (display_name) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [display_name]
    );
    const userId = userRes.rows[0].id;

    // Step 2: find or create profile
    const profRes = await pool.query(
      `INSERT INTO profiles (user_id, avatar_url)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET avatar_url = EXCLUDED.avatar_url
       RETURNING *`,
      [userId, avatar_url || null]
    );

    res.json({ ok: true, profile: profRes.rows[0] });
  } catch (err) {
    console.error("❌ /api/profile failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get profile by name
app.get("/api/profile/:name", async (req, res) => {
  const name = req.params.name;
  try {
    const q = `
      SELECT u.id AS user_id, u.display_name, p.avatar_url, p.games_played, p.rounds_won
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE u.display_name = $1
    `;
    const { rows } = await pool.query(q, [name]);
    if (!rows.length) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    res.json({ ok: true, profile: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/solo/question", async (_req, res) => {
  try {
    const q = await getRandomQuestionWithOptions();
    res.json({ ok: true, question: { id: q.id, text: q.text }, options: q.options });
  } catch (e) {
    console.error("❌ Failed to fetch solo question:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/ai-round", express.json(), async (req, res) => {
  const { question, options, aiName, aiPersonality, roomId } = req.body || {};
  if (!question?.text || !Array.isArray(options)) {
    return res.status(400).json({ error: "BAD_INPUT" });
  }

  try {
    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: `
              You are ${aiName}, ${aiPersonality}, a contestant in a psychological deduction game called *Majority Loss*.
              You must secretly pick an option that ends up in the minority of votes to win.

              Here’s how to think:
              1. Predict what the majority of the other contestants would likely pick.
              2. Decide whether to follow the crowd or intentionally go against it.
              3. Express a short inner thought (under 20 words) revealing your reasoning, emotion, or bluff — but it must logically connect to the question.
              4. End with your final choice in this exact format:
              CHOICE: [option text]
              Remember, your goal is to be in the minority. Choose wisely!
            `.trim(),
          },
          {
            role: "user",
            content: `${question.text}\nOptions: ${options.map((o) => o.text).join(", ")}`,
          },
        ],
      }),
    });

    const data = await r.json();
    const msg = data?.choices?.[0]?.message?.content || "";

    const split = msg.split(/CHOICE:/i);
    const thinking = split[0]?.trim() || "";
    const choiceMatch = split[1]?.match(/\[?([^\]\n]+)\]?/);
    const choiceText = choiceMatch ? choiceMatch[1].trim() : null;

    const choice = options.find(
      (o) =>
        o.text.toLowerCase().trim() === (choiceText || "").toLowerCase().trim()
    );

    const thinkingFinal = thinking || "is thinking deeply...";
    if (roomId && io) {
      io.to(roomId).emit("ai_thinking", { aiName, thinking: thinkingFinal });
    }

    res.json({
      aiName,
      thinking: thinkingFinal,
      choiceText,
      choiceId: choice?.id || null,
    });
  } catch (e) {
    console.error("❌ AI round failed:", e?.message || e);
    res.status(500).json({ error: "AI_FAILED", details: String(e?.message || e) });
  }
});

// ===================================================
// ================= SOCKET SETUP ====================
// ===================================================
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] },
});

// ===================================================
// ================= GAME STATE LOGIC ================
// ===================================================
const rooms = new Map();

function makeRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function sendRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = Array.from(room.players.values());
  io.to(roomId).emit("room_state", { roomId, players });
}

// ===================================================
// ================= ROUND HANDLER ===================
// ===================================================
async function startRound(roomId, durationSec = 20) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.timer) clearInterval(room.timer);

  room.roundNumber = (room.roundNumber || 0) + 1;
  if (room.roundNumber > MAX_ROUNDS) {
    const leaderboard = Array.from(room.players.values())
      .sort((a, b) => b.points - a.points)
      .map((p) => ({ name: p.name, points: p.points }));

    io.to(roomId).emit("game_over", { leaderboard });

    if (room.timer) clearInterval(room.timer);
    room.round = null;
    room.roundVotes = new Map();
    room.roundNumber = 0;
    return;
  }

  const q = await getRandomQuestionWithOptions();
  room.round = {
    id: Date.now().toString(),
    roundNumber: room.roundNumber,
    question: { id: q.id, text: q.text },
    options: q.options,
  };
  room.roundVotes = new Map();

  io.to(roomId).emit("round_question", {
    roundId: room.round.id,
    roundNumber: room.round.roundNumber,
    question: room.round.question,
    options: room.round.options,
  });

  const D = Math.max(1, Math.min(300, Number(durationSec) || 20));
  room.endAt = Date.now() + D * 1000;

  room.timer = setInterval(async () => {
    const remaining = Math.max(0, Math.ceil((room.endAt - Date.now()) / 1000));
    io.to(roomId).emit("round_tick", { remaining });

    if (remaining <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      room.endAt = null;

      const countsMap = new Map();
      for (const opt of room.round.options) countsMap.set(String(opt.id), 0);
      for (const optId of room.roundVotes.values()) {
        const key = String(optId);
        countsMap.set(key, (countsMap.get(key) || 0) + 1);
      }

      const counts = [];
      for (const [optionId, count] of countsMap.entries()) {
        const opt = room.round.options.find((o) => o.id === optionId);
        if (opt) counts.push({ optionId: Number(optionId), count, text: opt.text });
      }

      const nonzero = counts.filter((c) => c.count > 0);
      let winningOptionId = null;
      if (nonzero.length > 0) {
        const min = Math.min(...nonzero.map((c) => c.count));
        const losers = nonzero.filter((c) => c.count === min);
        if (losers.length === 1) winningOptionId = losers[0].optionId;
      }

      const votes = [];
      for (const [socketId, optionId] of room.roundVotes.entries()) {
        const player = room.players.get(socketId);
        if (player) {
          votes.push({ playerId: socketId, playerName: player.name, optionId });
        }
      }

      for (const [socketId, optionId] of room.roundVotes.entries()) {
        if (optionId === winningOptionId) {
          const player = room.players.get(socketId);
          if (player) {
            player.points += 1;
            await pool.query(
              `UPDATE player_game SET points = $1 WHERE id = $2`,
              [player.points, player.playerGameId]
            );
          }
        }
      }

      io.to(roomId).emit("round_results", {
        roundId: room.round.id,
        winningOptionId,
        counts,
        votes,
        leaderboard: Array.from(room.players.values()).map((p) => ({
          name: p.name,
          points: p.points,
        })),
      });

      room.round = null;
      room.roundVotes = new Map();
    }
  }, 1000);
}

// ===================================================
// ================= SOCKET HANDLERS =================
// ===================================================
io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  socket.on("host_create", async (ack) => {
    let roomId;
    do {
      roomId = makeRoomId();
    } while (rooms.has(roomId));

    const game = await getOrCreateGameByCode(roomId, 5);

    rooms.set(roomId, {
      roomId,
      players: new Map(),
      round: null,
      timer: null,
      endAt: null,
      gameId: game.id,
    });

    socket.join(roomId);
    console.log(`🧩 Room created: ${roomId} (game id: ${game.id})`);
    ack?.({ roomId, gameId: game.id });
  });

  socket.on("start_game", ({ roomId, duration } = {}, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });
    if (!room.players.has(socket.id)) return ack?.({ error: "NOT_IN_ROOM" });

    startRound(roomId, duration || 10);
    ack?.({ ok: true });
  });

  socket.on("join_room", async ({ roomId, name }, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });

    const p = await addPlayer(room.gameId, (name || "Player").trim());
    room.players.set(socket.id, {
      id: socket.id,
      name: p.display_name,
      playerGameId: p.id,
      points: p.points,
    });

    socket.join(roomId);
    sendRoomState(roomId);
    ack?.({ ok: true, playerId: socket.id });
  });

  socket.on("vote", ({ roomId, roundId, optionId }, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });
    if (!room.players.has(socket.id)) return ack?.({ error: "NOT_IN_ROOM" });

    if (!room.round || String(room.round.id) !== String(roundId)) {
      return ack?.({ error: "ROUND_CLOSED" });
    }

    const exists = room.round.options.some(
      (o) => Number(o.id) === Number(optionId)
    );
    if (!exists) return ack?.({ error: "BAD_OPTION" });

    room.roundVotes = room.roundVotes || new Map();
    room.roundVotes.set(socket.id, Number(optionId));

    const voted = {};
    for (const pid of room.roundVotes.keys()) voted[pid] = true;
    io.to(roomId).emit("vote_status", { voted });

    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms) {
      if (room.players.delete(socket.id)) {
        if (room.players.size === 0) {
          if (room.timer) clearInterval(room.timer);
          rooms.delete(roomId);
          console.log(`🧹 Room ${roomId} deleted (empty)`);
        } else {
          sendRoomState(roomId);
        }
        break;
      }
    }
    console.log("❌ Client disconnected:", socket.id);
  });
});

// ===================================================
// ================= SERVER STARTUP ==================
// ===================================================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
