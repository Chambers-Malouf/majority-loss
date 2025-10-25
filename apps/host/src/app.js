// apps/host/src/app.js

import { io } from "socket.io-client";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
});

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
let screen = "home";
let pendingAIThoughts = [];


let activeTimerEl = null;

socket.on("connect", () => {
  if (roomId && myName) {
    socket.emit("join_room", { roomId, name: myName }, (ack) => {
      if (ack?.error) {
        console.warn("Rejoin failed:", ack.error);
      }
    });
  }
});

function renderHome() {
  screen = "home";
  app.innerHTML = "";
  const nameInput = el("input", { placeholder: "Your name", maxlength: "16" });
  const codeInput = el("input", { placeholder: "Room code (e.g., ABC123)", maxlength: "6", class: "mt-8" });
  const createBtn = el("button", { class: "btn mt-12", onclick: onCreateRoom }, "Create Room");
  const joinBtn = el("button", { class: "btn mt-12 ml-8", onclick: () => onJoinRoom(codeInput.value, nameInput.value) }, "Join Room");
const soloBtn = el("button", { class: "btn mt-12", onclick: startSoloMode }, "Solo Mode (vs 4 AI)");

  app.appendChild(soloBtn);

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

function startSoloMode() {
  console.log("🎮 Starting Solo Mode...");
  isHost = true;
  myName = "You";
  screen = "solo";

  socket.emit("host_create", (res) => {
    roomId = res.roomId;
    console.log(`🧠 Solo room created: ${roomId}`);

    socket.emit("join_room", { roomId, name: myName }, (ack) => {
      if (ack?.error) return alert(ack.error);
      myId = ack.playerId;
      spawnAIs(roomId);
      renderLobby();
    });
  });
}

function spawnAIs(roomId) {
  const aiList = [
    { name: "Charon", personality: "logical strategist" },
    { name: "Nyx", personality: "chaotic trickster" },
    { name: "Erebus", personality: "deceptive manipulator" },
    { name: "Thanatos", personality: "predictive mimic" },
  ];

  aiList.forEach((ai) => {
    const aiSocket = io(SOCKET_URL, { transports: ["websocket"] });
    aiSocket.emit("join_room", { roomId, name: ai.name });

    aiSocket.on("round_question", async ({ question, options, roundId }) => {
      const delay = 2000 + Math.random() * 3000;

      setTimeout(async () => {
        const aiVote = await getAiVote(ai.name, ai.personality, question, options, roomId);

        if (aiVote?.thinking) {
          const msg = el("div", { class: "small mt-4 ai-thinking" },
            `${ai.name}: ${aiVote.thinking}`
          );
          document.querySelector(".card.mt-12")?.appendChild(msg);
        }
        if (aiVote?.id) {
          aiSocket.emit("vote", { roomId, roundId, optionId: aiVote.id });
          console.log(`${ai.name} voted for option ${aiVote.text}`);
        }
      }, delay);
    });
  });
}

async function getAiVote(aiName, aiPersonality, question, options, roomId) {
  try {
    const res = await fetch(`${SOCKET_URL.replace("wss://", "https://")}/api/ai-round`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiName, aiPersonality, question, options, roomId}),
    });
    const data = await res.json();

    const match = options.find(
      o => o.text.toLowerCase().trim() === (data.choiceText || "").toLowerCase().trim()
    ) || options[Math.floor(Math.random() * options.length)];
    return { id: match.id, text: match.text, thinking: data.thinking || null };
  } catch (err) {
    console.error("AI vote failed:", err);
    const fallback = options[Math.floor(Math.random() * options.length)];
    return { id: fallback.id, text: fallback.text, thinking: null };
  }
}

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
      const me = p.id === myId ? " (you)" : "";
      list.appendChild(el("div", {}, `${p.name}${me}`));
    });
  }

  let startWrap = null;
  if (isHost && screen === "lobby" && !isRoundActive) {
    const startBtn = el("button", {
      class: "btn mt-12",
      onclick: () => {
        isRoundActive = true;
        secondsRemaining = 20;
        renderGameStarted({ duration: 20 });
        socket.emit("start_game", { roomId, duration: 20 });
      }
    }, "Start Game");

    startWrap = el("div", {}, startBtn);
  }

  app.appendChild(header);
  app.appendChild(list);
  if (startWrap) app.appendChild(startWrap);
}

function renderGameStarted({ duration, endAt } = {}) {
  screen = "started";
  app.innerHTML = "";

  const card = el("div", { class: "card" },
    el("h2", {}, "Game started 🎉"),
    el("div", { class: "small mt-8" }, "The host has started the game. This is the in-game screen.")
  );

  const timer = el("div", { class: "small mt-8 mono" },
    typeof secondsRemaining === "number" ? `Time: ${secondsRemaining || 0}s` : ""
  );
  activeTimerEl = timer;
  card.appendChild(timer);

  const actions = el("div", { class: "mt-12" },
    el("button", { class: "btn", onclick: renderLobby }, "Back to Lobby")
  );

  app.appendChild(card);
  app.appendChild(actions);
}

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

  const you = el("div", { class: "small mt-4" },
    voted[myId] ? "You voted ✅" : "Pick an option"
  );
  renderQuestion._youVotedEl = you;
  qCard.appendChild(you);

  const aiLog = el("div", { class: "mt-8", id: "ai-log" });
  renderQuestion._aiLogEl = aiLog;
  qCard.appendChild(aiLog);

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

  const timer = el("div", { class: "small mt-8 mono" },
    `Time: ${secondsRemaining || 0}s`
  );
  activeTimerEl = timer;
  qCard.appendChild(timer);

  app.appendChild(title);
  app.appendChild(qCard);

  // ✅ NEW: Flush any queued AI messages that arrived early
  if (window.pendingAIThoughts?.length && renderQuestion._aiLogEl) {
    for (const { aiName, thinking } of window.pendingAIThoughts) {
      renderQuestion._aiLogEl.appendChild(
        el("div", { class: "small ai-thinking" }, `${aiName}: ${thinking}`)
      );
    }
    window.pendingAIThoughts = [];
  }
}

