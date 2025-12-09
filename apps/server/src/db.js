// apps/server/src/db.js
import dotenv from "dotenv";
import pg from "pg";
dotenv.config();
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false},
  /*ssl:
    process.env.PGSSL?.toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : false,*/
});

// -------------------- GAME HELPERS --------------------

export async function getOrCreateGameByCode(code, maxPoints = 5) {
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

export async function addPlayer(gameId, displayName = "Player") {
  const existing = await pool.query(
    `SELECT id FROM users WHERE LOWER(display_name) = LOWER($1)`,
    [displayName]
  );

  let userId;
  if (existing.rows.length > 0) {
    userId = existing.rows[0].id;
  } else {
    const created = await pool.query(
      `INSERT INTO users (display_name)
       VALUES ($1)
       RETURNING id`,
      [displayName]
    );
    userId = created.rows[0].id;
  }

  const insertPG = await pool.query(
    `
      INSERT INTO player_game (game_id, user_id, display_name, points)
      VALUES ($1, $2, $3, 0)
      RETURNING id, user_id, display_name, points
    `,
    [gameId, userId, displayName]
  );

  return {
    playerGameId: insertPG.rows[0].id,
    userId,
    display_name: displayName,
    points: insertPG.rows[0].points
  };
}


// -------------------- MISSION HELPERS --------------------

export async function logMission({
  userId,
  gameId,
  roundNumber,
  type,
  targetUserId = null,
  targetOptionId = null,
}) {
  const q = `
    INSERT INTO missions (user_id, game_id, round_number, type, target_user_id, target_option_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id;
  `;
  const { rows } = await pool.query(q, [
    userId,
    gameId,
    roundNumber,
    type,
    targetUserId,
    targetOptionId,
  ]);
  return rows[0].id;
}

export async function completeMission(missionId, success, bonusPoints) {
  const q = `
    UPDATE missions
    SET success = $1,
        bonus_points = $2
    WHERE id = $3
  `;
  await pool.query(q, [success, bonusPoints, missionId]);
}
