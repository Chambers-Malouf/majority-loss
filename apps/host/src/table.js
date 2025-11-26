// apps/host/src/table.js
import { AudioManager } from "./audio/audioManager.js";
import { initScene, setPlayersOnTable, updateReadyBadges } from "./scene/scene.js";
import { initMainMenuScene, disposeMainMenuScene } from "./scene/menu.js";
import { createSocket } from "./net/socket.js";
import { playIntroFromScene, playWinnerFromScene } from "./scene/scene.js";
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

// --- MUTE BUTTON ---
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("mute-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const muted = AudioManager.toggleMute();
    btn.textContent = muted ? "🔇" : "🔊";
  });
});

// ---------------- INPUT HELPERS ----------------
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

// ---------------- UI WRAPPERS ------------------
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
    roomId: roomId || "------",
    roundNumber: currentRound.roundNumber || 1,
    question: currentRound.question,
    options: currentRound.options || [],
    remaining: currentRemaining,
    myVoteOptionId,
    onOptionClick: handleOptionClick,
  });
}

function showResultsOverlay(results) {
  if (!results || !currentRound) return;
  renderResultsOverlay({
    roomId: roomId || "------",
    roundNumber: currentRound.roundNumber || 1,
    question: currentRound.question,
    options: currentRound.options || [],
    winningOptionId: results.winningOptionId,
    counts: results.counts || [],
    leaderboard: results.leaderboard || [],
    isHost: isHost(),
    onNextRoundClick: onStartGameClick,
  });
}

function showGameOverOverlay(leaderboard) {
  renderGameOverOverlay({
    roomId: roomId || "------",
    leaderboard: leaderboard || [],
    onBackToLobby: () => {
      window.location.reload();
    },
  });
}

// ---------------- ROOM ACTIONS -----------------
function onCreateRoomClick() {
  const name = getNameInput();
  if (!name) return;

  myName = name;
  localStorage.setItem("playerName", name);

  socket.emit("host_create", (res) => {
    if (!res?.roomId) {
      alert("Failed to create room.");
      return;
    }

    roomId = res.roomId;
    joinRoom(roomId, name);
  });
}

function onJoinRoomClick() {
  const name = getNameInput();
  const code = getCodeInput();
  if (!name || !code) {
    alert("Enter name and room code.");
    return;
  }

  myName = name;
  localStorage.setItem("playerName", name);
  roomId = code;

  joinRoom(code, name);
}

function joinRoom(code, name) {
  socket.emit("join_room", { roomId: code, name }, (ack) => {
    if (ack?.error) {
      alert(`Join failed: ${ack.error}`);
      return;
    }

    myId = ack.playerId;
    setMyPlayerId(myId);
    showInRoomOverlay();
  });
}

function onReadyClick() {
  if (!socket || !roomId) return;

  socket.emit("player_ready", { roomId }, (ack) => {
    if (ack?.error) {
      alert(`Ready failed: ${ack.error}`);
    }
  });
}

// ------------------------------------------------------------
//  START GAME LOGIC (INTRO ONCE, AUTO-START WHEN ALL READY)
// ------------------------------------------------------------
function onStartGameClick() {
  if (!socket || !roomId) return;

  // Only host controls the actual start signal
  if (!isHost()) {
    console.log("⛔ Only the host can start the game.");
    return;
  }

  // First start: require all players to be ready
  if (!gameStarted && !currentRound && !allReady) {
    alert("Everyone must be READY before the game can start.");
    return;
  }

  currentRemaining = null;
  myVoteOptionId = null;

  console.log("🎬 Emitting start_game to server");
  socket.emit("start_game", { roomId, duration: 20 }, (ack) => {
    if (ack?.error) {
      console.error("❌ start_game failed:", ack.error);
      alert(`Start failed: ${ack.error}`);
      return;
    }
    console.log("✅ start_game acknowledged:", ack);
    // We deliberately do NOT set gameStarted here.
    // We flip gameStarted to true only when we actually receive round_question.
  });
}

// Auto-start when everyone is ready in the lobby
function maybeAutoStart() {
  if (!isHost()) return;
  if (!allReady) return;
  if (gameStarted || currentRound) return;

  console.log("🎬 All players ready — auto-starting game");
  onStartGameClick();
}

function handleOptionClick(optionId) {
  if (!currentRound || !socket || !roomId) return;

  socket.emit(
    "vote",
    {
      roomId,
      roundId: currentRound.roundId,
      optionId,
    },
    (ack) => {
      if (!ack?.error) {
        myVoteOptionId = optionId;
        showQuestionOverlay();
      } else {
        console.error("❌ vote failed:", ack.error);
        alert(`Vote failed: ${ack.error}`);
      }
    }
  );
}

// ---------------- SOCKET EVENTS -----------------
function wireSocketEvents() {
  // Room sync
  socket.on("room_state", (state) => {
    if (state.roomId) roomId = state.roomId;
    players = state.players || [];

    const nextReady = { ...readyById };
    for (const p of players) {
      if (typeof nextReady[p.id] === "undefined") {
        nextReady[p.id] = false;
      }
    }
    readyById = nextReady;

    if (!gameStarted || !currentRound) {
      showInRoomOverlay();
    }

    setPlayersOnTable(players);
    updateReadyBadges(readyById);
  });

  socket.on("ready_state", ({ ready = {}, allReady: AR = false } = {}) => {
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

  // Multiplayer game-over → winner cutscene
  socket.on("game_over", ({ leaderboard }) => {
    const winners = leaderboard
      .filter((p) => p.points === leaderboard[0].points)
      .map((p) => p.name);

    playWinnerFromScene(winners);
  });

  // --------------------------------------------------------
  // INTRO CUTSCENE FOR EVERYONE, FIRST ROUND AFTER INTRO
  // --------------------------------------------------------
  socket.on("playIntroCutscene", () => {
    console.log("📣 Server: PLAY INTRO CUTSCENE");

    playIntroFromScene(() => {
      console.log("🎬 Intro cutscene finished on this client");

      // Only the host tells the server "intro is done".
      if (isHost() && !gameStarted && !currentRound) {
        console.log("🎬 Host emitting intro_done to start Round 1");
        socket.emit("intro_done", { roomId });
      }
    });
  });
}

// ---------------- MAIN MENU INIT -----------------
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
