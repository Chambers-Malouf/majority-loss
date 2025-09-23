// apps/host/src/app.js

// 1) Connect to the Socket.IO server using WebSocket transport only.
import { io } from "socket.io-client";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
});

// 2) Small DOM helper to create elements with attributes and children.
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

// 3) Local UI state kept in this tab.
const app = document.getElementById("app");
let isHost = false;
let currentRound = null;
let isRoundActive = false;
let secondsRemaining = 0;
let roomId = null;
let myId = null;
let myName = null;
let players = [];
let voted = {};
let screen = "home"; // "home" | "lobby" | "question" | "results"

// 4) On any reconnect (Render can sleep, wifi hiccups, page refresh),
//    automatically rejoin the last known room if we had one.
socket.on("connect", () => {
  if (roomId && myName) {
    socket.emit("join_room", { roomId, name: myName }, (ack) => {
      if (ack?.error) {
        console.warn("Rejoin failed:", ack.error);
      }
    });
  }
});

// 5) Initial home screen: name input + room code + Create/Join buttons.
function renderHome() {
  screen = "home";
  app.innerHTML = "";
  const nameInput = el("input", { placeholder: "Your name", maxlength: "16" });
  const codeInput = el("input", { placeholder: "Room code (e.g., ABC123)", maxlength: "6", class: "mt-8" });
  const createBtn = el("button", { class: "btn mt-12", onclick: onCreateRoom }, "Create Room");
  const joinBtn = el("button", { class: "btn mt-12 ml-8", onclick: () => onJoinRoom(codeInput.value, nameInput.value) }, "Join Room");

  app.appendChild(
    el("div", { class: "card" },
      el("h1", {}, "Majority Loss"),
      nameInput,
      codeInput,
      el("div", {}, createBtn, joinBtn),
      el("div", { class: "small mt-12" }, "Tip: One person creates a room. Everyone else joins with the code.")
    )
  );
}

// 6) Create room flow for the host: ask name → host_create → join_room → show lobby.
function onCreateRoom() {
  if (!myName) myName = prompt("Enter your name")?.trim() || "Player";
  isHost = true;
  socket.emit("host_create", (res) => {
    roomId = res.roomId;
    socket.emit("join_room", { roomId, name: myName }, (ack) => {
      if (ack?.error) return alert(ack.error);
      myId = ack.playerId;
      renderLobby();
    });
  });
}

// 7) Join an existing room flow for players.
function onJoinRoom(code, name) {
  roomId = (code || "").trim().toUpperCase();
  myName = (name || "").trim() || "Player";
  if (!roomId) return alert("Enter a room code.");
  socket.emit("join_room", { roomId, name: myName }, (ack) => {
    if (ack?.error) return alert(ack.error);
    myId = ack.playerId;
    renderLobby();
  });
}

// 8) Lobby screen: show room code, player list, and Start button for host.
function renderLobby() {
  screen = "lobby";
  app.innerHTML = "";

  const header = el("div", { class: "card" },
    el("h2", {}, "Room: ", el("span", { class: "mono" }, roomId || "------")),
    el("div", { class: "small" }, "Share this code for friends to join")
  );

  const list = el("div", { class: "card" }, el("h3", {}, "Players"));
  if (!players.length) {
    list.appendChild(el("div", {}, "(no players yet)"));
  } else {
    players.forEach(p => {
      const status = voted[p.id] ? "✅ ready" : "⏳ waiting";
      const me = p.id === myId ? " (you)" : "";
      list.appendChild(el("div", {}, `${p.name}${me} - ${status}`));
    });
  }

  let startWrap = null;
  if (isHost && screen === "lobby" && !isRoundActive) {
    const canStart = players.length >= 3; // keep your 3+ rule
    const startBtn = el("button", {
      class: "btn mt-12",
      disabled: !canStart,
      onclick: () => {
        const payload = { roomId, duration: 20, durationSeconds: 20 }; // send both keys for compatibility
        let acked = false;

        const failTimer = setTimeout(() => {
          if (!acked) alert("Server didn’t start the round (no response). Check server logs.");
        }, 4000);

        socket.emit("start_game", payload, (ack) => {
          acked = true;
          clearTimeout(failTimer);

          if (ack?.error === "NOT_IN_ROOM") {
            socket.emit("join_room", { roomId, name: myName }, () => {
              socket.emit("start_game", payload, (ack2) => {
                if (ack2?.error) alert(ack2.error);
              });
            });
            return;
          }
          if (ack?.error) alert(ack.error);
        });
      }
    }, canStart ? "Start Game" : "Need at least 3 players");

    startWrap = el("div", {}, startBtn);
  }

  app.appendChild(header);
  app.appendChild(list);
  if (startWrap) app.appendChild(startWrap);
}

