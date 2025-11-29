// apps/host/src/table.js
import { AudioManager } from "./audio/audioManager.js";
import { initScene, setPlayersOnTable, updateReadyBadges } from "./scene/scene.js";
import { initMainMenuScene, disposeMainMenuScene } from "./scene/menu.js";
import { createSocket } from "./net/socket.js";
import { playIntroFromScene } from "./scene/scene.js";
import { playWinnerCutscene } from "./cutscenes/winnerCutscene.js";

import {
  renderLobbyOverlay,
  renderInRoomOverlay,
  renderQuestionOverlay,
  renderResultsOverlay,
  renderGameOverOverlay,
} from "./ui/overlay.js";

import { setMyPlayerId } from "./state.js";
import { startSoloMode } from "./solo.js";

let socket = null;
let roomId = null;
let myId = null;
let myName = null;
let players = [];
let readyById = {};
let allReady = false;
let gameStarted = false;
let cleanupLobby = null;

// Round state
let currentRound = null;
let currentRemaining = null;
let myVoteOptionId = null;

// ======================================================
// MUTE BUTTON
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("mute-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const muted = AudioManager.toggleMute();
    btn.textContent = muted ? "🔇" : "🔊";
  });
});

// ======================================================
// HELPERS
// ======================================================
function getNameInput() {
  const input = document.getElementById("name-input");
  const raw = input?.value?.trim();
  return raw || "Player";
}

function getCodeInput() {
  const input = document.getElementById("code-input");
  const raw = input?.value?.trim();
  return raw ? raw.toUpperCase() : "";
}

function isHost() {
  if (!myId) return false;
  if (!players.length) return false;
  return players[0].id === myId;
}

// ======================================================
// UI SCREENS
// ======================================================
function showLobbyOverlay() {
  localStorage.removeItem("inRoom");
  const savedName = localStorage.getItem("playerName") || "";

  cleanupLobby = renderLobbyOverlay({
    savedName,
    onCreateRoomClick,
    onJoinRoomClick,
  });
}

function showInRoomOverlay() {
  localStorage.setItem("inRoom", "1");
  if (cleanupLobby) {
    cleanupLobby();
    cleanupLobby = null;
  }

  renderInRoomOverlay({
    roomId: roomId || "------",
    players,
    myId,
    readyById,
    allReady,
    isHost: isHost(),
    onReadyClick,
    onStartGameClick,
  });
}

function showQuestionOverlay() {
  if (!currentRound) return;
  renderQuestionOverlay({
    roomId,
    roundNumber: currentRound.roundNumber,
    question: currentRound.question,
    options: currentRound.options,
    remaining: currentRemaining,
    myVoteOptionId,
    onOptionClick: handleOptionClick,
  });
}

function showResultsOverlay(results) {
  if (!results || !currentRound) return;

  renderResultsOverlay({
    roomId,
    roundNumber: currentRound.roundNumber,
    question: currentRound.question,
    options: currentRound.options,
    winningOptionId: results.winningOptionId,
    counts: results.counts,
    leaderboard: results.leaderboard,
    isHost: isHost(),
    onNextRoundClick: onStartGameClick,
  });
}

function showGameOverOverlay(leaderboard) {
  renderGameOverOverlay({
    roomId,
    leaderboard,
    onBackToLobby: () => window.location.reload(),
  });
}

// ======================================================
// ROOM ACTIONS
// ======================================================
function onCreateRoomClick() {
  const name = getNameInput();
  if (!name) return;

  myName = name;
  localStorage.setItem("playerName", name);

  socket.emit("host_create", (res) => {
    if (!res?.roomId) return alert("Failed to create room.");
    roomId = res.roomId;
    joinRoom(roomId, name);
  });
}

function onJoinRoomClick() {
  const name = getNameInput();
  const code = getCodeInput();
  if (!name || !code) return alert("Enter name and room code.");

  myName = name;
  localStorage.setItem("playerName", name);
  roomId = code;

  joinRoom(code, name);
}

function joinRoom(code, name) {
  socket.emit("join_room", { roomId: code, name }, (ack) => {
    if (ack?.error) return alert(`Join failed: ${ack.error}`);

    myId = ack.playerId;
    setMyPlayerId(myId);

    showInRoomOverlay();
  });
}

function onReadyClick() {
  if (!socket || !roomId) return;

  socket.emit("player_ready", { roomId }, (ack) => {
    if (ack?.error) alert(`Ready failed: ${ack.error}`);
  });
}

