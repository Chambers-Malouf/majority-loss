// apps/server/src/questions.js
import { pool } from "./db.js";

export async function getRandomQuestionWithOptions(excludeIds = []) {
  // 1) Get all active questions
  const qSql = `
    SELECT id, text
    FROM questions
    WHERE is_active = true
    ORDER BY id
  `;
  const qRes = await pool.query(qSql);
  if (!qRes.rows.length) {
    throw new Error("no_questions");
  }

  const allQuestions = qRes.rows;

  // 2) Build a set of excluded IDs
  const excludeSet = new Set(
    (excludeIds || []).map((v) => Number(v))
  );

  // 3) Filter down to questions we haven't used yet
  const available = allQuestions.filter(
    (row) => !excludeSet.has(Number(row.id))
  );

  // 4) If we've used them all, fall back to full list
  const pickFrom = available.length ? available : allQuestions;

  // 5) Pick one at random
  const chosen =
    pickFrom[Math.floor(Math.random() * pickFrom.length)];

  // 6) Load that question's options
  const oSql = `
    SELECT id, text
    FROM options
    WHERE question_id = $1
    ORDER BY id
  `;
  const oRes = await pool.query(oSql, [chosen.id]);

  return {
    id: chosen.id,
    text: chosen.text,
    options: oRes.rows.map((r) => ({
      id: r.id,
      text: r.text,
    })),
  };
}
