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

// Polyfill fetch if needed (Render / Node 18 safety)
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
    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.8,
        messages: [
          {
            role: "system",
            content: `
${aiPersonality}

You are playing a psychological game called Majority Loss.
GOAL: Always choose the option that FEWEST other players will pick (the MINORITY).
Stay fully in character. You ALWAYS try to win.

Respond in EXACTLY this format:

THINKING: <one in-character sentence explaining your logic>
CHOICE: <exact option text you pick>

Nothing else. No additional lines. Only one sentence for THINKING.
`.trim(),
          },
          {
            role: "user",
            content: `
Question: ${question.text}
Options:
${options.map((o) => "- " + o.text).join("\n")}

Decide which option the majority picks, then choose the minority.
Stay perfectly in character.
`.trim(),
          },
        ],
      }),
    });

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || "";

    const thinkMatch = raw.match(/THINKING:\s*(.+)/i);
    const choiceMatch = raw.match(/CHOICE:\s*(.+)/i);

    const thinking = thinkMatch?.[1]?.trim() || "...";
    const choiceText = choiceMatch?.[1]?.trim() || options[0].text;

    const choice = options.find(
      (o) => o.text.toLowerCase().trim() === choiceText.toLowerCase().trim()
    );

    if (roomId && io) {
      io.to(roomId).emit("ai_thinking", { aiName, thinking });
    }

    return res.json({
      aiName,
      thinking,
      choiceText,
      choiceId: choice?.id || null,
    });

  } catch (err) {
    console.error("❌ AI round failed:", err);
    return res.status(500).json({ error: "AI_FAILED" });
  }
});

// ===================================================
// ============= SOLO QUESTION ENDPOINT ==============
// ===================================================
app.get("/api/solo/question", async (req, res) => {
  try {
    const q = await getRandomQuestionWithOptions();

    if (!q) {
      return res.status(500).json({ error: "NO_QUESTION" });
    }

    res.json({
      ok: true,
      question: { id: q.id, text: q.text },
      options: q.options.map((opt) => ({
        id: opt.id,
        text: opt.text,
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
