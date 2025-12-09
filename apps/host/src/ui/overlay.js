// apps/host/src/ui/overlay.js

import {
  setCourtroomBanner,
  setChalkQuestionView,
  setChalkResultsView,
  setChalkLobbyView,
  setChalkInRoomSettingsHandler,
} from "../scene/scene.js";

const overlayRootId = "overlay-root";

let currentRoundTime = 20; // seconds
let currentMaxRounds = 5;
let lastLobbyContext = null; 

if (typeof window !== "undefined") {
  window.__roundTime = currentRoundTime;
  window.__maxRounds = currentMaxRounds;
}

function getOverlayRoot() {
  const root = document.getElementById(overlayRootId);
  if (!root) {
    console.error("❌ Missing overlay root");
    return null;
  }
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

  root.innerHTML = `
    <input id="name-input" style="opacity:0;position:absolute;top:-9999px;" value="${savedName}">
    <input id="code-input" style="opacity:0;position:absolute;top:-9999px;">
  `;

  const nameInput = document.getElementById("name-input");
  const codeInput = document.getElementById("code-input");

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
   Helper: update chalkboards for the IN-ROOM LOBBY
----------------------------------------------------- */
function updateInRoomChalkboards({
  roomId = "------",
  players = [],
  myId = null,
  readyById = {},
} = {}) {
  const playerLines =
    players.length === 0
      ? "(no players yet)"
      : players
          .map((p) => {
            const ready = readyById[p.id] ? "READY ✔" : "NOT READY";
            const you = myId === p.id ? " (you)" : "";
            return `• ${p.name}${you} — ${ready}`;
          })
          .join("\n");

  const leftText =
    `Players:\n${playerLines}`;

  const centerText =
    `MAJORITY LOSS Trial\n` +
    `by Chambers Malouf\n\n` +
    `(GAME SETTINGS)`;

  const rightText =
    `Invite friends with\n` +
    `the code:\n\n` +
    `${roomId || "------"}`;

  setCourtroomBanner(leftText, centerText, rightText);
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

  lastLobbyContext = { roomId, players, myId, readyById };

  updateInRoomChalkboards(lastLobbyContext);

  // fresh UI
  root.innerHTML = "";

  root.innerHTML = `
    <div id="inroom-ui"
         style="
           pointer-events:auto;
           position:fixed;
           left:0; right:0; bottom:40px;
           display:flex;
           flex-direction:column;
           align-items:center;
           gap:10px;
           z-index:5000;
         ">

      <button id="ready-btn"
              class="chalk-btn"
              style="pointer-events:auto; min-width:180px;">
        READY UP
      </button>

      ${
        isHost
          ? `
          <button id="start-game-btn"
                  class="chalk-btn"
                  style="
                    pointer-events:auto;
                    min-width:200px;
                    display:${allReady ? "block" : "none"};
                  ">
            START GAME
          </button>

          <!-- Settings modal (hidden by default) -->
          <div id="settings-modal"
               style="
                 position:fixed;
                 top:50%;
                 left:50%;
                 transform:translate(-50%, -50%);
                 padding:24px 28px;
                 background:rgba(12, 24, 18, 0.98);
                 border:4px solid #fefae0;
                 border-radius:18px;
                 box-shadow:0 18px 55px rgba(0,0,0,0.7);
                 color:#fefae0;
                 font-family:'Chalk','Marker Felt','system-ui';
                 display:none;
                 z-index:9999;
                 max-width:420px;
                 text-align:center;
               ">
            <div style="font-size:26px; margin-bottom:8px;">
              ⚙️ Game Settings
            </div>
            <div style="font-size:16px; opacity:0.85; margin-bottom:20px;">
              Adjust round duration and max rounds for this trial.
            </div>

            <div style="margin-bottom:20px;">
              <div style="font-size:22px; margin-bottom:6px;">⏳ Round Duration</div>
              <div style="display:flex; align-items:center; justify-content:center; gap:16px;">
                <button id="rt-dec"
                        style="border:none; background:transparent; color:#fefae0; font-size:32px; cursor:pointer;">
                  ᐊ
                </button>
                <span id="rt-value" style="min-width:90px; font-size:24px;">
                  ${currentRoundTime}s
                </span>
                <button id="rt-inc"
                        style="border:none; background:transparent; color:#fefae0; font-size:32px; cursor:pointer;">
                  ᐅ
                </button>
              </div>
            </div>

            <div style="margin-bottom:24px;">
              <div style="font-size:22px; margin-bottom:6px;">🔢 Max Rounds</div>
              <div style="display:flex; align-items:center; justify-content:center; gap:16px;">
                <button id="mr-dec"
                        style="border:none; background:transparent; color:#fefae0; font-size:32px; cursor:pointer;">
                  ᐊ
                </button>
                <span id="mr-value" style="min-width:90px; font-size:24px;">
                  ${currentMaxRounds}
                </span>
                <button id="mr-inc"
                        style="border:none; background:transparent; color:#fefae0; font-size:32px; cursor:pointer;">
                  ᐅ
                </button>
              </div>
            </div>

            <div style="display:flex; justify-content:center; gap:12px;">
              <button id="settings-close"
                      class="chalk-btn"
                      style="padding:6px 18px; font-size:16px; background:#374151;">
                Close
              </button>
              <button id="settings-apply"
                      class="chalk-btn"
                      style="padding:6px 18px; font-size:16px;">
                Apply
              </button>
            </div>
          </div>
        `
          : ``
      }
    </div>
  `;

  const readyBtn = document.getElementById("ready-btn");
  const startBtn = document.getElementById("start-game-btn");

  if (readyById[myId]) {
    readyBtn.innerText = "READY ✔";
    readyBtn.disabled = true;
    readyBtn.classList.add("chalk-btn-disabled");
  } else {
    readyBtn.onclick = onReadyClick;
  }

  if (!isHost) return;

  // ------- SETTINGS MODAL BEHAVIOR (host only) -------
  const modal = document.getElementById("settings-modal");
  const rtSteps = [5, 10, 20, 30];
  const mrSteps = [1, 3, 5, 10];

  function clampToClosest(list, value) {
    let best = list[0];
    let bestDiff = Math.abs(list[0] - value);
    for (let i = 1; i < list.length; i++) {
      const diff = Math.abs(list[i] - value);
      if (diff < bestDiff) {
        best = list[i];
        bestDiff = diff;
      }
    }
    return best;
  }

  let rtIndex = rtSteps.indexOf(clampToClosest(rtSteps, currentRoundTime));
  let mrIndex = mrSteps.indexOf(clampToClosest(mrSteps, currentMaxRounds));

  const rtVal = document.getElementById("rt-value");
  const mrVal = document.getElementById("mr-value");
  const rtDec = document.getElementById("rt-dec");
  const rtInc = document.getElementById("rt-inc");
  const mrDec = document.getElementById("mr-dec");
  const mrInc = document.getElementById("mr-inc");
  const closeBtn = document.getElementById("settings-close");
  const applyBtn = document.getElementById("settings-apply");

  function syncModalText() {
    if (rtVal) rtVal.textContent = `${rtSteps[rtIndex]}s`;
    if (mrVal) mrVal.textContent = `${mrSteps[mrIndex]}`;
  }

  function openModal() {
    if (!modal) return;
    syncModalText();
    modal.style.display = "block";
  }
  function closeModal() {
    if (!modal) return;
    modal.style.display = "none";
  }

  // Center chalkboard click → open settings
  setChalkInRoomSettingsHandler({
    onSettingsClick: openModal,
  });

  if (closeBtn) {
    closeBtn.onclick = () => closeModal();
  }

  if (rtDec) {
    rtDec.onclick = () => {
      rtIndex = (rtIndex - 1 + rtSteps.length) % rtSteps.length;
      syncModalText();
    };
  }
  if (rtInc) {
    rtInc.onclick = () => {
      rtIndex = (rtIndex + 1) % rtSteps.length;
      syncModalText();
    };
  }

  if (mrDec) {
    mrDec.onclick = () => {
      mrIndex = (mrIndex - 1 + mrSteps.length) % mrSteps.length;
      syncModalText();
    };
  }
  if (mrInc) {
    mrInc.onclick = () => {
      mrIndex = (mrIndex + 1) % mrSteps.length;
      syncModalText();
    };
  }

  if (applyBtn) {
    applyBtn.onclick = () => {
      currentRoundTime = rtSteps[rtIndex];
      currentMaxRounds = mrSteps[mrIndex];

      if (typeof window !== "undefined") {
        window.__roundTime = currentRoundTime;
        window.__maxRounds = currentMaxRounds;
      }

      if (lastLobbyContext) {
        updateInRoomChalkboards(lastLobbyContext);
      }

      closeModal();
    };
  }

  if (startBtn) {
    startBtn.onclick = () => {
      onStartGameClick({
        roundTime: currentRoundTime,
        maxRounds: currentMaxRounds,
      });
    };
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

  root.innerHTML = "";
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
    "MAJORITY LOSS\n by Chambers Malouf",
    "Refresh tab to leave or play again",
    summary
  );

  root.innerHTML = `
    <div class="lobby-buttons" style="pointer-events:auto; text-align:center; position:fixed; bottom:40px; left:0; right:0;">
      <button id="back-btn" class="chalk-btn">BACK TO LOBBY</button>
    </div>
  `;

  const btn = document.getElementById("back-btn");
  if (btn) btn.onclick = onBackToLobby;
}
