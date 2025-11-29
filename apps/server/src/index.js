// apps/server/src/index.js
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

    // find existing or create new user
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

// ===================================================
// ================= SOLO / AI ROUTES ================
// ===================================================

app.get("/api/solo/question", async (_req, res) => {
  try {
    const q = await getRandomQuestionWithOptions();
    res.json({
      ok: true,
      question: { id: q.id, text: q.text },
      options: q.options,
    });
  } catch (e) {
    console.error("❌ Failed to fetch solo question:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

let io; // defined after server creation, but referenced in handler below

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
        temperature: 0.9,
        messages: [
            {
              role: "system",
              content: `
            You are ${aiName}, ${aiPersonality}, a contestant in the psychological deduction game "Majority Loss".

            Your job:
            • Think like a contestant trying to win by choosing the MINORITY option.
            • Produce EXACTLY ONE short "inner thought" sentence 20 words or fewer).
            • Then output your choice.

            STRICT FORMAT (no deviations):
            <INNER THOUGHT UNDER 20 WORDS>
            CHOICE: <option text>

            Hard rules you MUST follow:
            1. Only ONE sentence of thought.
            2. That sentence MUST be 20 words or fewer.
            3. No greetings, no explanations, no extra commentary.
            4. No extra lines other than the required two.
            5. If you break ANY rule or exceed 20 words, the answer becomes INVALID.

            Your response must ALWAYS follow the strict format above.
            `.trim(),
            },

          {
            role: "user",
            content: `${question.text}\nOptions: ${options
              .map((o) => o.text)
              .join(", ")}`,
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
io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] },
});

// ===================================================
// ================= SOCKET HANDLERS =================
// ===================================================
io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  // ---------- HOST CREATE ----------
  socket.on("host_create", async (ack) => {
    try {
      const { roomId, gameId } = await createRoomWithGame();

      socket.join(roomId);
      console.log(`🧩 Room created: ${roomId} (game id: ${gameId})`);

      ack?.({ roomId, gameId });
    } catch (err) {
      console.error("❌ host_create failed:", err);
      ack?.({ error: "HOST_CREATE_FAILED" });
    }
  });

  // ---------- START GAME ----------
  socket.on("start_game", ({ roomId, duration } = {}, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });
    if (!room.players.has(socket.id)) return ack?.({ error: "NOT_IN_ROOM" });

    // Reset round state
    room.roundVotes = new Map();
    room.round = null;

    // FIRST EVER START: only play intro
    if (!room.hasPlayedIntro) {
      room.hasPlayedIntro = true;
      room.firstRoundDuration = Number(duration) || 20;

      console.log("🎬 First start_game for room", roomId, "→ sending intro");
      io.to(roomId).emit("playIntroCutscene");

      // Acknowledge that intro is playing; round starts after intro_done
      ack?.({ ok: true, intro: true });
      return;
    }

    // Subsequent rounds: start immediately (no intro)
    startRound(io, roomId, Number(duration) || 20)
      .then(() => {
        room.ready = new Map();
        ack?.({ ok: true });
      })
      .catch((err) => {
        console.error("❌ start_game failed:", err);
        ack?.({ error: "START_FAILED" });
      });
  });

  // ---------- INTRO DONE (HOST AFTER CUTSCENE) ----------
  socket.on("intro_done", ({ roomId } = {}) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!room.players.has(socket.id)) return;      // must be in the room
    if (!room.hasPlayedIntro) return;             // intro was never triggered
    if (room.round) return;                        // round already running
    if (room.gameOver) return;                     // game already finished

    const duration = Number(room.firstRoundDuration) || 20;

    console.log("🎬 intro_done from", socket.id, "→ starting first round for", roomId);
    startRound(io, roomId, duration)
      .then(() => {
        room.ready = new Map();
      })
      .catch((err) => {
        console.error("❌ intro_done → startRound failed:", err);
      });
  });

  // ---------- JOIN ROOM ----------
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
      console.error("❌ join_room failed:", err);
      ack?.({ error: "JOIN_FAILED" });
    }
  });

  // ---------- PLAYER READY ----------
  socket.on("player_ready", ({ roomId } = {}, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });
    if (!room.players.has(socket.id)) return ack?.({ error: "NOT_IN_ROOM" });

    if (!room.ready) room.ready = new Map();
    room.ready.set(socket.id, true);

    const readyObj = {};
    for (const [pid, val] of room.ready.entries()) {
      readyObj[pid] = !!val;
    }

    const allReady = computeAllReady(room);

    io.to(roomId).emit("ready_state", {
      ready: readyObj,
      allReady,
    });

    ack?.({ ok: true });
  });

  // ---------- VOTE ----------
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

    // Store vote keyed by playerGameId (stable within the game)
    room.roundVotes = room.roundVotes || new Map();
    room.roundVotes.set(player.playerGameId, Number(optionId));

    // Build voted map keyed by socket.id just for UI (optional)
    const voted = {};
    for (const [pgId] of room.roundVotes.entries()) {
      const p = Array.from(room.players.values()).find(
        (pl) => pl.playerGameId === pgId
      );
      if (p) voted[p.id] = true;
    }
    io.to(roomId).emit("vote_status", { voted });

    ack?.({ ok: true });
    console.log("✅ vote received", {
      roomId,
      socketId: socket.id,
      playerGameId: player.playerGameId,
      optionId,
    });
  });

  // ---------- DISCONNECT ----------
  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms) {
      let removed = false;
      if (room.players.delete(socket.id)) {
        removed = true;
      }
      if (room.ready) {
        room.ready.delete(socket.id);
      }

      if (removed) {
        if (room.players.size === 0) {
          if (room.timer) clearInterval(room.timer);
          rooms.delete(roomId);
          console.log(`🧹 Room ${roomId} deleted (empty)`);
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
  const playerIds = Array.from(room.players.keys());
  if (!playerIds.length) return false;
  if (!room.ready) return false;
  return playerIds.every((id) => room.ready.get(id) === true);
}

// ===================================================
// ================= SERVER STARTUP ==================
// ===================================================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