function renderResults({ roundId, winningOptionId, counts, votes, leaderboard }) {
  console.log("leaderboard received:", leaderboard)
  screen = "results";
  app.innerHTML = "";

  const card = el("div", { class: "card" },
    el("h2", {}, "Results"),
    el("div", { class: "mt-8" },
      ...counts.map(c => el("div", {}, `${c.text}: ${c.count}`))  // ✅ text instead of optionId
    ),
    el("div", { class: "mt-8" },
      el("strong", {},
        winningOptionId
          ? `Winner(s): ${
              votes
                .filter(v => v.optionId === winningOptionId)
                .map(v => v.playerName)
                .join(", ")
            }`
          : "Tie / No winner"
      )
    )
  );
  if (leaderboard && leaderboard.length) {
  const leaderboardList = el("ul", {},
    ...leaderboard
      .sort((a, b) => b.points - a.points)
      .map(p =>
        el("li", {}, `${p.name}: ${p.points} point${p.points === 1 ? "" : "s"}`)
      )
  );

  const leaderboardBox = el(
    "div",
    { class: "mt-8" },
    el("h3", {}, "Scoreboard"),
    leaderboardList
  );

  card.appendChild(leaderboardBox);  // append into the results card
}

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

function renderGameOver(finalLeaderboard) {
  screen = "game_over";
  app.innerHTML = "";

  const card = el("div", { class: "card" },
    el("h2", {}, "🏁 Game Over!"),
    el("p", { class: "mt-8" }, "Here are the final results:")
  );

  if (finalLeaderboard && finalLeaderboard.length) {
    const list = el("ul", {},
      ...finalLeaderboard
        .sort((a, b) => b.points - a.points)
        .map(p =>
          el("li", {}, `${p.name}: ${p.points} point${p.points === 1 ? "" : "s"}`)
        )
    );

    const box = el("div", { class: "mt-8" },
      el("h3", {}, "Final Leaderboard"),
      list
    );

    card.appendChild(box);
  }

  const actions = el("div", { class: "mt-12" },
    el("button", { class: "btn mr-8", onclick: renderLobby }, "Back to Lobby"),
    el("button", {
      class: "btn",
      onclick: () => {
        if (isHost) {
          const payload = { roomId, duration: 20 };
          socket.emit("start_game", payload);
        } else {
          renderLobby();
        }
      }
    }, "Play Again")
  );

  app.appendChild(card);
  app.appendChild(actions);
}

socket.on("vote_status", ({ voted: v }) => {
  voted = v || {};
  if (screen === "question" && renderQuestion._youVotedEl) {
    renderQuestion._youVotedEl.textContent = voted[myId] ? "You voted ✅" : "Pick an option";
  }
});

socket.on("round_question", (payload) => {
  isRoundActive = true;
  currentRound = { id: payload.roundId, number: payload.roundNumber };
  secondsRemaining = 0;
  voted = {};
  renderQuestion(payload);
});

socket.on("round_results", ({ roundId, winningOptionId, counts, votes, leaderboard }) => {
  isRoundActive = false;
  currentRound = null;
  activeTimerEl = null;
  renderResults({ roundId, winningOptionId, counts, votes, leaderboard });
});


socket.on("room_state", (s) => {
  if (s.roomId) roomId = s.roomId;
  players = s.players || [];
  if (screen === "lobby" && !isRoundActive) {
    renderLobby();
  }
});

socket.on("round_started", ({ duration, endAt }) => {
  isRoundActive = true;
  if (endAt) {
    secondsRemaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  } else if (typeof duration === "number") {
    secondsRemaining = duration;
  }
  renderGameStarted({ duration, endAt });
});

socket.on("round_tick", ({ remaining }) => {
  secondsRemaining = remaining;
  if (activeTimerEl) {
    activeTimerEl.textContent = `Time: ${remaining}s`;
  }
});

socket.on("ai_thinking", ({ aiName, thinking }) => {
  console.log(`🧠 Received AI thought: ${aiName}: "${thinking}"`);
  if (screen === "question" && renderQuestion._aiLogEl) {
    renderQuestion._aiLogEl.appendChild(
      el("div", { class: "small ai-thinking" }, `${aiName}: ${thinking}`)
    );
  } else {
    pendingAIThoughts.push({ aiName, thinking });
  }
});


socket.on("game_over", ({ leaderboard }) => {
  isRoundActive = false;
  currentRound = null;
  activeTimerEl = null;
  renderGameOver(leaderboard);
});

renderHome();