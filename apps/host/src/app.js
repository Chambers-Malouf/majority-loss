// apps/host/src/app.js
// connecting to server
import { io } from "socket.io-client";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

const socket = io(SOCKET_URL, {
  transports: ["websocket"], 
});


// DOM helper
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


// local UI state
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

// initial screen
function renderHome() {
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

// create room
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

// join room
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

// lobby screen
function renderLobby() {
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
  if (isHost && !isRoundActive) {
    const canStart = players.length >= 3;
    const startBtn = el("button", {
      class: "btn mt-12",
      disabled: !canStart,
      onclick: () =>
        socket.emit(
          "start_game",
          { roomId, duration: 20 },
          (ack) => { if (ack?.error) alert(ack.error); }
        )
    }, canStart ? "Start Game" : "Need at least 3 players");

    startWrap = el("div", {}, startBtn);
  }

  app.appendChild(header);
  app.appendChild(list);
  if (startWrap) app.appendChild(startWrap);
}

function renderQuestion({ question, options, roundId, roundNumber }) {
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
        // prevent double-vote in UI
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

  // keep a reference so we can update countdown text later
  renderQuestion._timerEl = timer;
}
function renderResults({ roundId, winningOptionId, counts }) {
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
      onclick: () => socket.emit("start_game", { roomId, duration: 20 })
    }, "Next Round"));
  }
  actions.appendChild(el("button", { class: "btn", onclick: renderLobby }, "Back to Lobby"));

  app.appendChild(card);
  app.appendChild(actions);
}


// socket listeners
socket.on("room_state", (s) => {
  if (s.roomId) roomId = s.roomId;
  players = s.players || [];
  renderLobby();
});

socket.on("vote_status", ({ voted: v }) => {
  voted = v || {};
  if (roomId) renderLobby();
});
// server broadcasts the chosen question/options at round start
socket.on("round_question", (payload) => {
  // payload: { roundId, roundNumber, question:{id,text}, options:[{id,text}] }
  isRoundActive = true;
  currentRound = { id: payload.roundId, number: payload.roundNumber };
  secondsRemaining = 0;
  renderQuestion(payload);
});

// server ticks once per second
socket.on("round_tick", ({ remaining }) => {
  secondsRemaining = remaining;
  if (renderQuestion._timerEl) {
    renderQuestion._timerEl.textContent = `Time: ${remaining}s`;
  }
});

// server announces results when the timer ends
socket.on("round_results", ({ roundId, winningOptionId, counts }) => {
  isRoundActive = false;
  currentRound = null;
  renderResults({ roundId, winningOptionId, counts });
});

// optional: end-of-game signal
socket.on("game_over", () => {
  isRoundActive = false;
  currentRound = null;
  alert("Game over!");
  renderLobby();
});

// start
renderHome();
