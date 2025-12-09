import dotenv from "dotenv";
dotenv.config();

// ====================================================
// ================ IMPORTS & CONFIG ==================
// ====================================================
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { pool } from "./db.js";
import { getRandomQuestionWithOptions } from "./questions.js";
import {
  rooms,
  createRoomWithGame,
  broadcastRoomState,
} from "./rooms.js";
import { addPlayer } from "./db.js";
import { startRound } from "./gameLoop.js";
const usedSoloQuestions = new Set();

if (typeof fetch === "undefined") {
  global.fetch = (await import("node-fetch")).default;
}

const app = express();
const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim());

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// ===================================================
// ================= HEALTH & ROOT ===================
// ===================================================
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, build: "modular-v1" })
);
app.get("/", (_req, res) => res.status(200).send("OK"));

// ===================================================
// ================= USER PROFILE API ================
// ===================================================

app.post("/api/profile", async (req, res) => {
  try {
    const { display_name, avatar_url } = req.body || {};
    if (!display_name) {
      return res.status(400).json({ ok: false, error: "MISSING_NAME" });
    }

    console.log("🟢 /api/profile request:", display_name);

    let userId;
    const existing = await pool.query(
      `SELECT id FROM users WHERE LOWER(display_name) = LOWER($1)`,
      [display_name]
    );

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      console.log("✅ Existing user found:", userId);
    } else {
      const inserted = await pool.query(
        `INSERT INTO users (display_name) VALUES ($1) RETURNING id`,
        [display_name]
      );
      userId = inserted.rows[0].id;
      console.log("✅ New user created:", userId);
    }

    const profRes = await pool.query(
      `
      INSERT INTO profiles (user_id, avatar_url)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET avatar_url = EXCLUDED.avatar_url
      RETURNING *
      `,
      [userId, avatar_url || null]
    );

    console.log("✅ Profile saved:", profRes.rows[0]);
    return res.json({ ok: true, profile: profRes.rows[0] });
  } catch (err) {
    console.error("❌ /api/profile failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/profile/:name", async (req, res) => {
  try {
    const name = req.params.name.trim();
    const q = `
      SELECT u.id AS user_id, u.display_name,
             p.avatar_url, p.games_played, p.rounds_won
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE LOWER(u.display_name) = LOWER($1)
    `;
  const { rows } = await pool.query(q, [name]);
    if (!rows.length)
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    return res.json({ ok: true, profile: rows[0] });
  } catch (err) {
    console.error("❌ /api/profile/:name failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

let io;

// ====================================================
// ================= SOLO / AI ROUTES =================
// ====================================================

app.post("/api/ai-round", async (req, res) => {
  const { question, options, aiName, aiPersonality, roomId } = req.body || {};

  if (!question?.text || !Array.isArray(options)) {
    return res.status(400).json({ error: "BAD_INPUT" });
  }

  try {
    // Tell DeepSeek to return indexes ONLY
    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `
            ${aiPersonality}

You are playing Majority Loss.
RULE: Choose the option that FEWEST players will pick (the minority).

You MUST respond in EXACTLY this format:

THINKING: <a single sentence spoken in your character's natural style — dramatic if you're Yumeko, monotone if you're L, cold/logical if you're Chishiya, etc.>
CHOICE: <number>

Where <number> is the INDEX (0,1,2...) of the chosen option.
Do NOT return the text. Do NOT add extra lines.
`.trim(),

          },
          {
            role: "user",
            content: `
Question: ${question.text}

Options:
${options.map((o, i) => `${i}: ${o.text}`).join("\n")}

Pick ONLY the minority answer by index.
`.trim(),
          },
        ],
      }),
    });

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    console.log("🔍 RAW AI RESPONSE:", JSON.stringify(raw, null, 2));

    const thinkingMatch = raw.match(/THINKING:\s*(.+)/i);
    const indexMatch = raw.match(/CHOICE:\s*(\d+)/i);

    const thinking = thinkingMatch?.[1]?.trim() || "Analyzing…";
    const index = Number(indexMatch?.[1]);

    let choiceObj = null;
    if (Number.isFinite(index) && options[index]) {
      choiceObj = options[index];
    } else {
      choiceObj = options[Math.floor(Math.random() * options.length)];
    }

    if (roomId && io) {
      io.to(roomId).emit("ai_thinking", { aiName, thinking });
    }

    return res.json({
      aiName,
      thinking,
      choiceText: choiceObj.text,
      choiceId: choiceObj.id,
    });

  } catch (err) {
    console.error("❌ AI failed:", err);
    const fallback = options[Math.floor(Math.random() * options.length)];
    return res.json({
      aiName,
      thinking: "Instinct makes the choice.",
      choiceText: fallback.text,
      choiceId: fallback.id,
    });
  }
});

// ===================================================
// ============= SOLO QUESTION ENDPOINT ==============
// ===================================================
app.get("/api/solo/question", async (req, res) => {
  try {
    let q = null;

    for (let i = 0; i < 50; i++) {
      const candidate = await getRandomQuestionWithOptions();
      if (!usedSoloQuestions.has(candidate.id)) {
        usedSoloQuestions.add(candidate.id);
        q = candidate;
        break;
      }
    }

    if (!q) {
      return res.json({
        ok: false,
        error: "NO_UNIQUE_QUESTION"
      });
    }

    res.json({
      ok: true,
      question: { id: q.id, text: q.text },
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
      })),
    });
  } catch (err) {
    console.error("❌ /api/solo/question failed:", err);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});


