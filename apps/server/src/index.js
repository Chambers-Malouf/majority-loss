// apps/server/src/index.js. 
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
let io;
// ====================================================
// ================= SOLO / AI ROUTES =================
// ====================================================

app.post("/api/ai-round", async (req, res) => {
  const { question, options, aiName, aiPersonality, roomId } = req.body || {};
  if (!question?.text || !Array.isArray(options) || options.length === 0) {
    return res.status(400).json({ error: "BAD_INPUT" });
  }

  // Build a numbered list for the model
  const optionsForPrompt = options
    .map((o) => `${o.id}: ${o.text}`)
    .join("\n");

  try {
    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.85, // a bit more chaos so different AIs diverge
        messages: [
          {
            role: "system",
            content: `
You are ${aiName}.
${aiPersonality}

You are playing a psychological voting game called "Majority Loss":
- Each round, all players vote for ONE option.
- The players who picked the MINORITY option (fewest votes) "win" that round.
- Your goal is to think about what the MAJORITY will pick, then choose a DIFFERENT option.

You will be given:
- A question
- A list of numbered options: "<id>: <text>"

RESPOND **IN THIS EXACT FORMAT**:

THINKING: <one short, in-character sentence about your reasoning>
CHOICE_ID: <numeric id of the option you choose>

Rules:
- THINKING must be <= 1 short sentence, in-character.
- CHOICE_ID must be one of the ids given in the list.
- Do NOT add any extra lines, labels, apologies, or commentary.
        `.trim(),
          },
          {
            role: "user",
            content: `
Question: ${question.text}

Options:
${optionsForPrompt}
          `.trim(),
          },
        ],
      }),
    });

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    console.log("🤖 Raw DeepSeek reply for", aiName, "→", raw);

    // Parse THINKING and CHOICE_ID
    const thinkingMatch = raw.match(/THINKING:\s*(.+)/i);
    const idMatch = raw.match(/CHOICE_ID:\s*(\d+)/i);

    const thinkingRaw = (thinkingMatch?.[1] || "").trim();
    const choiceIdFromModel = idMatch ? Number(idMatch[1]) : null;

    // Find the matching option by id, or fall back to a random option
    let selectedOption = null;
    if (
      Number.isFinite(choiceIdFromModel) &&
      options.some((o) => Number(o.id) === choiceIdFromModel)
    ) {
      selectedOption = options.find(
        (o) => Number(o.id) === choiceIdFromModel
      );
    } else {
      // Fallback: random option (so it's not always the first)
      selectedOption =
        options[Math.floor(Math.random() * options.length)];
    }

    const innerThought =
      (thinkingRaw || `${aiName} is thinking...`).slice(0, 160);

    // Broadcast thinking in multiplayer (if you ever hook AI into that)
    if (roomId && io) {
      io.to(roomId).emit("ai_thinking", {
        aiName,
        thinking: innerThought,
      });
    }

    return res.json({
      aiName,
      thinking: innerThought,          // goes into speech bubbles
      choiceText: selectedOption.text, // mostly for debugging
      choiceId: selectedOption.id,     // THIS is what solo.js uses
    });
  } catch (e) {
    console.error("❌ AI round failed:", e);
    return res
      .status(500)
      .json({ error: "AI_FAILED", details: String(e) });
  }
});

// ===================================================
// ============= SOLO QUESTION ENDPOINT ==============
// ===================================================
app.get("/api/solo/question", async (req, res) => {
  try {
    // Get a random question + options from your questions.js helper
    const q = await getRandomQuestionWithOptions();

    if (!q) {
      return res.status(500).json({
        error: "NO_QUESTION",
      });
    }

    // Format the response in the exact structure solo.js expects
    res.json({
      ok: true,
      question: {
        id: q.id,
        text: q.text,
      },
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
socket.on("start_game", ({ roomId, duration, maxRounds } = {}, ack) => {
  const room = rooms.get(roomId);
  if (!room) return ack?.({ error: "ROOM_NOT_FOUND" });
  if (!room.players.has(socket.id)) return ack?.({ error: "NOT_IN_ROOM" });

  // ⭐ FIX: Safe number parsing — no more NaN → 20 bugs
  const parsedDur = Number(duration);
  const parsedMax = Number(maxRounds);

  room.roundDuration = Number.isFinite(parsedDur) ? parsedDur : 20;
  room.maxRounds = Number.isFinite(parsedMax) ? parsedMax : 10;

  console.log(`🔧 Host settings for ${roomId}:`, {
    roundDuration: room.roundDuration,
    maxRounds: room.maxRounds,
  });

  room.roundVotes = new Map();
  room.round = null;

  if (!room.hasPlayedIntro) {
    room.hasPlayedIntro = true;
    io.to(roomId).emit("playIntroCutscene");
    ack?.({ ok: true, intro: true });
    return;
  }

  startRound(io, roomId, room.roundDuration)
    .then(() => {
      room.ready = new Map();
      ack?.({ ok: true });
    })
    .catch((err) => {
      console.error("❌ start_game failed:", err);
      ack?.({ error: "START_FAILED" });
    });
});



// ---------- INTRO DONE ----------
socket.on("intro_done", ({ roomId } = {}) => {
  const room = rooms.get(roomId);
  if (!room) return;
  if (!room.players.has(socket.id)) return;
  if (!room.hasPlayedIntro) return;
  if (room.round) return;
  if (room.gameOver) return;

  // ⛔ DO NOT USE A LOCAL VARIABLE
  // ALWAYS TRUST room.roundDuration DIRECTLY
  if (!Number.isFinite(room.roundDuration)) {
    room.roundDuration = 20; // final fallback
  }

  if (!Number.isFinite(room.maxRounds)) {
    room.maxRounds = 10;
  }

  console.log("🎬 intro_done → using EXACT host duration:", room.roundDuration);

  startRound(io, roomId, room.roundDuration).catch((err) =>
    console.error("❌ intro_done → startRound failed:", err)
  );
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
