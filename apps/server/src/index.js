//apps/server/src/index.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";

const MAX_ROUNDS = 10;
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
    options: oRes.rows.map(r => ({ id: r.id, text: r.text })),
  };
}

const app = express();
const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map(s => s.trim());

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.get("/healthz", (_req, res) => res.json({ ok: true, build: "debug-4" }));
app.get("/", (_, res) => res.status(200).send("OK")); 

// Fetch one random question + its options from DB
app.get("/api/solo/question", async (_req, res) => {
  try {
    const q = await getRandomQuestionWithOptions();
    res.json({ ok: true, question: { id: q.id, text: q.text }, options: q.options });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/ai-round", express.json(), async (req, res) => {
  const { question, options, aiName, aiPersonality, roomId } = req.body || {};
  if (!question?.text || !Array.isArray(options)) {
    return res.status(400).json({ error: "BAD_INPUT" });
  }

  console.log(`🧠 [AI ROUND START] ${aiName} in room ${roomId || "N/A"}`);
  console.log("Prompt Question:", question.text);
  console.log("Options:", options.map(o => o.text).join(", "));

  try {
    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: `
You are ${aiName}, a ${aiPersonality} contestant in a psychological game called *Majority Loss*.

In this game, every player must secretly choose one of several options to a question.
The goal is to **be in the minority** — to choose differently from what most others will pick.
You must think strategically, predicting what others might vote, and then select your own option accordingly.

Reply in this EXACT two-line format (no Markdown, no extra punctuation, no explanations beyond this):
THINKING: <one natural sentence showing your reasoning or inner thoughts>
CHOICE: [exact text of your chosen option, matching one of the given options exactly]

Example:
THINKING: Most will probably choose paper, so I’ll risk the other one.
CHOICE: [assembly]
`.trim(),
          },
          {
            role: "user",
            content: `${question.text}\nOptions: ${options.map(o => o.text).join(", ")}`
          },
        ],
      }),
    });

    const data = await r.json();
    console.log("🧾 FULL DEEPSEEK RESPONSE:", JSON.stringify(data, null, 2));
    const msg = data?.choices?.[0]?.message?.content || "";
    console.log(`💬 [AI RAW REPLY] ${aiName}:`, msg);

    // --- Improved regex parsing ---
    const thinkMatch = msg.match(/THINKING[:\-]?\s*(.*)/i);
    const choiceMatch = msg.match(/CHOICE[:\-]?\s*\[([^\]]+)\]/i);

    const thinking = thinkMatch ? thinkMatch[1].trim() : "";
    const choiceText = choiceMatch ? choiceMatch[1].trim() : null;

    console.log(`🧩 [AI PARSED] ${aiName} thinks "${thinking}" and picks "${choiceText}"`);

    const choice = options.find(o =>
      o.text.toLowerCase().trim() === (choiceText || "").toLowerCase().trim()
    );

    // --- Emit to all clients in the room ---
    const thinkingFinal = thinking || "is thinking deeply...";
    if (roomId && io) {
      console.log(`📡 Emitting ai_thinking for ${aiName} to room ${roomId}`);
      io.to(roomId).emit("ai_thinking", { aiName, thinking: thinkingFinal });
    } else {
      console.log(`⚠️ No roomId provided — skipping ai_thinking emit for ${aiName}`);
    }

    res.json({
      aiName,
      thinking: thinkingFinal,
      choiceText,
      choiceId: choice?.id || null,
    });
  } catch (e) {
    console.error("❌ AI round failed:", e);
    res.status(500).json({ error: "AI_FAILED" });
  }
});

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
async function startRound(roomId, durationSec = 20) {
  const room = rooms.get(roomId);
  if (!room) return;

  // clear any previous timer
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }

  // round bookkeeping
  room.roundNumber = (room.roundNumber || 0) + 1;
  if (room.roundNumber > MAX_ROUNDS) {
  console.log(`🏁 Room ${roomId} reached ${MAX_ROUNDS} rounds, ending game.`);

  // build final leaderboard
  const leaderboard = Array.from(room.players.values())
    .sort((a, b) => b.points - a.points)
    .map(p => ({ name: p.name, points: p.points }));

  io.to(roomId).emit("game_over", { leaderboard });

  // clear timers & cleanup
  if (room.timer) clearInterval(room.timer);
  room.round = null;
  room.roundVotes = new Map();
  room.roundNumber = 0; // reset for next session
  return; // stop here, don’t start another round
}

  // pick 1 question from DB
  const q = await getRandomQuestionWithOptions();

  room.round = {
    id: Date.now().toString(),              
    roundNumber: room.roundNumber,
    question: { id: q.id, text: q.text },
    options: q.options,                    
  };


  // reset votes for this round
  room.roundVotes = new Map();

  // tell everyone the round question
  io.to(roomId).emit("round_question", {
    roundId: room.round.id,
    roundNumber: room.round.roundNumber,
    question: room.round.question,
    options: room.round.options,
  });
  // set & broadcast timer
  const D = Math.max(1, Math.min(300, Number(durationSec) || 20));
  room.endAt = Date.now() + D * 1000;

  room.timer = setInterval(async() => {
    const remaining = Math.max(0, Math.ceil((room.endAt - Date.now()) / 1000));
    io.to(roomId).emit("round_tick", { remaining });

    if (remaining <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      room.endAt = null;

      // tally votes with safe logic
      const countsMap = new Map();
      // normalize everything to strings
      for (const opt of room.round.options) {
        countsMap.set(String(opt.id), 0);
      }
      for (const optId of room.roundVotes.values()) {
        const key = String(optId);
        countsMap.set(key, (countsMap.get(key) || 0) + 1);
      }


      // build final counts, exactly one per option
      const counts = [];
      for (const [optionId, count] of countsMap.entries()) {
        const opt = room.round.options.find(o => o.id === optionId);
        if (opt) {
          counts.push({
            optionId: Number(optionId),
            count,
            text: opt.text
          });
        }
      }

      // use Minority logic (least chosen wins)
      const nonzero = counts.filter(c => c.count > 0);
      let winningOptionId = null;
      if (nonzero.length > 0) {
        const min = Math.min(...nonzero.map(c => c.count));
        const losers = nonzero.filter(c => c.count === min);
        if (losers.length === 1) {
          winningOptionId = losers[0].optionId;
        }
      }

      // build votes list
      const votes = [];
      for (const [socketId, optionId] of room.roundVotes.entries()) {
        const player = room.players.get(socketId);
        if (player) {
          votes.push({
            playerId: socketId,
            playerName: player.name,
            optionId
          });
        }
      }

      // debug log
      console.log(">> ROUND RESULTS DEBUG <<");
      console.log("Options:", room.round.options);
      console.log("Votes map:", Array.from(room.roundVotes.entries()));
      console.log("Final counts:", counts);
      console.log("Votes array:", votes);
      console.log("Winning OptionId:", winningOptionId);

      for (const [socketId, optionId] of room.roundVotes.entries()) {
        if (optionId === winningOptionId) {
          const player = room.players.get(socketId);
          if (player) {
            player.points += 1;

            // 🧠 Save back to DB
            await pool.query(
              `UPDATE player_game SET points = $1 WHERE id = $2`,
              [player.points, player.playerGameId]
            );
          }
        }
      }

      // emit
      io.to(roomId).emit("round_results", {
        roundId: room.round.id,
        winningOptionId,
        counts,
        votes,
        leaderboard: Array.from(room.players.values()).map(p => ({
          name: p.name,
          points: p.points
        }))
      });


      // keep state clean for next round
      room.round = null;
      room.roundVotes = new Map();
    }
      // (later) you can auto-start the next round or wait for host click
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

  // track in-memory yea
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
// ---- receive a vote for the current round
socket.on("vote", ({ roomId, roundId, optionId }, ack) => {
  const room = rooms.get(roomId);
  if (!room) return ack?.({ error: "ROOM_NOT_FOUNDf" });
  if (!room.players.has(socket.id)) return ack?.({ error: "NOT_IN_ROOM" });

  if (!room.round || String(room.round.id) !== String(roundId)) {
    return ack?.({ error: "ROUND_CLOSED" });
  }

  const exists = room.round.options.some(o => Number(o.id) === Number(optionId));
  if (!exists) return ack?.({ error: "BAD_OPTION" });

  room.roundVotes = room.roundVotes || new Map();
  room.roundVotes.set(socket.id, Number(optionId)); // last vote wins (MVP)

  const voted = {};
  for (const pid of room.roundVotes.keys()) voted[pid] = true;
  io.to(roomId).emit("vote_status", { voted });

  ack?.({ ok: true });
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

// ---- start server
server.listen(PORT, "0.0.0.0", () =>
  console.log("Server running on http://localhost:" + PORT)
);