// ===================================================
// ================= SOCKET SETUP ====================
// ===================================================
const server = http.createServer(app);
io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] },
});

// ===================================================
// ================= SOCKET HANDLERS =================
// ===================================================
io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  socket.on("host_create", async (ack) => {
    try {
      const { roomId, gameId } = await createRoomWithGame();
      socket.join(roomId);
      console.log(`🧩 Room created: ${roomId}`);
      ack?.({ roomId, gameId });
    } catch (err) {
      ack?.({ error: "HOST_CREATE_FAILED" });
    }
  });

  socket.on("start_game", ({ roomId, duration, maxRounds } = {}, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });
    if (!room.players.has(socket.id)) return ack?.({ error: "NOT_IN_ROOM" });

    const d = Number(duration);
    const r = Number(maxRounds);

    room.roundDuration = Number.isFinite(d) ? d : 20;
    room.maxRounds = Number.isFinite(r) ? r : 10;

    room.roundVotes = new Map();
    room.round = null;

    if (!room.hasPlayedIntro) {
      room.hasPlayedIntro = true;
      io.to(roomId).emit("playIntroCutscene");
      return ack?.({ ok: true, intro: true });
    }

    startRound(io, roomId, room.roundDuration)
      .then(() => {
        room.ready = new Map();
        ack?.({ ok: true });
      })
      .catch(() => ack?.({ error: "START_FAILED" }));
  });

  socket.on("intro_done", ({ roomId } = {}) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!room.players.has(socket.id)) return;
    if (!room.hasPlayedIntro || room.round || room.gameOver) return;

    if (!Number.isFinite(room.roundDuration)) room.roundDuration = 20;
    if (!Number.isFinite(room.maxRounds)) room.maxRounds = 10;

    startRound(io, roomId, room.roundDuration).catch((e) =>
      console.error("intro_done fail", e)
    );
  });

  socket.on("join_room", async ({ roomId, name }, ack) => {
    try {
      const room = rooms.get(roomId);
      if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });

      if (room.players.size >= 5) {
      return ack?.({ error: "Room is full (max 5 players)." });
      }

      const p = await addPlayer(room.gameId, (name || "Player").trim());
      room.players.set(socket.id, {
        id: socket.id,
        name: p.display_name,
        playerGameId: p.playerGameId,
        points: p.points,
        mission: null,
      });

      if (!room.ready) room.ready = new Map();
      room.ready.set(socket.id, false);

      socket.join(roomId);
      broadcastRoomState(io, roomId);

      const readyObj = {};
      for (const [pid, val] of room.ready.entries()) {
        readyObj[pid] = !!val;
      }

      io.to(roomId).emit("ready_state", {
        ready: readyObj,
        allReady: computeAllReady(room),
      });

      ack?.({ ok: true, playerId: socket.id });
    } catch (err) {
      ack?.({ error: "JOIN_FAILED" });
    }
  });

  socket.on("player_ready", ({ roomId } = {}, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });
    if (!room.players.has(socket.id)) return ack?.({ error: "NOT_IN_ROOM" });

    room.ready ??= new Map();
    room.ready.set(socket.id, true);

    const readyObj = {};
    for (const [pid, val] of room.ready.entries()) {
      readyObj[pid] = !!val;
    }

    io.to(roomId).emit("ready_state", {
      ready: readyObj,
      allReady: computeAllReady(room),
    });

    ack?.({ ok: true });
  });

  socket.on("vote", ({ roomId, roundId, optionId }, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });

    const player = room.players.get(socket.id);
    if (!player) return ack?.({ error: "NOT_IN_ROOM" });

    if (!room.round || String(room.round.id) !== String(roundId)) {
      return ack?.({ error: "ROUND_CLOSED" });
    }

    const exists = room.round.options.some(
      (o) => Number(o.id) === Number(optionId)
    );
    if (!exists) return ack?.({ error: "BAD_OPTION" });

    room.roundVotes ??= new Map();
    room.roundVotes.set(player.playerGameId, Number(optionId));

    const voted = {};
    for (const [pgId] of room.roundVotes.entries()) {
      const p = Array.from(room.players.values()).find(
        (pl) => pl.playerGameId === pgId
      );
      if (p) voted[p.id] = true;
    }

    io.to(roomId).emit("vote_status", { voted });

    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms) {
      let removed = false;

      if (room.players.delete(socket.id)) removed = true;
      room.ready?.delete(socket.id);

      if (removed) {
        if (room.players.size === 0) {
          if (room.timer) clearInterval(room.timer);
          rooms.delete(roomId);
          console.log(`🧹 Room ${roomId} deleted`);
        } else {
          broadcastRoomState(io, roomId);

          const readyObj = {};
          for (const [pid, val] of room.ready.entries()) {
            readyObj[pid] = !!val;
          }

          io.to(roomId).emit("ready_state", {
            ready: readyObj,
            allReady: computeAllReady(room),
          });
        }
        break;
      }
    }
    console.log("❌ Client disconnected:", socket.id);
  });
});

function computeAllReady(room) {
  if (!room || !room.players) return false;
  const ids = Array.from(room.players.keys());
  if (!ids.length) return false;
  if (!room.ready) return false;
  return ids.every((id) => room.ready.get(id) === true);
}

// ===================================================
// ================= SERVER STARTUP ==================
// ===================================================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
