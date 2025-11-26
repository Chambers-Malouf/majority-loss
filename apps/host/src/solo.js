// apps/host/src/solo.js
console.log("🧠 solo.js loaded — SOLO MODE vs 4 AI");

import {
  playIntroFromScene,
  playWinnerFromScene,
  initScene,
  setCourtroomBanner,
  setChalkQuestionView,
  setChalkResultsView,
  setPlayersOnTable,
  setAISpeechBubbles,
  placeSoloAI,
} from "./scene/scene.js";
import { setMyPlayerId } from "./state.js";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
const HTTP_BASE = SOCKET_URL
  ? SOCKET_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://")
  : window.location.origin;

const SOLO_MAX_ROUNDS = 1;
const SOLO_TIMER_SECONDS = 5;

// ======== 4 AI PERSONALITIES ========
const AI_LIST = [
  {
    name: "Chishiya",
    personality:
      "You are Shuntaro Chishiya from Alice in Borderland, playing a psychological game called Majority Loss where the goal is to end up in the MINORITY of votes each round. You are cold, calm, hyper-rational, and treat everything like a puzzle. You speak sparsely and clinically.",
  },
  {
    name: "Ann",
    personality:
      "You are Ann Walsh a female student at Ole Miss, playing Majority Loss, a game where the goal is to be in the MINORITY of votes to win. You are an autistic, yapper who loves planes .",
  },
  {
    name: "Yumeko",
    personality:
      "You are Yumeko Jabami from Kakegurui, playing Majority Loss, a game where the minority of votes wins. You are a thrill-seeking gambler who delights in risk, chaos, and psychological tension. You sound delighted, intense, and dramatic.",
  },
  {
    name: "L",
    personality:
      "You are L from Death Note, playing Majority Loss, a game where the minority of votes wins each round. You are analytical, monotone, and strange. You briefly explain the logic behind your choice in a detached way.",
  },
];

// ======== SOLO MODE STATE ========
let soloRunning = false;
let soloRoundNumber = 0;
let soloScores = new Map();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function setupSoloTable(playerName) {
  const playerId = "SOLO_PLAYER";

  setMyPlayerId(playerId);

  // place YOU using multiplayer logic
  setPlayersOnTable([{ id: playerId, name: playerName }]);

  // Now place the AI manually using our semi-circle function
  placeSoloAI(["Chishiya", "Ann", "Yumeko", "L"]);
}

// ===============================================================
//                     START SOLO MODE
// ===============================================================
export async function startSoloMode() {
  if (soloRunning) return;

  soloRunning = true;
  soloRoundNumber = 0;
  soloScores = new Map();

  let playerName =
    localStorage.getItem("playerName")?.trim() ||
    prompt("Enter your name for Solo Mode:")?.trim() ||
    "You";

  localStorage.setItem("playerName", playerName);
  localStorage.setItem("soloMode", "1"); // 👈 used by scene.js camera zoom

  // Initialize scores
  soloScores.set(playerName, 0);
  for (const ai of AI_LIST) soloScores.set(ai.name, 0);

  console.log("🎮 SOLO MODE START — player:", playerName);

  // 1. Build courtroom scene + camera
  initScene("table-app");

  // 2. Play intro cutscene once, using scene camera
  await new Promise((resolve) => {
    console.log("🎬 SOLO — playing intro cutscene from scene.js");
    playIntroFromScene(resolve);
  });

  // 3. Place players and AI, show welcome banner
  setupSoloTable(playerName);

  setCourtroomBanner("", `SOLO MODE — You vs 4 AI`, "");

  // 4. Enter the round loop
  await runNextSoloRound(playerName);
}

