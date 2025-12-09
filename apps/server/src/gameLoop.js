// apps/server/src/gameLoop.js
import { rooms } from "./rooms.js";
import { getRandomQuestionWithOptions } from "./questions.js";

// ========================================================
//  BUILD LEADERBOARD
// ========================================================
function buildLeaderboard(room) {
  return Array.from(room.players.values())
    .map((p) => ({
      name: p.name,
      points: p.points,
      reachedAt: p.reachedAt || {},
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;

      const score = a.points;
      const aRound = a.reachedAt?.[score] ?? Infinity;
      const bRound = b.reachedAt?.[score] ?? Infinity;
      return aRound - bRound;
    });
}

// ========================================================
// END GAME
// ========================================================
function endGame(io, roomId, reason = "unknown") {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.gameOver) {
    console.log("⚠️ endGame called but already gameOver:", roomId);
    return;
  }

  room.gameOver = true;

  const leaderboard = buildLeaderboard(room);

  console.log("🏁 GAME OVER:", { roomId, reason, leaderboard });

  io.to(roomId).emit("game_over", { leaderboard, reason });

  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }

  room.endAt = null;
  room.round = null;
  room.roundVotes = new Map();

  if (room.usedQuestionIds) delete room.usedQuestionIds;
}

// ========================================================
//  START ROUND
// ========================================================
export async function startRound(io, roomId, durationSec) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.gameOver) {
    console.log("⏹ startRound ignored — room already gameOver:", roomId);
    return;
  }

  // ========================================================
  //  STOP IF FINAL ROUND ALREADY PASSED
  // ========================================================
  if (room.roundNumber && room.roundNumber >= room.maxRounds) {
    console.log(
      `🏁 Room ${roomId} reached max rounds (${room.maxRounds}) → GAME OVER`
    );

    const leaderboard = buildLeaderboard(room);
    io.to(roomId).emit("game_over", { leaderboard, reason: "round_limit" });

    room.gameOver = true;
    return;
  }

  // ========================================================
  //  RESOLVE ROUND DURATION FROM HOST SETTINGS
  // ========================================================
  let rawDuration =
    durationSec !== undefined
      ? durationSec
      : room.roundDuration !== undefined
      ? room.roundDuration
      : 20;

  rawDuration = Number(rawDuration);
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
    rawDuration = 20;
  }

  const D = Math.max(1, Math.min(300, rawDuration));

  console.log(
    ` startRound for room ${roomId} with duration ${D}s (roundDuration=${room.roundDuration}, arg=${durationSec})`
  );

  // ========================================================
  //  CLEAR PREVIOUS TIMER
  // ========================================================
  if (room.timer) clearInterval(room.timer);

  // ========================================================
  //  INCREMENT ROUND #
  // ========================================================
  room.roundNumber = (room.roundNumber || 0) + 1;
  console.log("🎲 Starting round", room.roundNumber, "in room", roomId);

// ========================================================
//  FETCH QUESTION WITHOUT DUPLICATES 
// ========================================================
if (!room.usedQuestionIds) room.usedQuestionIds = new Set();

let q = null;

// Try up to 50 times to find a unique question
for (let i = 0; i < 50; i++) {
  const candidate = await getRandomQuestionWithOptions();

  if (!room.usedQuestionIds.has(candidate.id)) {
    q = candidate;
    break;
  }
}

if (!q) {
  console.error("❌ No unique questions left for room:", roomId);
  io.to(roomId).emit("round_error", {
    error: "NO_UNIQUE_QUESTION",
  });
  return;
}

// Mark as used
room.usedQuestionIds.add(q.id);

// Build round object
room.round = {
  id: Date.now().toString(),
  roundNumber: room.roundNumber,
  question: { id: q.id, text: q.text },
  options: q.options,
};

room.roundVotes = new Map();

// Send to clients
io.to(roomId).emit("round_question", {
  roundId: room.round.id,
  roundNumber: room.round.roundNumber,
  question: room.round.question,
  options: room.round.options,
});


  // ========================================================
  //  ROUND TIMER
  // ========================================================
  room.endAt = Date.now() + D * 1000;

  room.timer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((room.endAt - Date.now()) / 1000));
    io.to(roomId).emit("round_tick", { remaining });

    if (remaining > 0) return;

    // Timer finished
    clearInterval(room.timer);
    room.timer = null;
    room.endAt = null;

    console.log("🧮 roundVotes at end:", Array.from(room.roundVotes.entries()));

    if (!room.round) return;

    // ========================================================
    // COUNT VOTES
    // ========================================================
    const countsById = {};
    for (const opt of room.round.options) {
      countsById[Number(opt.id)] = 0;
    }

    for (const optionId of room.roundVotes.values()) {
      const id = Number(optionId);
      if (!Number.isFinite(id)) continue;
      if (countsById[id] == null) countsById[id] = 0;
      countsById[id]++;
    }

    const counts = room.round.options.map((opt) => ({
      optionId: Number(opt.id),
      count: countsById[Number(opt.id)] || 0,
      text: opt.text,
    }));

    // ========================================================
    //  FIND MINORITY
    // ========================================================
    let winningOptionId = null;
    const nonzero = counts.filter((c) => c.count > 0);

    if (nonzero.length > 0) {
      const min = Math.min(...nonzero.map((c) => c.count));
      const winners = nonzero.filter((c) => c.count === min);
      if (winners.length === 1) winningOptionId = winners[0].optionId;
    }

    // ========================================================
    //  APPLY POINTS
    // ========================================================
    for (const [playerGameId, optionId] of room.roundVotes.entries()) {
      const player = Array.from(room.players.values()).find(
        (p) => p.playerGameId === playerGameId
      );
      if (!player) continue;

      if (Number(optionId) === Number(winningOptionId)) {
        const newScore = player.points + 1;

        if (!player.reachedAt) player.reachedAt = {};
        if (!player.reachedAt[newScore]) {
          player.reachedAt[newScore] = room.roundNumber;
        }

        player.points = newScore;
      }
    }

    const leaderboard = buildLeaderboard(room);

    io.to(roomId).emit("round_results", {
      roundId: room.round.id,
      winningOptionId,
      counts,
      votes: Array.from(room.roundVotes.entries()),
      leaderboard,
      missionResults: [],
    });

    // ========================================================
    //  END GAME BASED ON HOST ROUND LIMIT
    // ========================================================
    if (room.roundNumber >= room.maxRounds) {
      console.log(
        "🏁 GAME OVER — finished all rounds:",
        room.roundNumber,
        "/",
        room.maxRounds
      );
      endGame(io, roomId, "round_limit");
      return;
    }
    room.round = null;
    room.roundVotes = new Map();
  }, 1000);
}