// 9) Question screen for an active round.
function renderQuestion({ question, options, roundId, roundNumber }) {
  screen = "question";
  app.innerHTML = "";

  const title = el("div", { class: "card" },
    el("h2", {}, `Round ${roundNumber}`),
    el("div", { class: "small" }, isHost ? "You’re the host." : "")
  );

  const qCard = el("div", { class: "card mt-12" },
    el("h3", {}, question.text)
  );

  const btns = el("div", { class: "mt-12" });
  options.forEach(opt => {
    const b = el("button", {
      class: "btn mr-8",
      onclick: () => {
        Array.from(btns.querySelectorAll("button")).forEach(x => x.disabled = true);
        socket.emit("vote", { roomId, roundId, optionId: opt.id }, (ack) => {
          if (ack?.error) alert(ack.error);
        });
      }
    }, opt.text);
    btns.appendChild(b);
  });
  qCard.appendChild(btns);

  const timer = el("div", { class: "small mt-8 mono" }, `Time: ${secondsRemaining || 0}s`);
  qCard.appendChild(timer);

  app.appendChild(title);
  app.appendChild(qCard);

  // Keep a reference so we can update countdown text later.
  renderQuestion._timerEl = timer;
}

// 10) Results screen at the end of a round.
function renderResults({ roundId, winningOptionId, counts }) {
  screen = "results";
  app.innerHTML = "";

  const card = el("div", { class: "card" },
    el("h2", {}, "Results"),
    el("div", { class: "mt-8" },
      ...counts.map(c => el("div", {}, `Option ${c.optionId}: ${c.count}`))
    ),
    el("div", { class: "mt-8" },
      el("strong", {}, winningOptionId ? `Winner: ${winningOptionId}` : "Tie / No winner")
    )
  );

  const actions = el("div", { class: "mt-12" });
  if (isHost) {
    actions.appendChild(el("button", {
      class: "btn mr-8",
      onclick: () => {
        const payload = { roomId, duration: 20 };
        socket.emit("start_game", payload, (ack) => {
          if (ack?.error) alert(ack.error);
        });
      }
    }, "Next Round"));
  }
  actions.appendChild(el("button", { class: "btn", onclick: renderLobby }, "Back to Lobby"));

  app.appendChild(card);
  app.appendChild(actions);
}

// 11) Socket listeners from the server → update UI.
socket.on("room_state", (s) => {
  if (s.roomId) roomId = s.roomId;
  players = s.players || [];

  // Only re-render the lobby when we’re actually on the lobby screen
  // and not in the middle of a round.
  if (screen === "lobby" && !isRoundActive) {
    renderLobby();
  }
});

socket.on("vote_status", ({ voted: v }) => {
  voted = v || {};
  // Only redraw lobby if that’s the current screen.
  if (screen === "lobby") renderLobby();
});

// Server sends the new round payload when a round starts.
socket.on("round_question", (payload) => {
  // payload: { roundId, roundNumber, question:{id,text}, options:[{id,text}] }
  isRoundActive = true;
  currentRound = { id: payload.roundId, number: payload.roundNumber };
  secondsRemaining = 0;
  renderQuestion(payload);
});

// Server ticks once per second with remaining time.
socket.on("round_tick", ({ remaining }) => {
  secondsRemaining = remaining;
  if (renderQuestion._timerEl) {
    renderQuestion._timerEl.textContent = `Time: ${remaining}s`;
  }
});

// Server announces results at the end of the timer.
socket.on("round_results", ({ roundId, winningOptionId, counts }) => {
  isRoundActive = false;
  currentRound = null;
  renderResults({ roundId, winningOptionId, counts });
});

// Optional: server tells us the whole game ended.
socket.on("game_over", () => {
  // Only trigger the popup if we really ran through 10 rounds.
  if (currentRound && currentRound.number >= 10) {
    isRoundActive = false;
    currentRound = null;
    alert("Game over!");
    renderLobby();
  } else {
    // Otherwise just quietly return to lobby without popup.
    isRoundActive = false;
    currentRound = null;
    renderLobby();
  }
});

// 12) Boot the app on the home screen.
renderHome();
