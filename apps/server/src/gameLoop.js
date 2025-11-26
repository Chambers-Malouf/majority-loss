// apps/server/src/gameLoop.js
import { rooms } from "./rooms.js";
import { getRandomQuestionWithOptions } from "./questions.js";

const MAX_ROUNDS = 10; // hard cap: round limit

// Helper: build sorted leaderboard from room.players
function buildLeaderboard(room) {
  return Array.from(room.players.values())
    .map((p) => ({
      name: p.name,
      points: p.points,
      reachedAt: p.reachedAt || {},
    }))
    .sort((a, b) => {
      // Higher points first
      if (b.points !== a.points) return b.points - a.points;

      // Tiebreaker: earliest round they reached that score
      const score = a.points;
      const aRound = a.reachedAt?.[score] ?? Infinity;
      const bRound = b.reachedAt?.[score] ?? Infinity;

      return aRound - bRound; // earlier wins
    });
}


// Helper: finish the game once (by max points OR round limit)
function endGame(io, roomId, reason = "unknown") {
  const room = rooms.get(roomId);
  if (!room) return;

  // prevent double game_over
  if (room.gameOver) {
    console.log("⚠️ endGame called but room already gameOver:", roomId);
    return;
  }

  room.gameOver = true;

  const leaderboard = buildLeaderboard(room);

  console.log("🏁 GAME OVER:", {
    roomId,
    reason,
    leaderboard,
  });

  io.to(roomId).emit("game_over", { leaderboard, reason });

  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
  room.endAt = null;
  room.round = null;
  room.roundVotes = new Map();
}

export async function startRound(io, roomId, durationSec = 20) {
  const room = rooms.get(roomId);
  if (!room) return;

  // If game already ended, ignore startRound calls
  if (room.gameOver) {
    console.log("⏹ startRound ignored — game already over for room:", roomId);
    return;
  }

  // Clear previous timer if any
  if (room.timer) clearInterval(room.timer);

  // Increment round count
  room.roundNumber = (room.roundNumber || 0) + 1;
  console.log("🎲 Starting round", room.roundNumber, "in room", roomId);

  // We DO NOT trigger game_over here anymore.
  // Round limit is enforced AFTER the round finishes (so the last round still plays).

  // ---------- FETCH QUESTION ----------
  const q = await getRandomQuestionWithOptions();
  room.round = {
    id: Date.now().toString(),
    roundNumber: room.roundNumber,
    question: { id: q.id, text: q.text },
    options: q.options,
  };

  // store votes as Map<playerGameId, optionId>
  room.roundVotes = new Map();

  io.to(roomId).emit("round_question", {
    roundId: room.round.id,
    roundNumber: room.round.roundNumber,
    question: room.round.question,
    options: room.round.options,
  });

  // ---------- ROUND TIMER ----------
  const D = Math.max(1, Math.min(300, Number(durationSec) || 20));
  room.endAt = Date.now() + D * 1000;

  room.timer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((room.endAt - Date.now()) / 1000));
    io.to(roomId).emit("round_tick", { remaining });

    if (remaining > 0) return;

    // Time's up
    clearInterval(room.timer);
    room.timer = null;
    room.endAt = null;

    // ---------- DEBUG: what votes do we actually have? ----------
    console.log(
      "🧮 roundVotes at end:",
      Array.from(room.roundVotes.entries())
    );

    if (!room.round) {
      console.warn("⚠️ No room.round at end of timer for room:", roomId);
      return;
    }

    // ============================================================
    // =============== COUNT VOTES (HARDENED VERSION) =============
    // ============================================================

    // Build a plain object: optionId (number) -> count
    const countsById = {};

    // Initialize to 0 for every option that exists in this round
    for (const opt of room.round.options) {
      const idNum = Number(opt.id);
      if (!Number.isFinite(idNum)) continue;
      countsById[idNum] = 0;
    }

    // Tally each recorded vote
    for (const optionId of room.roundVotes.values()) {
      const idNum = Number(optionId);
      if (!Number.isFinite(idNum)) continue;
      if (countsById[idNum] == null) {
        countsById[idNum] = 0; // in case an id somehow wasn't pre-initialized
      }
      countsById[idNum] += 1;
    }

    // Turn counts into the array the client expects
    const counts = room.round.options.map((opt) => {
      const idNum = Number(opt.id);
      const count = countsById[idNum] || 0;
      return {
        optionId: idNum,
        count,
        text: opt.text,
      };
    });

    console.log("🧮 counts before emit:", counts);

    // ---------- DETERMINE MINORITY ----------
    let winningOptionId = null;
    const nonzero = counts.filter((c) => c.count > 0);
    if (nonzero.length > 0) {
      const min = Math.min(...nonzero.map((c) => c.count));
      const winners = nonzero.filter((c) => c.count === min);
      if (winners.length === 1) winningOptionId = winners[0].optionId;
    }

    console.log("🏆 winningOptionId:", winningOptionId);

    // ---------- BUILD PER-PLAYER VOTE LIST ----------
    const votes = [];
    for (const [playerGameId, optionId] of room.roundVotes.entries()) {
      const player = Array.from(room.players.values()).find(
        (p) => p.playerGameId === playerGameId
      );
      if (!player) continue;
      votes.push({
        playerId: playerGameId,
        playerName: player.name,
        optionId: Number(optionId),
      });
    }
    console.log("🗳 votes array:", votes);

    // ---------- APPLY POINTS (NO MISSIONS) ----------
    for (const [playerGameId, optionId] of room.roundVotes.entries()) {
      const player = Array.from(room.players.values()).find(
        (p) => p.playerGameId === playerGameId
      );
      if (!player) continue;

      if (Number(optionId) === Number(winningOptionId)) {

      const newScore = player.points + 1;

      // Track earliest round they achieved each score
      if (!player.reachedAt) player.reachedAt = {};
      if (!player.reachedAt[newScore]) {
        player.reachedAt[newScore] = room.roundNumber;
      }

      player.points = newScore;
    }

    }

    // ---------- EMIT ROUND RESULTS ----------
    const leaderboard = buildLeaderboard(room);

    console.log("📤 Emitting round_results with:", {
      roundId: room.round.id,
      winningOptionId,
      counts,
      votes,
      leaderboard,
    });

    io.to(roomId).emit("round_results", {
      roundId: room.round.id,
      winningOptionId,
      counts,
      votes,
      leaderboard,
      missionResults: [], // missions disabled for now
    });

    // ============================
    //   GAME OVER CHECKS
    // ============================

    // 1) Max points condition
    const highestPoints = leaderboard.length ? leaderboard[0].points : 0;
    const maxPoints =
      Number(room.maxPoints || room.max_points || 5); // prefer room.maxPoints if set

    if (highestPoints >= maxPoints) {
      console.log(
        "🏁 Game over by max points:",
        highestPoints,
        ">= target",
        maxPoints
      );
      endGame(io, roomId, "max_points");
      return;
    }

    // 2) Round limit condition
    if (room.roundNumber >= MAX_ROUNDS) {
      console.log(
        "🏁 Game over by round limit:",
        room.roundNumber,
        "/",
        MAX_ROUNDS
      );
      endGame(io, roomId, "round_limit");
      return;
    }

    // Not game over yet → reset round state and wait for host to start next
    room.round = null;
    room.roundVotes = new Map();
  }, 1000);
}
