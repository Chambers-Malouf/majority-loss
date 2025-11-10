// ===================================================
// ================ IMPORTS & SOCKET ==================
// ===================================================
import { io } from "socket.io-client";
import {
  initScene,
  updatePlayerTablet,
  triggerAIDialogue,        // 🟡 added
  updateJumbotronResults,   // 🟡 added
} from "./scene.js";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;      // e.g. wss://minority-mayhem.onrender.com
const HTTP_BASE = SOCKET_URL
  .replace(/^wss:\/\//, "https://")
  .replace(/^ws:\/\//, "http://");

const socket = io(SOCKET_URL, { transports: ["websocket"] });

// ===================================================
// ==================== UTILITIES ====================
// ===================================================
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
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ===================================================
// =================== GLOBAL STATE ==================
// ===================================================
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

// SOLO state
const SOLO_MAX_ROUNDS = 10;
const SOLO_TIMER = 20;
let soloRoundNo = 0;
let soloScore = new Map(); // name -> points
const AI_LIST = [
  { name: "Chishiya", personality: "You are Chishiya from Alice in Borderland — a calm, calculating genius who treats everything like a psychological game. Speak sparsely." },
  { name: "Yuuichi",  personality: "You are Yuuichi Katagiri from Tomodachi Game — manipulative, unpredictable; mix kindness with cruelty; always two steps ahead." },
  { name: "Yumeko",   personality: "You are Yumeko Jabami from Kakegurui — a thrill-seeking gambler who delights in risk. Dramatic, delighted, intense." },
  { name: "L",        personality: "You are L from Death Note — analytical, monotone, concise; briefly explain reasoning." },
];

// ===================================================
// ================= SOCKET REJOIN ===================
// ===================================================
socket.on("connect", () => {
  if (roomId && myName) {
    socket.emit("join_room", { roomId, name: myName }, (ack) => {
      if (ack?.error) console.warn("Rejoin failed:", ack.error);
    });
  }
});

// ===================================================
// ===================== HOME UI =====================
// ===================================================
function renderHome() {
  screen = "home";
  app.innerHTML = "";

  const title = el("h1", { style: "margin-bottom: 6px;" }, "Majority Loss");
  const subtitle = el("p", { class: "small", style: "color:#aaa;margin-bottom:20px;" },
    "A psychological deception game where being in the minority means victory."
  );

  // Profile section (basic placeholder for now)
  const profileSection = el("div", { class: "card mt-8", style: "padding:12px;border:1px solid #222;" },
    el("h3", {}, "👤 Player Profile"),
    el("input", {
      id: "profileName",
      placeholder: "Enter your name",
      maxlength: "16",
      style: "width:100%;padding:8px;border-radius:6px;border:none;background:#111;color:#fff;margin-top:6px;"
    }),
    el("button", {
      class: "btn mt-8",
      onclick: async () => {
        const name = document.getElementById("profileName").value.trim();
        if (!name) return alert("Please enter a name first.");

        try {
          const res = await fetch(`${HTTP_BASE}/api/profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_name: name })
          });

          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Unknown error");

          localStorage.setItem("playerName", name);
          alert(`✅ Profile saved for ${name}!`);
        } catch (err) {
          console.error("Profile save failed:", err);
          alert("Failed to save profile — check backend connection.");
        }
      }
    }, "Save Profile")
  );

  // Game mode buttons
  const gameSection = el("div", { class: "card mt-12", style: "padding:20px;" },
    el("h2", {}, "🎮 Choose Mode"),
    el("button", {
      class: "btn mt-12",
      onclick: () => {
        const name = localStorage.getItem("playerName");
        if (!name) return alert("Please save a profile first!");
        startSoloMode();
      }
    }, "Solo Mode (vs 4 AI)"),

    el("button", {
      class: "btn mt-8",
      onclick: () => {
        const name = localStorage.getItem("playerName");
        if (!name) return alert("Please save a profile first!");
        isHost = true;
        onCreateRoom();
      }
    }, "Create Multiplayer Room"),

    el("button", {
      class: "btn mt-8",
      onclick: () => {
        const name = localStorage.getItem("playerName");
        if (!name) return alert("Please save a profile first!");
        const code = prompt("Enter room code:")?.toUpperCase();
        if (!code) return;
        onJoinRoom(code, name);
      }
    }, "Join Multiplayer Room")
  );

  // Help + Settings section
  const extraSection = el("div", { class: "card mt-12", style: "padding:16px;" },
    el("button", {
      class: "btn mt-8",
      onclick: () => alert("🧠 Objective:\nPick wisely. The few who disagree win the round.")
    }, "How to Play"),

    el("button", {
      class: "btn mt-8",
      onclick: () => alert("⚙️ Settings menu coming soon (change timer, rounds, etc).")
    }, "Settings")
  );

  app.appendChild(el("div", { class: "card", style: "text-align:center;padding:32px;" },
    title,
    subtitle,
    profileSection,
    gameSection,
    extraSection
  ));
}


// ===================================================
// ===================== SOLO MODE ===================
// ===================================================
function startSoloMode() {
  screen = "solo";
  app.innerHTML = "";
  isHost = false;
  myName = "You";
  myId = "local-player";
  roomId = "SOLO-" + Math.floor(Math.random() * 99999);

  const aiNames = ["You", "Yumeko", "L", "Yuuichi", "Chishiya"];
  initScene(aiNames);

  soloScore.clear();
  soloScore.set(myName, 0);
  for (const name of aiNames.slice(1)) soloScore.set(name, 0);
  soloRoundNo = 0;

  mountSoloHUD();
  soloNextRound();
}

function mountSoloHUD() {
  if (document.getElementById("solo-hud")) return;

  const hud = el("div", {
    id: "solo-hud",
    style: `
      position: fixed; inset: 0; pointer-events: none; z-index: 5;
      display:flex; align-items:flex-end; justify-content:center; padding-bottom:28px;
    `
  });

  const panel = el("div", {
    id: "solo-panel",
    style: `
      display:flex; gap:14px; pointer-events:auto;
      background: rgba(0,0,0,0.12);
      padding: 10px 12px; border-radius: 10px;
      backdrop-filter: blur(2px);
    `
  });
  hud.appendChild(panel);

  const toast = el("div", {
    id: "solo-toast",
    style: `
      position:absolute; top:18px; left:50%; transform:translateX(-50%);
      color:#e2e8f0; font-weight:700; font-family: ui-monospace, Menlo, Consolas;
      background: rgba(0,0,0,0.35); padding: 8px 12px; border-radius: 10px;
      display:none;
    `
  }, "Round results…");
  hud.appendChild(toast);

  document.body.appendChild(hud);
}

function soloSetButtons(options, onPick) {
  const panel = document.getElementById("solo-panel");
  if (!panel) return;
  panel.innerHTML = "";
  options.forEach((opt) => {
    const b = el("button", {
      class: "btn",
      style: "min-width:140px;",
      onclick: () => onPick(opt)
    }, opt.text || opt);
    panel.appendChild(b);
  });
}

async function soloNextRound() {
  if (soloRoundNo >= SOLO_MAX_ROUNDS) return soloGameOver();
  soloRoundNo += 1;
  let timer = SOLO_TIMER;
  const aiLines = [];

  // === Fetch Question ===
  let qData;
  try {
    const r = await fetch(`${HTTP_BASE}/api/solo/question`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    qData = await r.json();
  } catch (err) {
    updatePlayerTablet({
      title: `ROUND ${soloRoundNo}`,
      question: "Could not fetch question — check backend logs.",
      options: [],
      timer,
      aiLines
    });
    return;
  }

  const question = qData?.question || { id: 0, text: "Would you rather?" };
  const options = (qData?.options || []).map(o => ({ id: o.id, text: o.text }));
  let playerPick = null;

  // === Initial render ===
  updatePlayerTablet({
    title: `ROUND ${soloRoundNo}`,
    question: question.text,
    options: options.map(o => o.text),
    timer,
    aiLines
  });

  // === Player Buttons ===
  soloSetButtons(options, (opt) => {
    playerPick = opt;
    const toast = document.getElementById("solo-toast");
    if (toast) {
      toast.textContent = `You picked: ${opt.text}`;
      toast.style.display = "block";
      setTimeout(() => (toast.style.display = "none"), 1200);
    }
  });

  // === AI Thinking / Decisions ===
  const aiPromises = AI_LIST.map(async (ai) => {
    await wait(800 + Math.random() * 1500);
    let thinking = "…", choiceId = null, choiceText = null;

    try {
      const res = await soloGetAIVote(ai.name, ai.personality, question, options);
      thinking = res.thinking || "…";
      choiceId = res.choiceId;
      choiceText = res.choiceText;
    } catch (err) {
      console.warn("AI fetch failed for", ai.name, err);
    }

    // Always show visible floating dialogue
    triggerAIDialogue(ai.name, thinking.trim() || "Hmm...");

    aiLines.push(`${ai.name}: ${thinking}`);
    updatePlayerTablet({
      title: `ROUND ${soloRoundNo}`,
      question: question.text,
      options: options.map(o => o.text),
      timer,
      aiLines
    });

    const foundOpt =
      options.find(o => o.id === Number(choiceId)) ||
      options.find(o => o.text === choiceText) ||
      options[0];

    return { name: ai.name, option: foundOpt };
  });

  // === Timer Countdown ===
  const tInt = setInterval(() => {
    timer -= 1;
    updatePlayerTablet({
      title: `ROUND ${soloRoundNo}`,
      question: question.text,
      options: options.map(o => o.text),
      timer,
      aiLines
    });
    if (timer <= 0) clearInterval(tInt);
  }, 1000);

  await wait(SOLO_TIMER * 1000);
  const aiVotes = await Promise.all(aiPromises).catch(err => {
    console.warn("AI promise failure:", err);
    return [];
  });

  // === Player Default Pick ===
  if (!playerPick) {
    playerPick = options[Math.floor(Math.random() * options.length)];
  }

  // === Vote Counting ===
  const countsMap = new Map(options.map(o => [o.id, 0]));
  const votes = [];
  countsMap.set(playerPick.id, (countsMap.get(playerPick.id) || 0) + 1);
  votes.push({ name: myName, optionId: playerPick.id });

  for (const v of aiVotes) {
    if (!v?.option) continue;
    countsMap.set(v.option.id, (countsMap.get(v.option.id) || 0) + 1);
    votes.push({ name: v.name, optionId: v.option.id });
  }

  // === Determine Winner (Minority Option) ===
  const counts = options.map(o => ({
    optionId: o.id,
    text: o.text,
    count: countsMap.get(o.id) || 0
  }));

  const nonzero = counts.filter(c => c.count > 0);
  let winningOptionId = null;
  if (nonzero.length > 0) {
    const min = Math.min(...nonzero.map(c => c.count));
    const minority = nonzero.filter(c => c.count === min);
    if (minority.length === 1) winningOptionId = minority[0].optionId;
  }

  // === Award Points ===
  const winners = votes.filter(v => v.optionId === winningOptionId).map(v => v.name);
  for (const name of winners) {
    soloScore.set(name, (soloScore.get(name) || 0) + 1);
  }

  const winnersText = winners.length ? `Winner(s): ${winners.join(", ")}` : "Tie / No winner";
  const resultsPayload = { counts, winnersText };

  // === Update Tablet + Jumbotron ===
  updatePlayerTablet({
    title: `ROUND ${soloRoundNo} — RESULTS`,
    question: question.text,
    options: options.map(o => o.text),
    timer: 0,
    aiLines,
    results: resultsPayload
  });

  if (typeof updateJumbotronResults === "function") {
    updateJumbotronResults(resultsPayload, soloRoundNo);
  }

  // Safety redraw to prevent blue-screen bug
  if (resultsPayload?.counts?.length) {
    console.log("Updating jumbotron results for round", soloRoundNo);
    updateJumbotronResults(resultsPayload, soloRoundNo);
  } else {
    console.warn("No results data to render on jumbotron");
  }

  // Pause briefly then next round
  await wait(4000);
  soloNextRound();
  // ===================================================
  // =============== AI FETCH HELPER ===================
  // ===================================================
  async function soloGetAIVote(aiName, aiPersonality, question, options) {
    try {
      const res = await fetch(`${HTTP_BASE}/api/ai-round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiName,
          aiPersonality,
          question,
          options,
          roomId: null // not using sockets in solo mode
        })
      });

      if (!res.ok) {
        console.warn(`AI fetch failed for ${aiName}: HTTP ${res.status}`);
        return { thinking: "Hmm...", choiceId: null, choiceText: null };
      }

      const data = await res.json();
      console.log("🤖 AI response:", aiName, data); // for debugging

      return {
        thinking: data?.thinking || "Hmm...",
        choiceId: data?.choiceId ?? null,
        choiceText: data?.choiceText ?? null
      };
    } catch (err) {
      console.error("❌ soloGetAIVote error:", aiName, err);
      return { thinking: "Hmm...", choiceId: null, choiceText: null };
    }
  }
}


// ===================================================
// ================= GAME OVER =======================
// ===================================================
function soloGameOver() {
  const board = Array.from(soloScore.entries())
    .map(([name, points]) => ({ name, points }))
    .sort((a, b) => b.points - a.points);

  const lines = board.map((p) => `${p.name}: ${p.points} point${p.points === 1 ? "" : "s"}`);
  updatePlayerTablet({
    title: "🏁 GAME OVER — SOLO",
    question: "Final leaderboard",
    options: [],
    timer: 0,
    aiLines: lines
  });

  const panel = document.getElementById("solo-panel");
  if (panel) panel.innerHTML = "";
}
// ===================================================
// ================= MULTIPLAYER MODE ================
// ===================================================
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

// ===================================================
// ================== LOBBY / GAME ===================
// ===================================================
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

  // flush queued AI thoughts (multiplayer path)
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
  screen = "results";
  app.innerHTML = "";

  const card = el("div", { class: "card" },
    el("h2", {}, "Results"),
    el("div", { class: "mt-8" },
      ...counts.map(c => el("div", {}, `${c.text}: ${c.count}`))
    ),
    el("div", { class: "mt-8" },
      el("strong", {},
        winningOptionId
          ? `Winner(s): ${votes.filter(v => v.optionId === winningOptionId).map(v => v.playerName).join(", ")}`
          : "Tie / No winner"
      )
    )
  );

  if (leaderboard && leaderboard.length) {
    const leaderboardList = el("ul", {},
      ...leaderboard
        .sort((a, b) => b.points - a.points)
        .map(p => el("li", {}, `${p.name}: ${p.points} point${p.points === 1 ? "" : "s"}`))
    );

    const leaderboardBox = el("div", { class: "mt-8" },
      el("h3", {}, "Scoreboard"),
      leaderboardList
    );

    card.appendChild(leaderboardBox);
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
        .map(p => el("li", {}, `${p.name}: ${p.points} point${p.points === 1 ? "" : "s"}`))
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

// ===================================================
// ================= SOCKET EVENTS ===================
// ===================================================
socket.on("room_state", (s) => {
  if (s.roomId) roomId = s.roomId;
  players = s.players || [];
  if (screen === "lobby" && !isRoundActive) renderLobby();
});

socket.on("round_started", ({ duration, endAt }) => {
  isRoundActive = true;
  if (endAt) secondsRemaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  else if (typeof duration === "number") secondsRemaining = duration;
  renderGameStarted({ duration, endAt });
});

socket.on("round_question", (payload) => {
  isRoundActive = true;
  currentRound = { id: payload.roundId, number: payload.roundNumber };
  secondsRemaining = 0;
  voted = {};
  renderQuestion(payload);
});

socket.on("vote_status", ({ voted: v }) => {
  voted = v || {};
  if (screen === "question" && renderQuestion._youVotedEl) {
    renderQuestion._youVotedEl.textContent = voted[myId] ? "You voted ✅" : "Pick an option";
  }
});

socket.on("round_results", ({ roundId, winningOptionId, counts, votes, leaderboard }) => {
  isRoundActive = false;
  currentRound = null;
  activeTimerEl = null;
  renderResults({ roundId, winningOptionId, counts, votes, leaderboard });
});

socket.on("round_tick", ({ remaining }) => {
  secondsRemaining = remaining;
  if (activeTimerEl) activeTimerEl.textContent = `Time: ${remaining}s`;
});

socket.on("ai_thinking", ({ aiName, thinking }) => {
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

// ===================================================
// ==================== INIT APP =====================
// ===================================================
renderHome();
