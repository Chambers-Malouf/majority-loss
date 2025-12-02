// apps/server/src/rooms.js
import { getOrCreateGameByCode } from "./db.js";

export const rooms = new Map();

export function makeRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

export function broadcastRoomState(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = Array.from(room.players.values());
  io.to(roomId).emit("room_state", { roomId, players });
}

// Helper: create room + DB game row
export async function createRoomWithGame() {
  let roomId;
  do {
    roomId = makeRoomId();
  } while (rooms.has(roomId));

  const game = await getOrCreateGameByCode(roomId, 5);

  rooms.set(roomId, {
    roomId,
    gameId: game.id,
    players: new Map(), 
    round: null,
    roundVotes: new Map(),
    roundNumber: 0,
    timer: null,
    endAt: null,
    usedQuestionIds: new Set(),
  });

  return { roomId, gameId: game.id };
}
