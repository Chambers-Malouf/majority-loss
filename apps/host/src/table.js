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
// ⭐ NEW: import solo mode entry point
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


// Round / voting state
let currentRound = null;
let currentRemaining = null;
let myVoteOptionId = null;

// --- GLOBAL MUTE BUTTON ---
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
  // ❗ store cleanup returned from renderLobbyOverlay → scene removes lobby tap
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

// ---------------- ROOM / SOCKET LOGIC ---------
function onCreateRoomClick() {
  const name = getNameInput();
  if (!name) return;

  myName = name;
  localStorage.setItem("playerName", name);

  console.log("🟢 Creating room…");

  socket.emit("host_create", (res) => {
    if (!res || !res.roomId) {
      console.error("❌ host_create failed:", res);
      alert("Failed to create room.");
      return;
    }

    roomId = res.roomId;
    console.log("✅ Room created:", roomId, "gameId:", res.gameId);

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
  console.log("🟢 Joining room:", code, "as", name);

  socket.emit("join_room", { roomId: code, name }, (ack) => {
    if (ack?.error) {
      console.error("❌ join_room failed:", ack.error);
      alert(`Join failed: ${ack.error}`);
      return;
    }

    myId = ack.playerId;
    setMyPlayerId(myId); // 🔑 tell state.js who "I" am on THIS device

    // now we're in the game space
    showInRoomOverlay();
  });
}

function onReadyClick() {
  if (!socket || !roomId) return;

  console.log("✅ Sending player_ready…");
  socket.emit("player_ready", { roomId }, (ack) => {
    if (ack?.error) {
      console.error("❌ player_ready failed:", ack.error);
      alert(`Ready failed: ${ack.error}`);
    }
  });
}

function onStartGameClick() {
  if (!socket || !roomId) return;

  console.log("🎬 Host clicked START GAME — playing intro cutscene");

  // Cutscene disables input and runs the judge intro
  playIntroFromScene(() => {
    console.log("🎬 Intro cutscene finished — now requesting start_game…");

    currentRemaining = null;
    myVoteOptionId = null;

    socket.emit("start_game", { roomId, duration: 20 }, (ack) => {
      if (ack?.error) {
        console.error("❌ start_game failed:", ack.error);
        alert(`Start failed: ${ack.error}`);
        return;
      }

      console.log("✅ start_game acknowledged by server");
      gameStarted = true;
    });
  });
}


function maybeAutoStart() {
  if (!isHost()) return;
  if (!allReady) return;
  if (gameStarted) return;

  console.log("🎬 All players ready and I'm the host. Auto-starting game.");
  onStartGameClick();
}

function handleOptionClick(optionId) {
  if (!socket || !roomId || !currentRound) return;
  console.log("🟢 Voting option:", optionId);

  socket.emit(
    "vote",
    {
      roomId,
      roundId: currentRound.roundId,
      optionId,
    },
    (ack) => {
      if (ack?.error) {
        console.error("❌ vote failed:", ack.error);
        alert(`Vote failed: ${ack.error}`);
        return;
      }
      console.log("✅ vote accepted");
      myVoteOptionId = optionId;
      showQuestionOverlay();
    }
  );
}

// ---------------- SOCKET EVENTS ---------------
function wireSocketEvents() {
  socket.on("room_state", (state) => {
    console.log("📡 room_state:", state);

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

    // 🔑 scene decides who "me" is by reading state.js (myPlayerId)
    setPlayersOnTable(players);
    updateReadyBadges(readyById);
  });

  socket.on("ready_state", ({ ready = {}, allReady: allR = false } = {}) => {
    console.log("📡 ready_state:", ready, "allReady:", allR);
    readyById = ready;
    allReady = !!allR;

    if (!gameStarted || !currentRound) {
      showInRoomOverlay();
      maybeAutoStart();
    }

    updateReadyBadges(readyById);
  });

  socket.on("round_question", (payload) => {
    console.log("📡 round_question:", payload);
    currentRound = {
      roundId: payload.roundId,
      roundNumber: payload.roundNumber,
      question: payload.question,
      options: payload.options,
    };
    currentRemaining = null;
    myVoteOptionId = null;

    showQuestionOverlay();
  });

  socket.on("round_tick", ({ remaining }) => {
    currentRemaining = remaining;
    if (currentRound) {
      showQuestionOverlay();
    }
  });

  socket.on("vote_status", (payload) => {
    console.log("📡 vote_status:", payload);
  });

  socket.on("round_results", (results) => {
    console.log("📡 round_results:", results);
    currentRemaining = null;
    myVoteOptionId = null;

    showResultsOverlay(results);
  });

  socket.on("game_over", ({ leaderboard }) => {
  console.log("🏁 Server says GAME OVER:", leaderboard);
    const winners = leaderboard.filter(p => 
    p.points === leaderboard[0].points
  ).map(p => p.name);

  playWinnerFromScene(winners);
});

}

document.addEventListener("DOMContentLoaded", () => {
  console.log("MAIN MENU INITIALIZING…");

  initMainMenuScene("table-app", {
    onMultiplayerClick: () => {
      console.log("MULTIPLAYER POSTER CLICKED");

      disposeMainMenuScene();
      initScene("table-app");

      socket = createSocket();
      wireSocketEvents();

      showLobbyOverlay();
    },
    onSoloClick: () => {
      console.log("SOLO POSTER CLICKED — from table.js");
      startSoloMode();
    },
  });
});

