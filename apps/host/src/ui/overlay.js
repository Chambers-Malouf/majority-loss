// apps/host/src/ui/overlay.js

import {
  setCourtroomBanner,
  setChalkQuestionView,
  setChalkResultsView,
  setChalkLobbyView,
} from "../scene/scene.js";

const overlayRootId = "overlay-root";

function getOverlayRoot() {
  const root = document.getElementById(overlayRootId);
  if (!root) {
    console.error("❌ Missing overlay root");
    return null;
  }
  // Never block camera again
  root.style.pointerEvents = "none";
  return root;
}

/* -----------------------------------------------------
   MAIN LOBBY SCREEN (CREATE / JOIN)
----------------------------------------------------- */
export function renderLobbyOverlay({
  savedName = "",
  onCreateRoomClick,
  onJoinRoomClick,
}) {
  const root = getOverlayRoot();
  if (!root) return;

  root.style.display = "block";

  // Invisible HTML form (back-end logic only)
  root.innerHTML = `
    <input id="name-input" style="opacity:0;position:absolute;top:-9999px;" value="${savedName}">
    <input id="code-input" style="opacity:0;position:absolute;top:-9999px;">
  `;

  const nameInput = document.getElementById("name-input");
  const codeInput = document.getElementById("code-input");

  // Draw chalkboards
  setCourtroomBanner(
    null,
    "MAJORITY LOSS\nTrial by Chambers Malouf",
    null
  );

  setChalkLobbyView({
    nameInput,
    codeInput,
    onCreateRoomClick,
    onJoinRoomClick,
  });
}

/* -----------------------------------------------------
   IN-ROOM LOBBY (READY + HOST START)
----------------------------------------------------- */
export function renderInRoomOverlay({
  roomId = "------",
  players = [],
  myId = null,
  readyById = {},
  allReady = false,
  isHost = false,
  onReadyClick,
  onStartGameClick,
}) {
  const root = getOverlayRoot();
  if (!root) return;

  root.style.display = "block";
  root.innerHTML = "";

  // Chalkboards text
  const playerLines = players.length === 0
    ? "(no players yet)"
    : players
        .map((p) => {
          const ready = readyById[p.id] ? "READY ✔" : "NOT READY";
          const you = myId === p.id ? " (you)" : "";
          return `• ${p.name}${you} — ${ready}`;
        })
        .join("\n");

  setCourtroomBanner(
    `Invite friends with the code`,
    `MAJORITY LOSS\nTrial by Chambers Malouf`,
    `Lobby — Room ${roomId}\nPlayers:\n${playerLines}`
  );

  // Buttons need pointer events enabled
  root.innerHTML = `
    <div class="lobby-buttons" style="pointer-events:auto;">
      <button id="ready-btn" class="chalk-btn" style="pointer-events:auto;">READY UP</button>
      <button id="start-game-btn" class="chalk-btn" style="pointer-events:auto;">START GAME</button>
    </div>
  `;

  const readyBtn = document.getElementById("ready-btn");
  const startBtn = document.getElementById("start-game-btn");

  // Ready button logic
  if (readyById[myId]) {
    readyBtn.innerText = "READY ✔";
    readyBtn.disabled = true;
    readyBtn.classList.add("chalk-btn-disabled");
  } else {
    readyBtn.onclick = onReadyClick;
  }

  // Host start button
  if (!isHost) {
    startBtn.style.display = "none";
  } else {
    startBtn.style.display = allReady ? "block" : "none";
    startBtn.onclick = onStartGameClick;
  }
}


/* -----------------------------------------------------
   QUESTION SCREEN
----------------------------------------------------- */
export function renderQuestionOverlay({
  roomId,
  roundNumber,
  question,
  options,
  remaining,
  myVoteOptionId,
  onOptionClick,
}) {
  const root = getOverlayRoot();
  if (!root) return;

  root.innerHTML = ""; // blank overlay
  setCourtroomBanner(null, "MAJORITY LOSS\nTrial by Chambers Malouf", null);

  setChalkQuestionView({
    roomId,
    roundNumber,
    questionText: question?.text || "",
    options,
    remaining,
    myVoteOptionId,
    onOptionClick,
  });
}

/* -----------------------------------------------------
   RESULTS SCREEN
----------------------------------------------------- */
export function renderResultsOverlay({
  roomId,
  roundNumber,
  question,
  options,
  winningOptionId,
  counts,
  leaderboard,
  isHost,
  onNextRoundClick,
}) {
  const root = getOverlayRoot();
  if (!root) return;

  root.innerHTML = "";

  setCourtroomBanner(
    null,
    "MAJORITY LOSS\nTrial by Chambers Malouf",
    `Round ${roundNumber} Results\n${question?.text || ""}`
  );

  setChalkResultsView({
    roomId,
    roundNumber,
    questionText: question?.text || "",
    options,
    winningOptionId,
    counts,
    leaderboard,
  });

  // AUTO ADVANCE NEXT ROUND
  if (isHost && typeof onNextRoundClick === "function") {
    setTimeout(() => onNextRoundClick(), 4000);
  }
}

/* -----------------------------------------------------
   GAME OVER
----------------------------------------------------- */
export function renderGameOverOverlay({ roomId, leaderboard, onBackToLobby }) {
  const root = getOverlayRoot();
  if (!root) return;

  root.innerHTML = "";

  const summary = leaderboard
    .map(
      (p, i) =>
        `${i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : "•"} ${
          p.name
        } — ${p.points} pts`
    )
    .join("\n");

  setCourtroomBanner(
    `Game Over — Room ${roomId}`,
    "MAJORITY LOSS\nTrial by Chambers Malouf",
    summary
  );

  root.innerHTML = `
    <div class="lobby-buttons">
      <button id="back-btn" class="chalk-btn">BACK TO LOBBY</button>
    </div>
  `;

  const btn = document.getElementById("back-btn");
  btn.onclick = onBackToLobby;
}