// ======================================================
// START GAME — HOST ONLY
// ======================================================
function onStartGameClick({ roundTime, maxRounds } = {}) {
  roundTime = Number(roundTime ?? window.__roundTime ?? 20);
  maxRounds = Number(maxRounds ?? window.__maxRounds ?? 5);

  // ✅ FIX #1 — Persist host settings globally
  window.__roundTime = roundTime;
  window.__maxRounds = maxRounds;

  if (!socket || !roomId) return;

  if (!isHost()) {
    console.log("⛔ Only host can start.");
    return;
  }
  if (!gameStarted && !currentRound && !allReady) {
    return alert("Everyone must be READY first.");
  }

  currentRemaining = null;
  myVoteOptionId = null;

  const duration = roundTime;

  console.log("🎬 start_game → server", { roomId, duration, maxRounds });

  socket.emit(
    "start_game",
    { roomId, duration, maxRounds },
    (ack) => {
      if (ack?.error) {
        alert(`Start failed: ${ack.error}`);
        return;
      }
      console.log("✅ start_game acknowledged:", ack);
    }
  );
}

// ======================================================
// AUTO START WHEN ALL READY
// ======================================================
function maybeAutoStart() {
  if (!isHost()) return;
  if (!allReady) return;
  if (gameStarted || currentRound) return;

  console.log("🎬 All players ready — auto starting");

  onStartGameClick({
    roundTime: window.__roundTime || 20,
    maxRounds: window.__maxRounds || 5,
  });
}

// ======================================================
// VOTING
// ======================================================
function handleOptionClick(optionId) {
  if (!currentRound || !socket || !roomId) return;

  socket.emit(
    "vote",
    { roomId, roundId: currentRound.roundId, optionId },
    (ack) => {
      if (ack?.error) {
        alert(`Vote failed: ${ack.error}`);
      } else {
        myVoteOptionId = optionId;
        showQuestionOverlay();
      }
    }
  );
}

// ======================================================
// SOCKET EVENTS
// ======================================================
function wireSocketEvents() {
  socket.on("room_state", (state) => {
    if (state.roomId) roomId = state.roomId;
    players = state.players || [];

    const nextReady = { ...readyById };
    for (const p of players) {
      if (nextReady[p.id] === undefined) nextReady[p.id] = false;
    }
    readyById = nextReady;

    if (!gameStarted || !currentRound) showInRoomOverlay();

    setPlayersOnTable(players);
    updateReadyBadges(readyById);
  });

  socket.on("ready_state", ({ ready = {}, allReady: AR = false }) => {
    readyById = ready;
    allReady = AR;

    if (!gameStarted || !currentRound) {
      showInRoomOverlay();
      maybeAutoStart();
    }

    updateReadyBadges(readyById);
  });

  socket.on("round_question", (payload) => {
    currentRound = {
      roundId: payload.roundId,
      roundNumber: payload.roundNumber,
      question: payload.question,
      options: payload.options,
    };
    currentRemaining = null;
    myVoteOptionId = null;
    gameStarted = true;

    showQuestionOverlay();
  });

  socket.on("round_tick", ({ remaining }) => {
    currentRemaining = remaining;
    showQuestionOverlay();
  });

  socket.on("round_results", (results) => {
    currentRemaining = null;
    myVoteOptionId = null;
    showResultsOverlay(results);
  });

  socket.on("game_over", ({ leaderboard }) => {
    const winners = leaderboard
      .filter((p) => p.points === leaderboard[0].points)
      .map((p) => p.name);

    AudioManager.stopAll();
    AudioManager.play("winner");

    playWinnerCutscene(winners, () => {
      AudioManager.stop("winner");
      AudioManager.play("main");
    });
  });

  socket.on("playIntroCutscene", () => {
    console.log("🎬 PLAY INTRO");
    playIntroFromScene(() => {
      if (isHost() && !gameStarted && !currentRound) {
        socket.emit("intro_done", { roomId });
      }
    });
  });
}

// ======================================================
// MAIN INITIALIZATION
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  initMainMenuScene("table-app", {
    onMultiplayerClick: () => {
      disposeMainMenuScene();
      initScene("table-app");

      socket = createSocket();
      wireSocketEvents();

      showLobbyOverlay();
    },

    onSoloClick: () => startSoloMode(),
  });
});
