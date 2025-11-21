// apps/server/src/questions.js
import { pool } from "./db.js";

export async function getRandomQuestionWithOptions() {
  const qSql = `SELECT id, text FROM questions ORDER BY random() LIMIT 1`;
  const qRes = await pool.query(qSql);
  if (!qRes.rows.length) throw new Error("no_questions");

  const q = qRes.rows[0];

  const oSql = `SELECT id, text FROM options WHERE question_id = $1 ORDER BY id`;
  const oRes = await pool.query(oSql, [q.id]);

  return {
    id: q.id,
    text: q.text,
    options: oRes.rows.map((r) => ({ id: r.id, text: r.text })),
  };
}
