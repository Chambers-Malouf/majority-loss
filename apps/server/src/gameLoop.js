// apps/server/src/gameLoop.js
import { rooms } from "./rooms.js";
import { getRandomQuestionWithOptions } from "./questions.js";

const MAX_ROUNDS = 10;

export async function startRound(io, roomId, durationSec = 20) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.timer) clearInterval(room.timer);

  room.roundNumber = (room.roundNumber || 0) + 1;

  // ---------- GAME OVER CHECK ----------
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

    if (remaining <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      room.endAt = null;

      // ---------- DEBUG: what votes do we actually have? ----------
      console.log(
        "🧮 roundVotes at end:",
        Array.from(room.roundVotes.entries())
      );

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
          player.points += 1;
        }
      }

      // ---------- EMIT RESULTS ----------
      const leaderboard = Array.from(room.players.values()).map((p) => ({
        name: p.name,
        points: p.points,
      }));

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

      // Reset round state for next one
      room.round = null;
      room.roundVotes = new Map();
    }
  }, 1000);
}