// ===============================================================
//                 FETCH QUESTION FROM BACKEND
// ===============================================================
async function fetchSoloQuestion() {
  try {
    const res = await fetch(`${HTTP_BASE}/api/solo/question`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    return {
      id: data?.question?.id ?? 0,
      text: data?.question?.text || "Would you rather?",
      options: (data?.options || []).map((o) => ({
        id: o.id,
        text: o.text,
      })),
    };
  } catch (err) {
    console.error("❌ fetchSoloQuestion:", err);
    return {
      id: 0,
      text: "Could not fetch question.",
      options: [],
    };
  }
}

// ===============================================================
//             CALL BACKEND FOR A SINGLE AI VOTE
// ===============================================================
async function soloGetAIVote(ai, question, options) {
  try {
    const res = await fetch(`${HTTP_BASE}/api/ai-round`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiName: ai.name,
        aiPersonality: ai.personality,
        question,
        options,
        roomId: null,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    return {
      aiName: ai.name,
      thinking: data?.thinking || "…",
      optionId: data?.choiceId ?? null,
    };
  } catch (err) {
    console.error("AI error:", ai.name, err);
    return {
      aiName: ai.name,
      thinking: "…",
      optionId: null,
    };
  }
}

// ===============================================================
//                   SOLO ROUND LOOP
// ===============================================================
async function runNextSoloRound(playerName) {
  if (!soloRunning) return;

  if (soloRoundNumber >= SOLO_MAX_ROUNDS) {
    await showSoloGameOver();
    return;
  }

  soloRoundNumber += 1;

  const question = await fetchSoloQuestion();
  const options =
    question.options.length > 0
      ? question.options
      : [
          { id: 1, text: "Option A" },
          { id: 2, text: "Option B" },
        ];

  let remaining = SOLO_TIMER_SECONDS;
  let myVoteOptionId = null;

  const roomLabel = "SOLO";

  function updateBoards() {
    setChalkQuestionView({
      roomId: roomLabel,
      roundNumber: soloRoundNumber,
      questionText: question.text,
      options,
      remaining,
      myVoteOptionId,
      onOptionClick: (id) => {
        myVoteOptionId = id;
        updateBoards();
      },
    });
  }

  updateBoards();

  setCourtroomBanner(
    null,
    `Round ${soloRoundNumber}\nLook around to see what your AI opponents are thinking`,
    null
  );

  const aiVotePromises = AI_LIST.map((ai) =>
    soloGetAIVote(ai, question, options)
  );

  while (remaining > 0) {
    await wait(1000);
    remaining -= 1;
    updateBoards();

    if (remaining % 2 === 0) {
      const partial = await Promise.allSettled(aiVotePromises);
      const filtered = partial
        .filter((p) => p.status === "fulfilled")
        .map((p) => p.value);

      setAISpeechBubbles(filtered);
    }
  }

  const aiVotesRaw = await Promise.all(aiVotePromises);
  setAISpeechBubbles(aiVotesRaw);

  if (!myVoteOptionId) {
    myVoteOptionId = options[Math.floor(Math.random() * options.length)].id;
  }

  const counts = options.map((opt) => ({
    optionId: opt.id,
    text: opt.text,
    count: 0,
  }));

  const votes = [];

  function addVote(optId) {
    const row = counts.find((c) => Number(c.optionId) === Number(optId));
    if (row) row.count++;
  }

  addVote(myVoteOptionId);
  votes.push({ playerName, optionId: myVoteOptionId });

  for (const v of aiVotesRaw) {
    if (!v) continue;

    const exists = options.some((o) => Number(o.id) === Number(v.optionId));
    const id = exists ? v.optionId : options[0].id;

    addVote(id);
    votes.push({ playerName: v.aiName, optionId: id });
  }

  const nonZero = counts.filter((c) => c.count > 0);
  let winningOptionId = null;

  if (nonZero.length > 0) {
    const minVal = Math.min(...nonZero.map((c) => c.count));
    const minority = nonZero.filter((c) => c.count === minVal);
    if (minority.length === 1) winningOptionId = minority[0].optionId;
  }

  const winners = [];

  if (winningOptionId != null) {
    for (const v of votes) {
      if (Number(v.optionId) === Number(winningOptionId)) {
        winners.push(v.playerName);
        soloScores.set(v.playerName, (soloScores.get(v.playerName) || 0) + 1);
      }
    }
  }

  const winnersText =
    winners.length > 0
      ? `Winner(s): ${winners.join(", ")}`
      : "Tie — no clear minority.";

  const leaderboard = buildLeaderboard();

  setChalkResultsView({
    roomId: roomLabel,
    roundNumber: soloRoundNumber,
    questionText: question.text,
    options,
    winningOptionId,
    counts,
    leaderboard,
  });

  setCourtroomBanner(
    null,
    `Round ${soloRoundNumber} — Verdict\n${winnersText}`,
    null
  );

  await wait(4500);
  await runNextSoloRound(playerName);
}

// ===============================================================
//                   LEADERBOARD + GAME OVER
// ===============================================================
function buildLeaderboard() {
  return Array.from(soloScores.entries())
    .map(([name, points]) => ({ name, points }))
    .sort((a, b) => b.points - a.points);
}

async function showSoloGameOver() {
  soloRunning = false;

  const leaderboard = buildLeaderboard();
  const winnerName = leaderboard[0]?.name || "Winner";

  await new Promise((resolve) => {
    playWinnerFromScene(winnerName, resolve);
  });

  setChalkResultsView({
    roomId: "SOLO",
    roundNumber: soloRoundNumber,
    questionText: "Final Verdict — Solo Mode",
    options: [],
    winningOptionId: null,
    counts: [],
    leaderboard,
  });

  const lines = leaderboard.map(
    (p, i) =>
      `${i === 0 ? "👑" : "•"} ${p.name}: ${p.points} point${
        p.points === 1 ? "" : "s"
      }`
  );

  setCourtroomBanner(
    "",
    `🏁 SOLO — GAME OVER\n\n${lines.join("\n")}\n\nReload page to exit.`,
    ""
  );

  localStorage.removeItem("soloMode");

  await wait(6000);
}
